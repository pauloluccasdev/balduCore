import Link from 'next/link';
import { requireCoach, serverApi } from '../../../lib/server-auth';
import { Badge, MetricCard } from '../../../components/ui';
import { ThemeToggle } from '../../../components/theme-toggle';
import { ActivityTable } from '../../../features/activities/activity-table';
import {
  type ActivityList,
  sports,
  sources,
  formatNumber,
} from '../../../features/activities/types';
export default async function Activities({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireCoach();
  const params = await searchParams;
  const get = (name: string) =>
    typeof params[name] === 'string' ? (params[name] as string) : '';
  const query = new URLSearchParams();
  for (const key of [
    'q',
    'athleteId',
    'sport',
    'source',
    'from',
    'to',
    'status',
    'page',
  ])
    if (get(key)) query.set(key, get(key));
  const response = await serverApi(`/activities?${query}`);
  const data: ActivityList = response.ok
    ? await response.json()
    : {
        items: [],
        total: 0,
        page: 1,
        limit: 20,
        stats: {
          distanceMeters: null,
          durationSeconds: null,
          distanceCount: 0,
          durationCount: 0,
        },
      };
  const pageHref = (page: number) => {
    const next = new URLSearchParams(query);
    next.set('page', String(page));
    return `/atividades?${next}`;
  };
  return (
    <main id="dashboard" className="main-content">
      <header className="page-header">
        <div>
          <p className="eyebrow">ACOMPANHAMENTO ESPORTIVO</p>
          <h1>Atividades dos Alunos</h1>
          <p className="subtitle">
            Histórico, métricas e dados recebidos em um só lugar.
          </p>
        </div>
        <ThemeToggle />
      </header>
      <div className="demo-banner">
        <Badge tone="warning">Ambiente demonstrativo</Badge> Garmin simulado e
        arquivos FIT de teste. Não representa sincronização oficial.
      </div>
      <section
        className="metrics-grid activity-metrics"
        aria-label="Indicadores do histórico filtrado"
      >
        <MetricCard label="Atividades" description="Resultado dos filtros">
          {data.total}
        </MetricCard>
        <MetricCard
          label="Distância disponível"
          description={`${data.stats.distanceCount} atividades com distância`}
        >
          {formatNumber(data.stats.distanceMeters, ' km', 1000)}
        </MetricCard>
        <MetricCard
          label="Tempo disponível"
          description={`${data.stats.durationCount} atividades com duração`}
        >
          {formatNumber(data.stats.durationSeconds, ' min', 60)}
        </MetricCard>
        <MetricCard
          label="Nesta página"
          description="Paginação de até 20 atividades"
        >
          {data.items.length}
        </MetricCard>
      </section>
      <form className="activity-filters" method="get">
        <label>
          Buscar aluno
          <input
            name="q"
            defaultValue={get('q')}
            placeholder="Nome do aluno"
            maxLength={120}
          />
        </label>
        {get('athleteId') && (
          <input type="hidden" name="athleteId" value={get('athleteId')} />
        )}
        <label>
          Modalidade
          <select name="sport" defaultValue={get('sport')}>
            <option value="">Todas</option>
            {Object.entries(sports).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Origem
          <select name="source" defaultValue={get('source')}>
            <option value="">Todas</option>
            {Object.entries(sources).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Dados
          <select name="status" defaultValue={get('status')}>
            <option value="">Todos</option>
            <option value="with_samples">Com amostras</option>
            <option value="summary_only">Somente resumo</option>
          </select>
        </label>
        <label>
          De (UTC)
          <input name="from" type="date" defaultValue={get('from')} />
        </label>
        <label>
          Até (UTC)
          <input name="to" type="date" defaultValue={get('to')} />
        </label>
        <button className="button primary-button">Filtrar</button>
        <Link className="button" href="/atividades">
          Limpar
        </Link>
      </form>
      {!response.ok ? (
        <p role="alert">
          {response.status === 400
            ? 'Filtros inválidos. Revise o período e os valores.'
            : 'Não foi possível carregar atividades. Tente novamente.'}
        </p>
      ) : (
        <>
          <ActivityTable key={query.toString()} items={data.items} />
          <nav className="pagination" aria-label="Paginação de atividades">
            {data.page > 1 && (
              <Link className="button" href={pageHref(data.page - 1)}>
                Anterior
              </Link>
            )}
            <span>Página {data.page}</span>
            {data.page * data.limit < data.total && (
              <Link className="button" href={pageHref(data.page + 1)}>
                Próxima
              </Link>
            )}
          </nav>
        </>
      )}
    </main>
  );
}
