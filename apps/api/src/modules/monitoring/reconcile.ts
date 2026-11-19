import { z } from 'zod';
import type { PrismaClient } from '../../generated/prisma/client.js';
import { eligible, lockRelationship } from '../garmin-connections/lifecycle.js';
import {
  projectActivity,
  projectAnalysis,
  projectConnection,
  projectFit,
  projectIntegration,
} from './projection.js';
const options = z
  .object({
    coachId: z.uuid(),
    type: z.enum(['activity', 'analysis', 'fit', 'integration', 'connection']),
    limit: z.coerce.number().int().min(1).max(10000),
    cursor: z.uuid().optional(),
  })
  .strict();
export async function reconcileMonitoring(db: PrismaClient, raw: unknown) {
  const input = options.parse(raw);
  let cursor = input.cursor,
    scanned = 0,
    projected = 0;
  const select = { id: true, coachId: true, athleteId: true } as const;
  while (scanned < input.limit) {
    const query = {
      where: {
        coachId: input.coachId,
        ...(cursor ? { id: { gt: cursor } } : {}),
      },
      select,
      orderBy: { id: 'asc' as const },
      take: Math.min(100, input.limit - scanned),
    };
    const sources =
      input.type === 'activity'
        ? await db.activity.findMany(query)
        : input.type === 'analysis'
          ? await db.sportsAnalysis.findMany(query)
          : input.type === 'fit'
            ? await db.fitImport.findMany(query)
            : input.type === 'integration'
              ? await db.integrationEvent.findMany(query)
              : await db.garminConnection.findMany(query);
    if (!sources.length) break;
    for (const source of sources) {
      await db.$transaction(
        async (tx) => {
          await lockRelationship(tx, source);
          if (!(await eligible(tx, source))) return;
          if (input.type === 'activity') await projectActivity(tx, source.id);
          else if (input.type === 'analysis')
            await projectAnalysis(tx, source.id);
          else if (input.type === 'fit') await projectFit(tx, source.id);
          else if (input.type === 'integration')
            await projectIntegration(tx, source.id, true);
          else await projectConnection(tx, source.id, true);
          projected++;
        },
        { timeout: 15000 },
      );
      cursor = source.id;
      scanned++;
    }
    if (sources.length < query.take) break;
  }
  return {
    scanned,
    projected,
    nextCursor: scanned === input.limit ? cursor : null,
  };
}
export function reconciliationArguments(args: string[]) {
  if (args.length % 2) throw new Error('Invalid arguments');
  const allowed: Record<string, string> = {
    '--coach': 'coachId',
    '--type': 'type',
    '--limit': 'limit',
    '--cursor': 'cursor',
  };
  const parsed: Record<string, string> = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = allowed[args[index]];
    if (!key || key in parsed) throw new Error('Invalid arguments');
    parsed[key] = args[index + 1];
  }
  return options.parse(parsed);
}
