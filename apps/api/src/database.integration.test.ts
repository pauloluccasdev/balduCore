import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pino } from 'pino';
import { createApp } from './app.js';
import { readConfig } from './config.js';
import { createDatabase } from './database.js';
test('Prisma → PostgreSQL real → readiness HTTP 200', async () => {
  const database = createDatabase(readConfig(process.env).DATABASE_URL);
  const app = await createApp(database, pino({ level: 'silent' }));
  try {
    await database.ping();
    await app.listen(0, '127.0.0.1');
    const response = await fetch(`${await app.getUrl()}/health/ready`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'ok', database: 'up' });
  } finally {
    await app.close();
    await database.close();
  }
});
test('Prisma com PostgreSQL inacessível → readiness 503, liveness 200', async () => {
  const database = createDatabase(
    'postgresql://invalid:invalid@127.0.0.1:1/absent',
  );
  const app = await createApp(database, pino({ level: 'silent' }));
  try {
    await app.listen(0, '127.0.0.1');
    assert.equal(
      (await fetch(`${await app.getUrl()}/health/ready`)).status,
      503,
    );
    assert.equal((await fetch(`${await app.getUrl()}/health`)).status, 200);
  } finally {
    await app.close();
    await database.close();
  }
});
