import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { JobWithMetadata } from 'pg-boss';
import { createTestApp } from './test-support/test-app.js';
import {
  enrolledAthlete,
  cookieOf,
  type TestApp,
} from './test-support/enrolled-athlete.js';
import {
  analysisInput,
  analysisSample,
  analysisSplit,
} from './test-support/analysis-fixture.js';
import { ALGORITHM_VERSION } from './modules/sports-analysis/calculations.js';
import { enqueueAnalysis } from './modules/sports-analysis/processing.js';
import { digest } from './modules/auth/security.js';
import type { IntegrationJob } from './modules/activity-processing/queue.js';
async function persist(
  app: TestApp,
  flow: Awaited<ReturnType<typeof enrolledAthlete>>,
) {
  const fixture = analysisInput({
    samples: Array.from({ length: 61 }, (_, index) =>
      analysisSample(index, {
        heartRateBpm: 140 + (index % 20),
        cadenceRpm: 80,
        altitudeMeters: 100 + (index % 10),
      }),
    ),
    splits: [
      analysisSplit(0),
      analysisSplit(1, {
        timerSeconds: 230,
        avgHeartRateBpm: 150,
        avgCadenceRpm: 88,
      }),
    ],
  });
  const { samples, splits, ...summary } = fixture;
  return app.database.client.$transaction(async (tx) => {
    const activity = await tx.activity.create({
      data: {
        ...summary,
        id: randomUUID(),
        coachId: flow.coach.id,
        athleteId: flow.athlete.id,
        externalId: randomUUID(),
        dataHash: digest(randomUUID()),
      },
    });
    const scope = {
      coachId: flow.coach.id,
      athleteId: flow.athlete.id,
      activityId: activity.id,
    };
    await tx.activitySample.createMany({
      data: samples.map((sample) => ({ ...sample, ...scope })),
    });
    await tx.activitySplit.createMany({
      data: splits.map((split) => ({ ...split, ...scope })),
    });
    return activity;
  });
}
async function runNext(app: TestApp) {
  const queue = app.garmin.service.queue!;
  const [job] = await queue.boss.fetch<IntegrationJob>(queue.name, {
    includeMetadata: true,
  });
  assert.ok(job);
  await app.garmin.worker!.process(job);
  await queue.boss.complete(queue.name, {
    id: job.id,
    retryCount: job.retryCount,
  });
  return job;
}
const jobFor = (id: string, expired = false) =>
  ({
    data: { eventId: id, kind: 'analysis' },
    startedOn: expired ? new Date(0) : new Date(),
    expireInSeconds: 30,
  }) as JobWithMetadata<IntegrationJob>;
