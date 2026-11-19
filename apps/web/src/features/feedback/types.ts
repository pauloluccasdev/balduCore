import type { AnalysisEvent } from '../analysis/types';
export type PointScope =
  { kind: 'whole' } | { kind: 'time' | 'distance'; from: number; to: number };
export const categories = {
  walk: 'Caminhada',
  stop: 'Parada',
  hydration: 'Hidratação',
  nutrition: 'Alimentação',
  climb: 'Subida',
  discomfort: 'Desconforto',
  pace: 'Alteração de ritmo percebida',
  other: 'Outro',
};
export const origins = {
  coach_observation: 'Observado pelo treinador',
  athlete_report: 'Informado pelo aluno',
};
export const verdictLabels = {
  correct: 'Correto',
  partial: 'Parcialmente correto',
  incorrect: 'Incorreto',
};
export interface FeedbackContent {
  execution: string;
  observations: string;
  decisions: string;
  points: {
    id: string;
    category: keyof typeof categories;
    source: keyof typeof origins;
    note: string;
    scope: PointScope;
  }[];
  verdicts: { eventId: string; verdict: keyof typeof verdictLabels }[];
}
export interface Revision {
  version: number;
  createdAt: string;
  coachId: string;
  authorName?: string;
  inputRevision: number;
  inputHash: string;
  analysisId: string | null;
  content: FeedbackContent;
}
export interface FeedbackWorkspace {
  activity: {
    id: string;
    athleteId: string;
    athleteName: string;
    sport: string;
    startedAt: string;
    source: string;
    isSynthetic: boolean;
    revision: number;
    dataHash: string;
    distanceMeters: number | null;
    durationSeconds: number | null;
    durationBasis: string;
    paceSecondsPerKm: number | null;
    avgHeartRateBpm: number | null;
  };
  version: number;
  current: Revision | null;
  content: FeedbackContent;
  obsolete: boolean;
  analysis: {
    id: string | null;
    status: string;
    version: string;
    summary: string | null;
    events: AnalysisEvent[];
    total: number;
    page: number;
    limit: number;
  };
}
export interface History {
  items: Omit<Revision, 'content'>[];
  total: number;
  page: number;
  limit: number;
}
export const scopeLabel = (scope: PointScope) =>
  scope.kind === 'whole'
    ? 'Atividade inteira'
    : `${scope.from}–${scope.to} ${scope.kind === 'time' ? 's decorridos' : 'm'}`;
