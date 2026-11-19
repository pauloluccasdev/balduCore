import { z } from 'zod';
import type { Prisma } from '../../generated/prisma/client.js';
export const FIT_LIMITS = {
  bytes: 5 * 1024 * 1024,
  samples: 20_000,
  splits: 2000,
  messages: 60_000,
  timeoutMs: 5000,
  heapMb: 128,
} as const;
const optionalMetric = (max: number, min = 0) =>
  z.number().finite().min(min).max(max).nullable().optional();
export const sampleSchema = z
  .object({
    timestamp: z.iso.datetime(),
    distanceMeters: optionalMetric(2_000_000),
    speedMetersPerSecond: optionalMetric(150),
    heartRateBpm: optionalMetric(255, 1),
    cadenceRpm: optionalMetric(255),
    altitudeMeters: optionalMetric(15000, -1500),
  })
  .strict();
export const splitSchema = z
  .object({
    startedAt: z.iso.datetime().nullable(),
    endedAt: z.iso.datetime().nullable(),
    distanceMeters: optionalMetric(2_000_000),
    timerSeconds: optionalMetric(604800),
    elapsedSeconds: optionalMetric(604800),
    avgHeartRateBpm: optionalMetric(255, 1),
    avgCadenceRpm: optionalMetric(255),
  })
  .strict();
export const detailFields = {
  timerSeconds: optionalMetric(604800),
  elapsedSeconds: optionalMetric(604800),
  durationBasis: z.enum(['provided', 'timer', 'elapsed']).optional(),
  avgHeartRateBpm: optionalMetric(255, 1),
  maxHeartRateBpm: optionalMetric(255, 1),
  avgCadenceRpm: optionalMetric(255),
  totalAscentMeters: optionalMetric(100000),
  qualityWarnings: z
    .array(
      z.enum(['untimed_samples_removed', 'samples_reordered', 'unknown_sport']),
    )
    .max(3)
    .optional(),
  samples: z.array(sampleSchema).max(FIT_LIMITS.samples).optional(),
  splits: z.array(splitSchema).max(FIT_LIMITS.splits).optional(),
};
export const activityDataSchema = z
  .object({
    sport: z.enum(['running', 'cycling', 'walking', 'swimming', 'other']),
    startedAt: z.iso.datetime(),
    durationSeconds: optionalMetric(604800),
    distanceMeters: optionalMetric(2_000_000),
    ...detailFields,
  })
  .strict();
export type ActivityData = z.infer<typeof activityDataSchema>;
export function summaryData(data: ActivityData) {
  return {
    sport: data.sport,
    startedAt: new Date(data.startedAt),
    durationSeconds: data.durationSeconds ?? null,
    distanceMeters: data.distanceMeters ?? null,
    timerSeconds: data.timerSeconds ?? null,
    elapsedSeconds: data.elapsedSeconds ?? null,
    durationBasis: data.durationBasis ?? 'provided',
    avgHeartRateBpm: data.avgHeartRateBpm ?? null,
    maxHeartRateBpm: data.maxHeartRateBpm ?? null,
    avgCadenceRpm: data.avgCadenceRpm ?? null,
    totalAscentMeters: data.totalAscentMeters ?? null,
    qualityWarnings: data.qualityWarnings ?? [],
  };
}
// O chamador mantém lock do vínculo e publica a revisão inteira na mesma transação.
export async function replaceDetails(
  tx: Prisma.TransactionClient,
  scope: { coachId: string; athleteId: string; id: string },
  data: ActivityData,
) {
  await tx.activitySample.deleteMany({
    where: { activityId: scope.id, coachId: scope.coachId },
  });
  await tx.activitySplit.deleteMany({
    where: { activityId: scope.id, coachId: scope.coachId },
  });
  const samples = (data.samples ?? []).map((sample, ordinal) => ({
    coachId: scope.coachId,
    athleteId: scope.athleteId,
    activityId: scope.id,
    ordinal,
    ...sample,
    timestamp: new Date(sample.timestamp),
  }));
  const splits = (data.splits ?? []).map((split, ordinal) => ({
    coachId: scope.coachId,
    athleteId: scope.athleteId,
    activityId: scope.id,
    ordinal,
    ...split,
    startedAt: split.startedAt ? new Date(split.startedAt) : null,
    endedAt: split.endedAt ? new Date(split.endedAt) : null,
  }));
  for (let index = 0; index < samples.length; index += 1000)
    await tx.activitySample.createMany({
      data: samples.slice(index, index + 1000),
    });
  for (let index = 0; index < splits.length; index += 1000)
    await tx.activitySplit.createMany({
      data: splits.slice(index, index + 1000),
    });
}
export function derivedMetrics(
  distanceMeters: number | null,
  durationSeconds: number | null,
) {
  if (
    distanceMeters === null ||
    durationSeconds === null ||
    distanceMeters <= 0 ||
    durationSeconds <= 0
  )
    return { paceSecondsPerKm: null, speedKmh: null };
  return {
    paceSecondsPerKm: durationSeconds / (distanceMeters / 1000),
    speedKmh: (distanceMeters / durationSeconds) * 3.6,
  };
}
