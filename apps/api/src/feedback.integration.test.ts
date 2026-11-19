import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createTestApp } from './test-support/test-app.js';
import {
  enrolledAthlete,
  type TestApp,
} from './test-support/enrolled-athlete.js';
import {
  analysisInput,
  analysisSplit,
} from './test-support/analysis-fixture.js';
import {
  ALGORITHM_VERSION,
  analyze,
} from './modules/sports-analysis/calculations.js';
import { emptyContent } from './modules/coach-feedback/contracts.js';
async function setup() {
  const app = await createTestApp(0, undefined, 'demo', false, true);
  const flow = await enrolledAthlete(app);
  const fixture = analysisInput({
    splits: [analysisSplit(0), analysisSplit(1, { timerSeconds: 240 })],
  });
  const { samples, splits, ...summary } = fixture;
  assert.ok(samples.length > 0 && splits.length > 0);
  const activity = await app.database.client.activity.create({
    data: {
      ...summary,
      id: randomUUID(),
      externalId: randomUUID(),
      coachId: flow.coach.id,
      athleteId: flow.athlete.id,
    },
  });
  const path = `/activities/${activity.id}/feedback`;
  const body = {
    expectedVersion: 0,
    inputRevision: activity.revision,
    inputHash: activity.dataHash,
    analysisId: null as string | null,
    content: {
      ...emptyContent(),
      observations: 'Observação sintética, sem causa inferida.',
    },
  };
  const put = (
    data: unknown,
    cookie = flow.coach.cookie,
    csrf = flow.coach.csrf,
  ) =>
    fetch(`${app.base}${path}`, {
      method: 'PUT',
      headers: {
        cookie,
        origin: app.config.APP_ORIGIN,
        'content-type': 'application/json',
        'x-csrf-token': csrf,
      },
      body: JSON.stringify(data),
    });
  return { app, flow, activity, path, body, put, fixture };
}
const revisionsCount = (app: TestApp, activityId: string) =>
  app.database.client.coachFeedbackRevision.count({ where: { activityId } });
