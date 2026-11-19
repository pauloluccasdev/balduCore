import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { z } from 'zod';
import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';
import type { Config } from '../../config.js';
import type { IntegrationQueue } from '../activity-processing/queue.js';
import {
  eligible,
  lockRelationship,
  requireEligible,
} from '../garmin-connections/lifecycle.js';
import {
  ALGORITHM_VERSION,
  compare,
  resultSchema,
  segmentSchema,
  type Input,
} from './calculations.js';
import { enqueueAnalysis } from './processing.js';
import { series } from './series.js';
const querySchema = z
  .object({
    axis: z.enum(['time', 'distance']).default('time'),
    eventPage: z.coerce.number().int().min(1).max(120).default(1),
    splitPage: z.coerce.number().int().min(1).max(20).default(1),
  })
  .strict();
const comparisonSchema = z
  .object({
    inputRevision: z.number().int().positive(),
    inputHash: z.string().regex(/^[a-f0-9]{64}$/),
    segments: z.array(segmentSchema).length(2),
  })
  .strict();
export class AnalysisService {
  constructor(
    readonly db: PrismaClient,
    readonly config: Config,
    readonly queue?: IntegrationQueue,
  ) {}
  private async authorized<T>(
    coachId: string,
    id: string,
    action: (tx: Prisma.TransactionClient, input: Input) => Promise<T>,
  ) {
    if (!z.uuid().safeParse(id).success)
      throw new NotFoundException('Atividade não encontrada.');
    return this.db.$transaction(
      async (tx) => {
        const seed = await tx.activity.findFirst({
          where: { id, coachId },
          select: { coachId: true, athleteId: true },
        });
        if (!seed) throw new NotFoundException('Atividade não encontrada.');
        await lockRelationship(tx, seed);
        if (!(await eligible(tx, seed)))
          throw new NotFoundException('Atividade não encontrada.');
        const input = await tx.activity.findUniqueOrThrow({
          where: { id },
          include: {
            samples: { orderBy: { ordinal: 'asc' } },
            splits: { orderBy: { ordinal: 'asc' } },
          },
        });
        return action(tx, input);
      },
      { timeout: 15000 },
    );
  }
  async get(coachId: string, id: string, raw: unknown) {
    const parsed = querySchema.safeParse(raw);
    if (!parsed.success)
      throw new BadRequestException('Consulta de análise inválida.');
    const { axis, eventPage, splitPage } = parsed.data;
    return this.authorized(coachId, id, async (tx, input) => {
      const snapshot = await tx.sportsAnalysis.findUnique({
        where: {
          activityId_inputRevision_inputHash_algorithmVersion: {
            activityId: id,
            inputRevision: input.revision,
            inputHash: input.dataHash,
            algorithmVersion: ALGORITHM_VERSION,
          },
        },
      });
      const previous = snapshot
        ? null
        : await tx.sportsAnalysis.findFirst({
            where: { activityId: id },
            select: { id: true },
            orderBy: { createdAt: 'desc' },
          });
      const result =
        snapshot?.status === 'completed'
          ? resultSchema.parse(snapshot.result)
          : null;
      const athlete = await tx.athlete.findUniqueOrThrow({
        where: { id: input.athleteId },
        select: { name: true },
      });
      return {
        activity: {
          id: input.id,
          athleteId: input.athleteId,
          athleteName: athlete.name,
          sport: input.sport,
          source: input.source,
          isSynthetic: input.isSynthetic,
          startedAt: input.startedAt,
          revision: input.revision,
          dataHash: input.dataHash,
          distanceMeters: input.distanceMeters,
          durationSeconds: input.durationSeconds,
          durationBasis: input.durationBasis,
          timerSeconds: input.timerSeconds,
          elapsedSeconds: input.elapsedSeconds,
          avgHeartRateBpm: input.avgHeartRateBpm,
          maxHeartRateBpm: input.maxHeartRateBpm,
          avgCadenceRpm: input.avgCadenceRpm,
          totalAscentMeters: input.totalAscentMeters,
        },
        analysis: {
          id: snapshot?.id ?? null,
          status: snapshot?.status ?? 'not_requested',
          obsolete: !snapshot && Boolean(previous),
          version: ALGORITHM_VERSION,
          attempts: snapshot?.attempts ?? 0,
          errorCode: snapshot?.errorCode ?? null,
          finishedAt: snapshot?.finishedAt ?? null,
          result: result
            ? {
                ...result,
                events: result.events.slice(
                  (eventPage - 1) * 50,
                  eventPage * 50,
                ),
                eventCount: result.events.length,
              }
            : null,
        },
        eventPage,
        splitPage,
        series: series(input, axis),
        splits: {
          items: input.splits.slice((splitPage - 1) * 100, splitPage * 100),
          total: input.splits.length,
          page: splitPage,
          limit: 100,
        },
      };
    });
  }
  async request(coachId: string, id: string, body: unknown) {
    if (!z.object({}).strict().safeParse(body).success)
      throw new BadRequestException('Solicitação inválida.');
    if (!this.queue)
      throw new ServiceUnavailableException(
        'Processamento indisponível neste ambiente.',
      );
    return this.authorized(coachId, id, async (tx, input) => {
      await requireEligible(tx, input);
      const analysis = await enqueueAnalysis(
        tx,
        input,
        this.config.GARMIN_QUEUE_NAMESPACE,
        this.queue,
      );
      // Retry explícito somente após falha terminal da mesma versão; snapshot concluído é imutável.
      if (analysis.status === 'failed') {
        const jobId = await this.queue!.sendAnalysis(tx, analysis.id);
        await tx.sportsAnalysis.update({
          where: { id: analysis.id },
          data: {
            status: 'queued',
            attempts: 0,
            errorCode: null,
            finishedAt: null,
            runToken: null,
            leaseUntil: null,
            jobId,
          },
        });
      }
      await tx.auditLog.create({
        data: {
          coachId,
          resourceId: analysis.id,
          action: 'analysis.deterministic.requested',
        },
      });
      return {
        id: analysis.id,
        status: analysis.status === 'failed' ? 'queued' : analysis.status,
      };
    });
  }
  async comparison(coachId: string, id: string, raw: unknown) {
    const parsed = comparisonSchema.safeParse(raw);
    if (!parsed.success)
      throw new BadRequestException(
        'Selecione exatamente dois trechos válidos e a revisão atual.',
      );
    return this.authorized(coachId, id, async (_tx, input) => {
      if (
        input.revision !== parsed.data.inputRevision ||
        input.dataHash !== parsed.data.inputHash
      )
        throw new ConflictException(
          'Atividade atualizada. Atualize a análise antes de comparar.',
        );
      return {
        activityId: id,
        inputRevision: input.revision,
        inputHash: input.dataHash,
        algorithmVersion: ALGORITHM_VERSION,
        ...compare(input, parsed.data.segments),
      };
    });
  }
}
