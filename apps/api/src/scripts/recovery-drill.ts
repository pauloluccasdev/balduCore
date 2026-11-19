import assert from 'node:assert/strict';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { mkdtemp, chmod, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { Client } from 'pg';
import { pino } from 'pino';
import { recoveryAdmin, recoveryName } from './recovery-safety.js';
import { createDatabase } from '../database.js';
import { readConfig } from '../config.js';
import { encrypt, decrypt, digest } from '../modules/auth/security.js';
import { DEMO_DOCUMENTS } from '../modules/consents/consents.service.js';
import { IntegrationQueue } from '../modules/activity-processing/queue.js';
import { DashboardService } from '../modules/dashboard/dashboard.service.js';
import { ActivitiesService } from '../modules/activities/activities.service.js';
import { AnalysisService } from '../modules/sports-analysis/analysis.service.js';
import { analysisInput } from '../test-support/analysis-fixture.js';
import {
  analyze,
  ALGORITHM_VERSION,
} from '../modules/sports-analysis/calculations.js';

function run(command: string, args: string[], env: NodeJS.ProcessEnv) {
  const result = spawnSync(command, args, {
    env,
    stdio: 'pipe',
    timeout: 120000,
  });
  // stderr pode conter credenciais/URLs. Não propagá-lo nem criar artefato.
  if (result.error || result.status !== 0) {
    console.error(
      JSON.stringify({
        phase: command === process.execPath ? 'migration' : command,
        status: result.status,
        toolError: result.error ? 'unavailable' : undefined,
      }),
    );
    throw new Error(
      'Ferramenta de recuperação falhou; confira binários, permissões e versões localmente.',
    );
  }
}
async function fingerprint(url: string) {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const tables = await client.query<{
      schemaname: string;
      tablename: string;
    }>(
      "SELECT schemaname, tablename FROM pg_tables WHERE schemaname IN ('public','pgboss') ORDER BY schemaname, tablename",
    );
    const hash = createHash('sha256');
    let rows = 0;
    const quote = (s: string) => `"${s.replaceAll('"', '""')}"`;
    for (const table of tables.rows) {
      const result = await client.query(
        `SELECT row_to_json(t)::text AS row FROM ${quote(table.schemaname)}.${quote(table.tablename)} t ORDER BY row_to_json(t)::text`,
      );
      hash.update(JSON.stringify(table));
      for (const row of result.rows) hash.update(row.row + '\n');
      rows += result.rowCount ?? 0;
    }
    return { tables: tables.rowCount, rows, hash: hash.digest('hex') };
  } finally {
    await client.end();
  }
}
async function main() {
  const adminUrl = recoveryAdmin(
    process.env.RECOVERY_ADMIN_URL,
    process.env.NODE_ENV,
  );
  const tag = randomUUID().replaceAll('-', '');
  const names = [
    `balducore_drill_${tag}_source`,
    `balducore_drill_${tag}_restore`,
  ];
  const created = new Set<string>();
  const admin = new Client({ connectionString: adminUrl.toString() });
  const dir = await mkdtemp(join(tmpdir(), 'balducore-drill-'));
  const urls = names.map((name) => {
    const u = new URL(adminUrl);
    u.pathname = `/${name}`;
    return u.toString();
  });
  const toolsEnv = (database: string) => ({
    ...Object.fromEntries(
      Object.entries(process.env).filter(([key]) => !key.startsWith('PG')),
    ),
    PGHOST: adminUrl.hostname,
    PGPORT: adminUrl.port || '5432',
    PGUSER: decodeURIComponent(adminUrl.username),
    PGPASSWORD: decodeURIComponent(adminUrl.password),
    PGDATABASE: database,
    PGSSLMODE: 'disable',
  });
  let db: ReturnType<typeof createDatabase> | undefined;
  let queue: IntegrationQueue | undefined;
  let cleanupFailed = false;
  try {
    await admin.connect();
    for (const name of names) {
      // Nomes gerados internamente; created só é preenchido após CREATE bem-sucedido.
      await admin.query(`CREATE DATABASE "${name}"`);
      created.add(name);
    }
    console.log('recovery_phase:migrations');
    run(
      process.execPath,
      ['node_modules/prisma/build/index.js', 'migrate', 'deploy'],
      { ...process.env, DATABASE_URL: urls[0] },
    );
    db = createDatabase(urls[0]);
    const key = randomBytes(32).toString('base64');
    const config = readConfig({
      ...process.env,
      NODE_ENV: 'test',
      AUTH_MODE: 'demo',
      APP_ORIGIN: 'http://127.0.0.1:3000',
      API_HOST: '127.0.0.1',
      DATABASE_URL: urls[0],
      AUTH_SECRET: key,
      GARMIN_PROVIDER: 'disabled',
      GARMIN_QUEUE_NAMESPACE: 'recovery-drill',
    });
    const coach = await db.client.coach.create({
      data: {
        issuer: 'recovery-synthetic',
        subject: tag,
        name: 'Treinador sintético de recuperação',
        email: 'recovery@example.test',
      },
    });
    const athlete = await db.client.athlete.create({
      data: {
        coachId: coach.id,
        name: 'Aluno sintético',
        email: 'athlete@example.test',
      },
    });
    await db.client.coachAthleteRelationship.create({
      data: { coachId: coach.id, athleteId: athlete.id, status: 'active' },
    });
    const invitation = await db.client.invitation.create({
      data: {
        coachId: coach.id,
        athleteId: athlete.id,
        recipientEmail: athlete.email,
        tokenHash: digest(tag),
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    const enrollment = await db.client.enrollmentSession.create({
      data: {
        coachId: coach.id,
        athleteId: athlete.id,
        invitationId: invitation.id,
        tokenHash: digest(tag + 'enroll'),
        expiresAt: new Date(Date.now() + 3600000),
        codeExpiresAt: new Date(),
        acceptedAt: new Date(),
        verifiedAt: new Date(),
      },
    });
    for (const doc of DEMO_DOCUMENTS) {
      await db.client.consentDocument.create({
        data: { ...doc, contentHash: digest(doc.content) },
      });
      await db.client.consentEvidence.create({
        data: {
          coachId: coach.id,
          athleteId: athlete.id,
          enrollmentId: enrollment.id,
          documentId: doc.id,
          decision: 'accepted',
        },
      });
    }
    await db.client.authAttempt.create({
      data: {
        stateHash: tag,
        browserHash: tag,
        encryptedChecks: encrypt('synthetic-recovery-canary', key),
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    const { samples, splits, ...base } = analysisInput();
    const activities = Array.from({ length: 200 }, (_, i) => ({
      ...base,
      id: randomUUID(),
      coachId: coach.id,
      athleteId: athlete.id,
      externalId: `synthetic-${i}`,
      startedAt: new Date(Date.now() - 86400000),
    }));
    await db.client.activity.createMany({ data: activities });
    const first = activities[0];
    const detailSamples = samples.map((s) => ({
      ...s,
      coachId: coach.id,
      athleteId: athlete.id,
      activityId: first.id,
      timestamp: new Date(first.startedAt.getTime() + s.ordinal * 1000),
    }));
    const detailSplits = splits.map((s) => ({
      ...s,
      coachId: coach.id,
      athleteId: athlete.id,
      activityId: first.id,
      startedAt: new Date(first.startedAt.getTime() + s.ordinal * 200000),
      endedAt: new Date(first.startedAt.getTime() + (s.ordinal + 1) * 200000),
    }));
    await db.client.activitySample.createMany({ data: detailSamples });
    await db.client.activitySplit.createMany({ data: detailSplits });
    await db.client.sportsAnalysis.createMany({
      data: activities.map((a, i) => ({
        coachId: coach.id,
        athleteId: athlete.id,
        activityId: a.id,
        inputRevision: a.revision,
        inputHash: a.dataHash,
        algorithmVersion: ALGORITHM_VERSION,
        namespace: config.GARMIN_QUEUE_NAMESPACE,
        status: 'completed' as const,
        finishedAt: new Date(),
        result: analyze({
          ...a,
          samples: i === 0 ? detailSamples : [],
          splits: i === 0 ? detailSplits : [],
        }),
      })),
    });
    const measurements: Record<string, { medianMs: number; maxMs: number }> =
      {};
    for (const [label, action] of Object.entries({
      dashboard: () => new DashboardService(db!.client).get(coach.id, {}),
      activities: () =>
        new ActivitiesService(db!.client, config).list(coach.id, {}),
      analysis: () =>
        new AnalysisService(db!.client, config).get(coach.id, first.id, {}),
    })) {
      await action();
      const elapsed: number[] = [];
      for (let i = 0; i < 5; i++) {
        const start = performance.now();
        await action();
        elapsed.push(performance.now() - start);
      }
      elapsed.sort((a, b) => a - b);
      measurements[label] = {
        medianMs: Math.round(elapsed[2]),
        maxMs: Math.round(elapsed[4]),
      };
    }
    queue = new IntegrationQueue(config, pino({ level: 'silent' }));
    await queue.start();
    await queue.boss.send(queue.name, { eventId: 'synthetic-recovery-probe' });
    await queue.stop();
    queue = undefined;
    await db.close();
    db = undefined;
    console.log('recovery_phase:fingerprint');
    const before = await fingerprint(urls[0]);
    console.log('recovery_phase:dump-restore');
    const dump = join(dir, 'synthetic.dump');
    run(
      'pg_dump',
      ['--format=custom', '--no-owner', '--no-privileges', '--file', dump],
      toolsEnv(names[0]),
    );
    await chmod(dump, 0o600);
    run(
      'pg_restore',
      [
        '--exit-on-error',
        '--no-owner',
        '--no-privileges',
        '--dbname',
        names[1],
        dump,
      ],
      toolsEnv(names[1]),
    );
    const after = await fingerprint(urls[1]);
    console.log(JSON.stringify({ phase: 'restore-comparison', before, after }));
    assert.deepEqual(after, before);
    db = createDatabase(urls[1]);
    await db.ping();
    assert.equal(await db.client.activity.count(), 200);
    assert.equal(await db.client.sportsAnalysis.count(), 200);
    assert.equal(
      await db.client
        .$queryRawUnsafe<{ count: bigint }[]>(
          'SELECT COUNT(*) AS count FROM _prisma_migrations WHERE finished_at IS NOT NULL',
        )
        .then((r) => Number(r[0].count)),
      7,
    );
    const canary = await db.client.authAttempt.findUniqueOrThrow({
      where: { stateHash: tag },
    });
    assert.equal(
      decrypt(canary.encryptedChecks, key),
      'synthetic-recovery-canary',
    );
    assert.throws(() =>
      decrypt(canary.encryptedChecks, randomBytes(32).toString('base64')),
    );
    const restoredDashboard = await new DashboardService(db.client).get(
      coach.id,
      {},
    );
    assert.equal(restoredDashboard.activities.total, 200);
    queue = new IntegrationQueue(
      { ...config, DATABASE_URL: urls[1] },
      pino({ level: 'silent' }),
    );
    await queue.start();
    let deliveries = 0;
    await queue.work(async (job) => {
      assert.equal(job.data.eventId, 'synthetic-recovery-probe');
      deliveries++;
    });
    const deadline = Date.now() + 10000;
    while (!deliveries && Date.now() < deadline)
      await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(deliveries, 1);
    await queue.stop();
    queue = undefined;
    console.log(
      JSON.stringify({
        status: 'passed',
        migrations: 7,
        activities: 200,
        analyses: 200,
        fingerprintMatches: true,
        encryptedCanary: true,
        restoredQueueProbe: deliveries,
        measurements,
        samplesPerMeasurement: 5,
        note: 'Serviços locais, sem HTTP; conjunto sintético delimitado, sem SLA.',
      }),
    );
  } finally {
    await queue?.stop().catch(() => {
      cleanupFailed = true;
    });
    await db?.close().catch(() => {
      cleanupFailed = true;
    });
    for (const name of created) {
      try {
        await admin.query(
          `DROP DATABASE ${recoveryName(name, created)} WITH (FORCE)`,
        );
      } catch {
        cleanupFailed = true;
      }
    }
    await admin.end().catch(() => {
      cleanupFailed = true;
    });
    await rm(dir, { recursive: true, force: true }).catch(() => {
      cleanupFailed = true;
    });
    if (cleanupFailed)
      throw new Error(
        'Limpeza do ensaio incompleta; verificar bancos temporários locais.',
      );
  }
}
main().catch(() => {
  console.error(
    'Ensaio falhou. Nenhum detalhe de conexão foi registrado; confira ferramentas locais, permissões e documentação.',
  );
  process.exitCode = 1;
});
