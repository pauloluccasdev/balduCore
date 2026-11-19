import {
  processFitImport,
  recoverFitImports,
} from '../activities/fit-processing.js';
import { summaryData, replaceDetails } from '../activities/activity-data.js';
import { randomUUID } from 'node:crypto';
import type { JobWithMetadata } from 'pg-boss';
import type { Logger } from 'pino';
import { digest, decrypt } from '../auth/security.js';
import { GarminService } from '../garmin-connections/garmin.service.js';
import { eligible, lockRelationship } from '../garmin-connections/lifecycle.js';
import {
  ProviderFailure,
  type ProviderDelivery,
} from '../garmin-connections/provider.js';
import type { IntegrationJob } from './queue.js';

export class ActivityProcessingWorker {
  private started = false;
  private timer?: ReturnType<typeof setInterval>;
  constructor(
    readonly garmin: GarminService,
    private readonly logger: Logger,
  ) {}
  async recoverIntents() {
    await recoverFitImports(this.garmin);
    const seeds = await this.garmin.db.integrationEvent.findMany({
      where: {
        namespace: this.garmin.config.GARMIN_QUEUE_NAMESPACE,
        jobId: null,
        status: 'queued',
      },
      take: 50,
    });
    for (const seed of seeds)
      await this.garmin.db.$transaction(async (tx) => {
        await lockRelationship(tx, seed);
        const event = await tx.integrationEvent.findUniqueOrThrow({
          where: { id: seed.id },
        });
        if (event.jobId || event.status !== 'queued') return;
        const jobId = await this.garmin.queue!.send(tx, event.id);
        await tx.integrationEvent.update({
          where: { id: event.id },
          data: { jobId },
        });
      });
  }
  async heartbeat() {
    await this.garmin.db.workerHeartbeat.upsert({
      where: { name: this.garmin.config.GARMIN_QUEUE_NAMESPACE },
      create: {
        name: this.garmin.config.GARMIN_QUEUE_NAMESPACE,
        seenAt: new Date(),
      },
      update: { seenAt: new Date() },
    });
    await this.recoverIntents();
  }
  async start() {
    await this.heartbeat();
    this.started = true;
    await this.garmin.queue!.work((job) => this.process(job));
    this.timer = setInterval(() => {
      void this.heartbeat().catch(() =>
        this.logger.error(
          { code: 'GARMIN_HEARTBEAT_FAILED' },
          'worker_heartbeat_failed',
        ),
      );
    }, 5000);
  }
  async stop() {
    if (!this.started) return;
    this.started = false;
    if (this.timer) clearInterval(this.timer);
    await this.garmin.queue!.boss.offWork(this.garmin.queue!.name);
    await this.garmin.db.workerHeartbeat.deleteMany({
      where: { name: this.garmin.config.GARMIN_QUEUE_NAMESPACE },
    });
  }
  async process(job: JobWithMetadata<IntegrationJob>) {
    if (job.data.kind === 'fit') return processFitImport(this.garmin, job);
    const { db, config } = this.garmin;
    const runToken = randomUUID();
    const leaseUntil = new Date(
      new Date(job.startedOn!).getTime() + job.expireInSeconds * 1000,
    );
    const seed = await db.integrationEvent.findFirst({
      where: { id: job.data.eventId, namespace: config.GARMIN_QUEUE_NAMESPACE },
    });
    if (!seed) return;
    const event = await db.$transaction(async (tx) => {
      await lockRelationship(tx, seed);
      const current = await tx.integrationEvent.findUniqueOrThrow({
        where: { id: seed.id },
        include: { connection: true },
      });
      if (!['queued', 'retry', 'processing'].includes(current.status))
        return null;
      if (
        current.kind === 'activity' &&
        (current.connection.status !== 'connected' ||
          current.connection.generation !== current.generation ||
          !(await eligible(tx, current)))
      ) {
        await tx.integrationEvent.update({
          where: { id: current.id },
          data: {
            status: 'cancelled',
            errorCode: 'connection_revoked',
            encryptedPayload: null,
            runToken: null,
            leaseUntil: null,
          },
        });
        return null;
      }
      if (current.attempts >= 5) {
        await tx.integrationEvent.update({
          where: { id: current.id },
          data: {
            status: 'failed',
            errorCode: 'retry_exhausted',
            runToken: null,
            leaseUntil: null,
          },
        });
        if (current.kind === 'revoke')
          await tx.garminConnection.update({
            where: { id: current.connectionId },
            data: { revocationStatus: 'failed' },
          });
        return null;
      }
      return tx.integrationEvent.update({
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
      if (!event.encryptedPayload)
        throw new ProviderFailure('payload_unavailable', false);
      if (event.kind === 'revoke') {
        await this.garmin.provider!.revoke(
          this.garmin.decodeCredentials(event.encryptedPayload),
          event.attempts,
        );
        await db.$transaction(async (tx) => {
          await lockRelationship(tx, event);
          const current = await tx.integrationEvent.findUniqueOrThrow({
            where: { id: event.id },
          });
          if (current.runToken !== runToken || current.status !== 'processing')
            return;
          if (!current.leaseUntil || current.leaseUntil <= new Date())
            throw new ProviderFailure('processing_lease_expired', true);
          await tx.integrationEvent.update({
            where: { id: event.id },
            data: {
              status: 'processed',
              encryptedPayload: null,
              processedAt: new Date(),
              errorCode: null,
              runToken: null,
              leaseUntil: null,
            },
          });
          await tx.garminConnection.updateMany({
            where: {
              id: event.connectionId,
              generation: event.generation + 1,
              status: 'disconnected',
            },
            data: { revocationStatus: 'completed', lastError: null },
          });
        });
      } else {
        await this.garmin.credentials(event.connectionId, event.generation);
        let delivery: ProviderDelivery;
        try {
          delivery = JSON.parse(
            decrypt(event.encryptedPayload, config.GARMIN_TOKEN_KEY),
          ) as ProviderDelivery;
        } catch {
          throw new ProviderFailure('payload_unreadable', false);
        }
        const normalized = await this.garmin.provider!.normalize(
          delivery,
          event.attempts,
        );
        await db.$transaction(async (tx) => {
          await lockRelationship(tx, event);
          const current = await tx.integrationEvent.findUniqueOrThrow({
            where: { id: event.id },
            include: { connection: true },
          });
          if (current.runToken !== runToken || current.status !== 'processing')
            return;
          if (!current.leaseUntil || current.leaseUntil <= new Date())
            throw new ProviderFailure('processing_lease_expired', true);
          if (
            current.connection.generation !== event.generation ||
            current.connection.status !== 'connected' ||
            !(await eligible(tx, event))
          ) {
            await tx.integrationEvent.update({
              where: { id: event.id },
              data: {
                status: 'cancelled',
                encryptedPayload: null,
                errorCode: 'connection_revoked',
                runToken: null,
                leaseUntil: null,
              },
            });
            return;
          }
          const identity = {
            connectionId: event.connectionId,
            generation: event.generation,
            externalId: normalized.externalId,
          };
          const existing = await tx.activity.findUnique({
            where: { connectionId_generation_externalId: identity },
          });
          const dataHash = digest(JSON.stringify(normalized));
          if (
            existing &&
            existing.revision === normalized.revision &&
            existing.dataHash !== dataHash
          )
            throw new ProviderFailure('revision_conflict', false);
          const obsolete = Boolean(
            existing && existing.revision >= normalized.revision,
          );
          if (!obsolete) {
            const activity = await tx.activity.upsert({
              where: { connectionId_generation_externalId: identity },
              create: {
                coachId: event.coachId,
                athleteId: event.athleteId,
                ...identity,
                ...summaryData(normalized),
                revision: normalized.revision,
                source: normalized.source,
                isSynthetic: normalized.isSynthetic,
                dataHash,
              },
              update: {
                ...summaryData(normalized),
                revision: normalized.revision,
                dataHash,
              },
            });
            await replaceDetails(tx, activity, normalized);
          }
          await tx.integrationEvent.update({
            where: { id: event.id },
            data: {
              status: obsolete ? 'ignored' : 'processed',
              encryptedPayload: null,
              processedAt: new Date(),
              errorCode: null,
              runToken: null,
              leaseUntil: null,
            },
          });
          await tx.garminConnection.update({
            where: { id: event.connectionId },
            data: { lastSyncedAt: new Date(), lastError: null },
          });
          await tx.auditLog.create({
            data: {
              coachId: event.coachId,
              resourceId: event.id,
              action: obsolete
                ? 'activity.mock.obsolete'
                : 'activity.mock.normalized',
            },
          });
        });
      }
    } catch (error) {
      const failure =
        error instanceof ProviderFailure
          ? error
          : new ProviderFailure('processing_unavailable', true);
      const retry = failure.retryable && event.attempts < 5;
      let owned = false;
      await db.$transaction(async (tx) => {
        await lockRelationship(tx, event);
        const current = await tx.integrationEvent.findUniqueOrThrow({
          where: { id: event.id },
        });
        if (current.runToken !== runToken || current.status !== 'processing')
          return;
        owned = true;
        await tx.integrationEvent.update({
          where: { id: event.id },
          data: {
            status: retry ? 'retry' : 'failed',
            errorCode: failure.code,
            runToken: null,
            leaseUntil: null,
          },
        });
        if (event.kind === 'revoke')
          await tx.garminConnection.updateMany({
            where: {
              id: event.connectionId,
              status: 'disconnected',
              generation: event.generation + 1,
            },
            data: {
              revocationStatus: retry ? 'pending' : 'failed',
              lastError: failure.code,
            },
          });
        else
          await tx.garminConnection.updateMany({
            where: {
              id: event.connectionId,
              generation: event.generation,
              status: 'connected',
            },
            data: {
              lastError: failure.code,
              ...(['authorization_expired', 'credentials_unreadable'].includes(
                failure.code,
              )
                ? { status: 'error' as const }
                : {}),
            },
          });
      });
      if (owned)
        this.logger.warn(
          {
            eventId: event.id,
            code: failure.code,
            attempt: event.attempts,
            retry,
          },
          'integration_job_failed',
        );
      if (owned && failure.retryable) throw new Error(failure.code);
    }
  }
}
