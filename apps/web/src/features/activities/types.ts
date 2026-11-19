export const sports: Record<string, string> = {
  running: 'Corrida',
  cycling: 'Ciclismo',
  walking: 'Caminhada',
  swimming: 'Natação',
  other: 'Outra',
};
export const sources: Record<string, string> = {
  garmin_mock: 'Garmin simulado',
  manual_fit: 'FIT de teste',
};
export const formatNumber = (value: number | null, unit = '', scale = 1) =>
  value === null
    ? '—'
    : `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(value / scale)}${unit}`;
export const formatPace = (value: number | null) =>
  value === null
    ? '—'
    : `${Math.floor(Math.round(value) / 60)}:${String(Math.round(value) % 60).padStart(2, '0')} /km`;
export interface Activity {
  id: string;
  athleteId: string;
  athleteName: string;
  sport: string;
  source: string;
  isSynthetic: boolean;
  startedAt: string;
  durationSeconds: number | null;
  distanceMeters: number | null;
  timerSeconds: number | null;
  elapsedSeconds: number | null;
  durationBasis: string;
  avgHeartRateBpm: number | null;
  maxHeartRateBpm: number | null;
  avgCadenceRpm: number | null;
  totalAscentMeters: number | null;
  paceSecondsPerKm: number | null;
  speedKmh: number | null;
  sampleCount: number;
  splitCount: number;
  qualityWarnings: string[];
  status: string;
  possibleDuplicates?: number;
}
export interface ActivityList {
  items: Activity[];
  total: number;
  page: number;
  limit: number;
  stats: {
    distanceMeters: number | null;
    durationSeconds: number | null;
    distanceCount: number;
    durationCount: number;
  };
}
