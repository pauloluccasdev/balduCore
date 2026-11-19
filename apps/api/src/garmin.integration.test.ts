import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp } from './test-support/test-app.js';
import {
  enrolledAthlete,
  cookieOf,
  type TestApp,
} from './test-support/enrolled-athlete.js';
import {
  GarminMockProvider,
  ProviderFailure,
  type ProviderDelivery,
} from './modules/garmin-connections/provider.js';
import type { IntegrationJob } from './modules/activity-processing/queue.js';
import { decrypt, digest } from './modules/auth/security.js';

// A mesma fila também contém análises automáticas desde a SPRINT 06.
async function fetchGarmin(app: TestApp) {
  const queue = app.garmin.service.queue!;
  for (;;) {
    const [job] = await queue.boss.fetch<IntegrationJob>(queue.name, {
      includeMetadata: true,
    });
    assert.ok(job, 'expected persisted queue job');
    if (job.data.kind !== 'analysis') return job;
    await app.garmin.worker!.process(job);
    await queue.boss.complete(queue.name, {
      id: job.id,
      retryCount: job.retryCount,
    });
  }
}
async function runNext(app: TestApp) {
  const queue = app.garmin.service.queue!;
  const job = await fetchGarmin(app);
  try {
    await app.garmin.worker!.process(job);
    await queue.boss.complete(queue.name, {
      id: job.id,
      retryCount: job.retryCount,
    });
  } catch {
    await queue.boss.fail(
      queue.name,
      { id: job.id, retryCount: job.retryCount },
      { code: 'controlled_retry' },
    );
  }
  return job;
}
async function delivery(
  app: TestApp,
  wire: ProviderDelivery,
  timestamp = String(Math.floor(Date.now() / 1000)),
  signature?: string,
) {
  const provider = new GarminMockProvider(app.config.GARMIN_MOCK_SIGNING_KEY);
  const raw = JSON.stringify(wire);
  return fetch(`${app.base}/integrations/garmin-mock/events`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-baldu-mock-timestamp': timestamp,
      'x-baldu-mock-signature':
        signature ?? provider.signature(Buffer.from(raw), timestamp),
    },
    body: raw,
  });
}
const fixtureActivity = {
  externalId: 'external-test',
  revision: 1,
  sport: 'running',
  startedAt: '2026-11-18T12:00:00.000Z',
  durationSeconds: null,
  distanceMeters: 5000,
};

