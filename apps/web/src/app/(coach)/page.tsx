import { requireCoach, serverApi } from '../../lib/server-auth';
import { Dashboard } from '../../features/dashboard/dashboard';
import type { DashboardData } from '../../features/dashboard/types';
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireCoach();
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const key of ['period', 'sport'])
    if (typeof params[key] === 'string' && params[key])
      query.set(key, params[key]);
  const response = await serverApi(`/dashboard?${query}`);
  const initial: DashboardData | null = response.ok
    ? await response.json()
    : null;
  const error = response.ok
    ? ''
    : response.status === 400
      ? 'Filtros inválidos. Escolha 7, 30 ou 90 dias e uma modalidade válida.'
      : 'Não foi possível carregar o dashboard. Tente novamente.';
  return (
    <Dashboard
      key={query.toString()}
      initial={initial}
      initialError={error}
      coachName={session.coach.name}
      query={query.toString()}
    />
  );
}
