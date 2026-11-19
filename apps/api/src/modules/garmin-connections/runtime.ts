import type { Logger } from 'pino';
import type { PrismaClient } from '../../generated/prisma/client.js';
import type { Config } from '../../config.js';
import { IntegrationQueue } from '../activity-processing/queue.js';
import { ActivityProcessingWorker } from '../activity-processing/worker.js';
import { GarminService } from './garmin.service.js';
import { GarminMockProvider } from './provider.js';
export async function createGarminRuntime(
  client: PrismaClient,
  config: Config,
  logger: Logger,
) {
  const queue =
    config.GARMIN_PROVIDER === 'mock' || config.AUTH_MODE === 'demo'
      ? new IntegrationQueue(config, logger)
      : undefined;
  try {
    await queue?.start();
  } catch {
    await queue?.stop().catch(() => {});
    throw new Error('Garmin queue unavailable');
  }
  const service = new GarminService(
    client,
    config,
    config.GARMIN_PROVIDER === 'mock'
      ? new GarminMockProvider(config.GARMIN_MOCK_SIGNING_KEY)
      : undefined,
    queue,
  );
  const worker = queue
    ? new ActivityProcessingWorker(service, logger)
    : undefined;
  let closed = false;
  return {
    service,
    worker,
    async close() {
      if (closed) return;
      closed = true;
      try {
        await worker?.stop();
      } finally {
        await queue?.stop();
      }
    },
  };
}
