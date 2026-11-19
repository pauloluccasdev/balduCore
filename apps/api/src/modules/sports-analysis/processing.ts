import {
  projectActivity,
  projectAnalysis,
  resolveMonitoring,
} from '../monitoring/projection.js';
import { randomUUID } from 'node:crypto';
import type { JobWithMetadata } from 'pg-boss';
import { Prisma, type Activity } from '../../generated/prisma/client.js';
import type { GarminService } from '../garmin-connections/garmin.service.js';
import type {
  IntegrationQueue,
  IntegrationJob,
} from '../activity-processing/queue.js';
import { eligible, lockRelationship } from '../garmin-connections/lifecycle.js';
import { ALGORITHM_VERSION, analyze } from './calculations.js';
export async function enqueueAnalysis(
  tx: Prisma.TransactionClient,
  activity: Activity,
  namespace: string,
  queue?: IntegrationQueue,
) {
  await tx.sportsAnalysis.updateMany({
    where: {
      activityId: activity.id,
      status: { in: ['queued', 'retry', 'processing'] },
      OR: [
        { inputRevision: { not: activity.revision } },
        { inputHash: { not: activity.dataHash } },
        { algorithmVersion: { not: ALGORITHM_VERSION } },
      ],
    },
    data: {
      status: 'cancelled',
      runToken: null,
      leaseUntil: null,
      errorCode: 'obsolete_input',
      finishedAt: new Date(),
    },
  });
  const analysis = await tx.sportsAnalysis.upsert({
    where: {
      activityId_inputRevision_inputHash_algorithmVersion: {
        activityId: activity.id,
        inputRevision: activity.revision,
        inputHash: activity.dataHash,
        algorithmVersion: ALGORITHM_VERSION,
      },
    },
    create: {
      coachId: activity.coachId,
      athleteId: activity.athleteId,
      activityId: activity.id,
      inputRevision: activity.revision,
      inputHash: activity.dataHash,
      algorithmVersion: ALGORITHM_VERSION,
      namespace,
    },
    update: {},
  });
  if (analysis.status === 'queued' && !analysis.jobId && queue) {
    const jobId = await queue.sendAnalysis(tx, analysis.id);
    await tx.sportsAnalysis.update({
      where: { id: analysis.id },
      data: { jobId },
    });
  }
  await projectActivity(tx, activity.id);
  return analysis;
}
export async function cancelAnalyses(
  tx: Prisma.TransactionClient,
  scope: { coachId: string; athleteId: string },
) {
  await tx.sportsAnalysis.updateMany({
    where: { ...scope, status: { in: ['queued', 'retry', 'processing'] } },
    data: {
      status: 'cancelled',
      runToken: null,
      leaseUntil: null,
      errorCode: 'relationship_ended',
      finishedAt: new Date(),
    },
  });
  await resolveMonitoring(tx, scope);
}
export async function recoverAnalyses(service: GarminService) {
  // Se o processo caiu na última tentativa, o transporte não fará um sexto claim.
  // Finalizar somente leases vencidos, sob o mesmo lock usado por publicação/retirada.
  const exhausted = await service.db.sportsAnalysis.findMany({
    where: {
      namespace: service.config.GARMIN_QUEUE_NAMESPACE,
      status: 'processing',
      attempts: { gte: 5 },
      leaseUntil: { lte: new Date() },
    },
    take: 50,
  });
  for (const seed of exhausted)
    await service.db.$transaction(async (tx) => {
      await lockRelationship(tx, seed);
      await tx.sportsAnalysis.updateMany({
        where: {
          id: seed.id,
          status: 'processing',
          attempts: { gte: 5 },
          leaseUntil: { lte: new Date() },
        },
        data: {
          status: 'failed',
          runToken: null,
          leaseUntil: null,
          errorCode: 'retry_exhausted',
          finishedAt: new Date(),
        },
      });
      await projectAnalysis(tx, seed.id);
    });

  const seeds = await service.db.sportsAnalysis.findMany({
    where: {
      namespace: service.config.GARMIN_QUEUE_NAMESPACE,
      status: 'queued',
      jobId: null,
    },
    take: 50,
  });
  for (const seed of seeds)
    await service.db.$transaction(async (tx) => {
      await lockRelationship(tx, seed);
      const current = await tx.sportsAnalysis.findUniqueOrThrow({
        where: { id: seed.id },
      });
      if (current.status !== 'queued' || current.jobId) return;
      const jobId = await service.queue!.sendAnalysis(tx, current.id);
      await tx.sportsAnalysis.update({
        where: { id: current.id },
        data: { jobId },
      });
    });
}
export async function processAnalysis(
  service: GarminService,
  job: JobWithMetadata<IntegrationJob>,
) {
  const { db, config } = service;
  const seed = await db.sportsAnalysis.findFirst({
    where: { id: job.data.eventId, namespace: config.GARMIN_QUEUE_NAMESPACE },
  });
  if (!seed) return;
  const runToken = randomUUID(),
    leaseUntil = new Date(
      new Date(job.startedOn!).getTime() + job.expireInSeconds * 1000,
    );
  const captured = await db.$transaction(
    async (tx) => {
      await lockRelationship(tx, seed);
      const current = await tx.sportsAnalysis.findUniqueOrThrow({
        where: { id: seed.id },
        include: {
          activity: {
            include: {
              samples: { orderBy: { ordinal: 'asc' } },
              splits: { orderBy: { ordinal: 'asc' } },
            },
          },
        },
      });
      if (!['queued', 'retry', 'processing'].includes(current.status))
        return null;
      const activity = current.activity;
      const valid =
        activity.revision === current.inputRevision &&
        activity.dataHash === current.inputHash &&
        current.algorithmVersion === ALGORITHM_VERSION;
      if (!valid || !(await eligible(tx, current))) {
        await tx.sportsAnalysis.update({
          where: { id: current.id },
          data: {
            status: 'cancelled',
            runToken: null,
            leaseUntil: null,
            errorCode: valid ? 'relationship_ended' : 'obsolete_input',
            finishedAt: new Date(),
          },
        });
        return null;
      }
      if (current.attempts >= 5) {
        await tx.sportsAnalysis.update({
          where: { id: current.id },
          data: {
            status: 'failed',
            runToken: null,
            leaseUntil: null,
            errorCode: 'retry_exhausted',
            finishedAt: new Date(),
          },
        });
        await projectAnalysis(tx, current.id);
        return null;
      }
      const analysis = await tx.sportsAnalysis.update({
        where: { id: current.id },
        data: {
          status: 'processing',
          attempts: { increment: 1 },
          runToken,
          leaseUntil,
        },
      });
      return { analysis, activity };
    },
    { timeout: 15000 },
  );
  if (!captured) return;
  let permanent = false;
  try {
    let result;
    try {
      result = analyze(captured.activity);
    } catch {
      permanent = true;
      throw new Error('invalid_analysis_input');
    }
    await db.$transaction(async (tx) => {
      await lockRelationship(tx, seed);
      const current = await tx.sportsAnalysis.findUniqueOrThrow({
        where: { id: seed.id },
        include: { activity: true },
      });
      if (current.status !== 'processing' || current.runToken !== runToken)
        return;
      if (
        current.activity.revision !== current.inputRevision ||
        current.activity.dataHash !== current.inputHash ||
        !(await eligible(tx, current))
      ) {
        await tx.sportsAnalysis.update({
          where: { id: current.id },
          data: {
            status: 'cancelled',
            runToken: null,
            leaseUntil: null,
            errorCode: 'input_no_longer_authorized',
            finishedAt: new Date(),
          },
        });
        return;
      }
      if (leaseUntil <= new Date()) throw new Error('lease_expired');
      await tx.sportsAnalysis.update({
        where: { id: current.id },
        data: {
          status: 'completed',
          result: result as Prisma.InputJsonValue,
          runToken: null,
          leaseUntil: null,
          errorCode: null,
          finishedAt: new Date(),
        },
      });
      await projectAnalysis(tx, current.id);
      await tx.auditLog.create({
        data: {
          coachId: current.coachId,
          resourceId: current.id,
          action: 'analysis.deterministic.completed',
        },
      });
    });
  } catch {
    const retry = !permanent && captured.analysis.attempts < 5;
    const updated = await db.$transaction(async (tx) => {
      await lockRelationship(tx, seed);
      const updated = await tx.sportsAnalysis.updateMany({
        where: { id: seed.id, status: 'processing', runToken },
        data: {
          status: retry ? 'retry' : 'failed',
          runToken: null,
          leaseUntil: null,
          errorCode: permanent
            ? 'invalid_analysis_input'
            : retry
              ? 'analysis_unavailable'
              : 'retry_exhausted',
          ...(!retry ? { finishedAt: new Date() } : {}),
        },
      });
      if (updated.count) await projectAnalysis(tx, seed.id);
      return updated;
    });
    if (updated.count && retry) throw new Error('analysis_retry');
  }
}
