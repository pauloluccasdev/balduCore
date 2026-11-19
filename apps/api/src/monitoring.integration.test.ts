import { createDatabase } from './database.js';
import { MonitoringService } from './modules/monitoring/monitoring.service.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { JobWithMetadata } from 'pg-boss';
import { createTestApp } from './test-support/test-app.js';
import { enrolledAthlete } from './test-support/enrolled-athlete.js';
import {
  analysisInput,
  analysisSplit,
} from './test-support/analysis-fixture.js';
import {
  enqueueAnalysis,
  processAnalysis,
} from './modules/sports-analysis/processing.js';
import {
  projectActivity,
  projectAnalysis,
  projectFit,
  projectIntegration,
  projectConnection,
} from './modules/monitoring/projection.js';
import { reconcileMonitoring } from './modules/monitoring/reconcile.js';
import { lockRelationship } from './modules/garmin-connections/lifecycle.js';
import { emptyContent } from './modules/coach-feedback/contracts.js';
import { digest } from './modules/auth/security.js';
import type { IntegrationJob } from './modules/activity-processing/queue.js';
async function setup() {
  const app = await createTestApp(0, undefined, 'demo');
  const flow = await enrolledAthlete(app);
  const db = app.database.client;
  const fixture = analysisInput({
    splits: [
      analysisSplit(0),
      analysisSplit(1, {
        timerSeconds: 240,
        avgHeartRateBpm: 155,
        avgCadenceRpm: 90,
      }),
    ],
  });
  const { samples, splits, ...summary } = fixture;
  const activity = await db.$transaction(async (tx) => {
    await lockRelationship(tx, {
      coachId: flow.coach.id,
      athleteId: flow.athlete.id,
    });
    const a = await tx.activity.create({
      data: {
        ...summary,
        id: randomUUID().slice(0, -1) + '1',
        coachId: flow.coach.id,
        athleteId: flow.athlete.id,
        externalId: randomUUID(),
      },
    });
    const scope = {
      coachId: a.coachId,
      athleteId: a.athleteId,
      activityId: a.id,
    };
    await tx.activitySample.createMany({
      data: samples.map((s) => ({ ...s, ...scope })),
    });
    await tx.activitySplit.createMany({
      data: splits.map((s) => ({ ...s, ...scope })),
    });
    await enqueueAnalysis(
      tx,
      a,
      app.config.GARMIN_QUEUE_NAMESPACE,
      app.garmin.service.queue,
    );
    return a;
  });
  const url = `/monitoring?athleteId=${flow.athlete.id}`;
  const list = async (extra = '', cookie = flow.coach.cookie) => {
    const response = await flow.get(url + extra, cookie);
    assert.equal(response.status, 200);
    return response.json();
  };
  const mark = (
    id: string,
    expectedVersion: number,
    read = true,
    cookie = flow.coach.cookie,
    csrf = flow.coach.csrf,
  ) =>
    fetch(`${app.base}/monitoring/${id}/read`, {
      method: 'PATCH',
      headers: {
        origin: app.config.APP_ORIGIN,
        cookie,
        'x-csrf-token': csrf,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ expectedVersion, read }),
    });
  const complete = async () => {
    const s = await db.sportsAnalysis.findFirstOrThrow({
      where: { activityId: activity.id },
      orderBy: { inputRevision: 'desc' },
    });
    await processAnalysis(app.garmin.service, {
      data: { kind: 'analysis', eventId: s.id },
      startedOn: new Date(),
      expireInSeconds: 30,
    } as JobWithMetadata<IntegrationJob>);
    return s.id;
  };
  return { app, flow, db, activity, list, mark, complete, url };
}
test('monitoramento: pipeline real, agrupamento, leitura idempotente, filtros/contadores e autorização por recurso', async () => {
  const { app, flow, db, activity, list, mark, complete, url } = await setup();
  try {
    assert.equal((await flow.get('/monitoring')).status, 401);
    assert.equal((await list()).total, 1);
    await complete();
    const first = await list();
    assert.equal(first.total, 4);
    assert.equal(first.unread, 4);
    assert.equal(first.pending, 1);
    const events = first.items.find(
      (r: { kind: string }) => r.kind === 'sports_events',
    );
    assert.equal(events.eventCount, 3);
    assert.equal(events.href, `/analise-esportiva/${activity.id}`);
    assert.equal(
      (
        await mark(
          events.id,
          events.version,
          true,
          flow.coach.cookie,
          'invalid',
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await mark(
          events.id,
          events.version,
          true,
          flow.other.cookie,
          flow.other.csrf,
        )
      ).status,
      404,
    );
    assert.equal((await list('', flow.other.cookie)).total, 0);
    const options = await (
      await flow.get(
        `/monitoring/athletes?selected=${flow.athlete.id}`,
        flow.coach.cookie,
      )
    ).json();
    assert.equal(options.selected.id, flow.athlete.id);
    const otherOptions = await (
      await flow.get(
        `/monitoring/athletes?selected=${flow.athlete.id}`,
        flow.other.cookie,
      )
    ).json();
    assert.equal(otherOptions.selected, null);

    assert.equal((await mark(events.id, events.version)).status, 200);
    assert.equal((await mark(events.id, events.version)).status, 200);
    assert.equal(
      await db.auditLog.count({
        where: { resourceId: events.id, action: 'monitoring.read' },
      }),
      1,
    );
    const read = await list('&read=read');
    assert.equal(read.total, 1);
    assert.equal(read.unread, 0);
    assert.equal(read.items[0].id, events.id);
    assert.equal((await list('&read=unread')).total, 3);
    assert.equal((await list('&type=feedback_pending')).pending, 1);
    const rows = await db.monitoringEvent.findMany({
      where: { athleteId: flow.athlete.id },
      orderBy: { id: 'asc' },
    });
    await db.$transaction(async (tx) => {
      await lockRelationship(tx, activity);
      await projectActivity(tx, activity.id);
    });
    assert.deepEqual(
      await db.monitoringEvent.findMany({
        where: { athleteId: flow.athlete.id },
        orderBy: { id: 'asc' },
      }),
      rows,
    );
    assert.equal((await list()).unread, 3);
    assert.equal((await mark(events.id, events.version, false)).status, 200);
    assert.equal((await list()).unread, 4);
    assert.equal(
      (await flow.get(url + '&unknown=x', flow.coach.cookie)).status,
      400,
    );
    assert.equal(
      (
        await flow.get(
          url + '&from=2026-01-01&to=2026-04-01',
          flow.coach.cookie,
        )
      ).status,
      400,
    );
    assert.equal(
      (await flow.get(url + '&from=2026-02-30', flow.coach.cookie)).status,
      400,
    );
    assert.equal(
      (await flow.get(url + '&page=0', flow.coach.cookie)).status,
      400,
    );
    // Fronteira de meia-noite, inclusive para sessão PostgreSQL fora de UTC.
    await db.monitoringEvent.update({
      where: { id: events.id },
      data: { updatedAt: new Date('2026-11-20T00:00:00Z') },
    });
    const connection = new URL(process.env.TEST_DATABASE_URL!);
    connection.searchParams.set('options', '-c timezone=America/Sao_Paulo');
    const alternate = createDatabase(connection.toString());
    try {
      const service = new MonitoringService(alternate.client);
      const previous = await service.list(flow.coach.id, {
        athleteId: flow.athlete.id,
        type: 'sports_events',
        from: '2026-11-19',
        to: '2026-11-19',
      });
      const current = await service.list(flow.coach.id, {
        athleteId: flow.athlete.id,
        type: 'sports_events',
        from: '2026-11-20',
        to: '2026-11-20',
      });
      assert.equal(previous.total, 0);
      assert.equal(current.total, 1);
    } finally {
      await alternate.close();
    }
  } finally {
    await app.close();
  }
});
test('monitoramento: feedback atual resolve, limpar reabre, revisão nova e marcação antiga não ocultam atualização', async () => {
  const { app, flow, db, activity, list, mark, complete } = await setup();
  try {
    const oldAnalysis = await complete();
    const initial = await list();
    const pending = initial.items.find(
      (r: { kind: string }) => r.kind === 'feedback_pending',
    );
    const available = initial.items.find(
      (r: { kind: string }) => r.kind === 'activity_available',
    );
    await mark(pending.id, pending.version);
    await mark(available.id, available.version);
    const put = (version: number, observations: string) =>
      fetch(`${app.base}/activities/${activity.id}/feedback`, {
        method: 'PUT',
        headers: {
          origin: app.config.APP_ORIGIN,
          cookie: flow.coach.cookie,
          'content-type': 'application/json',
          'x-csrf-token': flow.coach.csrf,
        },
        body: JSON.stringify({
          expectedVersion: version,
          inputRevision: activity.revision,
          inputHash: activity.dataHash,
          analysisId: null,
          content: { ...emptyContent(), observations },
        }),
      });
    assert.equal(
      (await put(0, 'Observação sintética, sem validação de todas as regras.'))
        .status,
      200,
    );
    const resolved = await list('&type=feedback_pending');
    assert.equal(resolved.items[0].state, 'resolved');
    assert.equal(resolved.items[0].read, true);
    assert.equal(resolved.pending, 0);
    assert.equal((await put(1, '')).status, 200);
    const reopened = await list('&type=feedback_pending');
    assert.equal(reopened.items[0].state, 'active');
    assert.equal(reopened.items[0].read, false);
    assert.equal(reopened.items[0].id, pending.id);
    await db.$transaction(async (tx) => {
      await lockRelationship(tx, activity);
      const next = await tx.activity.update({
        where: { id: activity.id },
        data: { revision: 2, dataHash: digest('new-revision') },
      });
      await enqueueAnalysis(
        tx,
        next,
        app.config.GARMIN_QUEUE_NAMESPACE,
        app.garmin.service.queue,
      );
    });
    assert.equal((await mark(available.id, available.version)).status, 409);
    assert.equal((await list('&state=active&type=feedback_pending')).total, 0);
    await complete();
    assert.equal((await list('&state=active&type=feedback_pending')).total, 1);
    const activeAnalysis = await list('&type=analysis_completed&state=active');
    assert.equal(activeAnalysis.total, 1);
    assert.equal(activeAnalysis.items[0].inputRevision, 2);
    await db.$transaction((tx) => projectAnalysis(tx, oldAnalysis));
    assert.equal(
      (await list('&type=analysis_completed&state=active')).total,
      1,
    );
    assert.equal(
      (await list('&type=analysis_completed&state=resolved')).total,
      1,
    );
  } finally {
    await app.close();
  }
});
test('monitoramento: falhas terminais/retries/recuperação, geração antiga e reconciliação sem timestamp inventado', async () => {
  const { app, flow, db, activity, list } = await setup();
  try {
    const connection = await flow.connect();
    const request = await flow.simulate('permanent_failure');
    const { eventId } = await request.json();
    const job = {
      data: { eventId },
      startedOn: new Date(),
      expireInSeconds: 30,
    } as JobWithMetadata<IntegrationJob>;
    await app.garmin.worker!.process(job);
    let failed = await list('&type=sync_failure');
    assert.equal(failed.total, 1);
    assert.equal(failed.pending, 1);
    assert.equal(failed.items[0].href, `/alunos/${flow.athlete.id}`);
    // Redrive existente ainda em execução não cria outro alerta nem resolve a falha prematuramente.
    await app.garmin.service.retry(
      { coachId: flow.coach.id, athleteId: flow.athlete.id },
      eventId,
    );
    failed = await list('&type=sync_failure');
    assert.equal(failed.items[0].recovering, true);
    assert.equal(failed.pending, 1);
    await db.$transaction(async (tx) => {
      await lockRelationship(tx, activity);
      await tx.integrationEvent.update({
        where: { id: eventId },
        data: { status: 'processed', processedAt: new Date() },
      });
      await projectIntegration(tx, eventId);
    });
    assert.equal((await list('&type=sync_failure')).items[0].state, 'resolved');
    const f = await db.fitImport.create({
      data: {
        coachId: flow.coach.id,
        athleteId: flow.athlete.id,
        fileHash: digest(randomUUID()),
        namespace: app.config.GARMIN_QUEUE_NAMESPACE,
        status: 'retry',
      },
    });
    await db.$transaction((tx) => projectFit(tx, f.id));
    assert.equal((await list('&type=fit_failure')).total, 0);
    await db.$transaction(async (tx) => {
      await lockRelationship(tx, activity);
      await tx.fitImport.update({
        where: { id: f.id },
        data: { status: 'failed', errorCode: 'retry_exhausted' },
      });
      await projectFit(tx, f.id);
      await tx.garminConnection.update({
        where: { id: connection.id },
        data: { status: 'error', lastError: 'authorization_expired' },
      });
      await projectConnection(tx, connection.id);
    });
    assert.equal(
      (await list('&type=fit_failure')).items[0].timeBasis,
      'reconstructed',
    );
    assert.equal(
      (await list('&type=connection_failure&state=active')).total,
      1,
    );
    await db.$transaction(async (tx) => {
      await lockRelationship(tx, activity);
      await tx.garminConnection.update({
        where: { id: connection.id },
        data: { generation: { increment: 1 }, status: 'connected' },
      });
      await projectConnection(tx, connection.id);
    });
    assert.equal(
      (await list('&type=connection_failure&state=active')).total,
      0,
    );
    assert.equal((await list('&type=sync_failure&state=active')).total, 0);
  } finally {
    await app.close();
  }
});
test('monitoramento: projeção atrasada não vaza vínculo/consentimento, recurso obsoleto ou contadores de outro coach', async () => {
  const { app, flow, db, activity, list, mark, complete } = await setup();
  try {
    await complete();
    const initial = await list();
    const item = initial.items[0];
    await db.activity.update({
      where: { id: activity.id },
      data: { revision: 2, dataHash: digest('unprojected-revision') },
    });
    assert.equal((await list('&state=active')).total, 0);
    assert.equal((await list()).pending, 0);
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
    assert.equal((await list()).total, 0);
    assert.equal((await list()).unread, 0);
    assert.equal((await mark(item.id, item.version)).status, 404);
    const options = await (
      await flow.get(
        `/monitoring/athletes?selected=${flow.athlete.id}`,
        flow.coach.cookie,
      )
    ).json();
    assert.equal(options.selected, null);
    assert.ok(
      !options.items.some((i: { id: string }) => i.id === flow.athlete.id),
    );
  } finally {
    await app.close();
  }
});
test('monitoramento: reconstrução limitada/idempotente, paginação e integridade de fontes', async () => {
  const { app, flow, db, activity, list, complete, mark } = await setup();
  try {
    await complete();
    const item = (await list()).items[0];
    await mark(item.id, item.version);
    const before = await db.monitoringEvent.findMany({
      where: { athleteId: flow.athlete.id },
      orderBy: { id: 'asc' },
    });
    const options = {
      coachId: flow.coach.id,
      type: 'activity',
      cursor: activity.id.slice(0, -1) + '0',
      limit: 1,
    };
    const reconciled = await reconcileMonitoring(db, options);
    assert.equal(reconciled.scanned, 1);
    assert.equal(reconciled.nextCursor, activity.id);
    assert.deepEqual(
      await db.monitoringEvent.findMany({
        where: { athleteId: flow.athlete.id },
        orderBy: { id: 'asc' },
      }),
      before,
    );
    await assert.rejects(reconcileMonitoring(db, { ...options, limit: 10001 }));
    await assert.rejects(
      db.monitoringEvent.create({
        data: {
          coachId: flow.other.id,
          athleteId: flow.athlete.id,
          kind: 'activity_available',
          deduplicationKey: randomUUID(),
          signature: 'test',
          activityId: activity.id,
          inputRevision: 1,
          inputHash: activity.dataHash,
          occurredAt: new Date(),
          updatedAt: new Date(),
        },
      }),
    );
    await assert.rejects(
      db.monitoringEvent.create({
        data: {
          coachId: flow.coach.id,
          athleteId: flow.athlete.id,
          kind: 'fit_failure',
          deduplicationKey: randomUUID(),
          signature: 'test',
          activityId: activity.id,
          occurredAt: new Date(),
          updatedAt: new Date(),
        },
      }),
    );
    for (let n = 0; n < 9; n++)
      await db
        .$transaction(async (tx) => {
          await lockRelationship(tx, activity);
          const next = await tx.activity.update({
            where: { id: activity.id },
            data: { revision: n + 2, dataHash: digest(`page-${n}`) },
          });
          await enqueueAnalysis(
            tx,
            next,
            app.config.GARMIN_QUEUE_NAMESPACE,
            app.garmin.service.queue,
          );
        })
        .then(() => complete());
    const first = await list(),
      second = await list('&page=2');
    assert.equal(first.items.length, 20);
    assert.equal(second.total, first.total);
    assert.ok(second.items.length > 0);
    assert.equal(
      new Set([...first.items, ...second.items].map((r) => r.id)).size,
      first.total,
    );
  } finally {
    await app.close();
  }
});

test('monitoramento: falha de projeção desfaz publicação/feedback; recuperação do último lease gera somente falha terminal', async () => {
  const { app, flow, db, activity, list, complete } = await setup();
  const guard = `monitoring_test_${randomUUID().replaceAll('-', '')}`;
  let created = false;
  try {
    await complete();
    const pending = (await list('&type=feedback_pending')).items[0];
    assert.match(pending.id, /^[a-f0-9-]+$/);
    await db.$executeRawUnsafe(
      `CREATE FUNCTION "${guard}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'controlled_monitoring_failure'; END $$`,
    );
    created = true;
    await db.$executeRawUnsafe(
      `CREATE TRIGGER "${guard}" BEFORE UPDATE ON "MonitoringEvent" FOR EACH ROW WHEN (OLD.id = '${pending.id}') EXECUTE FUNCTION "${guard}"()`,
    );
    const response = await fetch(
      `${app.base}/activities/${activity.id}/feedback`,
      {
        method: 'PUT',
        headers: {
          origin: app.config.APP_ORIGIN,
          cookie: flow.coach.cookie,
          'content-type': 'application/json',
          'x-csrf-token': flow.coach.csrf,
        },
        body: JSON.stringify({
          expectedVersion: 0,
          inputRevision: activity.revision,
          inputHash: activity.dataHash,
          analysisId: null,
          content: { ...emptyContent(), observations: 'Observação sintética.' },
        }),
      },
    );
    assert.equal(response.status, 503);
    assert.equal(
      await db.coachFeedback.count({ where: { activityId: activity.id } }),
      0,
    );
    assert.equal((await list('&type=feedback_pending')).pending, 1);
    await db.$executeRawUnsafe(`DROP TRIGGER "${guard}" ON "MonitoringEvent"`);
    await db.$executeRawUnsafe(
      `CREATE TRIGGER "${guard}" BEFORE INSERT ON "MonitoringEvent" FOR EACH ROW WHEN (NEW."athleteId" = '${activity.athleteId}') EXECUTE FUNCTION "${guard}"()`,
    );
    const nextId = randomUUID();
    await assert.rejects(
      db.$transaction(async (tx) => {
        await lockRelationship(tx, activity);
        const next = await tx.activity.create({
          data: { ...activity, id: nextId, externalId: randomUUID() },
        });
        await enqueueAnalysis(
          tx,
          next,
          app.config.GARMIN_QUEUE_NAMESPACE,
          app.garmin.service.queue,
        );
      }),
    );
    assert.equal(await db.activity.count({ where: { id: nextId } }), 0);
    assert.equal(
      await db.sportsAnalysis.count({ where: { activityId: nextId } }),
      0,
    );
    await db.$executeRawUnsafe(`DROP TRIGGER "${guard}" ON "MonitoringEvent"`);
    const fit = await db.fitImport.create({
      data: {
        coachId: flow.coach.id,
        athleteId: flow.athlete.id,
        fileHash: digest(randomUUID()),
        namespace: app.config.GARMIN_QUEUE_NAMESPACE,
        status: 'processing',
        attempts: 5,
        runToken: randomUUID(),
        leaseUntil: new Date(0),
      },
    });
    const connection = await flow.connect();
    const integration = await db.integrationEvent.create({
      data: {
        coachId: flow.coach.id,
        athleteId: flow.athlete.id,
        connectionId: connection.id,
        generation: connection.generation,
        kind: 'activity',
        deliveryId: randomUUID(),
        payloadHash: digest('fake'),
        namespace: app.config.GARMIN_QUEUE_NAMESPACE,
        status: 'processing',
        attempts: 5,
        leaseUntil: new Date(0),
        runToken: randomUUID(),
      },
    });
    await app.garmin.worker!.recoverIntents();
    assert.equal(
      (await db.fitImport.findUniqueOrThrow({ where: { id: fit.id } })).status,
      'failed',
    );
    assert.equal(
      (
        await db.integrationEvent.findUniqueOrThrow({
          where: { id: integration.id },
        })
      ).status,
      'failed',
    );
    assert.equal((await list('&type=fit_failure')).pending, 1);
    assert.equal((await list('&type=sync_failure')).pending, 1);
    const before = await db.monitoringEvent.findMany({
      where: { athleteId: flow.athlete.id },
      orderBy: { id: 'asc' },
    });
    await app.garmin.worker!.recoverIntents();
    assert.deepEqual(
      await db.monitoringEvent.findMany({
        where: { athleteId: flow.athlete.id },
        orderBy: { id: 'asc' },
      }),
      before,
    );
  } finally {
    if (created) {
      await db.$executeRawUnsafe(
        `DROP TRIGGER IF EXISTS "${guard}" ON "MonitoringEvent"`,
      );
      await db.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "${guard}"()`);
    }
    await app.close();
  }
});
