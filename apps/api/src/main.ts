import { pino } from 'pino';
import { createApp } from './app.js';
import { readConfig } from './config.js';
import { createDatabase } from './database.js';

const logger = pino({ level: 'info' });
try {
  const config = readConfig(process.env);
  logger.level = config.LOG_LEVEL;
  const database = createDatabase(config.DATABASE_URL);
  const app = await createApp(
    database,
    logger,
    config.NODE_ENV !== 'production',
  );
  await app.listen(config.API_PORT, config.API_HOST);
  logger.info({ port: config.API_PORT }, 'api_started');
} catch {
  logger.fatal(
    { code: 'API_START_FAILED' },
    'Verifique configuração e documentação local.',
  );
  process.exitCode = 1;
}