test('autorização mock: aceites independentes, recusa, state/browser/expiração/replay e isolamento de coach', async () => {
  const app = await createTestApp(0, undefined, 'demo');
  try {
    const c = await enrolledAthlete(app);
    const before = await (
      await c.get(`/athletes/${c.athlete.id}/garmin`, c.coach.cookie)
    ).json();
    assert.equal(before.status, 'not_connected');
    assert.equal(before.activityCount, 0);
    assert.equal(
      (await c.post('/public/garmin/start', {}, c.student.cookie)).status,
      403,
    );
    const denied = await c.start();
    assert.equal(
      (
        await c.post(
          '/public/garmin/mock/finish',
          { state: denied, decision: 'deny' },
          c.student.cookie,
          c.student.csrf,
        )
      ).status,
      201,
    );
    assert.equal(
      (await (await c.get(`/athletes/${c.athlete.id}`, c.coach.cookie)).json())
        .relationship.status,
      'active',
    );
    const expired = await c.start();
    await app.database.client.garminAuthorizationAttempt.update({
      where: { stateHash: digest(expired) },
      data: { expiresAt: new Date(0) },
    });
    assert.equal(
      (
        await c.post(
          '/public/garmin/mock/finish',
          { state: expired, decision: 'approve' },
          c.student.cookie,
          c.student.csrf,
        )
      ).status,
      410,
    );
    const state = await c.start();
    const another = await enrolledAthlete(app);
    assert.equal(
      (
        await another.post(
          '/public/garmin/mock/finish',
          { state, decision: 'approve' },
          another.student.cookie,
          another.student.csrf,
        )
      ).status,
      410,
    );
    const response = await c.post(
      '/public/garmin/mock/finish',
      { state, decision: 'approve' },
      c.student.cookie,
      c.student.csrf,
    );
    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), {
      status: 'connected',
      isSynthetic: true,
    });
    assert.equal(
      (
        await c.post(
          '/public/garmin/mock/finish',
          { state, decision: 'approve' },
          c.student.cookie,
          c.student.csrf,
        )
      ).status,
      410,
    );
    const connection =
      await app.database.client.garminConnection.findUniqueOrThrow({
        where: {
          coachId_athleteId: { coachId: c.coach.id, athleteId: c.athlete.id },
        },
      });
    assert.ok(connection.encryptedCredentials);
    assert.ok(!connection.encryptedCredentials.includes('mock-access:'));
    const status = await (
      await c.get(`/athletes/${c.athlete.id}/garmin`, c.coach.cookie)
    ).json();
    assert.equal(status.encryptedCredentials, undefined);
    assert.equal(status.externalAccountHash, undefined);
    assert.equal(status.isSynthetic, true);
    for (const suffix of ['garmin', 'invitations'])
      assert.equal(
        (await c.get(`/athletes/${c.athlete.id}/${suffix}`, c.other.cookie))
          .status,
        404,
      );
    assert.equal(
      (
        await c.post(
          `/athletes/${c.athlete.id}/garmin/mock`,
          { scenario: 'sample' },
          c.other.cookie,
          c.other.csrf,
        )
      ).status,
      404,
    );
    assert.equal(
      (
        await c.post(
          `/athletes/${c.athlete.id}/garmin/disconnect`,
          {},
          c.other.cookie,
          c.other.csrf,
        )
      ).status,
      404,
    );
  } finally {
    await app.close();
  }
});

