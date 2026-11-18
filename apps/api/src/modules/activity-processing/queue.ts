import { PgBoss, fromPrisma, type JobWithMetadata } from 'pg-boss';
import type { Logger } from 'pino';
import type { Prisma } from '../../generated/prisma/client.js';
import type { Config } from '../../config.js';
export type IntegrationJob = { eventId: string };
export class IntegrationQueue {
  readonly boss: PgBoss;
  readonly name: string;
  constructor(config: Config, logger: Logger) {
    this.name = `garmin-${config.GARMIN_QUEUE_NAMESPACE}`;
    this.boss = new PgBoss({
      connectionString: config.DATABASE_URL,
      max: 2,
      application_name: 'balducore-garmin',
      superviseIntervalSeconds: 2,
    });
    this.boss.on('error', () =>
      logger.error({ code: 'GARMIN_QUEUE_ERROR' }, 'integration_queue_error'),
    );
  }
  async start() {
    await this.boss.start();
    await this.boss.createQueue(this.name, {
      retryLimit: 4,
      retryDelay: 1,
      retryBackoff: true,
      expireInSeconds: 30,
      retentionSeconds: 7 * 86400,
    });
  }
  async send(tx: Prisma.TransactionClient, eventId: string) {
    return this.boss.send(this.name, { eventId }, { db: fromPrisma(tx) });
  }
  async work(handler: (job: JobWithMetadata<IntegrationJob>) => Promise<void>) {
    const options = {
      includeMetadata: true as const,
      pollingIntervalSeconds: 0.5,
      batchSize: 1,
    };
    return this.boss.work<IntegrationJob, void, typeof options>(
      this.name,
      options,
      async (jobs) => {
        for (const job of jobs) await handler(job);
      },
    );
  }
  async stop() {
    await this.boss.stop({ graceful: true, timeout: 5000 });
  }
}
