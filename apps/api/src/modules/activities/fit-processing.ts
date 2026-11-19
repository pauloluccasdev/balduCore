import { projectFit } from '../monitoring/projection.js';
import { enqueueAnalysis } from '../sports-analysis/processing.js';
import { randomUUID } from 'node:crypto';
import type { JobWithMetadata } from 'pg-boss';
import { Prisma } from '../../generated/prisma/client.js';
import type { GarminService } from '../garmin-connections/garmin.service.js';
import { eligible, lockRelationship } from '../garmin-connections/lifecycle.js';
import type { IntegrationJob } from '../activity-processing/queue.js';
import {
  activityDataSchema,
  summaryData,
  replaceDetails,
} from './activity-data.js';
import { digest } from '../auth/security.js';
export async function cancelFitImports(
  tx: Prisma.TransactionClient,
  scope: { coachId: string; athleteId: string },
) {
  await tx.fitImport.updateMany({
    where: {
      ...scope,
      status: { in: ['queued', 'retry', 'processing', 'failed'] },
    },
    data: {
      status: 'cancelled',
      normalized: Prisma.DbNull,
      runToken: null,
      leaseUntil: null,
      errorCode: 'relationship_ended',
      finishedAt: new Date(),
    },
  });
}
export async function recoverFitImports(service: GarminService) {
  const exhausted = await service.db.fitImport.findMany({
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
      const changed = await tx.fitImport.updateMany({
        where: {
          id: seed.id,
          status: 'processing',
          attempts: { gte: 5 },
          leaseUntil: { lte: new Date() },
        },
        data: {
          status: 'failed',
          normalized: Prisma.DbNull,
          runToken: null,
          leaseUntil: null,
          errorCode: 'retry_exhausted',
          finishedAt: new Date(),
        },
      });
      if (changed.count) await projectFit(tx, seed.id);
    });
  const seeds = await service.db.fitImport.findMany({
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
      const current = await tx.fitImport.findUniqueOrThrow({
        where: { id: seed.id },
      });
      if (current.jobId || current.status !== 'queued') return;
      const jobId = await service.queue!.sendFit(tx, current.id);
      await tx.fitImport.update({ where: { id: current.id }, data: { jobId } });
    });
}
export async function processFitImport(
  service: GarminService,
  job: JobWithMetadata<IntegrationJob>,
) {
  const { db, config } = service;
  const seed = await db.fitImport.findFirst({
    where: { id: job.data.eventId, namespace: config.GARMIN_QUEUE_NAMESPACE },
  });
  if (!seed) return;
  const runToken = randomUUID();
  const leaseUntil = new Date(
    new Date(job.startedOn!).getTime() + job.expireInSeconds * 1000,
  );
  const event = await db.$transaction(async (tx) => {
    await lockRelationship(tx, seed);
    const current = await tx.fitImport.findUniqueOrThrow({
      where: { id: seed.id },
    });
    if (!['queued', 'retry', 'processing'].includes(current.status))
      return null;
    if (!(await eligible(tx, current))) {
      await cancelFitImports(tx, {
        coachId: current.coachId,
        athleteId: current.athleteId,
      });
      return null;
    }
    if (current.attempts >= 5) {
      await tx.fitImport.update({
        where: { id: current.id },
        data: {
          status: 'failed',
          errorCode: 'retry_exhausted',
          normalized: Prisma.DbNull,
          runToken: null,
          leaseUntil: null,
          finishedAt: new Date(),
        },
      });
      await projectFit(tx, current.id);
      return null;
    }
    return tx.fitImport.update({
      where: { id: current.id },
      data: {
        status: 'processing',
        attempts: { increment: 1 },
        runToken,
        leaseUntil,
      },
    });
  });
  if (!event) return;
  try {
    const data = activityDataSchema.parse(event.normalized);
    await db.$transaction(
      async (tx) => {
        await lockRelationship(tx, event);
        const current = await tx.fitImport.findUniqueOrThrow({
          where: { id: event.id },
        });
        if (current.status !== 'processing' || current.runToken !== runToken)
          return;
        if (!current.leaseUntil || current.leaseUntil <= new Date())
          throw new Error('lease_expired');
        if (!(await eligible(tx, current))) {
          await cancelFitImports(tx, {
            coachId: current.coachId,
            athleteId: current.athleteId,
          });
          return;
        }
        const activity = await tx.activity.create({
          data: {
            coachId: event.coachId,
            athleteId: event.athleteId,
            connectionId: null,
            generation: 0,
            externalId: event.id,
            revision: 1,
            source: 'manual_fit',
            isSynthetic: true,
            ...summaryData(data),
            dataHash: digest(JSON.stringify(data)),
          },
        });
        await replaceDetails(tx, activity, data);
        await enqueueAnalysis(
          tx,
          activity,
          config.GARMIN_QUEUE_NAMESPACE,
          service.queue,
        );
        if (leaseUntil <= new Date()) throw new Error('lease_expired');
        await tx.fitImport.update({
          where: { id: event.id },
          data: {
            status: 'processed',
            activityId: activity.id,
            normalized: Prisma.DbNull,
            runToken: null,
            leaseUntil: null,
            errorCode: null,
            finishedAt: new Date(),
          },
        });
        await projectFit(tx, event.id);
        await tx.auditLog.create({
          data: {
            coachId: event.coachId,
            resourceId: activity.id,
            action: 'activity.fit.demo.published',
          },
        });
      },
      { timeout: 15000 },
    );
  } catch {
    const retry = event.attempts < 5;
    const updated = await db.$transaction(async (tx) => {
      await lockRelationship(tx, seed);
      const updated = await tx.fitImport.updateMany({
        where: { id: event.id, status: 'processing', runToken },
        data: {
          status: retry ? 'retry' : 'failed',
          runToken: null,
          leaseUntil: null,
          errorCode: retry ? 'publication_unavailable' : 'retry_exhausted',
          ...(!retry
            ? { normalized: Prisma.DbNull, finishedAt: new Date() }
            : {}),
        },
      });
      if (updated.count) await projectFit(tx, seed.id);
      return updated;
    });
    if (updated.count && retry) throw new Error('fit_publication_retry');
  }
}
