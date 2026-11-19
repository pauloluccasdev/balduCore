import type {
  Activity,
  MonitoringEvent,
  Prisma,
} from '../../generated/prisma/client.js';
import { digest } from '../auth/security.js';
import { eligible, type Scope } from '../garmin-connections/lifecycle.js';
import {
  ALGORITHM_VERSION,
  resultSchema,
} from '../sports-analysis/calculations.js';
import { contentSchema } from '../coach-feedback/contracts.js';
type Tx = Prisma.TransactionClient;
export const kinds = [
  'activity_available',
  'analysis_completed',
  'sports_events',
  'feedback_pending',
  'fit_failure',
  'analysis_failure',
  'sync_failure',
  'connection_failure',
] as const;
export type MonitoringKind = (typeof kinds)[number];
type Notice = Scope & {
  kind: MonitoringKind;
  deduplicationKey: string;
  activityId?: string;
  analysisId?: string;
  fitImportId?: string;
  integrationEventId?: string;
  connectionId?: string;
  generation?: number;
  inputRevision?: number;
  inputHash?: string;
  algorithmVersion?: string;
  eventCount?: number;
  errorCode?: string | null;
};
async function put(
  tx: Tx,
  notice: Notice,
  active: boolean,
  at: Date,
  reconstructed = false,
) {
  const key = {
    coachId: notice.coachId,
    deduplicationKey: notice.deduplicationKey,
  };
  const previous = await tx.monitoringEvent.findUnique({
    where: { coachId_deduplicationKey: key },
  });
  if (!active && !previous) return;
  const state = active ? 'active' : 'resolved';
  const signature = digest(JSON.stringify({ ...notice, state }));
  if (previous?.signature === signature && previous.state === state) return;
  if (!previous) {
    await tx.monitoringEvent.create({
      data: {
        ...notice,
        state,
        signature,
        occurredAt: at,
        updatedAt: at,
        timeBasis: reconstructed ? 'reconstructed' : 'source',
      },
    });
    return;
  }
  const version = previous.version + 1;
  await tx.monitoringEvent.update({
    where: { id: previous.id },
    data: {
      ...notice,
      state,
      signature,
      version,
      updatedAt: at,
      readAt: active ? null : previous.readAt,
      readVersion: active || !previous.readAt ? null : version,
    },
  });
}
async function resolve(
  tx: Tx,
  where: Prisma.MonitoringEventWhereInput,
  at = new Date(),
) {
  const rows = await tx.monitoringEvent.findMany({
    where: { ...where, state: 'active' },
  });
  for (const row of rows)
    await tx.monitoringEvent.update({
      where: { id: row.id },
      data: {
        state: 'resolved',
        version: { increment: 1 },
        readVersion: row.readAt ? row.version + 1 : null,
        updatedAt: at,
      },
    });
}
export function resolveMonitoring(tx: Tx, scope: Scope) {
  return resolve(tx, { coachId: scope.coachId, athleteId: scope.athleteId });
}
const activityContext = (a: Activity) => ({
  coachId: a.coachId,
  athleteId: a.athleteId,
  activityId: a.id,
  inputRevision: a.revision,
  inputHash: a.dataHash,
});
export async function projectActivity(tx: Tx, id: string) {
  const a = await tx.activity.findUniqueOrThrow({ where: { id } });
  if (!(await eligible(tx, a))) return resolveMonitoring(tx, a);
  const at = a.updatedAt;
  await put(
    tx,
    {
      ...activityContext(a),
      kind: 'activity_available',
      deduplicationKey: `activity:${id}`,
    },
    true,
    at,
  );
  await resolve(
    tx,
    {
      activityId: id,
      kind: {
        in: [
          'analysis_completed',
          'sports_events',
          'analysis_failure',
          'feedback_pending',
        ],
      },
      OR: [
        { inputRevision: { not: a.revision } },
        { inputHash: { not: a.dataHash } },
        { algorithmVersion: { not: ALGORITHM_VERSION } },
      ],
    },
    at,
  );
  const analysis = await tx.sportsAnalysis.findUnique({
    where: {
      activityId_inputRevision_inputHash_algorithmVersion: {
        activityId: id,
        inputRevision: a.revision,
        inputHash: a.dataHash,
        algorithmVersion: ALGORITHM_VERSION,
      },
    },
  });
  if (analysis) await projectAnalysis(tx, analysis.id);
}
export async function projectAnalysis(tx: Tx, id: string) {
  const s = await tx.sportsAnalysis.findUniqueOrThrow({
    where: { id },
    include: { activity: true },
  });
  const a = s.activity;
  const current =
    s.inputRevision === a.revision &&
    s.inputHash === a.dataHash &&
    s.algorithmVersion === ALGORITHM_VERSION;
  if (!current || !(await eligible(tx, s))) {
    await resolve(tx, { analysisId: id });
    return;
  }
  const failureKey = `analysis-failure:${id}`;
  if (s.status === 'failed') {
    await put(
      tx,
      {
        ...activityContext(a),
        analysisId: id,
        algorithmVersion: s.algorithmVersion,
        kind: 'analysis_failure',
        deduplicationKey: failureKey,
        errorCode: s.errorCode,
      },
      true,
      s.finishedAt ?? new Date(),
      !s.finishedAt,
    );
    await resolve(tx, { activityId: a.id, kind: 'feedback_pending' });
  } else if (s.status === 'completed' || s.status === 'cancelled') {
    await resolve(
      tx,
      { deduplicationKey: failureKey, coachId: s.coachId },
      s.finishedAt ?? new Date(),
    );
  }
  if (s.status !== 'completed') return;
  const result = resultSchema.parse(s.result);
  const at = s.finishedAt ?? s.createdAt;
  const context = {
    ...activityContext(a),
    analysisId: id,
    algorithmVersion: s.algorithmVersion,
  };
  await put(
    tx,
    {
      ...context,
      kind: 'analysis_completed',
      deduplicationKey: `analysis:${id}`,
    },
    true,
    at,
  );
  if (result.events.length)
    await put(
      tx,
      {
        ...context,
        kind: 'sports_events',
        deduplicationKey: `events:${id}`,
        eventCount: result.events.length,
      },
      true,
      at,
    );
  else
    await resolve(
      tx,
      { coachId: s.coachId, deduplicationKey: `events:${id}` },
      at,
    );
  const feedback = await tx.coachFeedback.findUnique({
    where: { activityId: a.id },
  });
  const revision = feedback
    ? await tx.coachFeedbackRevision.findUniqueOrThrow({
        where: {
          feedbackId_version: {
            feedbackId: feedback.id,
            version: feedback.version,
          },
        },
      })
    : null;
  const content = revision ? contentSchema.parse(revision.content) : null;
  const meaningful = Boolean(
    content &&
    (content.execution ||
      content.observations ||
      content.decisions ||
      content.points.length ||
      content.verdicts.length),
  );
  const reviewed =
    meaningful &&
    revision!.inputRevision === a.revision &&
    revision!.inputHash === a.dataHash &&
    (revision!.analysisId === null || revision!.analysisId === id);
  const existing = await tx.monitoringEvent.findUnique({
    where: {
      coachId_deduplicationKey: {
        coachId: a.coachId,
        deduplicationKey: `feedback:${a.id}`,
      },
    },
  });
  // Um diário vazio novo só gera aviso ao concluir a análise; limpar um diário usa sua data real.
  const changed =
    existing &&
    (existing.inputRevision !== a.revision ||
      existing.inputHash !== a.dataHash ||
      existing.analysisId !== id);
  await put(
    tx,
    {
      ...context,
      kind: 'feedback_pending',
      deduplicationKey: `feedback:${a.id}`,
    },
    !reviewed,
    changed || !existing ? at : (revision?.createdAt ?? at),
  );
}
export async function projectFit(tx: Tx, id: string) {
  const f = await tx.fitImport.findUniqueOrThrow({ where: { id } });
  const key = `fit-failure:${id}`;
  if (
    !(await eligible(tx, f)) ||
    ['processed', 'cancelled', 'ignored'].includes(f.status)
  )
    return resolve(
      tx,
      { coachId: f.coachId, deduplicationKey: key },
      f.finishedAt ?? new Date(),
    );
  if (f.status === 'failed')
    await put(
      tx,
      {
        coachId: f.coachId,
        athleteId: f.athleteId,
        fitImportId: id,
        kind: 'fit_failure',
        deduplicationKey: key,
        errorCode: f.errorCode,
      },
      true,
      f.finishedAt ?? new Date(),
      !f.finishedAt,
    );
}
export async function projectIntegration(
  tx: Tx,
  id: string,
  reconstructed = false,
) {
  const i = await tx.integrationEvent.findUniqueOrThrow({
    where: { id },
    include: { connection: true },
  });
  if (i.kind !== 'activity') return;
  const key = `sync-failure:${id}`;
  if (
    !(await eligible(tx, i)) ||
    i.connection.generation !== i.generation ||
    !['connected', 'error'].includes(i.connection.status) ||
    ['processed', 'ignored', 'cancelled'].includes(i.status)
  )
    return resolve(
      tx,
      { coachId: i.coachId, deduplicationKey: key },
      i.processedAt ?? new Date(),
    );
  if (i.status === 'failed')
    await put(
      tx,
      {
        coachId: i.coachId,
        athleteId: i.athleteId,
        integrationEventId: id,
        connectionId: i.connectionId,
        generation: i.generation,
        kind: 'sync_failure',
        deduplicationKey: key,
        errorCode: i.errorCode,
      },
      true,
      new Date(),
      reconstructed,
    );
}
export async function projectConnection(
  tx: Tx,
  id: string,
  reconstructed = false,
) {
  const g = await tx.garminConnection.findUniqueOrThrow({ where: { id } });
  await resolve(tx, {
    connectionId: id,
    OR: [
      { generation: { not: g.generation } },
      ...(!['connected', 'error'].includes(g.status)
        ? [{ kind: 'sync_failure' }]
        : []),
    ],
  });
  const key = `connection-failure:${id}:${g.generation}`;
  if (!(await eligible(tx, g)) || g.status !== 'error')
    return resolve(tx, {
      coachId: g.coachId,
      kind: 'connection_failure',
      connectionId: id,
    });
  await put(
    tx,
    {
      coachId: g.coachId,
      athleteId: g.athleteId,
      connectionId: id,
      generation: g.generation,
      kind: 'connection_failure',
      deduplicationKey: key,
      errorCode: g.lastError,
    },
    true,
    reconstructed ? new Date() : g.updatedAt,
    reconstructed,
  );
}
export type MonitoringRow = MonitoringEvent & {
  athleteName: string;
  effectiveState: string;
  recovering: boolean;
  isSynthetic: boolean;
};
