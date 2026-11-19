import { requireCoach, serverApi } from '../../../lib/server-auth';
import { MonitoringWorkspace } from '../../../features/monitoring/workspace';
import type {
  MonitoringList,
  AthleteOptions,
} from '../../../features/monitoring/types';
export default async function Monitoring({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireCoach();
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const key of [
    'athleteId',
    'type',
    'from',
    'to',
    'read',
    'state',
    'page',
  ])
    if (typeof params[key] === 'string' && params[key])
      query.set(key, params[key]);
  const selected = query.get('athleteId');
  const [response, athletesResponse] = await Promise.all([
    serverApi(`/monitoring?${query}`),
    serverApi(
      `/monitoring/athletes${selected ? `?selected=${encodeURIComponent(selected)}` : ''}`,
    ),
  ]);
  const initial: MonitoringList | null = response.ok
    ? await response.json()
    : null;
  const failure = response.ok
    ? ''
    : response.status === 400
      ? 'Filtros inválidos. Escolha um período de até 90 dias e valores válidos.'
      : 'Não foi possível carregar a central. Tente novamente.';
  const options: AthleteOptions = athletesResponse.ok
    ? await athletesResponse.json()
    : { items: [], selected: null };
  return (
    <MonitoringWorkspace
      key={query.toString()}
      initial={initial}
      initialError={failure}
      options={options}
      query={query.toString()}
    />
  );
}
