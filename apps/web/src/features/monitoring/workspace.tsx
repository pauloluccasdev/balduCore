'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Card, MetricCard, Badge } from '../../components/ui';
import { ThemeToggle } from '../../components/theme-toggle';
import { mutate } from '../../lib/client-api';
import { AthleteFilter } from './athlete-filter';
import { labels, type AthleteOptions, type MonitoringList } from './types';
export function MonitoringWorkspace({
  initial,
  initialError,
  options,
  query,
}: {
  initial: MonitoringList | null;
  initialError: string;
  options: AthleteOptions;
  query: string;
}) {
  const [data, setData] = useState(initial);
  const [error, setError] = useState(initialError);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const filters =
    data?.filters ?? Object.fromEntries(new URLSearchParams(query));
  const pageHref = (page: number) => {
    const next = new URLSearchParams(query);
    next.set('page', String(page));
    return `/monitoramento?${next}`;
  };
  async function refresh() {
    const response = await fetch(`/api/monitoring?${query}`, {
      cache: 'no-store',
    });
    if (response.status === 401) {
      setData(null);
      window.location.assign('/login');
      throw new Error('Sua sessão expirou. Entre novamente.');
    }
    if (!response.ok) {
      const result = await response.json().catch(() => null);
      throw new Error(
        result?.message ??
          'Não foi possível atualizar a central. Tente novamente.',
      );
    }
    setData(await response.json());
  }
  async function update() {
    setBusy('refresh');
    setError('');
    setMessage('');
    try {
      await refresh();
      setMessage('Central atualizada.');
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(null);
    }
  }
  async function mark(id: string, version: number, read: boolean) {
    setBusy(id);
    setError('');
    setMessage('');
    try {
      await mutate(`/monitoring/${id}/read`, 'PATCH', {
        expectedVersion: version,
        read,
      });
      try {
        await refresh();
        setMessage(
          read ? 'Item marcado como lido.' : 'Item marcado como não lido.',
        );
      } catch {
        setError(
          'Marcação salva, mas a lista não pôde ser atualizada. Use Atualizar central.',
        );
      }
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(null);
    }
  }
  return (
    <main id="dashboard" className="main-content">
      <header className="page-header">
        <div>
          <p className="eyebrow">ACOMPANHAMENTO ESPORTIVO</p>
          <h1>Central de Monitoramento</h1>
          <p className="subtitle">
            Atividades, análises e pendências que merecem sua atenção.
          </p>
        </div>
        <ThemeToggle />
      </header>
      <p className="muted small">
        Leitura não significa resolução. Eventos esportivos são observações
        determinísticas, sem causa ou diagnóstico atribuídos.
      </p>
      <form className="activity-filters monitoring-filters" method="get">
        <AthleteFilter
          initial={options}
          selectedId={filters.athleteId ?? ''}
          refreshToken={data?.queriedAt ?? ''}
        />
        <label>
          Categoria
          <select name="type" defaultValue={filters.type ?? ''}>
            <option value="">Todas as categorias</option>
            {Object.entries(labels).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Leitura
          <select name="read" defaultValue={filters.read ?? 'all'}>
            <option value="all">Todos</option>
            <option value="unread">Não lidos</option>
            <option value="read">Lidos</option>
          </select>
        </label>
        <label>
          Estado
          <select name="state" defaultValue={filters.state ?? 'all'}>
            <option value="all">Todos</option>
            <option value="active">Ativos</option>
            <option value="resolved">Resolvidos / contexto anterior</option>
          </select>
        </label>
        <label>
          De (UTC)
          <input type="date" name="from" defaultValue={filters.from ?? ''} />
        </label>
        <label>
          Até (UTC)
          <input type="date" name="to" defaultValue={filters.to ?? ''} />
        </label>
        <button type="submit" className="button primary">
          Aplicar filtros
        </button>
        <Link className="button" href="/monitoramento">
          Limpar filtros
        </Link>
      </form>
      <div className="monitoring-toolbar">
        <button
          className="button"
          type="button"
          disabled={busy !== null}
          onClick={() => void update()}
        >
          {busy === 'refresh' ? 'Atualizando…' : 'Atualizar central'}
        </button>
        {data && (
          <span className="muted small">
            Consultado em{' '}
            {new Date(data.queriedAt).toLocaleString('pt-BR', {
              timeZone: 'UTC',
            })}{' '}
            UTC · atualização manual
          </span>
        )}
      </div>
      <p role="status" aria-live="polite">
        {message || (busy ? 'Processando…' : '')}
      </p>
      {error && (
        <p role="alert" className="form-error">
          {error}
          {data &&
            ' Os dados abaixo correspondem à última consulta bem-sucedida.'}
        </p>
      )}
      {data ? (
        <>
          <section
            className="metrics-grid monitoring-metrics"
            aria-label="Indicadores da central filtrada"
          >
            <MetricCard label="Itens" description="Resultado dos filtros">
              {data.total}
            </MetricCard>
            <MetricCard label="Não lidos" description="Nos mesmos filtros">
              {data.unread}
            </MetricCard>
            <MetricCard
              label="Pendências ativas"
              description="Falhas e ausência de feedback"
            >
              {data.pending}
            </MetricCard>
          </section>
          <Card
            title="Acompanhamento do treinador"
            aside={<Badge>{data.items.length} nesta página</Badge>}
          >
            {!data.items.length ? (
              <div className="empty-state">
                <h3>Nenhum item nestes filtros</h3>
                <p>
                  Atividades e análises publicadas alimentam a central. Ajuste o
                  período ou os filtros; itens exigem acompanhamento ativo e
                  aceites válidos.
                </p>
                <Link className="button" href="/atividades">
                  Ver atividades
                </Link>
              </div>
            ) : (
              <div className="table-scroll">
                <table className="monitoring-table">
                  <thead>
                    <tr>
                      <th>Aluno / item</th>
                      <th>Atualização (UTC)</th>
                      <th>Estado / leitura</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((item) => (
                      <tr
                        key={item.id}
                        className={!item.read ? 'monitoring-unread' : ''}
                      >
                        <td>
                          <Link href={`/alunos/${item.athleteId}`}>
                            {item.athleteName}
                          </Link>
                          <strong className="monitoring-item-title">
                            {labels[item.kind]}
                          </strong>
                          {item.kind === 'sports_events' && (
                            <p className="muted small">
                              {item.eventCount} evento(s) agrupado(s); consulte
                              as evidências na análise.
                            </p>
                          )}
                          {item.inputRevision !== null && (
                            <p className="muted small">
                              Revisão da atividade: {item.inputRevision}
                            </p>
                          )}
                          {item.kind === 'feedback_pending' && (
                            <p className="muted small">
                              Um texto, ponto ou avaliação salvo no contexto
                              atual resolve esta pendência.
                            </p>
                          )}
                          {item.recovering && (
                            <Badge tone="warning">
                              Recuperação em andamento
                            </Badge>
                          )}
                          {item.isSynthetic && (
                            <Badge>Dados sintéticos de teste</Badge>
                          )}
                        </td>
                        <td>
                          {new Date(item.updatedAt).toLocaleString('pt-BR', {
                            timeZone: 'UTC',
                          })}
                          {item.timeBasis === 'reconstructed' && (
                            <p className="muted small">
                              Data da reconstrução; instante original não
                              disponível.
                            </p>
                          )}
                        </td>
                        <td>
                          <Badge
                            tone={
                              item.state === 'resolved'
                                ? 'success'
                                : item.kind.endsWith('_failure') ||
                                    item.kind === 'feedback_pending'
                                  ? 'warning'
                                  : 'neutral'
                            }
                          >
                            {item.state === 'resolved'
                              ? 'Resolvido / contexto anterior'
                              : 'Ativo'}
                          </Badge>
                          <p className="small">
                            {item.read ? 'Lido' : 'Não lido'}
                          </p>
                        </td>
                        <td>
                          <div className="monitoring-actions">
                            <Link className="button" href={item.href}>
                              {item.kind === 'feedback_pending'
                                ? 'Registrar feedback'
                                : item.kind === 'sports_events' ||
                                    item.kind === 'analysis_completed' ||
                                    item.kind === 'analysis_failure'
                                  ? 'Abrir análise'
                                  : item.kind === 'activity_available'
                                    ? 'Abrir atividade'
                                    : 'Ver conexão / processamento'}
                            </Link>
                            <button
                              className="button"
                              type="button"
                              disabled={busy !== null}
                              onClick={() =>
                                void mark(item.id, item.version, !item.read)
                              }
                              aria-label={`${item.read ? 'Marcar como não lido' : 'Marcar como lido'}: ${labels[item.kind]} de ${item.athleteName}`}
                            >
                              {busy === item.id
                                ? 'Salvando…'
                                : item.read
                                  ? 'Marcar não lido'
                                  : 'Marcar lido'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <nav className="pagination" aria-label="Páginas da central">
              {data.page > 1 && (
                <Link className="button" href={pageHref(data.page - 1)}>
                  Anterior
                </Link>
              )}
              <span>
                Página {data.page} · {data.total} itens
              </span>
              {data.page * 20 < data.total && (
                <Link className="button" href={pageHref(data.page + 1)}>
                  Próxima
                </Link>
              )}
            </nav>
          </Card>
        </>
      ) : (
        <Card title="Central indisponível">
          <p>
            A lista e os indicadores não foram carregados. Ajuste os filtros ou
            tente atualizar novamente.
          </p>
        </Card>
      )}
    </main>
  );
}