test('análise: GET sem mutação, autorização/CSRF, snapshot idempotente, séries e comparação com revisão', async () => {
  const app = await createTestApp(0, undefined, 'demo', false, true);
  try {
    const flow = await enrolledAthlete(app),
      activity = await persist(app, flow),
      path = `/activities/${activity.id}/analysis`,
      db = app.database.client;
    assert.equal((await flow.get(path)).status, 401);
    assert.equal((await flow.get(path, flow.other.cookie)).status, 404);
    const initial = await (await flow.get(path, flow.coach.cookie)).json();
    assert.equal(initial.analysis.status, 'not_requested');
    assert.equal(
      await db.sportsAnalysis.count({ where: { activityId: activity.id } }),
      0,
    );
    assert.equal(initial.series.channels[0].points.length, 61);
    assert.equal(
      (await flow.post(path, {}, flow.coach.cookie, 'invalid')).status,
      403,
    );
    assert.equal(
      (await flow.post(path, {}, flow.other.cookie, flow.other.csrf)).status,
      404,
    );
    const responses = await Promise.all([
      flow.post(path, {}, flow.coach.cookie, flow.coach.csrf),
      flow.post(path, {}, flow.coach.cookie, flow.coach.csrf),
    ]);
    assert.ok(responses.every((response) => response.status === 202));
    const [a, b] = await Promise.all(
      responses.map((response) => response.json()),
    );
    assert.equal(a.id, b.id);
    await runNext(app);
    const completed = await (await flow.get(path, flow.coach.cookie)).json();
    assert.equal(completed.analysis.status, 'completed');
    assert.equal(completed.analysis.result.eventCount, 3);
    assert.equal(
      completed.analysis.result.events[0].current.durationSeconds,
      230,
    );
    const body = {
      inputRevision: activity.revision,
      inputHash: activity.dataHash,
      segments: [
        { kind: 'splits', from: 0, to: 0 },
        { kind: 'splits', from: 1, to: 1 },
      ],
    };
    const response = await flow.post(
      `${path}/compare`,
      body,
      flow.coach.cookie,
      flow.coach.csrf,
    );
    assert.equal(response.status, 200);
    const comparison = await response.json();
    assert.equal(comparison.paceDeltaSecondsPerKm, 30);
    assert.equal(comparison.segments[0].basis, 'timer');
    assert.equal(
      (
        await flow.post(
          `${path}/compare`,
          body,
          flow.other.cookie,
          flow.other.csrf,
        )
      ).status,
      404,
    );
    assert.equal(
      (
        await flow.post(
          `${path}/compare`,
          { ...body, inputHash: 'b'.repeat(64) },
          flow.coach.cookie,
          flow.coach.csrf,
        )
      ).status,
      409,
    );
    assert.equal(
      (
        await flow.post(
          `${path}/compare`,
          { ...body, segments: [{ kind: 'time', from: 10, to: 0 }] },
          flow.coach.cookie,
          flow.coach.csrf,
        )
      ).status,
      400,
    );
    assert.equal(
      (await flow.get(`${path}?axis=bad`, flow.coach.cookie)).status,
      400,
    );
    assert.equal(
      (await flow.get(`${path}?eventPage=121`, flow.coach.cookie)).status,
      400,
    );
    const before = await db.sportsAnalysis.findUniqueOrThrow({
      where: { id: a.id },
    });
    await app.garmin.worker!.process(jobFor(a.id));
    const after = await db.sportsAnalysis.findUniqueOrThrow({
      where: { id: a.id },
    });
    assert.deepEqual(after.result, before.result);
    assert.equal(after.attempts, 1);
    await assert.rejects(
      db.sportsAnalysis.create({
        data: {
          coachId: flow.other.id,
          athleteId: flow.athlete.id,
          activityId: activity.id,
          inputRevision: 1,
          inputHash: 'c'.repeat(64),
          algorithmVersion: ALGORITHM_VERSION,
          namespace: app.config.GARMIN_QUEUE_NAMESPACE,
        },
      }),
    );
  } finally {
    await app.close();
  }
});
test('análise: lease expirado, nova revisão/obsolescência e recuperação de intenção sem job', async () => {
  const app = await createTestApp(0, undefined, 'demo', false, true);
  try {
    const flow = await enrolledAthlete(app),
      activity = await persist(app, flow),
      db = app.database.client;
    const seeded = await db.$transaction((tx) =>
      enqueueAnalysis(tx, activity, app.config.GARMIN_QUEUE_NAMESPACE),
    );
    assert.equal(seeded.jobId, null);
    await app.garmin.worker!.recoverIntents();
    assert.ok(
      (await db.sportsAnalysis.findUniqueOrThrow({ where: { id: seeded.id } }))
        .jobId,
    );
    await assert.rejects(app.garmin.worker!.process(jobFor(seeded.id, true)));
    let record = await db.sportsAnalysis.findUniqueOrThrow({
      where: { id: seeded.id },
    });
    assert.equal(record.status, 'retry');
    assert.equal(record.result, null);
    await app.garmin.worker!.process(jobFor(seeded.id));
    record = await db.sportsAnalysis.findUniqueOrThrow({
      where: { id: seeded.id },
    });
    assert.equal(record.status, 'completed');
    assert.equal(record.attempts, 2);
    const orphanActivity = await persist(app, flow);
    const orphan = await db.$transaction((tx) =>
      enqueueAnalysis(tx, orphanActivity, app.config.GARMIN_QUEUE_NAMESPACE),
    );
    await db.sportsAnalysis.update({
      where: { id: orphan.id },
      data: {
        status: 'processing',
        attempts: 5,
        runToken: randomUUID(),
        leaseUntil: new Date(0),
      },
    });
    await app.garmin.worker!.recoverIntents();
    const recovered = await db.sportsAnalysis.findUniqueOrThrow({
      where: { id: orphan.id },
    });
    assert.equal(recovered.status, 'failed');
    assert.equal(recovered.errorCode, 'retry_exhausted');

    const updated = await db.activity.update({
      where: { id: activity.id },
      data: { revision: 2, dataHash: digest('revision-two') },
    });
    const current = await (
      await flow.get(`/activities/${activity.id}/analysis`, flow.coach.cookie)
    ).json();
    assert.equal(current.analysis.obsolete, true);
    assert.equal(current.analysis.result, null);
    const next = await db.$transaction((tx) =>
      enqueueAnalysis(
        tx,
        updated,
        app.config.GARMIN_QUEUE_NAMESPACE,
        app.garmin.service.queue,
      ),
    );
    await db.activity.update({
      where: { id: activity.id },
      data: { revision: 3, dataHash: digest('revision-three') },
    });
    await app.garmin.worker!.process(jobFor(next.id));
    assert.equal(
      (await db.sportsAnalysis.findUniqueOrThrow({ where: { id: next.id } }))
        .status,
      'cancelled',
    );
    assert.equal(
      (await db.sportsAnalysis.findUniqueOrThrow({ where: { id: seeded.id } }))
        .status,
      'completed',
    );
  } finally {
    await app.close();
  }
});
test('análise: retirada durante cálculo cancela resultado tardio e bloqueia todas as consultas', async () => {
  const app = await createTestApp(0, undefined, 'demo', false, true);
  try {
    const flow = await enrolledAthlete(app),
      activity = await persist(app, flow),
      db = app.database.client;
    const analysis = await db.$transaction((tx) =>
      enqueueAnalysis(tx, activity, app.config.GARMIN_QUEUE_NAMESPACE),
    );
    const transaction = db.$transaction.bind(db);
    let paused = false;
    let release!: () => void, reached!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const entered = new Promise<void>((resolve) => {
      reached = resolve;
    });
    db.$transaction = (async (...args: unknown[]) => {
      const result = await Reflect.apply(transaction, db, args);
      if (
        !paused &&
        result &&
        typeof result === 'object' &&
        'analysis' in result
      ) {
        paused = true;
        reached();
        await gate;
      }
      return result;
    }) as typeof db.$transaction;
    const pending = app.garmin.worker!.process(jobFor(analysis.id));
    await entered;
    try {
      const redeemed = await flow.post('/public/withdrawal/redeem', {
        token: new URL(flow.withdrawalUrl).hash.slice(1),
      });
      const cookie = cookieOf(redeemed);
      const session = await (
        await flow.get('/public/withdrawal', cookie)
      ).json();
      assert.equal(
        (
          await flow.post(
            '/public/withdrawal/confirm',
            { confirm: true },
            cookie,
            session.csrf,
          )
        ).status,
        201,
      );
    } finally {
      release();
    }
    await pending;
    db.$transaction = transaction;
    const record = await db.sportsAnalysis.findUniqueOrThrow({
      where: { id: analysis.id },
    });
    assert.equal(record.status, 'cancelled');
    assert.equal(record.result, null);
    assert.equal(
      (await flow.get(`/activities/${activity.id}/analysis`, flow.coach.cookie))
        .status,
      404,
    );
    assert.equal(
      (
        await flow.post(
          `/activities/${activity.id}/analysis`,
          {},
          flow.coach.cookie,
          flow.coach.csrf,
        )
      ).status,
      404,
    );
    assert.equal(
      (
        await flow.post(
          `/activities/${activity.id}/analysis/compare`,
          {
            inputRevision: 1,
            inputHash: activity.dataHash,
            segments: [
              { kind: 'time', from: 0, to: 10 },
              { kind: 'time', from: 10, to: 20 },
            ],
          },
          flow.coach.cookie,
          flow.coach.csrf,
        )
      ).status,
      404,
    );
  } finally {
    await app.close();
  }
});
test('análise: intenção e job são atômicos quando o enfileiramento falha', async () => {
  const app = await createTestApp(0, undefined, 'demo', false, true);
  try {
    const flow = await enrolledAthlete(app),
      activity = await persist(app, flow),
      queue = app.garmin.service.queue!,
      db = app.database.client;
    const send = queue.sendAnalysis.bind(queue);
    queue.sendAnalysis = async (tx, id) => {
      await send(tx, id);
      throw new Error('controlled queue failure');
    };
    assert.equal(
      (
        await flow.post(
          `/activities/${activity.id}/analysis`,
          {},
          flow.coach.cookie,
          flow.coach.csrf,
        )
      ).status,
      503,
    );
    assert.equal(
      await db.sportsAnalysis.count({ where: { activityId: activity.id } }),
      0,
    );
    assert.equal((await queue.boss.fetch(queue.name)).length, 0);
    queue.sendAnalysis = send;
  } finally {
    await app.close();
  }
});
