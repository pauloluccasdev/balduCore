import { z } from 'zod';
import type {
  Activity,
  ActivitySample,
  ActivitySplit,
} from '../../generated/prisma/client.js';
import { derivedMetrics } from '../activities/activity-data.js';
export const ALGORITHM_VERSION = 'deterministic-1.0.0';
export const GAP_SECONDS = 30;
export type Input = Activity & {
  samples: ActivitySample[];
  splits: ActivitySplit[];
};
const metric = z.number().finite().nullable();
const evidenceSchema = z
  .object({
    ordinal: z.number().int().nonnegative(),
    distanceMeters: metric,
    durationSeconds: metric,
    basis: z.enum(['timer', 'elapsed', 'unavailable']),
    heartRateBpm: metric,
    cadenceRpm: metric,
    startedAt: z.iso.datetime().nullable(),
    endedAt: z.iso.datetime().nullable(),
  })
  .strict();
export const eventSchema = z
  .object({
    id: z.string().max(80),
    type: z.enum(['pace_change', 'heart_rate_change', 'cadence_change']),
    ruleVersion: z.literal(ALGORITHM_VERSION),
    direction: z.enum(['increase', 'decrease']),
    delta: z.number().finite(),
    relativeDelta: metric,
    absoluteThreshold: z.number(),
    relativeThreshold: metric,
    previous: evidenceSchema,
    current: evidenceSchema,
    distanceComparable: z.boolean(),
    distanceMissing: z.boolean(),
    marker: z
      .object({
        timeSeconds: metric,
        distanceMeters: metric,
        ordinal: z.number().int().nonnegative().nullable(),
      })
      .strict(),
  })
  .strict();
export const resultSchema = z
  .object({
    version: z.literal(ALGORITHM_VERSION),
    sampleCount: z.number().int().min(0).max(20000),
    splitCount: z.number().int().min(0).max(2000),
    distanceAxisAvailable: z.boolean(),
    gaps: z.number().int().nonnegative(),
    quality: z.array(z.string().max(80)).max(12),
    summary: z.string().max(500),
    events: z.array(eventSchema).max(6000),
  })
  .strict();
export type AnalysisResult = z.infer<typeof resultSchema>;
export const segmentSchema = z
  .discriminatedUnion('kind', [
    z
      .object({
        kind: z.literal('time'),
        from: z.number().finite().min(-604800).max(604800),
        to: z.number().finite().min(-604800).max(604800),
      })
      .strict(),
    z
      .object({
        kind: z.literal('distance'),
        from: z.number().finite().min(0).max(2000000),
        to: z.number().finite().min(0).max(2000000),
      })
      .strict(),
    z
      .object({
        kind: z.literal('splits'),
        from: z.number().int().min(0).max(1999),
        to: z.number().int().min(0).max(1999),
      })
      .strict(),
  ])
  .refine((value) => value.from <= value.to);
