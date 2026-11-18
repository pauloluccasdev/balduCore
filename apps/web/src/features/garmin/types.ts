export const garminLabels = {
  not_connected: 'Não conectada',
  awaiting_authorization: 'Aguardando autorização',
  connected: 'Conectada · simulação',
  error: 'Erro de autorização',
  disconnected: 'Desconectada',
};
export type GarminStatus = keyof typeof garminLabels;
export type GarminSnapshot = {
  enabled: boolean;
  status: GarminStatus;
  revocationStatus: string;
  lastReceivedAt: string | null;
  lastSyncedAt: string | null;
  lastError: string | null;
  activityCount: number;
  workerOnline: boolean;
  isSynthetic: boolean;
  events: {
    id: string;
    kind: string;
    status: string;
    attempts: number;
    errorCode: string | null;
    createdAt: string;
  }[];
};
