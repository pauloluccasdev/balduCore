export interface Evidence {
  ordinal: number;
  distanceMeters: number | null;
  durationSeconds: number | null;
  basis: string;
  heartRateBpm: number | null;
  cadenceRpm: number | null;
  startedAt: string | null;
  endedAt: string | null;
}
export interface AnalysisEvent {
  id: string;
  type: 'pace_change' | 'heart_rate_change' | 'cadence_change';
  direction: 'increase' | 'decrease';
  delta: number;
  relativeDelta: number | null;
  absoluteThreshold: number;
  relativeThreshold: number | null;
  previous: Evidence;
  current: Evidence;
  distanceMissing: boolean;
  marker: {
    timeSeconds: number | null;
    distanceMeters: number | null;
    ordinal: number | null;
  };
}
export interface Point {
  ordinal: number;
  timestamp: string;
  x: number;
  value: number | null;
  breakBefore: boolean;
}
export interface Channel {
  channel: 'pace' | 'heartRate' | 'cadence' | 'altitude';
  originalCount: number;
  knownCount: number;
  reduced: boolean;
  points: Point[];
}
export interface Split {
  ordinal: number;
  startedAt: string | null;
  endedAt: string | null;
  distanceMeters: number | null;
  timerSeconds: number | null;
  elapsedSeconds: number | null;
  avgHeartRateBpm: number | null;
  avgCadenceRpm: number | null;
}
export interface Workspace {
  activity: {
    id: string;
    athleteId: string;
    athleteName: string;
    sport: string;
    source: string;
    isSynthetic: boolean;
    startedAt: string;
    revision: number;
    dataHash: string;
    distanceMeters: number | null;
    durationSeconds: number | null;
    durationBasis: string;
    timerSeconds: number | null;
    elapsedSeconds: number | null;
    avgHeartRateBpm: number | null;
    maxHeartRateBpm: number | null;
    avgCadenceRpm: number | null;
    totalAscentMeters: number | null;
  };
  analysis: {
    id: string | null;
    status: string;
    obsolete: boolean;
    version: string;
    attempts: number;
    errorCode: string | null;
    result: null | {
      version: string;
      sampleCount: number;
      splitCount: number;
      distanceAxisAvailable: boolean;
      gaps: number;
      quality: string[];
      summary: string;
      events: AnalysisEvent[];
      eventCount: number;
    };
  };
  series: {
    axis: 'time' | 'distance';
    requestedAxis: 'time' | 'distance';
    distanceAxisAvailable: boolean;
    limit: number;
    channels: Channel[];
  };
  splits: { items: Split[]; total: number; page: number; limit: number };
  eventPage: number;
  splitPage: number;
}
export interface Selection {
  kind: 'time' | 'distance' | 'splits';
  from: number;
  to: number;
}
interface Statistics {
  count: number;
  missing: number;
  mean: number | null;
  min: number | null;
  max: number | null;
}
export interface SegmentResult {
  requested: Selection;
  available: boolean;
  reason?: string;
  actual?: {
    from: number;
    to: number;
    fromOrdinal?: number;
    toOrdinal?: number;
    startedAt?: string;
    endedAt?: string;
  } | null;
  basis?: string;
  distanceMeters?: number | null;
  durationSeconds?: number | null;
  paceSecondsPerKm?: number | null;
  gaps?: number | null;
  sampleCount?: number;
  splitCount?: number;
  heartRate?: Statistics | null;
  cadence?: Statistics | null;
  incomplete?: boolean;
}
export interface Comparison {
  activityId: string;
  inputRevision: number;
  inputHash: string;
  algorithmVersion: string;
  segments: SegmentResult[];
  comparable: boolean;
  paceDeltaSecondsPerKm: number | null;
}
export const eventLabels = {
  pace_change: 'Variação de ritmo',
  heart_rate_change: 'Alteração de FC média',
  cadence_change: 'Variação de cadência',
};
export const basisLabels: Record<string, string> = {
  timer: 'cronômetro',
  elapsed: 'decorrido',
  provided: 'fornecida',
  unavailable: 'indisponível',
};
export const qualityLabels: Record<string, string> = {
  samples_unavailable: 'Sem amostras recebidas',
  distance_axis_unavailable: 'Distância parcial/regressiva: seleção por tempo',
  recording_gaps: 'Lacunas de gravação superiores a 30 s',
  duplicate_or_unordered_timestamps: 'Horários repetidos ou fora de ordem',
  untimed_samples_removed: 'Amostras sem horário removidas na importação',
  samples_reordered: 'Amostras ordenadas na importação',
  unknown_sport: 'Modalidade não reconhecida',
};
