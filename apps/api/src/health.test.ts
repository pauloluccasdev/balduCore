import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pino } from 'pino';
import { Writable } from 'node:stream';
import { createApp } from './app.js';
test('HTTP: liveness independente, readiness 503 sanitizado e logs sem URL/segredos', async () => {
  const logs: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      logs.push(chunk.toString());
      callback();
    },
  });
  const app = await createApp(
    {
      ping: async () => {
        throw new Error('password=private-token');
      },
      close: async () => {},
    },
    pino(stream),
  );
  await app.listen(0, '127.0.0.1');
  try {
    const url = await app.getUrl();
    const live = await fetch(`${url}/health?token=private-token`);
    assert.equal(live.status, 200);
    assert.equal(live.headers.get('cache-control'), 'no-store');
    assert.match(live.headers.get('x-request-id') ?? '', /^[a-f0-9-]{36}$/);
    const ready = await fetch(`${url}/health/ready`);
    assert.equal(ready.status, 503);
    assert.deepEqual(await ready.json(), {
      status: 'unavailable',
      database: 'down',
    });
    assert.equal((await fetch(`${url}/athletes`)).status, 404);
    assert.ok(logs.length >= 2);
    assert.ok(
      logs.every(
        (line) => !line.includes('private-token') && !line.includes('password'),
      ),
    );
  } finally {
    await app.close();
  }
});
