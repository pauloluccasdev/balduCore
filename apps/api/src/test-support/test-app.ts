import { createGarminRuntime } from '../modules/garmin-connections/runtime.js';
import { randomBytes } from 'node:crypto';
import { pino } from 'pino';
import { createApp } from '../app.js';
import { readConfig } from '../config.js';
import { createDatabase } from '../database.js';
import { GoogleProvider } from '../modules/auth/google-provider.js';
import { oidcFixture } from './oidc-fixture.js';
export async function createTestApp(
  port = 0,
  origin?: string,
  mode: 'google' | 'demo' = 'google',
  worker = false,
  garminDisabled = false,
) {
  let isolated = false;
  try {
    isolated = Boolean(
      process.env.TEST_DATABASE_URL &&
      process.env.DATABASE_URL &&
      new URL(process.env.TEST_DATABASE_URL).pathname !==
        new URL(process.env.DATABASE_URL).pathname,
    );
  } catch {
    /* Não expor URL. */
  }
  if (process.env.NODE_ENV === 'production' || !isolated)
    throw new Error(
      'Configure banco de teste com nome diferente do operacional, fora de produção.',
    );
  const config = readConfig({
    ...process.env,
    DATABASE_URL: process.env.TEST_DATABASE_URL,
    NODE_ENV: 'test',
    AUTH_MODE: mode,
    GARMIN_PROVIDER: mode === 'demo' && !garminDisabled ? 'mock' : 'disabled',
    GARMIN_TOKEN_KEY: randomBytes(32).toString('base64'),
    GARMIN_MOCK_SIGNING_KEY: randomBytes(32).toString('base64'),
    GARMIN_QUEUE_NAMESPACE: `test-${randomBytes(8).toString('hex')}`,
    APP_ORIGIN:
      origin ?? `http://127.0.0.1:${Math.floor(Math.random() * 20000) + 20000}`,
    GOOGLE_CLIENT_ID: 'test-client',
    GOOGLE_CLIENT_SECRET: 'test-secret',
    AUTH_SECRET: randomBytes(32).toString('base64'),
    GOOGLE_ALLOWED_EMAILS: 'coach.a@gmail.com,coach.b@gmail.com',
    GOOGLE_ALLOWED_SUBJECTS: '',
  });
  const database = createDatabase(config.DATABASE_URL);
  const fixture = await oidcFixture();
  const provider = new GoogleProvider(config, fixture.configuration);
  const garmin = await createGarminRuntime(
    database.client,
    config,
    pino({ level: 'silent' }),
  );
  const app = await createApp(database, pino({ level: 'silent' }), false, {
    client: database.client,
    config,
    provider,
    garmin,
  });
  if (worker) await garmin.worker?.start();
  await app.listen(port, '127.0.0.1');
  return {
    app,
    database,
    config,
    garmin,
    fixture,
    base: await app.getUrl(),
    async close() {
      await app.close();
      await fixture.close();
    },
  };
}
