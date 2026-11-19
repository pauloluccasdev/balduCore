import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { Prisma, type PrismaClient } from '../../generated/prisma/client.js';
import {
  visibleRelationship,
  visibleRelationshipSql,
} from '../garmin-connections/eligibility.js';
import {
  ALGORITHM_VERSION,
  resultSchema,
} from '../sports-analysis/calculations.js';
import { visible } from '../monitoring/query.js';
import { monitoringItem } from '../monitoring/monitoring.service.js';
import type { MonitoringRow } from '../monitoring/projection.js';
const querySchema = z
  .object({
    period: z.coerce
      .number()
      .pipe(z.union([z.literal(7), z.literal(30), z.literal(90)]))
      .default(30),
    sport: z
      .enum(['running', 'cycling', 'swimming', 'walking', 'other'])
      .optional(),
  })
  .strict();
export function dashboardQuery(raw: unknown, now = new Date()) {
  const parsed = querySchema.safeParse(raw);
  if (!parsed.success)
    throw new BadRequestException(
      'Filtros inválidos. Escolha 7, 30 ou 90 dias e uma modalidade válida.',
    );
  const to = now.toISOString().slice(0, 10);
  const end = new Date(`${to}T00:00:00Z`);
  const start = new Date(end.getTime() - (parsed.data.period - 1) * 86400000);
  return {
    ...parsed.data,
    from: start.toISOString().slice(0, 10),
    to,
    start,
    end: new Date(end.getTime() + 86400000),
  };
}
interface ActivityRow {
  id: string;
  athleteId: string;
  athleteName: string;
  startedAt: Date;
  sport: string;
  source: string;
  isSynthetic: boolean;
  revision: number;
  distanceMeters: number | null;
  durationSeconds: number | null;
  durationBasis: string;
  analysisStatus: string | null;
  result: unknown;
  previous: boolean;
}
const activityDto = (a: ActivityRow) => ({
  id: a.id,
  athleteId: a.athleteId,
  athleteName: a.athleteName,
  startedAt: a.startedAt,
  sport: a.sport,
  source: a.source,
  isSynthetic: a.isSynthetic,
  revision: a.revision,
  distanceMeters: a.distanceMeters,
  durationSeconds: a.durationSeconds,
  durationBasis: a.durationBasis,
  analysisStatus:
    a.analysisStatus === 'completed' &&
    !resultSchema.safeParse(a.result).success
      ? 'invalid'
      : (a.analysisStatus ?? (a.previous ? 'obsolete' : 'not_requested')),
});
export class DashboardService {
  constructor(readonly db: PrismaClient) {}
  async get(coachId: string, raw: unknown) {
    const now = new Date(),
      query = dashboardQuery(raw, now);
    const eligible = Prisma.sql`SELECT r."coachId", r."athleteId" FROM "CoachAthleteRelationship" r JOIN "Coach" c ON c.id = r."coachId" WHERE r."coachId" = ${coachId} AND ${visibleRelationshipSql()}`;
    const scoped = Prisma.sql`WITH eligible AS (${eligible}), scoped AS (
      SELECT a.*, athlete.name AS "athleteName" FROM "Activity" a JOIN eligible e ON e."coachId" = a."coachId" AND e."athleteId" = a."athleteId" JOIN "Athlete" athlete ON athlete.id = a."athleteId" AND athlete."coachId" = a."coachId"
      WHERE a."startedAt" >= (${query.start.toISOString()}::timestamptz AT TIME ZONE 'UTC') AND a."startedAt" < (${query.end.toISOString()}::timestamptz AT TIME ZONE 'UTC') ${query.sport ? Prisma.sql`AND a.sport = ${query.sport}` : Prisma.empty}
    )`;
    const analysisJoin = Prisma.sql`s."activityId" = a.id AND s."coachId" = a."coachId" AND s."athleteId" = a."athleteId" AND s."inputRevision" = a.revision AND s."inputHash" = a."dataHash" AND s."algorithmVersion" = ${ALGORITHM_VERSION}`;
    return this.db.$transaction(
      async (tx) => {
        const totalAthletes = await tx.athlete.count({ where: { coachId } });
        const statuses = await tx.coachAthleteRelationship.groupBy({
          by: ['status'],
          where: { coachId },
          _count: { _all: true },
        });
        const students = await tx.athlete.findMany({
          where: { coachId },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 6,
          select: {
            id: true,
            name: true,
            relationship: {
              select: {
                status: true,
                garminConnection: {
                  select: {
                    status: true,
                    provider: true,
                    isSynthetic: true,
                    lastSyncedAt: true,
                  },
                },
              },
            },
          },
        });
        const allowedStudents = await tx.coachAthleteRelationship.findMany({
          where: {
            ...visibleRelationship,
            coachId,
            athleteId: { in: students.map((s) => s.id) },
          },
          select: { athleteId: true },
        });
        const allowedIds = new Set(allowedStudents.map((s) => s.athleteId));
        const connections = await tx.$queryRaw<
          {
            status: string;
            provider: string | null;
            isSynthetic: boolean | null;
            count: number;
            lastSyncedAt: Date | null;
          }[]
        >(
          Prisma.sql`WITH eligible AS (${eligible}) SELECT COALESCE(g.status::text, 'not_connected') AS status, g.provider, g."isSynthetic", COUNT(*)::int AS count, MAX(g."lastSyncedAt") AS "lastSyncedAt" FROM eligible e LEFT JOIN "GarminConnection" g ON g."coachId" = e."coachId" AND g."athleteId" = e."athleteId" GROUP BY g.status, g.provider, g."isSynthetic" ORDER BY status, g.provider`,
        );
        const [activityStats] = await tx.$queryRaw<
          { total: number; synthetic: number; real: number }[]
        >(
          Prisma.sql`${scoped} SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE "isSynthetic")::int AS synthetic, COUNT(*) FILTER (WHERE NOT "isSynthetic")::int AS real FROM scoped`,
        );
        const volumes = await tx.$queryRaw<
          {
            sport: string;
            isSynthetic: boolean;
            total: number;
            known: number;
            missing: number;
            distanceMeters: number | null;
          }[]
        >(
          Prisma.sql`${scoped} SELECT sport, "isSynthetic", COUNT(*)::int AS total, COUNT("distanceMeters")::int AS known, (COUNT(*)-COUNT("distanceMeters"))::int AS missing, SUM("distanceMeters") AS "distanceMeters" FROM scoped GROUP BY sport, "isSynthetic" ORDER BY sport, "isSynthetic"`,
        );
        const recent = await tx.$queryRaw<ActivityRow[]>(
          Prisma.sql`${scoped} SELECT a.*, s.status::text AS "analysisStatus", s.result, EXISTS(SELECT 1 FROM "SportsAnalysis" old WHERE old."activityId" = a.id) AS previous FROM scoped a LEFT JOIN "SportsAnalysis" s ON ${analysisJoin} ORDER BY a."startedAt" DESC, a.id DESC LIMIT 5`,
        );
        let completed = 0,
          invalid = 0,
          withEvents = 0;
        const attention: (ReturnType<typeof activityDto> & {
          eventCount: number;
        })[] = [];
        // Ler snapshots em lotes limita memória sem truncar o universo dos totais.
        for (let offset = 0; ; offset += 100) {
          const batch = await tx.$queryRaw<ActivityRow[]>(
            Prisma.sql`${scoped} SELECT a.*, s.status::text AS "analysisStatus", s.result, true AS previous FROM scoped a JOIN "SportsAnalysis" s ON ${analysisJoin} WHERE s.status = 'completed' ORDER BY a."startedAt" DESC, a.id DESC LIMIT 100 OFFSET ${offset}`,
          );
          completed += batch.length;
          for (const row of batch) {
            const result = resultSchema.safeParse(row.result);
            if (!result.success) {
              invalid++;
              continue;
            }
            if (result.data.events.length) {
              withEvents++;
              if (attention.length < 5)
                attention.push({
                  ...activityDto(row),
                  eventCount: result.data.events.length,
                });
            }
          }
          if (batch.length < 100) break;
        }
        const periodCondition = Prisma.sql`"updatedAt" >= (${query.start.toISOString()}::timestamptz AT TIME ZONE 'UTC') AND "updatedAt" < (${query.end.toISOString()}::timestamptz AT TIME ZONE 'UTC') AND "effectiveState" = 'active' AND kind IN ('feedback_pending','fit_failure','analysis_failure','sync_failure','connection_failure')`;
        const pendingItems = await tx.$queryRaw<MonitoringRow[]>(
          Prisma.sql`${visible(coachId)} SELECT * FROM visible WHERE ${periodCondition} ORDER BY "updatedAt" DESC, id DESC LIMIT 3`,
        );
        const [pending] = await tx.$queryRaw<{ total: number }[]>(
          Prisma.sql`${visible(coachId)} SELECT COUNT(*)::int AS total FROM visible WHERE ${periodCondition}`,
        );
        const connected = connections.filter((g) => g.status === 'connected');
        return {
          filters: {
            period: query.period,
            sport: query.sport,
            from: query.from,
            to: query.to,
          },
          generatedAt: now,
          athletes: {
            total: totalAthletes,
            statuses: Object.fromEntries(
              statuses.map((s) => [s.status, s._count._all]),
            ),
            withoutRelationship:
              totalAthletes - statuses.reduce((n, s) => n + s._count._all, 0),
            limit: 6,
            items: students.map((s) => ({
              id: s.id,
              name: s.name,
              relationshipStatus: s.relationship?.status ?? null,
              garmin: allowedIds.has(s.id)
                ? (s.relationship?.garminConnection ?? {
                    status: 'not_connected',
                    provider: null,
                    isSynthetic: null,
                    lastSyncedAt: null,
                  })
                : null,
            })),
          },
          connections: {
            eligible: connections.reduce((n, g) => n + g.count, 0),
            connected: connected.reduce((n, g) => n + g.count, 0),
            simulated: connected
              .filter((g) => g.isSynthetic)
              .reduce((n, g) => n + g.count, 0),
            nonsynthetic: connected
              .filter((g) => !g.isSynthetic)
              .reduce((n, g) => n + g.count, 0),
            states: connections,
            officialAvailable: false,
          },
          activities: {
            ...activityStats,
            limit: 5,
            items: recent.map(activityDto),
          },
          volumes,
          attention: {
            status: invalid ? 'unavailable' : 'available',
            total: invalid ? null : withEvents,
            coverage: {
              completed: completed - invalid,
              invalid,
              missing: activityStats.total - completed,
            },
            limit: 5,
            items: invalid ? [] : attention,
          },
          monitoring: {
            ...pending,
            limit: 3,
            items: pendingItems.map(monitoringItem),
          },
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
        timeout: 15000,
      },
    );
  }
}
