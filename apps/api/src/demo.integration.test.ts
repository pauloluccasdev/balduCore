import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp } from './test-support/test-app.js';
import { AuthService } from './modules/auth/auth.service.js';
import type { Request } from 'express';
test('demo local: contas fixas, origem, sessão real, origem sintética e separação do Google', async () => {
  const app = await createTestApp(0, undefined, 'demo');
  const { base, config, database } = app;
  const login = async (account: string, origin = config.APP_ORIGIN) =>
    fetch(`${base}/auth/demo`, {
      method: 'POST',
      redirect: 'manual',
      headers: { origin, 'content-type': 'application/json' },
      body: JSON.stringify({ account }),
    });
  try {
    assert.deepEqual(await (await fetch(`${base}/auth/status`)).json(), {
      mode: 'demo',
      configured: true,
    });
    assert.equal((await login('1', 'https://other.example')).status, 403);
    assert.equal((await login('arbitrary-coach')).status, 400);
    const signed = await login('1');
    assert.equal(signed.status, 200);
    const cookie = signed.headers.getSetCookie()[0].split(';')[0];
    const session = await (
      await fetch(`${base}/auth/session`, { headers: { cookie } })
    ).json();
    assert.equal(session.isSynthetic, true);
    assert.equal(session.coach.name, 'Treinador Demo 1');
    const saved = await fetch(`${base}/athletes`, {
      method: 'POST',
      headers: {
        cookie,
        origin: config.APP_ORIGIN,
        'content-type': 'application/json',
        'x-csrf-token': session.csrf,
      },
      body: JSON.stringify({
        name: 'Aluno fictício API',
        email: `demo-${Date.now()}@example.test`,
      }),
    });
    assert.equal(saved.status, 201);
    const athlete = await saved.json();
    assert.equal(athlete.isSynthetic, true);
    const second = await login('2');
    const secondCookie = second.headers.getSetCookie()[0].split(';')[0];
    assert.equal(
      (
        await fetch(`${base}/athletes/${athlete.id}`, {
          headers: { cookie: secondCookie },
        })
      ).status,
      404,
    );
    const google = new AuthService(
      database.client,
      { ...config, AUTH_MODE: 'google' },
      {
        start: async () => '',
        finish: async () => {
          throw new Error('not used');
        },
      },
    );
    await assert.rejects(
      google.authenticate({ headers: { cookie } } as Request),
      (error) =>
        Boolean(
          error &&
          typeof error === 'object' &&
          'status' in error &&
          error.status === 401,
        ),
    );
    assert.equal(
      (await fetch(`${base}/auth/google`, { redirect: 'manual' })).status,
      503,
    );
    const realMode = await createTestApp();
    try {
      assert.equal(
        (await fetch(`${realMode.base}/auth/demo`, { method: 'POST' })).status,
        404,
      );
    } finally {
      await realMode.close();
    }
  } finally {
    await app.close();
  }
});
