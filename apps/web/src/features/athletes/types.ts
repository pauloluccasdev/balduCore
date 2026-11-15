export interface Athlete {
  id: string;
  name: string;
  email: string;
  version: number;
  relationship: { status: 'pending' | 'active' | 'ended' } | null;
}
export const statusLabel = {
  pending: 'Pendente',
  active: 'Ativo',
  ended: 'Encerrado',
};
