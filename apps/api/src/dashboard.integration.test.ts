import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createTestApp } from './test-support/test-app.js';
import type { TestApp } from './test-support/enrolled-athlete.js';
import {
  analysisInput,
  analysisSplit,
} from './test-support/analysis-fixture.js';
import {
  analyze,
  ALGORITHM_VERSION,
} from './modules/sports-analysis/calculations.js';
import { DEMO_DOCUMENTS } from './modules/consents/consents.service.js';
import { DEMO_ISSUER } from './modules/auth/demo-accounts.js';
import { digest, randomToken } from './modules/auth/security.js';
import { projectActivity } from './modules/monitoring/projection.js';
import { createDatabase } from './database.js';
import { DashboardService } from './modules/dashboard/dashboard.service.js';
import type {
  Activity,
  RelationshipStatus,
} from './generated/prisma/client.js';
async function principal(app: TestApp) {
  const token = randomToken();
  const coach = await app.database.client.coach.create({
    data: {
      issuer: DEMO_ISSUER,
      subject: randomUUID(),
      name: 'Treinador sintético isolado',
      email: `${randomUUID()}@example.test`,
    },
  });
  await app.database.client.coachSession.create({
    data: {
      tokenHash: digest(token),
      coachId: coach.id,
      expiresAt: new Date(Date.now() + 3600000),
    },
  });
  return { id: coach.id, cookie: `balducore_session=${token}` };
}
async function student(
  app: TestApp,
  coachId: string,
  status: RelationshipStatus = 'active',
  consent = true,
) {
  const db = app.database.client;
  const a = await db.athlete.create({
    data: {
      coachId,
      name: `Aluno sintético ${randomUUID()}`,
      email: `${randomUUID()}@example.test`,
    },
  });
  await db.coachAthleteRelationship.create({
    data: { coachId, athleteId: a.id, status },
  });
  if (consent) {
    const invitation = await db.invitation.create({
      data: {
        coachId,
        athleteId: a.id,
        recipientEmail: a.email,
        tokenHash: digest(randomUUID()),
        expiresAt: new Date(Date.now() + 3600000),
        consumedAt: new Date(),
      },
    });
    const enrollment = await db.enrollmentSession.create({
      data: {
        coachId,
        athleteId: a.id,
        invitationId: invitation.id,
        tokenHash: digest(randomUUID()),
        expiresAt: new Date(Date.now() + 3600000),
        codeExpiresAt: new Date(Date.now() + 3600000),
        acceptedAt: new Date(),
        verifiedAt: new Date(),
      },
    });
    for (const doc of DEMO_DOCUMENTS) {
      await db.consentDocument.upsert({
        where: { id: doc.id },
        update: {},
        create: { ...doc, contentHash: digest(doc.content) },
      });
      await db.consentEvidence.create({
        data: {
          coachId,
          athleteId: a.id,
          enrollmentId: enrollment.id,
          documentId: doc.id,
          decision: 'accepted',
        },
      });
    }
  }
  return a;
}
const today = () =>
  new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z');
