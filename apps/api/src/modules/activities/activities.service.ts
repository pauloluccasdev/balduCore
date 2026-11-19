import { visibleRelationship } from '../garmin-connections/eligibility.js';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
  HttpException,
} from '@nestjs/common';
import { z } from 'zod';
import { Prisma, type PrismaClient } from '../../generated/prisma/client.js';
import type { Config } from '../../config.js';
import type { IntegrationQueue } from '../activity-processing/queue.js';
import {
  lockRelationship,
  requireEligible,
} from '../garmin-connections/lifecycle.js';
import { createHash } from 'node:crypto';
import { decodeFit, FitDecodeError } from './fit-decoder.js';
import { derivedMetrics } from './activity-data.js';
const date = z.iso.date();
const filters = z
  .object({
    q: z.string().trim().max(120).optional(),
    athleteId: z.uuid().optional(),
    sport: z
      .enum(['running', 'cycling', 'walking', 'swimming', 'other'])
      .optional(),
    source: z.enum(['garmin_mock', 'manual_fit']).optional(),
    from: date.optional(),
    to: date.optional(),
    status: z.enum(['with_samples', 'summary_only']).optional(),
    page: z.coerce.number().int().min(1).max(10000).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();
const seriesQuery = z
  .object({
    page: z.coerce.number().int().min(1).max(10000).default(1),
    limit: z.coerce.number().int().min(1).max(1000).default(200),
  })
  .strict();
const include = {
  relationship: { select: { athlete: { select: { name: true } } } },
  _count: { select: { samples: true, splits: true } },
} as const;
export class ActivitiesService {
  private decoding = new Set<string>();
  constructor(
    readonly db: PrismaClient,
    readonly config: Config,
    readonly queue?: IntegrationQueue,
  ) {}
  private uuid(id: string) {
    if (!z.uuid().safeParse(id).success)
      throw new NotFoundException('Recurso não encontrado.');
  }
  async list(coachId: string, query: unknown) {
    const result = filters.safeParse(query);
    if (!result.success) throw new BadRequestException('Filtros inválidos.');
    const { q, athleteId, sport, source, from, to, status, page, limit } =
      result.data;
    if (from && to && from > to)
      throw new BadRequestException('Período inválido.');
    const where: Prisma.ActivityWhereInput = {
      coachId,
      relationship: visibleRelationship,
      ...(athleteId ? { athleteId } : {}),
      ...(sport ? { sport } : {}),
      ...(source ? { source } : {}),
      ...(q
        ? {
            relationship: {
              ...visibleRelationship,
              athlete: { name: { contains: q, mode: 'insensitive' } },
            },
          }
        : {}),
      ...(from || to
        ? {
            startedAt: {
              ...(from ? { gte: new Date(from) } : {}),
              ...(to
                ? { lt: new Date(new Date(to).getTime() + 86400000) }
                : {}),
            },
          }
        : {}),
      ...(status
        ? { samples: status === 'with_samples' ? { some: {} } : { none: {} } }
        : {}),
    };
    const [items, total, stats] = await this.db.$transaction([
      this.db.activity.findMany({
        where,
        include,
        orderBy: [{ startedAt: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.db.activity.count({ where }),
      this.db.activity.aggregate({
        where,
        _sum: { distanceMeters: true, durationSeconds: true },
        _count: { distanceMeters: true, durationSeconds: true },
      }),
    ]);
    return {
      items: items.map((item) => this.dto(item)),
      total,
      page,
      limit,
      stats: {
        distanceMeters: stats._sum.distanceMeters,
        durationSeconds: stats._sum.durationSeconds,
        distanceCount: stats._count.distanceMeters,
        durationCount: stats._count.durationSeconds,
      },
      isSynthetic: this.config.AUTH_MODE === 'demo',
    };
  }
  private dto(item: Prisma.ActivityGetPayload<{ include: typeof include }>) {
    const { relationship, _count, ...data } = item;
    return {
      ...data,
      athleteName: relationship.athlete.name,
      sampleCount: _count.samples,
      splitCount: _count.splits,
      status: _count.samples ? 'with_samples' : 'summary_only',
      cadenceUnit: 'cycles/min',
      ...derivedMetrics(item.distanceMeters, item.durationSeconds),
    };
  }
  async get(coachId: string, id: string) {
    this.uuid(id);
    const item = await this.db.activity.findFirst({
      where: { id, coachId, relationship: visibleRelationship },
      include,
    });
    if (!item) throw new NotFoundException('Atividade não encontrada.');
    const possibleDuplicates = await this.db.activity.count({
      where: {
        coachId,
        athleteId: item.athleteId,
        startedAt: item.startedAt,
        sport: item.sport,
        id: { not: id },
        source: { not: item.source },
        relationship: visibleRelationship,
      },
    });
    return { ...this.dto(item), possibleDuplicates };
  }
  async series(
    coachId: string,
    id: string,
    query: unknown,
    kind: 'samples' | 'splits',
  ) {
    await this.get(coachId, id);
    const parsed = seriesQuery.safeParse(query);
    if (!parsed.success) throw new BadRequestException('Paginação inválida.');
    const { page, limit } = parsed.data;
    // A autorização é reaplicada na consulta para não reabrir acesso após retirada concorrente.
    const where = {
      activityId: id,
      coachId,
      activity: { relationship: visibleRelationship },
    };
    const [items, total] =
      kind === 'samples'
        ? await this.db.$transaction([
            this.db.activitySample.findMany({
              where,
              orderBy: { ordinal: 'asc' },
              skip: (page - 1) * limit,
              take: limit,
            }),
            this.db.activitySample.count({ where }),
          ])
        : await this.db.$transaction([
            this.db.activitySplit.findMany({
              where,
              orderBy: { ordinal: 'asc' },
              skip: (page - 1) * limit,
              take: limit,
            }),
            this.db.activitySplit.count({ where }),
          ]);
    return { items, total, page, limit };
  }
  async imports(coachId: string, athleteId: string) {
    this.uuid(athleteId);
    await this.db.$transaction((tx) =>
      requireEligible(tx, { coachId, athleteId }),
    );
    return this.db.fitImport.findMany({
      where: { coachId, athleteId, relationship: visibleRelationship },
      select: {
        id: true,
        status: true,
        activityId: true,
        attempts: true,
        errorCode: true,
        createdAt: true,
        finishedAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
  }
  async upload(
    coachId: string,
    athleteId: string,
    bytes: unknown,
    confirmed: boolean,
  ) {
    if (this.config.AUTH_MODE !== 'demo') throw new NotFoundException();
    this.uuid(athleteId);
    if (!confirmed || !Buffer.isBuffer(bytes))
      throw new BadRequestException(
        'Envie FIT binário de teste com confirmação demonstrativa.',
      );
    if (!this.queue)
      throw new ServiceUnavailableException('Fila indisponível.');
    await this.db.$transaction(async (tx) => {
      await lockRelationship(tx, { coachId, athleteId });
      await requireEligible(tx, { coachId, athleteId });
    });
    const fileHash = createHash('sha256').update(bytes).digest('hex');
    const prior = await this.db.fitImport.findUnique({
      where: { coachId_fileHash: { coachId, fileHash } },
    });
    if (prior) {
      if (prior.athleteId !== athleteId)
        throw new ConflictException('Arquivo já importado neste treinador.');
      return this.importDto(prior);
    }
    if (this.decoding.has(coachId) || this.decoding.size >= 2)
      throw new HttpException(
        { message: 'Aguarde a importação em andamento.' },
        429,
      );
    this.decoding.add(coachId);
    try {
      const data = await decodeFit(bytes);
      return await this.db.$transaction(async (tx) => {
        await lockRelationship(tx, { coachId, athleteId });
        await requireEligible(tx, { coachId, athleteId });
        // Upsert atômico também serializa o mesmo hash para alunos distintos.
        const event = await tx.fitImport.upsert({
          where: { coachId_fileHash: { coachId, fileHash } },
          create: {
            coachId,
            athleteId,
            fileHash,
            namespace: this.config.GARMIN_QUEUE_NAMESPACE,
            normalized: data as Prisma.InputJsonValue,
          },
          update: {},
        });
        if (event.athleteId !== athleteId)
          throw new ConflictException('Arquivo já importado neste treinador.');
        if (!event.jobId && event.status === 'queued') {
          const jobId = await this.queue!.sendFit(tx, event.id);
          await tx.fitImport.update({
            where: { id: event.id },
            data: { jobId },
          });
          await tx.auditLog.create({
            data: {
              coachId,
              resourceId: event.id,
              action: 'activity.fit.demo.accepted',
            },
          });
        }
        return this.importDto(event);
      });
    } catch (error) {
      if (error instanceof FitDecodeError)
        throw new BadRequestException({
          message:
            'FIT rejeitado: arquivo inválido, não suportado ou limite excedido.',
          code: error.code,
        });
      throw error;
    } finally {
      this.decoding.delete(coachId);
    }
  }
  private importDto(event: {
    id: string;
    status: string;
    activityId: string | null;
  }) {
    return {
      id: event.id,
      status: event.status,
      activityId: event.activityId,
      source: 'manual_fit',
      isSynthetic: true,
    };
  }
}