test('entrega assinada e inbox/job atômicos; duplicatas, colisão, versões fora de ordem e métricas ausentes', async () => {
  const app = await createTestApp(0, undefined, 'demo');
  try {
    const c = await enrolledAthlete(app);
    const connection = await c.connect();
    const credentials = app.garmin.service.decodeCredentials(
      connection.encryptedCredentials!,
    );
    const wire: ProviderDelivery = {
      accountId: credentials.accountId,
      deliveryId: 'delivery-1',
      kind: 'activity',
      activity: fixtureActivity,
    };
    assert.equal((await delivery(app, wire, undefined, 'invalid')).status, 401);
    assert.equal(
      (await delivery(app, wire, String(Math.floor(Date.now() / 1000) - 600)))
        .status,
      401,
    );
    const originalSend = app.garmin.service.queue!.send.bind(
      app.garmin.service.queue!,
    );
    app.garmin.service.queue!.send = async (tx, eventId) => {
      await originalSend(tx, eventId);
      throw new Error('controlled queue failure after enqueue');
    };
    assert.equal((await delivery(app, wire)).status, 503);
    assert.equal(
      await app.database.client.integrationEvent.count({
        where: { connectionId: connection.id },
      }),
      0,
    );
    assert.equal(
      (
        await app.garmin.service.queue!.boss.findJobs(
          app.garmin.service.queue!.name,
        )
      ).length,
      0,
    );
    app.garmin.service.queue!.send = originalSend;
    const incoming = await Promise.all([
      delivery(app, wire),
      delivery(app, wire),
    ]);
    assert.deepEqual(
      incoming.map((r) => r.status),
      [202, 202],
    );
    assert.equal(
      await app.database.client.integrationEvent.count({
        where: { connectionId: connection.id },
      }),
      1,
    );
    assert.equal(
      (
        await app.garmin.service.queue!.boss.findJobs(
          app.garmin.service.queue!.name,
        )
      ).length,
      1,
    );
    assert.equal(
      await app.database.client.activity.count({
        where: { connectionId: connection.id },
      }),
      0,
    );
    await runNext(app);
    const activity = await app.database.client.activity.findFirstOrThrow({
      where: { connectionId: connection.id },
    });
    assert.equal(activity.durationSeconds, null);
    assert.equal(activity.distanceMeters, 5000);
    assert.equal(activity.source, 'garmin_mock');
    assert.equal(activity.isSynthetic, true);
    assert.equal(
      (
        await delivery(app, {
          ...wire,
          activity: { ...fixtureActivity, distanceMeters: 999 },
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await delivery(app, {
          ...wire,
          deliveryId: 'newer',
          activity: { ...fixtureActivity, revision: 3, distanceMeters: 6000 },
        })
      ).status,
      202,
    );
    await runNext(app);
    assert.equal(
      (
        await delivery(app, {
          ...wire,
          deliveryId: 'older',
          activity: { ...fixtureActivity, revision: 2 },
        })
      ).status,
      202,
    );
    await runNext(app);
    const after = await app.database.client.activity.findUniqueOrThrow({
      where: { id: activity.id },
    });
    assert.equal(after.revision, 3);
    assert.equal(after.distanceMeters, 6000);
    assert.equal(
      await app.database.client.activity.count({
        where: { connectionId: connection.id },
      }),
      1,
    );
    const count = await app.database.client.athlete.count();
    assert.equal(
      (
        await delivery(app, {
          ...wire,
          accountId: 'unknown-account',
          deliveryId: 'unknown',
        })
      ).status,
      202,
    );
    assert.equal(await app.database.client.athlete.count(), count);
  } finally {
    await app.close();
  }
});

test('retentativas automáticas limitadas, falha permanente e redrive autorizado', async () => {
  const app = await createTestApp(0, undefined, 'demo');
  try {
    const c = await enrolledAthlete(app);
    const connection = await c.connect();
    const queue = app.garmin.service.queue!;
    const policy = await queue.boss.getQueue(queue.name);
    assert.equal(policy!.retryLimit, 4);
    assert.equal(policy!.retryBackoff, true);
    await queue.boss.updateQueue(queue.name, {
      retryDelay: 0,
      retryBackoff: false,
    }); // Relógio de testes, sem alterar política produtiva.
    const eventResponse = await c.simulate('temporary_failure');
    assert.equal(eventResponse.status, 201);
    const eventId = (await eventResponse.json()).eventId;
    for (let index = 0; index < 3; index++) await runNext(app);
    let event = await app.database.client.integrationEvent.findUniqueOrThrow({
      where: { id: eventId },
    });
    assert.equal(event.status, 'processed');
    assert.equal(event.attempts, 3);
    const permanent = await c.simulate('permanent_failure');
    const failedId = (await permanent.json()).eventId;
    await runNext(app);
    event = await app.database.client.integrationEvent.findUniqueOrThrow({
      where: { id: failedId },
    });
    assert.equal(event.status, 'failed');
    assert.equal(event.attempts, 1);
    assert.equal(
      (
        await c.post(
          `/athletes/${c.athlete.id}/garmin/events/${failedId}/retry`,
          {},
          c.other.cookie,
          c.other.csrf,
        )
      ).status,
      404,
    );
    assert.equal(
      (
        await c.post(
          `/athletes/${c.athlete.id}/garmin/events/${failedId}/retry`,
          {},
          c.coach.cookie,
          c.coach.csrf,
        )
      ).status,
      201,
    );
    await runNext(app);
    const normalize = app.garmin.service.provider!.normalize.bind(
      app.garmin.service.provider!,
    );
    app.garmin.service.provider!.normalize = async () => {
      throw new ProviderFailure('always_unavailable', true);
    };
    const exhausted = await c.simulate('sample');
    const exhaustedId = (await exhausted.json()).eventId;
    for (let index = 0; index < 5; index++) await runNext(app);
    event = await app.database.client.integrationEvent.findUniqueOrThrow({
      where: { id: exhaustedId },
    });
    assert.equal(event.status, 'failed');
    assert.equal(event.attempts, 5);
    assert.equal((await queue.boss.fetch(queue.name)).length, 0);
    app.garmin.service.provider!.normalize = normalize;
    assert.equal(
      await app.database.client.activity.count({
        where: { connectionId: connection.id },
      }),
      1,
    );
  } finally {
    await app.close();
  }
});

test('crash/lease e resultado tardio: supervisor recupera job e fencing evita publicação duplicada', async () => {
  const app = await createTestApp(0, undefined, 'demo');
  let release: () => void = () => {};
  try {
    const c = await enrolledAthlete(app);
    const connection = await c.connect();
    await c.simulate('sample');
    const queue = app.garmin.service.queue!;
    const first = await fetchGarmin(app);
    const normalize = app.garmin.service.provider!.normalize.bind(
      app.garmin.service.provider!,
    );
    let entered: () => void = () => {};
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    let calls = 0;
    app.garmin.service.provider!.normalize = async (data, attempt) => {
      if (++calls === 1) {
        entered();
        await waiting;
      }
      return normalize(data, attempt);
    };
    const old = app.garmin.worker!.process(first);
    await started;
    await app.database.client
      .$executeRaw`UPDATE pgboss.job SET started_on = NOW() - INTERVAL '90 seconds' WHERE id = ${first.id}::uuid`;
    await queue.boss.supervise(queue.name);
    await app.database.client
      .$executeRaw`UPDATE pgboss.job SET start_after = NOW() - INTERVAL '1 second' WHERE id = ${first.id}::uuid`;
    const second = await fetchGarmin(app);
    assert.ok(second);
    assert.ok(second.retryCount > first.retryCount);
    await app.garmin.worker!.process(second);
    await queue.boss.complete(queue.name, {
      id: second.id,
      retryCount: second.retryCount,
    });
    release();
    await old;
    const stale = await queue.boss.complete(queue.name, {
      id: first.id,
      retryCount: first.retryCount,
    });
    assert.equal(stale.affected, 0);
    assert.equal(
      await app.database.client.activity.count({
        where: { connectionId: connection.id },
      }),
      1,
    );
    const event = await app.database.client.integrationEvent.findUniqueOrThrow({
      where: { id: first.data.eventId },
    });
    assert.equal(event.status, 'processed');
    assert.equal(event.attempts, 2);
  } finally {
    release();
    await app.close();
  }
});

test('refresh concorrente e desconexão durante processamento não restauram acesso ou publicam atividade', async () => {
  const app = await createTestApp(0, undefined, 'demo');
  let release: () => void = () => {};
  try {
    const c = await enrolledAthlete(app);
    const connection = await c.connect();
    await c.simulate('expired_token');
    await runNext(app);
    const refreshed =
      await app.database.client.garminConnection.findUniqueOrThrow({
        where: { id: connection.id },
      });
    assert.equal(refreshed.credentialVersion, connection.credentialVersion + 1);
    await app.database.client.garminConnection.update({
      where: { id: connection.id },
      data: { tokenExpiresAt: new Date(0) },
    });
    const originalRefresh = app.garmin.service.provider!.refresh.bind(
      app.garmin.service.provider!,
    );
    let entered: () => void = () => {};
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    app.garmin.service.provider!.refresh = async (credentials) => {
      entered();
      await waiting;
      return originalRefresh(credentials);
    };
    const first = app.garmin.service.credentials(
      connection.id,
      connection.generation,
    );
    await started;
    await assert.rejects(
      app.garmin.service.credentials(connection.id, connection.generation),
      (error) =>
        error instanceof ProviderFailure &&
        error.code === 'refresh_in_progress',
    );
    release();
    await first;
    const after = await app.database.client.garminConnection.findUniqueOrThrow({
      where: { id: connection.id },
    });
    assert.equal(after.credentialVersion, connection.credentialVersion + 2);
    const oldCredentials = app.garmin.service.decodeCredentials(
      after.encryptedCredentials!,
    );
    await c.simulate('sample');
    const normalize = app.garmin.service.provider!.normalize.bind(
      app.garmin.service.provider!,
    );
    let normalizing: () => void = () => {};
    const normalizingStarted = new Promise<void>((resolve) => {
      normalizing = resolve;
    });
    const waitNormalize = new Promise<void>((resolve) => {
      release = resolve;
    });
    app.garmin.service.provider!.normalize = async (payload, attempt) => {
      normalizing();
      await waitNormalize;
      return normalize(payload, attempt);
    };
    const queue = app.garmin.service.queue!;
    const job = await fetchGarmin(app);
    const pending = app.garmin.worker!.process(job);
    await normalizingStarted;
    assert.equal(
      (
        await c.post(
          `/athletes/${c.athlete.id}/garmin/disconnect`,
          {},
          c.coach.cookie,
          c.coach.csrf,
        )
      ).status,
      201,
    );
    release();
    await pending;
    await queue.boss.complete(queue.name, {
      id: job.id,
      retryCount: job.retryCount,
    });
    let disconnected =
      await app.database.client.garminConnection.findUniqueOrThrow({
        where: { id: connection.id },
      });
    assert.equal(disconnected.status, 'disconnected');
    assert.equal(disconnected.encryptedCredentials, null);
    assert.equal(disconnected.externalAccountHash, null);
    assert.equal(
      (
        await app.database.client.integrationEvent.findUniqueOrThrow({
          where: { id: job.data.eventId },
        })
      ).status,
      'cancelled',
    );
    assert.equal(
      (
        await (
          await delivery(app, {
            accountId: oldCredentials.accountId,
            deliveryId: 'late-event',
            kind: 'activity',
            activity: fixtureActivity,
          })
        ).json()
      ).accepted,
      false,
    );
    await runNext(app);
    disconnected = await app.database.client.garminConnection.findUniqueOrThrow(
      { where: { id: connection.id } },
    );
    assert.equal(disconnected.revocationStatus, 'completed');
    assert.equal(
      await app.database.client.activity.count({
        where: { connectionId: connection.id },
      }),
      1,
    );
  } finally {
    release();
    await app.close();
  }
});

test('retirada pública bloqueia conexão; falha de revogação retenta sem reativar vínculo', async () => {
  const app = await createTestApp(0, undefined, 'demo');
  try {
    const c = await enrolledAthlete(app);
    const connection = await c.connect();
    const queue = app.garmin.service.queue!;
    await queue.boss.updateQueue(queue.name, {
      retryDelay: 0,
      retryBackoff: false,
    });
    await c.simulate('revocation_failure');
    const redeemed = await c.post('/public/withdrawal/redeem', {
      token: new URL(c.withdrawalUrl).hash.slice(1),
    });
    const cookie = cookieOf(redeemed);
    const session = await (await c.get('/public/withdrawal', cookie)).json();
    assert.equal(
      (
        await c.post(
          '/public/withdrawal/confirm',
          { confirm: true },
          cookie,
          session.csrf,
        )
      ).status,
      201,
    );
    const getConnection = () =>
      app.database.client.garminConnection.findUniqueOrThrow({
        where: { id: connection.id },
      });
    assert.equal((await getConnection()).status, 'disconnected');
    assert.equal((await getConnection()).revocationStatus, 'pending');
    await runNext(app);
    assert.equal((await getConnection()).revocationStatus, 'pending');
    await runNext(app);
    await runNext(app);
    assert.equal((await getConnection()).revocationStatus, 'completed');
    assert.equal(
      (
        await app.database.client.coachAthleteRelationship.findUniqueOrThrow({
          where: { athleteId: c.athlete.id },
        })
      ).status,
      'ended',
    );
    assert.equal(
      (
        await c.post(
          '/public/garmin/start',
          {},
          c.student.cookie,
          c.student.csrf,
        )
      ).status,
      410,
    );
    assert.equal(
      (
        await c.post(
          `/athletes/${c.athlete.id}/garmin/authorization-link`,
          {},
          c.coach.cookie,
          c.coach.csrf,
        )
      ).status,
      409,
    );
  } finally {
    await app.close();
  }
});

test('convite de reconexão tem finalidade restrita, nova verificação e não duplica aceites', async () => {
  const app = await createTestApp(0, undefined, 'demo');
  try {
    const c = await enrolledAthlete(app);
    const connection = await c.connect();
    await c.post(
      `/athletes/${c.athlete.id}/garmin/disconnect`,
      {},
      c.coach.cookie,
      c.coach.csrf,
    );
    await runNext(app);
    await app.database.client.enrollmentSession.updateMany({
      where: { coachId: c.coach.id, athleteId: c.athlete.id },
      data: { expiresAt: new Date(0) },
    });
    const response = await c.post(
      `/athletes/${c.athlete.id}/garmin/authorization-link`,
      {},
      c.coach.cookie,
      c.coach.csrf,
    );
    assert.equal(response.status, 201);
    const invite = await response.json();
    const redeemed = await c.post('/public/invitation/redeem', {
      token: new URL(invite.url).hash.slice(1),
    });
    assert.equal(redeemed.status, 201);
    const cookie = cookieOf(redeemed);
    const session = await (await c.get('/public/enrollment', cookie)).json();
    assert.equal(session.purpose, 'garmin');
    assert.equal(
      (await c.post('/public/garmin/start', {}, cookie, session.csrf)).status,
      410,
    );
    const list = await (
      await c.get(`/athletes/${c.athlete.id}/invitations`, c.coach.cookie)
    ).json();
    assert.equal(
      (
        await c.post(
          '/public/enrollment/verify',
          { email: c.athlete.email, code: list.items[0].demoCode },
          cookie,
          session.csrf,
        )
      ).status,
      201,
    );
    const started = await c.post(
      '/public/garmin/start',
      {},
      cookie,
      session.csrf,
    );
    assert.equal(started.status, 201);
    const state = new URL((await started.json()).url).hash.slice(1);
    assert.equal(
      (
        await c.post(
          '/public/garmin/mock/finish',
          { state, decision: 'approve' },
          cookie,
          session.csrf,
        )
      ).status,
      201,
    );
    assert.equal(
      await app.database.client.consentEvidence.count({
        where: { athleteId: c.athlete.id },
      }),
      2,
    );
    assert.equal(
      (
        await app.database.client.garminConnection.findUniqueOrThrow({
          where: { id: connection.id },
        })
      ).status,
      'connected',
    );
  } finally {
    await app.close();
  }
});

test('token inválido exige reconexão; revogação assinada pelo provedor bloqueia imediatamente', async () => {
  const app = await createTestApp(0, undefined, 'demo');
  try {
    const c = await enrolledAthlete(app);
    const connection = await c.connect();
    await c.simulate('invalid_refresh');
    await runNext(app);
    assert.equal(
      (
        await app.database.client.garminConnection.findUniqueOrThrow({
          where: { id: connection.id },
        })
      ).status,
      'error',
    );
    const second = await enrolledAthlete(app);
    const connected = await second.connect();
    assert.equal((await second.simulate('provider_revocation')).status, 201);
    const after = await app.database.client.garminConnection.findUniqueOrThrow({
      where: { id: connected.id },
    });
    assert.equal(after.status, 'disconnected');
    assert.equal(after.encryptedCredentials, null);
    assert.equal(after.revocationStatus, 'completed');
    const payloads = await app.database.client.integrationEvent.findMany({
      where: { connectionId: connected.id },
    });
    assert.equal(payloads.length, 1);
    assert.equal(payloads[0].kind, 'connection_revoked');
    assert.equal(
      decrypt(
        connection.encryptedCredentials!,
        app.config.GARMIN_TOKEN_KEY,
      ).includes('mock-access:'),
      true,
    );
    const google = await createTestApp();
    try {
      assert.equal(
        (
          await fetch(`${google.base}/integrations/garmin-mock/events`, {
            method: 'POST',
          })
        ).status,
        404,
      );
    } finally {
      await google.close();
    }
  } finally {
    await app.close();
  }
});

test('falha na autorização e retirada durante callback: compensação não restaura credenciais', async () => {
  const app = await createTestApp(0, undefined, 'demo');
  let release: () => void = () => {};
  try {
    const c = await enrolledAthlete(app);
    const provider = app.garmin.service.provider!;
    const authorize = provider.authorize.bind(provider);
    provider.authorize = async () => {
      throw new ProviderFailure('controlled_authorize_failure', true);
    };
    let state = await c.start();
    assert.equal(
      (
        await c.post(
          '/public/garmin/mock/finish',
          { state, decision: 'approve' },
          c.student.cookie,
          c.student.csrf,
        )
      ).status,
      503,
    );
    let connection =
      await app.database.client.garminConnection.findUniqueOrThrow({
        where: {
          coachId_athleteId: { coachId: c.coach.id, athleteId: c.athlete.id },
        },
      });
    assert.equal(connection.status, 'error');
    assert.equal(connection.encryptedCredentials, null);
    state = await c.start();
    let entered: () => void = () => {};
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    provider.authorize = async (id, generation) => {
      const result = await authorize(id, generation);
      entered();
      await waiting;
      return result;
    };
    let compensations = 0;
    provider.revoke = async () => {
      compensations++;
    };
    const pending = c.post(
      '/public/garmin/mock/finish',
      { state, decision: 'approve' },
      c.student.cookie,
      c.student.csrf,
    );
    await started;
    const redeemed = await c.post('/public/withdrawal/redeem', {
      token: new URL(c.withdrawalUrl).hash.slice(1),
    });
    const cookie = cookieOf(redeemed);
    const session = await (await c.get('/public/withdrawal', cookie)).json();
    assert.equal(
      (
        await c.post(
          '/public/withdrawal/confirm',
          { confirm: true },
          cookie,
          session.csrf,
        )
      ).status,
      201,
    );
    release();
    assert.equal((await pending).status, 410);
    connection = await app.database.client.garminConnection.findUniqueOrThrow({
      where: { id: connection.id },
    });
    assert.equal(connection.status, 'disconnected');
    assert.equal(connection.encryptedCredentials, null);
    assert.equal(compensations, 1);
  } finally {
    release();
    await app.close();
  }
});

test('resultado com lease expirado é retentado; constraints rejeitam outro aluno na mesma conexão', async () => {
  const app = await createTestApp(0, undefined, 'demo');
  try {
    const c = await enrolledAthlete(app);
    const connection = await c.connect();
    await c.simulate('sample');
    const queue = app.garmin.service.queue!;
    await queue.boss.updateQueue(queue.name, {
      retryDelay: 0,
      retryBackoff: false,
    });
    const job = await fetchGarmin(app);
    const normalize = app.garmin.service.provider!.normalize.bind(
      app.garmin.service.provider!,
    );
    app.garmin.service.provider!.normalize = async (wire, attempt) => {
      await app.database.client.integrationEvent.update({
        where: { id: job.data.eventId },
        data: { leaseUntil: new Date(0) },
      });
      return normalize(wire, attempt);
    };
    await assert.rejects(
      app.garmin.worker!.process(job),
      /processing_lease_expired/,
    );
    const event = await app.database.client.integrationEvent.findUniqueOrThrow({
      where: { id: job.data.eventId },
    });
    assert.equal(event.status, 'retry');
    assert.equal(
      await app.database.client.activity.count({
        where: { connectionId: connection.id },
      }),
      0,
    );
    const another = await enrolledAthlete(app);
    await assert.rejects(
      app.database.client.activity.create({
        data: {
          coachId: c.coach.id,
          athleteId: another.athlete.id,
          connectionId: connection.id,
          generation: connection.generation,
          externalId: 'cross-athlete',
          revision: 1,
          sport: 'running',
          startedAt: new Date(),
          dataHash: 'test',
        },
      }),
      (error: unknown) =>
        Boolean(
          error &&
          typeof error === 'object' &&
          'code' in error &&
          error.code === 'P2003',
        ),
    );
  } finally {
    await app.close();
  }
});

test('desconexão com fila desabilitada mantém intenção durável e worker recupera agendamento', async () => {
  const app = await createTestApp(0, undefined, 'demo');
  try {
    const c = await enrolledAthlete(app);
    const connection = await c.connect();
    const { GarminService } =
      await import('./modules/garmin-connections/garmin.service.js');
    const disabled = new GarminService(app.database.client, {
      ...app.config,
      GARMIN_PROVIDER: 'disabled',
    });
    await disabled.disconnect({ coachId: c.coach.id, athleteId: c.athlete.id });
    const intent = await app.database.client.integrationEvent.findFirstOrThrow({
      where: { connectionId: connection.id, kind: 'revoke' },
    });
    assert.equal(intent.jobId, null);
    assert.equal(intent.status, 'queued');
    assert.ok(intent.encryptedPayload);
    assert.equal(
      (
        await app.database.client.garminConnection.findUniqueOrThrow({
          where: { id: connection.id },
        })
      ).encryptedCredentials,
      null,
    );
    await app.garmin.worker!.recoverIntents();
    assert.ok(
      (
        await app.database.client.integrationEvent.findUniqueOrThrow({
          where: { id: intent.id },
        })
      ).jobId,
    );
    await runNext(app);
    const processed =
      await app.database.client.integrationEvent.findUniqueOrThrow({
        where: { id: intent.id },
      });
    assert.equal(processed.status, 'processed');
    assert.equal(processed.encryptedPayload, null);
  } finally {
    await app.close();
  }
});

test('revisão mock publica detalhes atomicamente e remove amostras/splits ausentes na revisão seguinte', async () => {
  const app = await createTestApp(0, undefined, 'demo');
  try {
    const c = await enrolledAthlete(app);
    const connection = await c.connect();
    const credentials = app.garmin.service.decodeCredentials(
      connection.encryptedCredentials!,
    );
    const wire: ProviderDelivery = {
      accountId: credentials.accountId,
      deliveryId: 'details-v1',
      kind: 'activity',
      activity: {
        ...fixtureActivity,
        timerSeconds: 20,
        elapsedSeconds: 22,
        samples: [
          { timestamp: fixtureActivity.startedAt, speedMetersPerSecond: 0 },
        ],
        splits: [
          {
            startedAt: fixtureActivity.startedAt,
            endedAt: null,
            distanceMeters: 5000,
          },
        ],
      },
    };
    assert.equal((await delivery(app, wire)).status, 202);
    await runNext(app);
    const db = app.database.client;
    const activity = await db.activity.findFirstOrThrow({
      where: { connectionId: connection.id },
    });
    assert.equal(
      await db.activitySample.count({ where: { activityId: activity.id } }),
      1,
    );
    assert.equal(
      await db.activitySplit.count({ where: { activityId: activity.id } }),
      1,
    );
    await assert.rejects(
      db.activitySample.create({
        data: {
          activityId: activity.id,
          athleteId: c.athlete.id,
          coachId: c.other.id,
          ordinal: 9,
          timestamp: new Date(),
        },
      }),
    );
    assert.equal(
      (
        await delivery(app, {
          ...wire,
          deliveryId: 'details-v2',
          activity: { ...fixtureActivity, revision: 2 },
        })
      ).status,
      202,
    );
    await runNext(app);
    const revised = await db.activity.findUniqueOrThrow({
      where: { id: activity.id },
    });
    assert.equal(revised.revision, 2);
    assert.equal(revised.timerSeconds, null);
    assert.equal(revised.durationSeconds, null);
    assert.equal(
      await db.activitySample.count({ where: { activityId: activity.id } }),
      0,
    );
    assert.equal(
      await db.activitySplit.count({ where: { activityId: activity.id } }),
      0,
    );
    const detail = await (
      await c.get(`/activities/${activity.id}`, c.coach.cookie)
    ).json();
    assert.equal(detail.paceSecondsPerKm, null);
    assert.equal(detail.status, 'summary_only');
  } finally {
    await app.close();
  }
});
