import { pino } from 'pino';
import { readConfig } from './config.js';
import { createDatabase } from './database.js';
import { createGarminRuntime } from './modules/garmin-connections/runtime.js';
const logger = pino({ level: 'info' });
let stop: (() => Promise<void>) | undefined;
try {
  const config = readConfig(process.env);
  logger.level = config.LOG_LEVEL;
  if (config.GARMIN_PROVIDER === 'mock') {
    const database = createDatabase(config.DATABASE_URL);
    const runtime = await createGarminRuntime(
      database.client,
      config,
      logger,
    ).catch(async (error: unknown) => {
      await database.close();
      throw error;
    });
    stop = async () => {
      try {
        await runtime.close();
      } finally {
        await database.close();
      }
    };
    await runtime.worker!.start();
    logger.info({ code: 'GARMIN_MOCK_WORKER_STARTED' }, 'worker_started');
  } else logger.info({ code: 'GARMIN_DISABLED' }, 'worker_idle');
  const keepAlive = setInterval(() => {}, 60_000);
  await new Promise<void>((resolve) => {
    for (const signal of ['SIGINT', 'SIGTERM'] as const)
      process.once(signal, () => resolve());
  });
  clearInterval(keepAlive);
  await stop?.();
} catch {
  await stop?.().catch(() => {});
  logger.fatal(
    { code: 'GARMIN_WORKER_FAILED' },
    'Verifique banco, migrations e configuração do mock local.',
  );
  process.exitCode = 1;
}
