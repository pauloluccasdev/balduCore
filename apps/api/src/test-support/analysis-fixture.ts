import type {
  ActivitySample,
  ActivitySplit,
} from '../generated/prisma/client.js';
import type { Input } from '../modules/sports-analysis/calculations.js';
export const ANALYSIS_START = new Date('2026-11-18T12:00:00.000Z');
export function analysisSample(
  ordinal: number,
  overrides: Partial<ActivitySample> = {},
): ActivitySample {
  return {
    coachId: 'coach',
    athleteId: 'athlete',
    activityId: 'activity',
    ordinal,
    timestamp: new Date(ANALYSIS_START.getTime() + ordinal * 1000),
    distanceMeters: ordinal * 4,
    speedMetersPerSecond: 4,
    heartRateBpm: null,
    cadenceRpm: null,
    altitudeMeters: null,
    ...overrides,
  };
}
export function analysisSplit(
  ordinal: number,
  overrides: Partial<ActivitySplit> = {},
): ActivitySplit {
  return {
    coachId: 'coach',
    athleteId: 'athlete',
    activityId: 'activity',
    ordinal,
    startedAt: new Date(ANALYSIS_START.getTime() + ordinal * 200000),
    endedAt: new Date(ANALYSIS_START.getTime() + (ordinal + 1) * 200000),
    distanceMeters: 1000,
    timerSeconds: 200,
    elapsedSeconds: 220,
    avgHeartRateBpm: 140,
    avgCadenceRpm: 80,
    ...overrides,
  };
}
export function analysisInput(overrides: Partial<Input> = {}): Input {
  return {
    id: 'activity',
    coachId: 'coach',
    athleteId: 'athlete',
    connectionId: null,
    generation: 0,
    externalId: 'fixture',
    revision: 1,
    source: 'manual_fit',
    isSynthetic: true,
    sport: 'running',
    startedAt: ANALYSIS_START,
    durationSeconds: 400,
    distanceMeters: 2000,
    timerSeconds: 400,
    elapsedSeconds: 440,
    durationBasis: 'timer',
    avgHeartRateBpm: null,
    maxHeartRateBpm: null,
    avgCadenceRpm: null,
    totalAscentMeters: null,
    qualityWarnings: [],
    dataHash: 'a'.repeat(64),
    createdAt: ANALYSIS_START,
    updatedAt: ANALYSIS_START,
    samples: [analysisSample(0), analysisSample(1)],
    splits: [analysisSplit(0), analysisSplit(1)],
    ...overrides,
  };
}
