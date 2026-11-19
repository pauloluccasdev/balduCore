import type { MonitoringItem } from '../monitoring/types';
export interface DashboardActivity {
  id: string;
  athleteId: string;
  athleteName: string;
  startedAt: string;
  sport: string;
  source: string;
  isSynthetic: boolean;
  revision: number;
  distanceMeters: number | null;
  durationSeconds: number | null;
  durationBasis: string;
  analysisStatus: string;
}
interface GarminState {
  status: string;
  provider: string | null;
  isSynthetic: boolean | null;
  lastSyncedAt: string | null;
}
export interface DashboardData {
  filters: { period: number; sport?: string; from: string; to: string };
  generatedAt: string;
  athletes: {
    total: number;
    statuses: Record<string, number>;
    withoutRelationship: number;
    limit: number;
    items: {
      id: string;
      name: string;
      relationshipStatus: string | null;
      garmin: GarminState | null;
    }[];
  };
  connections: {
    eligible: number;
    connected: number;
    simulated: number;
    nonsynthetic: number;
    officialAvailable: boolean;
    states: (GarminState & { count: number })[];
  };
  activities: {
    total: number;
    synthetic: number;
    real: number;
    limit: number;
    items: DashboardActivity[];
  };
  volumes: {
    sport: string;
    isSynthetic: boolean;
    total: number;
    known: number;
    missing: number;
    distanceMeters: number | null;
  }[];
  attention: {
    status: 'available' | 'unavailable';
    total: number | null;
    coverage: { completed: number; invalid: number; missing: number };
    limit: number;
    items: (DashboardActivity & { eventCount: number })[];
  };
  monitoring: { total: number; limit: number; items: MonitoringItem[] };
}
export const analysisStatuses: Record<string, string> = {
  not_requested: 'Não solicitada',
  obsolete: 'Revisão anterior',
  queued: 'Na fila',
  processing: 'Processando',
  retry: 'Em retentativa',
  completed: 'Analisada',
  failed: 'Falhou',
  cancelled: 'Cancelada',
  invalid: 'Análise indisponível',
};
export const relationshipLabels: Record<string, string> = {
  pending: 'Pendente',
  active: 'Ativo',
  ended: 'Encerrado',
};
export const garminLabels: Record<string, string> = {
  not_connected: 'Não conectada',
  awaiting_authorization: 'Aguardando autorização',
  connected: 'Conectada',
  error: 'Erro',
  disconnected: 'Desconectada',
};