async function activity(
  app: TestApp,
  coachId: string,
  athleteId: string,
  overrides: Partial<Activity> = {},
) {
  const { samples, splits, ...base } = analysisInput();
  assert.ok(samples.length && splits.length);
  return app.database.client.activity.create({
    data: {
      ...base,
      id: randomUUID(),
      coachId,
      athleteId,
      externalId: randomUUID(),
      startedAt: new Date(today().getTime() - 86400000 + 43200000),
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    },
  });
}
async function snapshot(app: TestApp, a: Activity, events = true) {
  const fixture = analysisInput({
    ...a,
    splits: [
      analysisSplit(0),
      analysisSplit(1, {
        timerSeconds: events ? 240 : 200,
        avgHeartRateBpm: events ? 155 : 140,
        avgCadenceRpm: events ? 90 : 80,
      }),
    ],
  });
  return app.database.client.sportsAnalysis.create({
    data: {
      coachId: a.coachId,
      athleteId: a.athleteId,
      activityId: a.id,
      inputRevision: a.revision,
      inputHash: a.dataHash,
      algorithmVersion: ALGORITHM_VERSION,
      namespace: app.config.GARMIN_QUEUE_NAMESPACE,
      status: 'completed',
      finishedAt: new Date(),
      result: analyze(fixture),
    },
  });
}
async function setup() {
  const app = await createTestApp(0, undefined, 'demo', false, true);
  const coach = await principal(app),
    other = await principal(app);
  const get = (query = '', cookie = coach.cookie) =>
    fetch(`${app.base}/dashboard${query ? '?' + query : ''}`, {
      headers: { cookie },
    });
  const read = async (query = '', cookie = coach.cookie) => {
    const response = await get(query, cookie);
    assert.equal(response.status, 200);
    return response.json();
  };
  return { app, db: app.database.client, coach, other, get, read };
}
test('dashboard: vazio verdadeiro, autenticação, DTO sem escrita de domínio e filtros estritos', async () => {
  const { app, db, coach, get, read } = await setup();
  try {
    assert.equal((await get('', '')).status, 401);
    const before = {
      activity: await db.activity.count(),
      monitoring: await db.monitoringEvent.count(),
      analysis: await db.sportsAnalysis.count(),
    };
    const response = await get();
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const data = await response.json();
    assert.equal(data.athletes.total, 0);
    assert.equal(data.connections.eligible, 0);
    assert.equal(data.connections.connected, 0);
    assert.equal(data.activities.total, 0);
    assert.deepEqual(data.volumes, []);
    assert.equal(data.attention.total, 0);
    assert.equal(data.monitoring.total, 0);
    assert.deepEqual(data.activities.items, []);
    assert.deepEqual(data.athletes.items, []);
    assert.deepEqual(
      {
        activity: await db.activity.count(),
        monitoring: await db.monitoringEvent.count(),
        analysis: await db.sportsAnalysis.count(),
      },
      before,
    );
    for (const query of [
      'period=0',
      'period=31',
      'period=invalid',
      'sport=football',
      'coachId=' + coach.id,
    ])
      assert.equal((await get(query)).status, 400);
    const next = await read('period=7');
    assert.equal(next.filters.period, 7);
    await db.coach.update({
      where: { id: coach.id },
      data: { enabled: false },
    });
    assert.equal((await get()).status, 401);
  } finally {
    await app.close();
  }
});
test('dashboard: totais além das prévias, modalidades, zero/null, proveniência separada e fotografia cadastral', async () => {
  const { app, db, coach, other, read } = await setup();
  try {
    const active = await student(app, coach.id),
      ended = await student(app, coach.id, 'ended'),
      pending = await student(app, coach.id, 'pending', false),
      withdrawn = await student(app, coach.id);
    for (let n = 0; n < 6; n++) await student(app, coach.id, 'pending', false);
    const evidence = await db.consentEvidence.findFirstOrThrow({
      where: { athleteId: withdrawn.id },
    });
    await db.consentEvidence.create({
      data: {
        coachId: coach.id,
        athleteId: withdrawn.id,
        enrollmentId: evidence.enrollmentId,
        documentId: evidence.documentId,
        decision: 'withdrawn',
      },
    });
    for (const a of [active, ended, pending, withdrawn])
      await db.garminConnection.create({
        data: {
          coachId: coach.id,
          athleteId: a.id,
          status: 'connected',
          isSynthetic: true,
          provider: 'garmin_mock',
        },
      });
    const inputs = [
      { distanceMeters: 1000 },
      { distanceMeters: null },
      { distanceMeters: 0 },
      { sport: 'cycling', distanceMeters: 42000 },
      { sport: 'swimming', distanceMeters: 1500 },
      { sport: 'walking', distanceMeters: 3000 },
      { sport: 'other', distanceMeters: null },
      {
        distanceMeters: 5000,
        isSynthetic: false,
        source: 'nonsynthetic_test_fixture',
      },
    ];
    for (const input of inputs) await activity(app, coach.id, active.id, input);
    await activity(app, coach.id, active.id, {
      sport: 'cycling',
      distanceMeters: 100,
      startedAt: new Date(today().getTime() - 8 * 86400000),
    });
    await activity(app, coach.id, active.id, {
      distanceMeters: 200,
      startedAt: new Date(today().getTime() - 40 * 86400000),
    });
    await activity(app, coach.id, active.id, {
      startedAt: new Date(today().getTime() + 86400000),
    });
    for (const a of [ended, pending, withdrawn])
      await activity(app, coach.id, a.id, { distanceMeters: 900000 });
    const foreign = await student(app, other.id);
    await activity(app, other.id, foreign.id, { distanceMeters: 1000000 });
    const data = await read();
    assert.equal(data.athletes.total, 10);
    assert.equal(data.athletes.items.length, 6);
    assert.equal(data.athletes.statuses.active, 2);
    assert.equal(data.athletes.statuses.pending, 7);
    assert.equal(data.athletes.statuses.ended, 1);
    assert.equal(data.connections.eligible, 1);
    assert.equal(data.connections.connected, 1);
    assert.equal(data.connections.simulated, 1);
    assert.equal(data.connections.officialAvailable, false);
    assert.equal(data.activities.total, 9);
    assert.equal(data.activities.items.length, 5);
    assert.equal(data.activities.synthetic, 8);
    assert.equal(data.activities.real, 1);
    const runs = data.volumes.find(
      (v: { sport: string; isSynthetic: boolean }) =>
        v.sport === 'running' && v.isSynthetic,
    );
    assert.equal(runs.distanceMeters, 1000);
    assert.equal(runs.known, 2);
    assert.equal(runs.missing, 1);
    assert.equal(
      data.volumes.find((v: { sport: string }) => v.sport === 'other')
        .distanceMeters,
      null,
    );
    assert.equal(
      data.volumes.find((v: { sport: string }) => v.sport === 'walking')
        .distanceMeters,
      3000,
    );
    assert.equal((await read('period=7')).activities.total, 8);
    assert.equal((await read('period=90')).activities.total, 10);
    const swimming = await read('sport=swimming');
    assert.equal(swimming.activities.total, 1);
    assert.equal(swimming.volumes[0].distanceMeters, 1500);
    assert.equal(swimming.athletes.total, 10);
    assert.equal(swimming.connections.connected, 1);
    const otherData = await read('', other.cookie);
    assert.equal(otherData.athletes.total, 1);
    assert.equal(otherData.activities.total, 1);
    for (const item of otherData.activities.items)
      assert.equal(item.athleteId, foreign.id);
  } finally {
    await app.close();
  }
});
test('dashboard: análise atual e eventos por atividade, snapshots inválidos e obsoletos sem inventar ausência', async () => {
  const { app, db, coach, read } = await setup();
  try {
    const a = await student(app, coach.id);
    const first = await activity(app, coach.id, a.id),
      calm = await activity(app, coach.id, a.id),
      waiting = await activity(app, coach.id, a.id),
      old = await activity(app, coach.id, a.id);
    const firstSnapshot = await snapshot(app, first);
    await snapshot(app, calm, false);
    await snapshot(app, old);
    await db.activity.update({
      where: { id: old.id },
      data: { revision: 2, dataHash: digest('updated') },
    });
    await db.sportsAnalysis.create({
      data: {
        coachId: coach.id,
        athleteId: a.id,
        activityId: waiting.id,
        inputRevision: 1,
        inputHash: waiting.dataHash,
        algorithmVersion: ALGORITHM_VERSION,
        namespace: app.config.GARMIN_QUEUE_NAMESPACE,
        status: 'queued',
      },
    });
    let data = await read();
    assert.equal(data.attention.total, 1);
    assert.equal(data.attention.items[0].eventCount, 3);
    assert.equal(data.attention.coverage.completed, 2);
    assert.equal(data.attention.coverage.missing, 2);
    assert.equal(data.connections.connected, 0);
    assert.equal(data.connections.eligible, 1);
    assert.equal(data.connections.states[0].status, 'not_connected');
    assert.equal(
      data.activities.items.find((v: { id: string }) => v.id === old.id)
        .analysisStatus,
      'obsolete',
    );
    await db.sportsAnalysis.update({
      where: { id: firstSnapshot.id },
      data: { result: { invalid: true } },
    });
    data = await read();
    assert.equal(data.attention.status, 'unavailable');
    assert.equal(data.attention.total, null);
    assert.equal(data.attention.coverage.invalid, 1);
    assert.equal(data.activities.total, 4);
    assert.equal(data.volumes[0].distanceMeters, 8000);
    assert.equal(
      data.activities.items.find((v: { id: string }) => v.id === first.id)
        .analysisStatus,
      'invalid',
    );
  } finally {
    await app.close();
  }
});
test('dashboard: pendência usa regras da central, não modalidade, e retirada remove todos os dados esportivos', async () => {
  const { app, db, coach, read } = await setup();
  try {
    const a = await student(app, coach.id),
      run = await activity(app, coach.id, a.id);
    await snapshot(app, run);
    await db.$transaction((tx) => projectActivity(tx, run.id));
    assert.equal((await read()).monitoring.total, 1);
    const onlySwimming = await read('sport=swimming');
    assert.equal(onlySwimming.activities.total, 0);
    assert.equal(onlySwimming.monitoring.total, 1);
    const session = await (
      await fetch(`${app.base}/auth/session`, {
        headers: { cookie: coach.cookie },
      })
    ).json();
    const response = await fetch(`${app.base}/activities/${run.id}/feedback`, {
      method: 'PUT',
      headers: {
        cookie: coach.cookie,
        origin: app.config.APP_ORIGIN,
        'content-type': 'application/json',
        'x-csrf-token': session.csrf,
      },
      body: JSON.stringify({
        expectedVersion: 0,
        inputRevision: run.revision,
        inputHash: run.dataHash,
        analysisId: null,
        content: {
          execution: '',
          observations: 'Observação sintética.',
          decisions: '',
          points: [],
          verdicts: [],
        },
      }),
    });
    assert.equal(response.status, 200);
    assert.equal((await read()).monitoring.total, 0);
    const consent = await db.consentEvidence.findFirstOrThrow({
      where: { athleteId: a.id },
    });
    await db.consentEvidence.create({
      data: {
        coachId: coach.id,
        athleteId: a.id,
        enrollmentId: consent.enrollmentId,
        documentId: consent.documentId,
        decision: 'withdrawn',
      },
    });
    const blocked = await read();
    assert.equal(blocked.athletes.total, 1);
    assert.equal(blocked.athletes.items[0].garmin, null);
    assert.equal(blocked.activities.total, 0);
    assert.deepEqual(blocked.volumes, []);
    assert.equal(blocked.attention.total, 0);
    assert.equal(blocked.monitoring.total, 0);
    assert.equal(blocked.connections.eligible, 0);
  } finally {
    await app.close();
  }
});
test('dashboard: fronteiras de início de atividade em UTC e independência do fuso PostgreSQL', async () => {
  const { app, coach, read } = await setup();
  let alternate: ReturnType<typeof createDatabase> | undefined;
  try {
    const a = await student(app, coach.id),
      start = today().getTime() - 6 * 86400000,
      end = today().getTime() + 86400000;
    for (const time of [start, start - 1, end - 1, end])
      await activity(app, coach.id, a.id, { startedAt: new Date(time) });
    assert.equal((await read('period=7')).activities.total, 2);
    assert.equal((await read('period=30')).activities.total, 3);
    const url = new URL(process.env.TEST_DATABASE_URL!);
    url.searchParams.set('options', '-c timezone=America/Sao_Paulo');
    alternate = createDatabase(url.toString());
    const data = await new DashboardService(alternate.client).get(coach.id, {
      period: 7,
    });
    assert.equal(data.activities.total, 2);
  } finally {
    await alternate?.close();
    await app.close();
  }
});
test('dashboard: lote de mais de 100 análises não limita totais nem ignora corrupção fora das prévias', async () => {
  const { app, db, coach, read } = await setup();
  try {
    const a = await student(app, coach.id),
      base = await activity(app, coach.id, a.id),
      first = await snapshot(app, base);
    const rows = Array.from({ length: 105 }, (_, n) => ({
      ...base,
      id: randomUUID(),
      externalId: randomUUID(),
      startedAt: new Date(base.startedAt.getTime() - n - 1),
    }));
    await db.activity.createMany({ data: rows });
    await db.sportsAnalysis.createMany({
      data: rows.map((row) => ({
        coachId: coach.id,
        athleteId: a.id,
        activityId: row.id,
        inputRevision: row.revision,
        inputHash: row.dataHash,
        algorithmVersion: ALGORITHM_VERSION,
        namespace: app.config.GARMIN_QUEUE_NAMESPACE,
        status: 'completed' as const,
        result: first.result!,
      })),
    });
    const data = await read();
    assert.equal(data.activities.total, 106);
    assert.equal(data.activities.items.length, 5);
    assert.equal(data.attention.total, 106);
    assert.equal(data.attention.items.length, 5);
    await db.sportsAnalysis.updateMany({
      where: { activityId: rows.at(-1)!.id },
      data: { result: { bad: 'snapshot' } },
    });
    const invalid = await read();
    assert.equal(invalid.attention.status, 'unavailable');
    assert.equal(invalid.attention.coverage.invalid, 1);
    assert.equal(invalid.activities.total, 106);
  } finally {
    await app.close();
  }
});
