export const labels: Record<string, string> = {
  activity_available: 'Atividade disponível',
  analysis_completed: 'Análise concluída',
  sports_events: 'Eventos esportivos',
  feedback_pending: 'Sem feedback nesta revisão',
  fit_failure: 'Falha na importação FIT',
  analysis_failure: 'Falha na análise',
  sync_failure: 'Falha de sincronização',
  connection_failure: 'Conexão requer atenção',
};
export interface MonitoringItem {
  id: string;
  athleteId: string;
  athleteName: string;
  kind: string;
  state: 'active' | 'resolved';
  version: number;
  read: boolean;
  occurredAt: string;
  updatedAt: string;
  timeBasis: string;
  inputRevision: number | null;
  eventCount: number;
  recovering: boolean;
  isSynthetic: boolean;
  href: string;
}
export interface MonitoringList {
  items: MonitoringItem[];
  total: number;
  unread: number;
  pending: number;
  page: number;
  limit: number;
  filters: {
    type?: string;
    athleteId?: string;
    from: string;
    to: string;
    read: string;
    state: string;
  };
  queriedAt: string;
}
export interface AthleteOptions {
  items: { id: string; name: string }[];
  selected: { id: string; name: string } | null;
}
