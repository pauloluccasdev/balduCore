import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createTestApp } from './test-support/test-app.js';
import { enrolledAthlete } from './test-support/enrolled-athlete.js';
import { sampleActivity } from './test-support/fit-fixture.js';
import type { JobWithMetadata } from 'pg-boss';
import type { IntegrationJob } from './modules/activity-processing/queue.js';
const wait = async <T>(read: () => Promise<T>, done: (value: T) => boolean) => {
  for (let attempt = 0; attempt < 100; attempt++) {
    const value = await read();
    if (done(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Processamento não concluído.');
};
test('FIT demo sem Garmin: fila/publicação, filtros, amostras, replay, isolamento e retirada', async () => {
  const app = await createTestApp(0, undefined, 'demo', true, true);
  try {
    const bytes = sampleActivity(
      new Date(Date.now() + Math.floor(Math.random() * 1000000000)),
    );
    const flow = await enrolledAthlete(app);
    const { coach, other, athlete, get } = flow;
    const upload = (bytes: Buffer, cookie = coach.cookie, csrf = coach.csrf) =>
      fetch(`${app.base}/athletes/${athlete.id}/fit-imports`, {
        method: 'POST',
        headers: {
          cookie,
          origin: app.config.APP_ORIGIN,
          'x-csrf-token': csrf,
          'x-demo-file': 'true',
          'content-type': 'application/octet-stream',
        },
        body: new Uint8Array(bytes),
      });
    assert.equal((await upload(bytes, other.cookie, other.csrf)).status, 404);
    assert.equal((await upload(bytes, coach.cookie, 'invalid')).status, 403);
    assert.equal((await upload(Buffer.from('bad'))).status, 400);
    assert.equal((await upload(Buffer.alloc(5 * 1024 * 1024 + 1))).status, 413);
    const uploaded = await upload(bytes);
    assert.equal(uploaded.status, 202);
    const accepted = await uploaded.json();
    const event = await wait(
      () =>
        app.database.client.fitImport.findUniqueOrThrow({
          where: { id: accepted.id },
        }),
      (value) => value.status === 'processed',
    );
    assert.equal(event.normalized, null);
    const analysis = await wait(
      () =>
        app.database.client.sportsAnalysis.findFirst({
          where: { activityId: event.activityId! },
        }),
      (value) => value?.status === 'completed',
    );
    assert.equal(
      analysis?.inputHash,
      (
        await app.database.client.activity.findUniqueOrThrow({
          where: { id: event.activityId! },
        })
      ).dataHash,
    );
    assert.ok(event.activityId);
    assert.equal(event.attempts, 1);
    assert.equal(
      (
        await app.database.client.garminConnection.findUnique({
          where: {
            coachId_athleteId: { coachId: coach.id, athleteId: athlete.id },
          },
        })
      )?.status ?? 'not_connected',
      'not_connected',
    );
    const detail = await (
      await get(`/activities/${event.activityId}`, coach.cookie)
    ).json();
    assert.equal(detail.source, 'manual_fit');
    assert.equal(detail.sampleCount, 3);
    assert.equal(detail.splitCount, 1);
    assert.equal(detail.timerSeconds, 20);
    assert.equal(detail.elapsedSeconds, 22);
    assert.equal(detail.avgHeartRateBpm, null);
    assert.equal(
      (await get(`/activities/${event.activityId}`, other.cookie)).status,
      404,
    );
    assert.equal(
      (await get(`/activities/${event.activityId}/samples`, other.cookie))
        .status,
      404,
    );
    assert.equal(
      (await get(`/activities/${event.activityId}/splits`, other.cookie))
        .status,
      404,
    );
    assert.equal((await get(`/activities/${event.activityId}`)).status, 401);
    const series = await (
      await get(`/activities/${event.activityId}/samples?limit=2`, coach.cookie)
    ).json();
    assert.equal(series.items.length, 2);
    assert.equal(series.total, 3);
    assert.equal(series.items[0].speedMetersPerSecond, 0);
    assert.equal(
      (
        await get(
          `/activities/${event.activityId}/samples?limit=1001`,
          coach.cookie,
        )
      ).status,
      400,
    );
    assert.equal(
      (await get('/activities?from=2026-11-19&to=2026-11-18', coach.cookie))
        .status,
      400,
    );
    const list = await (
      await get(
        `/activities?athleteId=${athlete.id}&source=manual_fit&sport=running&from=2026-01-01&to=2030-12-31&status=with_samples`,
        coach.cookie,
      )
    ).json();
    assert.equal(list.total, 1);
    assert.equal(list.stats.distanceMeters, 90);
    const otherList = await (
      await get(`/activities?athleteId=${athlete.id}`, other.cookie)
    ).json();
    assert.equal(otherList.total, 0);
    const again = await (await upload(bytes)).json();
    assert.equal(again.id, accepted.id);
    assert.equal(again.activityId, event.activityId);
    const withdrawal = await flow.post('/public/withdrawal/redeem', {
      token: new URL(flow.withdrawalUrl).hash.slice(1),
    });
    const cookie = withdrawal.headers.getSetCookie()[0].split(';')[0];
    const session = await (await get('/public/withdrawal', cookie)).json();
    const ended = await flow.post(
      '/public/withdrawal/confirm',
      { confirm: true },
      cookie,
      session.csrf,
    );
    assert.equal(ended.status, 201);
    assert.equal(
      (await get(`/activities/${event.activityId}`, coach.cookie)).status,
      404,
    );
    assert.equal(
      (await get(`/activities/${event.activityId}/samples`, coach.cookie))
        .status,
      404,
    );
    assert.equal((await upload(bytes)).status, 409);
  } finally {
    await app.close();
  }
});
test('FIT: hash não reassocia aluno, FK entre coaches e cancelamento impede publicação tardia', async () => {
  const app = await createTestApp(0, undefined, 'demo', false, true);
  try {
    const bytes = sampleActivity(
      new Date(Date.now() + Math.floor(Math.random() * 1000000000)),
    );
    const first = await enrolledAthlete(app),
      second = await enrolledAthlete(app);
    const db = app.database.client;
    const upload = (athleteId: string) =>
      fetch(`${app.base}/athletes/${athleteId}/fit-imports`, {
        method: 'POST',
        headers: {
          cookie: first.coach.cookie,
          origin: app.config.APP_ORIGIN,
          'x-csrf-token': first.coach.csrf,
          'x-demo-file': 'true',
          'content-type': 'application/octet-stream',
        },
        body: new Uint8Array(bytes),
      });
    const response = await upload(first.athlete.id);
    assert.equal(response.status, 202);
    const event = await response.json();
    assert.equal((await upload(second.athlete.id)).status, 409);
    await assert.rejects(
      db.activitySample.create({
        data: {
          coachId: first.other.id,
          athleteId: first.athlete.id,
          activityId: randomUUID(),
          ordinal: 0,
          timestamp: new Date(),
        },
      }),
    );
    await db.coachAthleteRelationship.update({
      where: {
        coachId_athleteId: {
          coachId: first.coach.id,
          athleteId: first.athlete.id,
        },
      },
      data: { status: 'ended' },
    });
    const job = {
      data: { eventId: event.id, kind: 'fit' },
      startedOn: new Date(),
      expireInSeconds: 30,
    } as JobWithMetadata<IntegrationJob>;
    await app.garmin.worker!.process(job);
    const result = await db.fitImport.findUniqueOrThrow({
      where: { id: event.id },
    });
    assert.equal(result.status, 'cancelled');
    assert.equal(result.normalized, null);
    assert.equal(
      await db.activity.count({
        where: { coachId: first.coach.id, athleteId: first.athlete.id },
      }),
      0,
    );
    // Um estado terminal nunca é reaberto por uma entrega repetida.
    await app.garmin.worker!.process(job);
    assert.equal(
      (await db.fitImport.findUniqueOrThrow({ where: { id: event.id } }))
        .status,
      'cancelled',
    );
  } finally {
    await app.close();
  }
});

test('FIT: lease expirado não publica; falha é limitada e limpa os dados temporários', async () => {
  const app = await createTestApp(0, undefined, 'demo', false, true);
  try {
    const flow = await enrolledAthlete(app);
    const db = app.database.client;
    const response = await fetch(
      `${app.base}/athletes/${flow.athlete.id}/fit-imports`,
      {
        method: 'POST',
        headers: {
          cookie: flow.coach.cookie,
          origin: app.config.APP_ORIGIN,
          'x-csrf-token': flow.coach.csrf,
          'x-demo-file': 'true',
          'content-type': 'application/octet-stream',
        },
        body: new Uint8Array(
          sampleActivity(
            new Date(Date.now() + Math.floor(Math.random() * 1000000000)),
          ),
        ),
      },
    );
    assert.equal(response.status, 202);
    const { id } = await response.json();
    const expired = {
      data: { eventId: id, kind: 'fit' },
      startedOn: new Date(0),
      expireInSeconds: 30,
    } as JobWithMetadata<IntegrationJob>;
    await assert.rejects(app.garmin.worker!.process(expired));
    let event = await db.fitImport.findUniqueOrThrow({ where: { id } });
    assert.equal(event.status, 'retry');
    assert.equal(event.attempts, 1);
    assert.equal(event.activityId, null);
    assert.equal(
      await db.activity.count({
        where: { coachId: flow.coach.id, athleteId: flow.athlete.id },
      }),
      0,
    );
    const job = { ...expired, startedOn: new Date() };
    await db.fitImport.update({
      where: { id },
      data: { normalized: { invalid: true }, attempts: 4 },
    });
    await app.garmin.worker!.process(job);
    event = await db.fitImport.findUniqueOrThrow({ where: { id } });
    assert.equal(event.status, 'failed');
    assert.equal(event.attempts, 5);
    assert.equal(event.normalized, null);
    await app.garmin.worker!.process(job);
    assert.equal(
      (await db.fitImport.findUniqueOrThrow({ where: { id } })).attempts,
      5,
    );
  } finally {
    await app.close();
  }
});
