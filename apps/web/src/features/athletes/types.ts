export interface Athlete {
  id: string;
  name: string;
  email: string;
  version: number;
  relationship: {
    status: 'pending' | 'active' | 'ended';
    garminConnection?: {
      status: import('../garmin/types').GarminStatus;
      isSynthetic: boolean;
    } | null;
  } | null;
}
export const statusLabel = {
  pending: 'Pendente',
  active: 'Ativo',
  ended: 'Encerrado',
};
