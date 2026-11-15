// Fixtures inteiramente sintéticas. Nenhuma conta, atividade ou conexão real.
export const demoDate = new Date('2026-11-15T12:00:00Z');
export const athletes = [
  { name: 'Atleta de referência', status: 'Não conectada', tone: 'neutral' },
  { name: 'Camila D.', status: 'Conectada (simulação)', tone: 'success' },
  { name: 'Bruno L.', status: 'Aguardando autorização', tone: 'warning' },
  { name: 'Marina S.', status: 'Conectada (simulação)', tone: 'success' },
  { name: 'Thiago P.', status: 'Erro (simulação)', tone: 'danger' },
] as const;
export const demoActivities = [
  {
    id: 'demo-1',
    athlete: 'Atleta de referência',
    name: 'Prova de 30 km',
    date: '2026-11-13',
    sport: 'Corrida',
    distance: 30060,
    status: 'Analisada',
    attention: 'Variação de ritmo nos KM 11–12 e 26.',
  },
  {
    id: 'demo-2',
    athlete: 'Camila D.',
    name: 'Corrida leve',
    date: '2026-11-12',
    sport: 'Corrida',
    distance: 8000,
    status: 'Analisada',
    attention: null,
  },
  {
    id: 'demo-3',
    athlete: 'Bruno L.',
    name: 'Pedal de base',
    date: '2026-11-11',
    sport: 'Ciclismo',
    distance: 42000,
    status: 'Em análise',
    attention: null,
  },
  {
    id: 'demo-4',
    athlete: 'Marina S.',
    name: 'Natação técnica',
    date: '2026-11-10',
    sport: 'Natação',
    distance: 1500,
    status: 'Analisada',
    attention: null,
  },
  {
    id: 'demo-5',
    athlete: 'Camila D.',
    name: 'Intervalado',
    date: '2026-11-03',
    sport: 'Corrida',
    distance: 10000,
    status: 'Analisada',
    attention: 'Variação de ritmo no KM 6.',
  },
  {
    id: 'demo-6',
    athlete: 'Thiago P.',
    name: 'Corrida de base',
    date: '2026-10-30',
    sport: 'Corrida',
    distance: 18000,
    status: 'Analisada',
    attention: null,
  },
  {
    id: 'demo-7',
    athlete: 'Bruno L.',
    name: 'Pedal longo',
    date: '2026-10-25',
    sport: 'Ciclismo',
    distance: 55000,
    status: 'Analisada',
    attention: null,
  },
  {
    id: 'demo-8',
    athlete: 'Marina S.',
    name: 'Corrida contínua',
    date: '2026-10-20',
    sport: 'Corrida',
    distance: 6000,
    status: 'Analisada',
    attention: null,
  },
] as const;
export function activitiesForPeriod(days: number) {
  const cutoff = demoDate.getTime() - days * 86_400_000;
  return demoActivities.filter(
    (activity) => new Date(`${activity.date}T12:00:00Z`).getTime() >= cutoff,
  );
}
export function formatDistance(meters: number, sport: string) {
  return sport === 'Natação'
    ? `${meters.toLocaleString('pt-BR')} m`
    : `${(meters / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} km`;
}