test('feedback: autenticação/CSRF, isolamento, primeira publicação e histórico imutável com autoria da sessão', async () => {
  const { app, flow, activity, path, body, put } = await setup();
  try {
    assert.equal((await flow.get(path)).status, 401);
    assert.equal((await put(body, '', '')).status, 401);
    assert.equal((await put(body, flow.coach.cookie, 'bad')).status, 403);
    assert.equal(
      (await put(body, flow.other.cookie, flow.other.csrf)).status,
      404,
    );
    assert.equal((await flow.get(path, flow.other.cookie)).status, 404);
    assert.equal((await put({ ...body, coachId: flow.other.id })).status, 400);
    const initial = await (await flow.get(path, flow.coach.cookie)).json();
    assert.equal(initial.version, 0);
    assert.equal(initial.analysis.id, null);
    assert.equal(await revisionsCount(app, activity.id), 0);
    assert.equal((await put(body)).status, 200);
    const second = {
      ...body,
      expectedVersion: 1,
      content: {
        ...body.content,
        decisions: 'Acompanhar execução no próximo treino.',
      },
    };
    assert.equal((await put(second)).status, 200);
    const history = await (
      await flow.get(`${path}/revisions`, flow.coach.cookie)
    ).json();
    assert.deepEqual(
      history.items.map((item: { version: number }) => item.version),
      [2, 1],
    );
    const old = await (
      await flow.get(`${path}/revisions/1`, flow.coach.cookie)
    ).json();
    assert.equal(old.content.decisions, '');
    assert.equal(old.coachId, flow.coach.id);
    const latest = await (await flow.get(path, flow.coach.cookie)).json();
    assert.equal(latest.content.decisions, second.content.decisions);
    for (const url of [
      `${path}/revisions`,
      `${path}/revisions/1`,
      `/athletes/${flow.athlete.id}/feedback`,
    ])
      assert.equal((await flow.get(url, flow.other.cookie)).status, 404);
    assert.equal(
      (await flow.get(`${path}/revisions/3`, flow.coach.cookie)).status,
      404,
    );
    assert.equal(
      (await flow.get(`${path}/revisions/9999999999`, flow.coach.cookie))
        .status,
      400,
    );
    const list = await (
      await flow.get(`/athletes/${flow.athlete.id}/feedback`, flow.coach.cookie)
    ).json();
    assert.equal(list.items[0].activityId, activity.id);
    assert.equal(
      await app.database.client.auditLog.count({
        where: {
          resourceId: latest.current.feedbackId,
          action: 'feedback.revision.created',
        },
      }),
      2,
    );
  } finally {
    await app.close();
  }
});
test('feedback: criação/edição concorrentes, replay e escrita idêntica não criam revisões extras', async () => {
  const { app, flow, activity, body, put, path } = await setup();
  try {
    const first = await Promise.all([put(body), put(body)]);
    assert.deepEqual(first.map((r) => r.status).sort(), [200, 409]);
    const next = {
      ...body,
      expectedVersion: 1,
      content: { ...body.content, observations: 'Nova observação sintética.' },
    };
    const concurrent = await Promise.all([
      put(next),
      put({
        ...next,
        content: {
          ...next.content,
          observations: 'Outra observação sintética.',
        },
      }),
    ]);
    assert.deepEqual(concurrent.map((r) => r.status).sort(), [200, 409]);
    assert.equal(await revisionsCount(app, activity.id), 2);
    const current = await (await flow.get(path, flow.coach.cookie)).json();
    const unchanged = await put({
      ...body,
      expectedVersion: 2,
      content: current.content,
    });
    assert.equal(unchanged.status, 200);
    assert.equal((await unchanged.json()).unchanged, true);
    assert.equal(await revisionsCount(app, activity.id), 2);
    assert.equal(
      (await put({ ...body, expectedVersion: 2, content: emptyContent() }))
        .status,
      200,
    );
    assert.equal(await revisionsCount(app, activity.id), 3);
  } finally {
    await app.close();
  }
});
test('feedback: valida limites, campos, segmentos e proveniência dos eventos; aceita contexto ausente sem análise', async () => {
  const { app, flow, activity, path, body, put, fixture } = await setup();
  try {
    assert.equal((await put({ ...body, content: emptyContent() })).status, 400);
    assert.equal(
      (
        await put({
          ...body,
          content: { ...body.content, observations: 'x'.repeat(4001) },
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await put({
          ...body,
          content: {
            ...body.content,
            verdicts: [{ eventId: 'invented', verdict: 'correct' }],
          },
        })
      ).status,
      400,
    );
    const point = {
      id: randomUUID(),
      category: 'hydration',
      source: 'athlete_report',
      note: 'Aluno informou parada para hidratação.',
      scope: { kind: 'distance', from: 0, to: 1000 },
    };
    for (const scope of [
      { kind: 'distance', from: 2, to: 1 },
      { kind: 'distance', from: 0, to: 3000 },
      { kind: 'time', from: 0, to: 441 },
    ])
      assert.equal(
        (
          await put({
            ...body,
            content: { ...body.content, points: [{ ...point, scope }] },
          })
        ).status,
        400,
      );
    assert.equal(
      (
        await put({
          ...body,
          content: {
            ...body.content,
            points: [{ ...point, source: 'sensor_inferred' }],
          },
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await put({
          ...body,
          content: { ...body.content, points: [point, point] },
        })
      ).status,
      400,
    );
    const result = analyze(fixture);
    const analysis = await app.database.client.sportsAnalysis.create({
      data: {
        coachId: flow.coach.id,
        athleteId: flow.athlete.id,
        activityId: activity.id,
        inputRevision: activity.revision,
        inputHash: activity.dataHash,
        algorithmVersion: ALGORITHM_VERSION,
        namespace: app.config.GARMIN_QUEUE_NAMESPACE,
        status: 'completed',
        result,
      },
    });
    const withAnalysis = {
      ...body,
      analysisId: analysis.id,
      content: {
        ...body.content,
        points: [point],
        verdicts: [{ eventId: result.events[0].id, verdict: 'correct' }],
      },
    };
    assert.equal(
      (
        await put({
          ...withAnalysis,
          content: {
            ...withAnalysis.content,
            verdicts: [{ eventId: 'invented', verdict: 'correct' }],
          },
        })
      ).status,
      400,
    );
    assert.equal(
      (await put({ ...withAnalysis, analysisId: randomUUID() })).status,
      409,
    );
    assert.equal((await put(withAnalysis)).status, 200);
    assert.equal(
      (await (await flow.get(path, flow.coach.cookie)).json()).analysis.total,
      1,
    );
    await app.database.client.sportsAnalysis.update({
      where: { id: analysis.id },
      data: { status: 'failed' },
    });
    assert.equal(
      (await (await flow.get(path, flow.coach.cookie)).json()).obsolete,
      true,
    );
    assert.equal((await put({ ...body, expectedVersion: 1 })).status, 409);
    await app.database.client.sportsAnalysis.update({
      where: { id: analysis.id },
      data: { status: 'completed' },
    });
    // Distância/tempo ausentes não autorizam intervalos fabricados.
    await app.database.client.activity.update({
      where: { id: activity.id },
      data: { distanceMeters: null, elapsedSeconds: null },
    });
    assert.equal(
      (
        await put({
          ...body,
          expectedVersion: 1,
          content: { ...body.content, points: [point] },
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await put({
          ...body,
          expectedVersion: 1,
          content: {
            ...body.content,
            points: [{ ...point, scope: { kind: 'time', from: 0, to: 1 } }],
          },
        })
      ).status,
      400,
    );
  } finally {
    await app.close();
  }
});
test('feedback: atividade atualizada exige contexto confirmado e preserva revisão antiga; retirada bloqueia todas as rotas', async () => {
  const { app, flow, activity, body, put, path } = await setup();
  try {
    assert.equal((await put(body)).status, 200);
    const hash = 'b'.repeat(64);
    await app.database.client.activity.update({
      where: { id: activity.id },
      data: { revision: 2, dataHash: hash },
    });
    assert.equal((await put({ ...body, expectedVersion: 1 })).status, 409);
    assert.equal(
      (await (await flow.get(path, flow.coach.cookie)).json()).obsolete,
      true,
    );
    const fresh = {
      ...body,
      expectedVersion: 1,
      inputRevision: 2,
      inputHash: hash,
    };
    assert.equal((await put(fresh)).status, 409);
    assert.equal(
      (
        await put({
          ...fresh,
          confirmContext: true,
          content: {
            ...body.content,
            verdicts: [{ eventId: 'old', verdict: 'correct' }],
          },
        })
      ).status,
      409,
    );
    assert.equal((await put({ ...fresh, confirmContext: true })).status, 200);
    const old = await (
      await flow.get(`${path}/revisions/1`, flow.coach.cookie)
    ).json();
    assert.equal(old.inputHash, activity.dataHash);
    assert.equal(old.inputRevision, 1);
    await app.database.client.coachAthleteRelationship.update({
      where: {
        coachId_athleteId: {
          coachId: flow.coach.id,
          athleteId: flow.athlete.id,
        },
      },
      data: { status: 'ended', endedAt: new Date() },
    });
    for (const url of [
      path,
      `${path}/revisions`,
      `${path}/revisions/1`,
      `/athletes/${flow.athlete.id}/feedback`,
    ])
      assert.equal((await flow.get(url, flow.coach.cookie)).status, 404);
    assert.equal((await put({ ...fresh, expectedVersion: 2 })).status, 404);
  } finally {
    await app.close();
  }
});
test('feedback: paginação de eventos/histórico, consentimento retirado, FKs compostas e transação sem revisão parcial', async () => {
  const { app, flow, activity, body, put, path, fixture } = await setup();
  try {
    const result = analyze(fixture),
      event = result.events[0];
    const analysis = await app.database.client.sportsAnalysis.create({
      data: {
        coachId: flow.coach.id,
        athleteId: flow.athlete.id,
        activityId: activity.id,
        inputRevision: activity.revision,
        inputHash: activity.dataHash,
        algorithmVersion: ALGORITHM_VERSION,
        namespace: app.config.GARMIN_QUEUE_NAMESPACE,
        status: 'completed',
        result: {
          ...result,
          events: Array.from({ length: 51 }, (_, i) => ({
            ...event,
            id: `event-${i}`,
          })),
        },
      },
    });
    const page = await (
      await flow.get(`${path}?page=2`, flow.coach.cookie)
    ).json();
    assert.equal(page.analysis.events[0].id, 'event-50');
    assert.equal(page.analysis.total, 51);
    assert.equal(
      (
        await put({
          ...body,
          analysisId: analysis.id,
          content: {
            ...body.content,
            verdicts: [{ eventId: 'event-50', verdict: 'partial' }],
          },
        })
      ).status,
      200,
    );
    const db = app.database.client;
    const feedback = await db.coachFeedback.findUniqueOrThrow({
      where: { activityId: activity.id },
    });
    await assert.rejects(
      db.coachFeedbackRevision.create({
        data: {
          coachId: flow.other.id,
          athleteId: flow.athlete.id,
          activityId: activity.id,
          feedbackId: feedback.id,
          version: 2,
          inputRevision: 1,
          inputHash: activity.dataHash,
          content: emptyContent(),
        },
      }),
    );
    await assert.rejects(
      db.$transaction(async (tx) => {
        await tx.coachFeedback.update({
          where: { id: feedback.id },
          data: { version: 2 },
        });
        await tx.coachFeedbackRevision.create({
          data: {
            coachId: flow.coach.id,
            athleteId: flow.athlete.id,
            activityId: activity.id,
            feedbackId: feedback.id,
            analysisId: randomUUID(),
            version: 2,
            inputRevision: 1,
            inputHash: activity.dataHash,
            content: emptyContent(),
          },
        });
      }),
    );
    assert.equal(
      (await db.coachFeedback.findUniqueOrThrow({ where: { id: feedback.id } }))
        .version,
      1,
    );
    assert.equal(await revisionsCount(app, activity.id), 1);
    assert.equal(
      (await flow.get(`${path}/revisions?page=0`, flow.coach.cookie)).status,
      400,
    );
    assert.equal(
      (await flow.get(`${path}?page=1&untrusted=yes`, flow.coach.cookie))
        .status,
      400,
    );
    // Histórico paginado, sem depender de 21 gravações HTTP/rate limit.
    for (let version = 2; version <= 21; version++)
      await db.coachFeedbackRevision.create({
        data: {
          coachId: flow.coach.id,
          athleteId: flow.athlete.id,
          activityId: activity.id,
          feedbackId: feedback.id,
          version,
          inputRevision: 1,
          inputHash: activity.dataHash,
          content: body.content,
        },
      });
    const history = await (
      await flow.get(`${path}/revisions?page=2`, flow.coach.cookie)
    ).json();
    assert.equal(history.items.length, 1);
    assert.equal(history.items[0].version, 1);
    const consent = await db.consentEvidence.findFirstOrThrow({
      where: { coachId: flow.coach.id, athleteId: flow.athlete.id },
    });
    await db.consentEvidence.create({
      data: {
        coachId: consent.coachId,
        athleteId: consent.athleteId,
        enrollmentId: consent.enrollmentId,
        documentId: consent.documentId,
        decision: 'withdrawn',
      },
    });
    for (const url of [
      path,
      `${path}/revisions`,
      `${path}/revisions/1`,
      `/athletes/${flow.athlete.id}/feedback`,
    ])
      assert.equal((await flow.get(url, flow.coach.cookie)).status, 404);
    assert.equal((await put({ ...body, expectedVersion: 1 })).status, 404);
  } finally {
    await app.close();
  }
});

test('feedback: limite HTTP específico, UTF-8 e rollback real após falha de auditoria', async () => {
  const { app, flow, activity, body, put, path } = await setup();
  const db = app.database.client;
  const suffix = randomUUID().replaceAll('-', '');
  const guard = `feedback_test_${suffix}`;
  let createdGuard = false;
  try {
    const content = {
      execution: 'x'.repeat(4000),
      observations: 'x'.repeat(4000),
      decisions: 'x'.repeat(4000),
      points: Array.from({ length: 20 }, () => ({
        id: randomUUID(),
        category: 'other',
        source: 'coach_observation',
        note: 'x'.repeat(1000),
        scope: { kind: 'whole' },
      })),
      verdicts: [],
    };
    assert.ok(Buffer.byteLength(JSON.stringify({ ...body, content })) > 16384);
    assert.equal((await put({ ...body, content })).status, 200);
    const excessive = await fetch(`${app.base}${path}`, {
      method: 'PUT',
      headers: {
        cookie: flow.coach.cookie,
        origin: app.config.APP_ORIGIN,
        'content-type': 'application/json',
        'x-csrf-token': flow.coach.csrf,
      },
      body: JSON.stringify(body) + ' '.repeat(65536),
    });
    assert.equal(excessive.status, 413);
    assert.equal(
      (
        await put({
          ...body,
          expectedVersion: 1,
          content: {
            ...content,
            points: content.points.map((p) => ({
              ...p,
              note: '界'.repeat(1000),
            })),
          },
        })
      ).status,
      413,
    );
    const ordinary = await fetch(`${app.base}/athletes`, {
      method: 'POST',
      headers: {
        cookie: flow.coach.cookie,
        origin: app.config.APP_ORIGIN,
        'content-type': 'application/json',
        'x-csrf-token': flow.coach.csrf,
      },
      body:
        JSON.stringify({
          name: 'Teste sintético',
          email: 'size@example.test',
        }) + ' '.repeat(17000),
    });
    assert.equal(ordinary.status, 413);
    // Falha controlada somente no audit deste recurso sintético: a API deve desfazer agregado e revisão.
    const feedback = await db.coachFeedback.findUniqueOrThrow({
      where: { activityId: activity.id },
    });
    assert.match(feedback.id, /^[a-f0-9-]+$/);
    await db.$executeRawUnsafe(
      `CREATE FUNCTION "${guard}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'controlled_test_failure'; END $$`,
    );
    createdGuard = true;
    await db.$executeRawUnsafe(
      `CREATE TRIGGER "${guard}" BEFORE INSERT ON "AuditLog" FOR EACH ROW WHEN (NEW."resourceId" = '${feedback.id}') EXECUTE FUNCTION "${guard}"()`,
    );
    assert.equal((await put({ ...body, expectedVersion: 1 })).status, 503);
    assert.equal(await revisionsCount(app, activity.id), 1);
    assert.equal(
      (await db.coachFeedback.findUniqueOrThrow({ where: { id: feedback.id } }))
        .version,
      1,
    );
  } finally {
    if (createdGuard) {
      await db.$executeRawUnsafe(
        `DROP TRIGGER IF EXISTS "${guard}" ON "AuditLog"`,
      );
      await db.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "${guard}"()`);
    }
    await app.close();
  }
});
