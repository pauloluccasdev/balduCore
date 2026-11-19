import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { z } from 'zod';
import { Prisma, type PrismaClient } from '../../generated/prisma/client.js';
import { lockRelationship } from '../garmin-connections/lifecycle.js';
import { kinds, type MonitoringRow } from './projection.js';
import { visible, unread } from './query.js';
const schema = z
  .object({
    type: z.enum(kinds).optional(),
    athleteId: z.uuid().optional(),
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    read: z.enum(['all', 'read', 'unread']).default('all'),
    state: z.enum(['all', 'active', 'resolved']).default('all'),
    page: z.coerce.number().int().min(1).max(10000).default(1),
  })
  .strict();
export function monitoringQuery(raw: unknown, now = new Date()) {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new BadRequestException('Filtros inválidos.');
  const to = parsed.data.to ?? now.toISOString().slice(0, 10);
  const end = new Date(`${to}T00:00:00.000Z`);
  const from =
    parsed.data.from ??
    new Date(end.getTime() - 29 * 86400000).toISOString().slice(0, 10);
  const start = new Date(`${from}T00:00:00.000Z`);
  const days = (end.getTime() - start.getTime()) / 86400000 + 1;
  if (days < 1 || days > 90)
    throw new BadRequestException('Escolha um período de 1 a 90 dias UTC.');
  return {
    ...parsed.data,
    from,
    to,
    start,
    end: new Date(end.getTime() + 86400000),
  };
}
const dto = (row: MonitoringRow) => ({
  id: row.id,
  athleteId: row.athleteId,
  athleteName: row.athleteName,
  kind: row.kind,
  state: row.effectiveState,
  version: row.version,
  read: Boolean(
    row.readAt &&
    row.readVersion === row.version &&
    row.state === row.effectiveState,
  ),
  occurredAt: row.occurredAt,
  updatedAt: row.updatedAt,
  timeBasis: row.timeBasis,
  inputRevision: row.inputRevision,
  eventCount: row.eventCount,
  recovering: row.recovering && row.effectiveState === 'active',
  isSynthetic: row.isSynthetic,
  href:
    row.kind === 'feedback_pending'
      ? `/atividades/${row.activityId}/feedback`
      : ['analysis_completed', 'sports_events', 'analysis_failure'].includes(
            row.kind,
          )
        ? `/analise-esportiva/${row.activityId}`
        : row.kind === 'activity_available'
          ? `/atividades/${row.activityId}`
          : `/alunos/${row.athleteId}`,
});
export class MonitoringService {
  constructor(readonly db: PrismaClient) {}
  async list(coachId: string, raw: unknown) {
    const query = monitoringQuery(raw);
    // ISO com Z evita interpretar parâmetros timestamp no fuso da sessão PostgreSQL.
    const filters = [
      Prisma.sql`"updatedAt" >= (${query.start.toISOString()}::timestamptz AT TIME ZONE 'UTC') AND "updatedAt" < (${query.end.toISOString()}::timestamptz AT TIME ZONE 'UTC')`,
    ];
    if (query.type) filters.push(Prisma.sql`kind = ${query.type}`);
    if (query.athleteId)
      filters.push(Prisma.sql`"athleteId" = ${query.athleteId}`);
    if (query.state !== 'all')
      filters.push(Prisma.sql`"effectiveState" = ${query.state}`);
    if (query.read !== 'all')
      filters.push(
        query.read === 'unread' ? unread : Prisma.sql`NOT ${unread}`,
      );
    const where = Prisma.join(filters, ' AND ');
    return this.db.$transaction(
      async (tx) => {
        const rows = await tx.$queryRaw<MonitoringRow[]>(
          Prisma.sql`${visible(coachId)} SELECT * FROM visible WHERE ${where} ORDER BY "updatedAt" DESC, id DESC LIMIT 20 OFFSET ${(query.page - 1) * 20}`,
        );
        const [stats] = await tx.$queryRaw<
          { total: number; unread: number; pending: number }[]
        >(
          Prisma.sql`${visible(coachId)} SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE ${unread})::int AS unread, COUNT(*) FILTER (WHERE "effectiveState" = 'active' AND kind IN ('feedback_pending','fit_failure','analysis_failure','sync_failure','connection_failure'))::int AS pending FROM visible WHERE ${where}`,
        );
        return {
          items: rows.map(dto),
          ...stats,
          page: query.page,
          limit: 20,
          filters: {
            type: query.type,
            athleteId: query.athleteId,
            from: query.from,
            to: query.to,
            read: query.read,
            state: query.state,
          },
          queriedAt: new Date(),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
  async athletes(coachId: string, raw: unknown) {
    const parsed = z
      .object({
        q: z.string().trim().max(120).default(''),
        selected: z.uuid().optional(),
      })
      .strict()
      .safeParse(raw);
    if (!parsed.success)
      throw new BadRequestException('Busca de aluno inválida.');
    const query = parsed.data.q;
    // strpos trata curingas como texto literal. Somente alunos com itens ainda autorizados.
    const items = await this.db.$queryRaw<{ id: string; name: string }[]>(
      Prisma.sql`${visible(coachId)} SELECT DISTINCT "athleteId" AS id, "athleteName" AS name FROM visible WHERE strpos(lower("athleteName"), lower(${query})) > 0 ORDER BY name, id LIMIT 20`,
    );
    const selected = parsed.data.selected
      ? await this.db.$queryRaw<{ id: string; name: string }[]>(
          Prisma.sql`${visible(coachId)} SELECT DISTINCT "athleteId" AS id, "athleteName" AS name FROM visible WHERE "athleteId" = ${parsed.data.selected}`,
        )
      : [];
    return { items, selected: selected[0] ?? null };
  }
  async mark(coachId: string, id: string, raw: unknown) {
    const parsed = z
      .object({
        expectedVersion: z.number().int().positive().max(2147483647),
        read: z.boolean(),
      })
      .strict()
      .safeParse(raw);
    if (!parsed.success) throw new BadRequestException('Marcação inválida.');
    if (!z.uuid().safeParse(id).success)
      throw new NotFoundException('Item não encontrado.');
    return this.db.$transaction(async (tx) => {
      const seed = await tx.monitoringEvent.findFirst({
        where: { id, coachId },
        select: { athleteId: true },
      });
      if (!seed) throw new NotFoundException('Item não encontrado.');
      await lockRelationship(tx, { coachId, athleteId: seed.athleteId });
      const [row] = await tx.$queryRaw<MonitoringRow[]>(
        Prisma.sql`${visible(coachId)} SELECT * FROM visible WHERE id = ${id}`,
      );
      if (!row) throw new NotFoundException('Item não encontrado.');
      if (
        row.version !== parsed.data.expectedVersion ||
        row.state !== row.effectiveState
      )
        throw new ConflictException(
          'O item foi atualizado. Atualize a central antes de marcar.',
        );
      const already = Boolean(row.readAt && row.readVersion === row.version);
      if (already !== parsed.data.read) {
        await tx.monitoringEvent.update({
          where: { id },
          data: {
            readAt: parsed.data.read ? new Date() : null,
            readVersion: parsed.data.read ? row.version : null,
          },
        });
        await tx.auditLog.create({
          data: {
            coachId,
            resourceId: id,
            action: parsed.data.read ? 'monitoring.read' : 'monitoring.unread',
          },
        });
      }
      return { id, version: row.version, read: parsed.data.read };
    });
  }
}
