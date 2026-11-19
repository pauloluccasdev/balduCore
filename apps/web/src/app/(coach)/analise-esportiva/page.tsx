import Link from 'next/link';
import { requireCoach, serverApi } from '../../../lib/server-auth';
import { Card, Badge } from '../../../components/ui';
import { ThemeToggle } from '../../../components/theme-toggle';
import {
  type ActivityList,
  sports,
  sources,
  formatNumber,
} from '../../../features/activities/types';
export default async function AnalysisIndex({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireCoach();
  const params = await searchParams;
  const value = (key: string) =>
    typeof params[key] === 'string' ? (params[key] as string) : '';
  const query = new URLSearchParams();
  for (const key of ['q', 'athleteId', 'page', 'from', 'to', 'sport'])
    if (value(key)) query.set(key, value(key));
  const response = await serverApi(`/activities?${query}`);
  const data: ActivityList | null = response.ok ? await response.json() : null;
  const href = (page: number) => {
    const next = new URLSearchParams(query);
    next.set('page', String(page));
    return `/analise-esportiva?${next}`;
  };
  return (
    <main id="dashboard" className="main-content" tabIndex={-1}>
      <header className="page-header">
        <div>
          <h1>Análise esportiva</h1>
          <p className="subtitle">
            Escolha uma atividade para investigar métricas, trechos e eventos.
          </p>
        </div>
        <ThemeToggle />
      </header>
      <form className="activity-filters" method="get">
        <label>
          Buscar aluno
          <input name="q" defaultValue={value('q')} maxLength={120} />
        </label>
        {value('athleteId') && (
          <input type="hidden" name="athleteId" value={value('athleteId')} />
        )}
        {['from', 'to', 'sport'].map((key) =>
          value(key) ? (
            <input key={key} type="hidden" name={key} value={value(key)} />
          ) : null,
        )}
        <button className="button primary-button">Buscar atividades</button>
        <Link className="button" href="/analise-esportiva">
          Limpar
        </Link>
      </form>
      {(value('from') || value('to') || value('sport')) && (
        <p className="muted small">
          Recorte: {value('from') || 'início livre'} a{' '}
          {value('to') || 'fim livre'} UTC ·{' '}
          {sports[value('sport')] ?? 'Todas as modalidades'}
        </p>
      )}
      <Card
        title="Atividades disponíveis"
        aside={<Badge>{data?.total ?? 0} atividades</Badge>}
      >
        {!data ? (
          <p role="alert">
            Não foi possível carregar atividades. Revise os filtros e tente
            novamente.
          </p>
        ) : !data.items.length ? (
          <div className="empty-state">
            <p>
              Nenhuma atividade disponível para análise com os filtros e
              vínculos atuais.
            </p>
            <Link className="button" href="/alunos">
              Consultar alunos
            </Link>
          </div>
        ) : (
          <div
            className="table-scroll activities-scroll"
            tabIndex={0}
            role="region"
            aria-label="Atividades disponíveis para análise"
          >
            <table>
              <thead>
                <tr>
                  <th>Aluno</th>
                  <th>Modalidade / origem</th>
                  <th>Data UTC</th>
                  <th>Distância</th>
                  <th>Análise</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((activity) => (
                  <tr key={activity.id}>
                    <td>{activity.athleteName}</td>
                    <td>
                      {sports[activity.sport]} · {sources[activity.source]}
                    </td>
                    <td>
                      {new Date(activity.startedAt).toLocaleString('pt-BR', {
                        timeZone: 'UTC',
                      })}
                    </td>
                    <td>
                      {formatNumber(activity.distanceMeters, ' km', 1000)}
                    </td>
                    <td>
                      <Link href={`/analise-esportiva/${activity.id}`}>
                        Analisar atividade →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {data && (
        <nav
          className="pagination"
          aria-label="Paginação de atividades para análise"
        >
          {data.page > 1 && (
            <Link className="button" href={href(data.page - 1)}>
              Anterior
            </Link>
          )}
          <span>Página {data.page}</span>
          {data.page * data.limit < data.total && (
            <Link className="button" href={href(data.page + 1)}>
              Próxima
            </Link>
          )}
        </nav>
      )}
    </main>
  );
}
