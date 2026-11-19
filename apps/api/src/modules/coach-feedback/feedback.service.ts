import { projectActivity } from '../monitoring/projection.js';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { z } from 'zod';
import type {
  Prisma,
  PrismaClient,
  Activity,
} from '../../generated/prisma/client.js';
import { lockRelationship, eligible } from '../garmin-connections/lifecycle.js';
import { derivedMetrics } from '../activities/activity-data.js';
import {
  ALGORITHM_VERSION,
  resultSchema,
} from '../sports-analysis/calculations.js';
import {
  contentSchema,
  emptyContent,
  saveSchema,
  pageSchema,
} from './contracts.js';
const notFound = () => new NotFoundException('Diário não encontrado.');
export class FeedbackService {
  constructor(readonly db: PrismaClient) {}
  private async authorized<T>(
    coachId: string,
    id: string,
    action: (tx: Prisma.TransactionClient, activity: Activity) => Promise<T>,
  ) {
    if (!z.uuid().safeParse(id).success) throw notFound();
    return this.db.$transaction(async (tx) => {
      const seed = await tx.activity.findFirst({ where: { id, coachId } });
      if (!seed) throw notFound();
      await lockRelationship(tx, seed);
      if (!(await eligible(tx, seed))) throw notFound();
      // Releitura depois do lock: ingestão pode ter publicado uma revisão enquanto esperávamos.
      const activity = await tx.activity.findUniqueOrThrow({ where: { id } });
      return action(tx, activity);
    });
  }
  private snapshot(tx: Prisma.TransactionClient, activity: Activity) {
    return tx.sportsAnalysis.findUnique({
      where: {
        activityId_inputRevision_inputHash_algorithmVersion: {
          activityId: activity.id,
          inputRevision: activity.revision,
          inputHash: activity.dataHash,
          algorithmVersion: ALGORITHM_VERSION,
        },
      },
    });
  }
  async get(coachId: string, id: string, raw: unknown) {
    const query = pageSchema.safeParse(raw);
    if (!query.success) throw new BadRequestException('Página inválida.');
    return this.authorized(coachId, id, async (tx, activity) => {
      const feedback = await tx.coachFeedback.findUnique({
        where: { activityId: id },
      });
      const current = feedback
        ? await tx.coachFeedbackRevision.findUniqueOrThrow({
            where: {
              feedbackId_version: {
                feedbackId: feedback.id,
                version: feedback.version,
              },
            },
          })
        : null;
      const analysis = await this.snapshot(tx, activity);
      const result =
        analysis?.status === 'completed'
          ? resultSchema.parse(analysis.result)
          : null;
      const athlete = await tx.athlete.findUniqueOrThrow({
        where: { id: activity.athleteId },
        select: { name: true },
      });
      return {
        activity: {
          id,
          athleteId: activity.athleteId,
          athleteName: athlete.name,
          sport: activity.sport,
          startedAt: activity.startedAt,
          source: activity.source,
          isSynthetic: activity.isSynthetic,
          revision: activity.revision,
          dataHash: activity.dataHash,
          distanceMeters: activity.distanceMeters,
          durationSeconds: activity.durationSeconds,
          durationBasis: activity.durationBasis,
          ...derivedMetrics(activity.distanceMeters, activity.durationSeconds),
          avgHeartRateBpm: activity.avgHeartRateBpm,
        },
        version: feedback?.version ?? 0,
        current,
        content: current
          ? contentSchema.parse(current.content)
          : emptyContent(),
        obsolete: Boolean(
          current &&
          (current.inputRevision !== activity.revision ||
            current.inputHash !== activity.dataHash ||
            (current.analysisId !== null &&
              current.analysisId !== (result ? analysis!.id : null))),
        ),
        analysis: {
          id: result ? analysis!.id : null,
          status: analysis?.status ?? 'not_requested',
          version: ALGORITHM_VERSION,
          summary: result?.summary ?? null,
          events:
            result?.events.slice(
              (query.data.page - 1) * 50,
              query.data.page * 50,
            ) ?? [],
          total: result?.events.length ?? 0,
          page: query.data.page,
          limit: 50,
        },
      };
    });
  }
  async save(coachId: string, id: string, raw: unknown) {
    if (Buffer.byteLength(JSON.stringify(raw) ?? '') > 65536)
      throw new BadRequestException('Diário excede 64 KiB.');
    const parsed = saveSchema.safeParse(raw);
    if (!parsed.success)
      throw new BadRequestException(
        'Diário inválido. Confira campos e limites.',
      );
    const body = parsed.data;
    return this.authorized(coachId, id, async (tx, activity) => {
      if (
        body.inputRevision !== activity.revision ||
        body.inputHash !== activity.dataHash
      )
        throw new ConflictException(
          'A atividade foi atualizada. Recarregue e confirme o novo contexto.',
        );
      let feedback = await tx.coachFeedback.findUnique({
        where: { activityId: id },
      });
      if ((feedback?.version ?? 0) !== body.expectedVersion)
        throw new ConflictException(
          'O diário foi editado em outra sessão. Recarregue para conferir a versão salva; seu texto local foi preservado.',
        );
      const previous = feedback
        ? await tx.coachFeedbackRevision.findUniqueOrThrow({
            where: {
              feedbackId_version: {
                feedbackId: feedback.id,
                version: feedback.version,
              },
            },
          })
        : null;
      const currentSnapshot = await this.snapshot(tx, activity);
      const changedContext =
        previous &&
        (previous.inputRevision !== activity.revision ||
          previous.inputHash !== activity.dataHash ||
          (previous.analysisId !== null &&
            (previous.analysisId !== currentSnapshot?.id ||
              currentSnapshot.status !== 'completed')));
      if (
        changedContext &&
        (!body.confirmContext || body.content.verdicts.length > 0)
      )
        throw new ConflictException(
          'Confirme o novo contexto sem reaplicar avaliações antigas.',
        );
      const snapshot = body.analysisId ? currentSnapshot : null;
      if (
        body.analysisId &&
        (snapshot?.id !== body.analysisId || snapshot.status !== 'completed')
      )
        throw new ConflictException('Análise desatualizada ou indisponível.');
      if (body.content.verdicts.length) {
        if (!snapshot || snapshot.status !== 'completed')
          throw new BadRequestException('Avaliações exigem análise concluída.');
        const result = resultSchema.parse(snapshot.result);
        const ids = new Set(result.events.map((e) => e.id));
        if (body.content.verdicts.some((v) => !ids.has(v.eventId)))
          throw new BadRequestException(
            'Evento não pertence à análise indicada.',
          );
      }
      const lastSample = await tx.activitySample.findFirst({
        where: { activityId: id },
        orderBy: { timestamp: 'desc' },
        select: { timestamp: true },
      });
      const elapsed =
        activity.elapsedSeconds ??
        (lastSample
          ? (lastSample.timestamp.getTime() - activity.startedAt.getTime()) /
            1000
          : null);
      for (const point of body.content.points) {
        const scope = point.scope;
        if (scope.kind === 'whole') continue;
        const maximum =
          scope.kind === 'distance' ? activity.distanceMeters : elapsed;
        if (maximum === null || scope.to > maximum)
          throw new BadRequestException(
            'Intervalo fora dos dados disponíveis. Use metros ou segundos decorridos desde o início.',
          );
      }
      if (
        !feedback &&
        !body.content.execution &&
        !body.content.observations &&
        !body.content.decisions &&
        !body.content.points.length &&
        !body.content.verdicts.length
      )
        throw new BadRequestException(
          'Preencha ao menos um campo antes de salvar.',
        );
      if (
        previous &&
        !changedContext &&
        previous.analysisId === body.analysisId &&
        JSON.stringify(contentSchema.parse(previous.content)) ===
          JSON.stringify(body.content)
      )
        return { version: feedback!.version, unchanged: true };
      const version = body.expectedVersion + 1;
      if (feedback) {
        const updated = await tx.coachFeedback.updateMany({
          where: { id: feedback.id, version: body.expectedVersion },
          data: { version },
        });
        if (updated.count !== 1)
          throw new ConflictException(
            'Conflito de edição. Recarregue o diário.',
          );
      } else
        feedback = await tx.coachFeedback.create({
          data: {
            coachId,
            athleteId: activity.athleteId,
            activityId: id,
            version,
          },
        });
      await tx.coachFeedbackRevision.create({
        data: {
          coachId,
          athleteId: activity.athleteId,
          activityId: id,
          feedbackId: feedback.id,
          version,
          inputRevision: activity.revision,
          inputHash: activity.dataHash,
          analysisId: body.analysisId,
          content: body.content,
        },
      });
      await projectActivity(tx, id);
      await tx.auditLog.create({
        data: {
          coachId,
          resourceId: feedback.id,
          action: 'feedback.revision.created',
        },
      });
      return { version, unchanged: false };
    });
  }
  async revisions(coachId: string, id: string, raw: unknown, version?: string) {
    const parsed = pageSchema.safeParse(raw);
    if (
      !parsed.success ||
      (version !== undefined &&
        (!/^[1-9]\d{0,9}$/.test(version) || Number(version) > 2147483647))
    )
      throw new BadRequestException('Página ou versão inválida.');
    return this.authorized(coachId, id, async (tx) => {
      if (version !== undefined) {
        const item = await tx.coachFeedbackRevision.findFirst({
          where: { coachId, activityId: id, version: Number(version) },
        });
        if (!item) throw notFound();
        const author = await tx.coach.findUniqueOrThrow({
          where: { id: item.coachId },
          select: { name: true },
        });
        return { ...item, authorName: author.name };
      }
      const where = { coachId, activityId: id };
      return {
        items: await tx.coachFeedbackRevision.findMany({
          where,
          orderBy: { version: 'desc' },
          skip: (parsed.data.page - 1) * 20,
          take: 20,
          select: {
            version: true,
            createdAt: true,
            coachId: true,
            inputRevision: true,
            inputHash: true,
            analysisId: true,
          },
        }),
        total: await tx.coachFeedbackRevision.count({ where }),
        page: parsed.data.page,
        limit: 20,
      };
    });
  }
  async forAthlete(coachId: string, athleteId: string, raw: unknown) {
    const parsed = pageSchema.safeParse(raw);
    if (!parsed.success) throw new BadRequestException('Página inválida.');
    if (!z.uuid().safeParse(athleteId).success) throw notFound();
    return this.db.$transaction(async (tx) => {
      const scope = { coachId, athleteId };
      await lockRelationship(tx, scope);
      if (!(await eligible(tx, scope))) throw notFound();
      const where = scope;
      return {
        items: await tx.coachFeedback.findMany({
          where,
          orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
          skip: (parsed.data.page - 1) * 20,
          take: 20,
          select: {
            activityId: true,
            version: true,
            updatedAt: true,
            activity: {
              select: { sport: true, startedAt: true, isSynthetic: true },
            },
          },
        }),
        total: await tx.coachFeedback.count({ where }),
        page: parsed.data.page,
        limit: 20,
      };
    });
  }
}
