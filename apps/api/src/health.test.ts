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
    const malformed = await fetch(`${url}/health?token=private-token`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: 'session=private-cookie',
        authorization: 'Bearer private-bearer',
      },
      body: '{"secret":"private-body",',
    });
    assert.equal(malformed.status, 400);
    assert.equal(malformed.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(malformed.headers.get('referrer-policy'), 'no-referrer');
    const message = JSON.stringify(await malformed.json());
    assert.ok(!message.includes('private-body'));
    assert.ok(!message.includes('SyntaxError'));
    assert.ok(logs.every((line) => !/private-(cookie|bearer|body)/.test(line)));
    const correlationId = malformed.headers.get('x-request-id');
    assert.ok(
      logs.some((line) => JSON.parse(line).correlationId === correlationId),
    );

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
