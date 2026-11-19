import { parentPort, workerData } from 'node:worker_threads';
import { Decoder, Stream, type FitMessages } from '@garmin/fitsdk';
import {
  activityDataSchema,
  FIT_LIMITS,
  type ActivityData,
} from './activity-data.js';
const date = (value: unknown) =>
  value instanceof Date && Number.isFinite(value.getTime())
    ? value.toISOString()
    : null;
const metric = (value: unknown, max: number, min = 0) =>
  typeof value === 'number' &&
  Number.isFinite(value) &&
  value >= min &&
  value <= max
    ? value
    : null;
function normalized(messages: FitMessages): ActivityData {
  if (
    messages.fileIdMesgs?.length !== 1 ||
    messages.fileIdMesgs[0].type !== 'activity' ||
    messages.sessionMesgs?.length !== 1
  )
    throw new Error('fit_session_unsupported');
  const session = messages.sessionMesgs[0];
  if (session.sport === 'multisport')
    throw new Error('fit_session_unsupported');
  const startedAt = date(session.startTime);
  if (!startedAt) throw new Error('fit_missing_start');
  const records = messages.recordMesgs ?? [];
  const laps = messages.lapMesgs ?? [];
  if (records.length > FIT_LIMITS.samples || laps.length > FIT_LIMITS.splits)
    throw new Error('fit_limits_exceeded');
  const warnings: NonNullable<ActivityData['qualityWarnings']> = [];
  const samples = records.flatMap((record) => {
    const timestamp = date(record.timestamp);
    if (!timestamp) {
      if (!warnings.includes('untimed_samples_removed'))
        warnings.push('untimed_samples_removed');
      return [];
    }
    return [
      {
        timestamp,
        distanceMeters: metric(record.distance, 2_000_000),
        speedMetersPerSecond: metric(record.enhancedSpeed ?? record.speed, 150),
        heartRateBpm: metric(record.heartRate, 255, 1),
        cadenceRpm: metric(record.cadence, 255),
        altitudeMeters: metric(
          record.enhancedAltitude ?? record.altitude,
          15000,
          -1500,
        ),
      },
    ];
  });
  if (
    samples.some(
      (sample, index) =>
        index > 0 && sample.timestamp < samples[index - 1].timestamp,
    )
  )
    warnings.push('samples_reordered');
  samples.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const timerSeconds = metric(session.totalTimerTime, 604800);
  const elapsedSeconds = metric(session.totalElapsedTime, 604800);
  const sport = ['running', 'cycling', 'walking', 'swimming'].includes(
    String(session.sport),
  )
    ? (session.sport as 'running' | 'cycling' | 'walking' | 'swimming')
    : 'other';
  if (sport === 'other') warnings.push('unknown_sport');
  return activityDataSchema.parse({
    sport,
    startedAt,
    durationSeconds: timerSeconds ?? elapsedSeconds,
    distanceMeters: metric(session.totalDistance, 2_000_000),
    timerSeconds,
    elapsedSeconds,
    durationBasis:
      timerSeconds !== null
        ? 'timer'
        : elapsedSeconds !== null
          ? 'elapsed'
          : 'provided',
    avgHeartRateBpm: metric(session.avgHeartRate, 255, 1),
    maxHeartRateBpm: metric(session.maxHeartRate, 255, 1),
    avgCadenceRpm: metric(session.avgCadence, 255),
    totalAscentMeters: metric(session.totalAscent, 100000),
    qualityWarnings: warnings,
    samples,
    splits: laps.map((lap) => ({
      startedAt: date(lap.startTime),
      endedAt: date(lap.timestamp),
      distanceMeters: metric(lap.totalDistance, 2_000_000),
      timerSeconds: metric(lap.totalTimerTime, 604800),
      elapsedSeconds: metric(lap.totalElapsedTime, 604800),
      avgHeartRateBpm: metric(lap.avgHeartRate, 255, 1),
      avgCadenceRpm: metric(lap.avgCadence, 255),
    })),
  });
}
try {
  const bytes = Buffer.from(workerData as Uint8Array);
  if (bytes.length > FIT_LIMITS.bytes) throw new Error('fit_limits_exceeded');
  const decoder = new Decoder(Stream.fromBuffer(bytes));
  if (!decoder.isFIT() || !decoder.checkIntegrity())
    throw new Error('fit_invalid_integrity');
  let count = 0;
  let records = 0;
  let laps = 0;
  let exceeded = false;
  const { messages, errors } = decoder.read({
    includeUnknownData: false,
    decodeMemoGlobs: false,
    mergeHeartRates: false,
    mesgListener: (id) => {
      if (
        ++count > FIT_LIMITS.messages ||
        (id === 20 && ++records > FIT_LIMITS.samples) ||
        (id === 19 && ++laps > FIT_LIMITS.splits)
      ) {
        exceeded = true;
        throw new Error('fit_limits_exceeded');
      }
    },
  });
  if (exceeded) throw new Error('fit_limits_exceeded');
  if (errors.length) throw new Error('fit_invalid_structure');
  parentPort!.postMessage({ ok: true, data: normalized(messages) });
} catch (error) {
  const allowed = [
    'fit_session_unsupported',
    'fit_missing_start',
    'fit_limits_exceeded',
    'fit_invalid_integrity',
    'fit_invalid_structure',
  ];
  const code =
    error instanceof Error && allowed.includes(error.message)
      ? error.message
      : 'fit_invalid_structure';
  parentPort!.postMessage({ ok: false, code });
}