export type Segment = z.infer<typeof segmentSchema>;
export function distanceAxis(samples: ActivitySample[]) {
  return (
    samples.length >= 2 &&
    samples.every(
      (sample, index) =>
        sample.distanceMeters !== null &&
        (index === 0 ||
          sample.distanceMeters >= samples[index - 1].distanceMeters!),
    ) &&
    samples.at(-1)!.distanceMeters! > samples[0].distanceMeters!
  );
}
export function splitDuration(split: ActivitySplit) {
  return split.timerSeconds !== null
    ? { value: split.timerSeconds, basis: 'timer' as const }
    : split.elapsedSeconds !== null
      ? { value: split.elapsedSeconds, basis: 'elapsed' as const }
      : { value: null, basis: 'unavailable' as const };
}
function evidence(split: ActivitySplit) {
  const duration = splitDuration(split);
  return {
    ordinal: split.ordinal,
    distanceMeters: split.distanceMeters,
    durationSeconds: duration.value,
    basis: duration.basis,
    heartRateBpm: split.avgHeartRateBpm,
    cadenceRpm: split.avgCadenceRpm,
    startedAt: split.startedAt?.toISOString() ?? null,
    endedAt: split.endedAt?.toISOString() ?? null,
  };
}
export function analyze(input: Input): AnalysisResult {
  if (input.samples.length > 20000 || input.splits.length > 2000)
    throw new Error('analysis_input_limit');
  const events: AnalysisResult['events'] = [];
  const samplesByTime = new Map<number, (typeof input.samples)[number]>();
  for (const sample of input.samples)
    if (!samplesByTime.has(sample.timestamp.getTime()))
      samplesByTime.set(sample.timestamp.getTime(), sample);
  for (let index = 1; index < input.splits.length; index++) {
    const a = evidence(input.splits[index - 1]),
      b = evidence(input.splits[index]);
    if (
      b.ordinal !== a.ordinal + 1 ||
      a.basis === 'unavailable' ||
      a.basis !== b.basis ||
      a.durationSeconds === null ||
      b.durationSeconds === null ||
      a.durationSeconds <= 0 ||
      b.durationSeconds <= 0
    )
      continue;
    const distanceMissing =
      a.distanceMeters === null || b.distanceMeters === null;
    const comparable =
      !distanceMissing &&
      a.distanceMeters! >= 200 &&
      b.distanceMeters! >= 200 &&
      b.distanceMeters! / a.distanceMeters! >= 0.8 &&
      b.distanceMeters! / a.distanceMeters! <= 1.25;
    const push = (
      type: AnalysisResult['events'][number]['type'],
      previous: number,
      current: number,
      absoluteThreshold: number,
      relativeThreshold: number | null,
    ) => {
      const delta = current - previous,
        relativeDelta = previous > 0 ? delta / previous : null;
      // Tolerância apenas para ruído de ponto flutuante na fronteira inclusiva.
      if (
        Math.abs(delta) + 1e-9 < absoluteThreshold ||
        (relativeThreshold !== null &&
          (relativeDelta === null ||
            Math.abs(relativeDelta) + 1e-12 < relativeThreshold))
      )
        return;
      events.push({
        id: `${type}:${a.ordinal}:${b.ordinal}`,
        type,
        ruleVersion: ALGORITHM_VERSION,
        direction: delta > 0 ? 'increase' : 'decrease',
        delta,
        relativeDelta,
        absoluteThreshold,
        relativeThreshold,
        previous: a,
        current: b,
        distanceComparable: comparable,
        distanceMissing,
        marker: {
          timeSeconds: b.startedAt
            ? (new Date(b.startedAt).getTime() - input.startedAt.getTime()) /
              1000
            : null,
          distanceMeters: b.startedAt
            ? (samplesByTime.get(new Date(b.startedAt).getTime())
                ?.distanceMeters ?? null)
            : null,
          ordinal: b.startedAt
            ? (samplesByTime.get(new Date(b.startedAt).getTime())?.ordinal ??
              null)
            : null,
        },
      });
    };
    if (comparable && ['running', 'walking'].includes(input.sport))
      push(
        'pace_change',
        a.durationSeconds / (a.distanceMeters! / 1000),
        b.durationSeconds / (b.distanceMeters! / 1000),
        30,
        0.15,
      );
    if (
      a.durationSeconds < 60 ||
      b.durationSeconds < 60 ||
      (!distanceMissing && !comparable)
    )
      continue;
    if (a.heartRateBpm !== null && b.heartRateBpm !== null)
      push('heart_rate_change', a.heartRateBpm, b.heartRateBpm, 10, null);
    if (
      a.cadenceRpm !== null &&
      b.cadenceRpm !== null &&
      a.cadenceRpm > 0 &&
      b.cadenceRpm > 0
    )
      push('cadence_change', a.cadenceRpm, b.cadenceRpm, 5, 0.1);
  }
  const gaps = input.samples.filter(
    (sample, index) =>
      index > 0 &&
      (sample.timestamp.getTime() -
        input.samples[index - 1].timestamp.getTime()) /
        1000 >
        GAP_SECONDS,
  ).length;
  const quality = [...input.qualityWarnings];
  if (!input.samples.length) quality.push('samples_unavailable');
  if (input.samples.length && !distanceAxis(input.samples))
    quality.push('distance_axis_unavailable');
  if (gaps) quality.push('recording_gaps');
  if (
    input.samples.some(
      (sample, index) =>
        index > 0 &&
        sample.timestamp.getTime() <=
          input.samples[index - 1].timestamp.getTime(),
    )
  )
    quality.push('duplicate_or_unordered_timestamps');
  return resultSchema.parse({
    version: ALGORITHM_VERSION,
    sampleCount: input.samples.length,
    splitCount: input.splits.length,
    distanceAxisAvailable: distanceAxis(input.samples),
    gaps,
    quality: [...new Set(quality)],
    summary: `${input.samples.length} amostras e ${input.splits.length} splits recebidos. ${events.length} diferenças atendem às regras demonstrativas v1. ${gaps} lacunas superiores a ${GAP_SECONDS} s.`,
    events,
  });
}
function statistics(values: (number | null)[]) {
  const known = values.filter((value): value is number => value !== null);
  return {
    count: known.length,
    missing: values.length - known.length,
    mean: known.length
      ? known.reduce((sum, value) => sum + value, 0) / known.length
      : null,
    min: known.length ? Math.min(...known) : null,
    max: known.length ? Math.max(...known) : null,
  };
}
export function segment(input: Input, requested: Segment) {
  if (requested.kind === 'splits') {
    const splits = input.splits.filter(
      (split) =>
        split.ordinal >= requested.from && split.ordinal <= requested.to,
    );
    const durations = splits.map(splitDuration),
      basis = durations[0]?.basis ?? 'unavailable';
    const complete =
      splits.length > 0 && splits.length === requested.to - requested.from + 1;
    const distanceMeters =
      complete && splits.every((split) => split.distanceMeters !== null)
        ? splits.reduce((sum, split) => sum + split.distanceMeters!, 0)
        : null;
    const durationSeconds =
      complete &&
      basis !== 'unavailable' &&
      durations.every(
        (duration) => duration.basis === basis && duration.value !== null,
      )
        ? durations.reduce((sum, duration) => sum + duration.value!, 0)
        : null;
    return {
      requested,
      available: splits.length > 0,
      actual: splits.length
        ? { from: splits[0].ordinal, to: splits.at(-1)!.ordinal }
        : null,
      basis,
      distanceMeters,
      durationSeconds,
      ...derivedMetrics(distanceMeters, durationSeconds),
      sampleCount: 0,
      splitCount: splits.length,
      gaps: null,
      heartRate: null,
      cadence: null,
      incomplete: distanceMeters === null || durationSeconds === null,
      evidence: splits.map((split) => split.ordinal),
    };
  }
  const distanceAvailable = distanceAxis(input.samples);
  if (requested.kind === 'distance' && !distanceAvailable)
    return { requested, available: false, reason: 'distance_axis_unavailable' };
  const coordinate = (sample: ActivitySample) =>
    requested.kind === 'distance'
      ? sample.distanceMeters!
      : (sample.timestamp.getTime() - input.startedAt.getTime()) / 1000;
  const samples = input.samples.filter(
    (sample) =>
      coordinate(sample) >= requested.from &&
      coordinate(sample) <= requested.to,
  );
  const first = samples[0],
    last = samples.at(-1);
  const durationSeconds =
    first && last && last.timestamp > first.timestamp
      ? (last.timestamp.getTime() - first.timestamp.getTime()) / 1000
      : null;
  const distanceMeters =
    samples.length >= 2 &&
    samples.every(
      (sample, index) =>
        sample.distanceMeters !== null &&
        (index === 0 ||
          sample.distanceMeters >= samples[index - 1].distanceMeters!),
    )
      ? last!.distanceMeters! - first!.distanceMeters!
      : null;
  return {
    requested,
    available: samples.length > 0,
    actual:
      first && last
        ? {
            from: coordinate(first),
            to: coordinate(last),
            fromOrdinal: first.ordinal,
            toOrdinal: last.ordinal,
            startedAt: first.timestamp.toISOString(),
            endedAt: last.timestamp.toISOString(),
          }
        : null,
    basis: 'elapsed',
    distanceMeters,
    durationSeconds,
    ...derivedMetrics(distanceMeters, durationSeconds),
    sampleCount: samples.length,
    splitCount: 0,
    gaps: samples.filter(
      (sample, index) =>
        index > 0 &&
        (sample.timestamp.getTime() - samples[index - 1].timestamp.getTime()) /
          1000 >
          GAP_SECONDS,
    ).length,
    heartRate: statistics(samples.map((sample) => sample.heartRateBpm)),
    cadence: statistics(samples.map((sample) => sample.cadenceRpm)),
    incomplete: distanceMeters === null || durationSeconds === null,
    evidence: samples.length ? [first!.ordinal, last!.ordinal] : [],
  };
}
export function compare(input: Input, selections: Segment[]) {
  const segments = selections.map((selection) => segment(input, selection));
  const [a, b] = segments;
  const comparable =
    a.available &&
    b.available &&
    'basis' in a &&
    'basis' in b &&
    a.basis === b.basis &&
    'paceSecondsPerKm' in a &&
    'paceSecondsPerKm' in b &&
    a.paceSecondsPerKm !== null &&
    b.paceSecondsPerKm !== null;
  return {
    segments,
    comparable,
    paceDeltaSecondsPerKm:
      comparable &&
      'paceSecondsPerKm' in a &&
      'paceSecondsPerKm' in b &&
      a.paceSecondsPerKm !== null &&
      b.paceSecondsPerKm !== null
        ? b.paceSecondsPerKm! - a.paceSecondsPerKm!
        : null,
  };
}
