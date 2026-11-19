'use client';
import { useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Clock3, PlugZap, Sparkles } from 'lucide-react';
import { ThemeToggle } from '../../components/theme-toggle';
import { Badge, Card, MetricCard } from '../../components/ui';
import { sports, sources, formatNumber } from '../activities/types';
import { labels as monitoringLabels } from '../monitoring/types';
import {
  type DashboardData,
  analysisStatuses,
  relationshipLabels,
  garminLabels,
} from './types';
export function Dashboard({
  initial,
  initialError,
  coachName,
  query,
}: {
  initial: DashboardData | null;
  initialError: string;
  coachName: string;
  query: string;
}) {
  const [data, setData] = useState(initial);
  const [error, setError] = useState(initialError);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const filters = data?.filters ?? {
    period: [7, 30, 90].includes(
      Number(new URLSearchParams(query).get('period')),
    )
      ? Number(new URLSearchParams(query).get('period'))
      : 30,
    sport: new URLSearchParams(query).get('sport') ?? undefined,
    from: '',
    to: '',
  };
  const selected = new URLSearchParams();
  if (filters.from) selected.set('from', filters.from);
  if (filters.to) selected.set('to', filters.to);
  const central = `/monitoramento?${selected}&state=active`;
  if (filters.sport) selected.set('sport', filters.sport);
  const initials = coachName
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
  async function refresh() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch(`/api/dashboard?${query}`, {
        cache: 'no-store',
      });
      if (response.status === 401) {
        setData(null);
        window.location.assign('/login');
        return;
      }
      if (!response.ok)
        throw new Error(
          response.status === 400
            ? 'Filtros inválidos. Escolha 7, 30 ou 90 dias e uma modalidade válida.'
            : 'Não foi possível atualizar o dashboard. Tente novamente.',
        );
      setData(await response.json());
      setMessage('Dashboard atualizado.');
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="app-shell">
      <main className="main-content" id="dashboard" tabIndex={-1}>
        <header className="page-header">
          <div>
            <p className="eyebrow">VISÃO GERAL</p>
            <h1>Dashboard</h1>
            <p className="subtitle">
              Seus alunos, atividades e pontos de atenção em um só lugar.
            </p>
          </div>
          <div className="header-actions">
            <form className="dashboard-filter" method="get">
              <div
                className="period-switch"
                role="group"
                aria-label="Período das atividades"
              >
                {[7, 30, 90].map((period) => (
                  <button
                    type="submit"
                    name="period"
                    value={period}
                    key={period}
                    aria-pressed={filters.period === period}
                  >
                    {period} dias
                  </button>
                ))}
              </div>
              <label>
                Modalidade
                <select name="sport" defaultValue={filters.sport ?? ''}>
                  <option value="">Todas as modalidades</option>
                  {Object.entries(sports).map(([key, label]) => (
                    <option value={key} key={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="submit"
                name="period"
                value={filters.period}
                className="button"
              >
                Aplicar modalidade
              </button>
            </form>
            <ThemeToggle />
            <span
              className="coach-avatar"
              aria-label={`Treinador: ${coachName}`}
            >
              {initials || 'CO'}
            </span>
          </div>
        </header>
        <div className="demo-banner" role="note">
          <PlugZap size={18} aria-hidden="true" />
          <div>
            <strong>Integração Garmin oficial indisponível</strong>
            <span>
              Indicadores calculados sobre registros persistidos autorizados.
              Conexões simuladas e atividades sintéticas estão identificadas.
            </span>
          </div>
          <Badge tone="warning">IA adiada</Badge>
        </div>
        <div className="dashboard-refresh">
          <button
            className="button"
            type="button"
            onClick={() => void refresh()}
            disabled={busy}
          >
            {busy ? 'Atualizando…' : 'Atualizar dashboard'}
          </button>
          {data && (
            <span className="muted small">
              Consulta de{' '}
              {new Date(data.generatedAt).toLocaleString('pt-BR', {
                timeZone: 'UTC',
              })}{' '}
              UTC
            </span>
          )}
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
            {data &&
              ' Abaixo está a última consulta bem-sucedida; os indicadores não foram atualizados.'}
          </p>
        )}
        <p role="status" aria-live="polite">
          {message}
        </p>
        {data ? (
          <>
            <div className="metrics-grid">
              <MetricCard
                label="Total de alunos"
                description="Fotografia cadastral atual"
              >
                <span data-testid="dashboard-athletes">
                  {data.athletes.total}
                </span>
                <p className="muted small">
                  {data.athletes.statuses.active ?? 0} ativos ·{' '}
                  {data.athletes.statuses.pending ?? 0} pendentes ·{' '}
                  {data.athletes.statuses.ended ?? 0} encerrados
                  {data.athletes.withoutRelationship
                    ? ` · ${data.athletes.withoutRelationship} sem vínculo`
                    : ''}
                </p>
              </MetricCard>
              <MetricCard
                label="Conectados à Garmin"
                description="Estado local atual; somente vínculos elegíveis"
              >
                <span data-testid="dashboard-connected">
                  {data.connections.connected}
                </span>{' '}
                <small>de {data.connections.eligible}</small>
                <p className="muted small">
                  {data.connections.simulated} simulação ·{' '}
                  {data.connections.nonsynthetic} não sintéticos
                </p>
              </MetricCard>
              <MetricCard
                label="Atividades recentes"
                description={`Início nos últimos ${filters.period} dias UTC`}
              >
                <span data-testid="dashboard-activities">
                  {data.activities.total}
                </span>
                <p className="muted small">
                  {data.activities.synthetic} sintéticas ·{' '}
                  {data.activities.real} não sintéticas
                </p>
              </MetricCard>
              <MetricCard
                label="Volume por modalidade"
                description="Distância disponível; não estima dados ausentes"
              >
                <dl className="sport-volumes dashboard-volume">
                  {Object.entries(sports)
                    .filter(
                      ([key]) =>
                        ['running', 'cycling', 'swimming'].includes(key) ||
                        data.volumes.some((v) => v.sport === key),
                    )
                    .map(([key, label]) => {
                      const groups = data.volumes.filter(
                        (v) => v.sport === key,
                      );
                      return (
                        <div key={key}>
                          <dt>{label}</dt>
                          <dd>
                            {groups.length ? (
                              groups.map((group) => (
                                <span
                                  className="dashboard-volume-value"
                                  key={String(group.isSynthetic)}
                                >
                                  {formatNumber(
                                    group.distanceMeters,
                                    key === 'swimming' ? ' m' : ' km',
                                    key === 'swimming' ? 1 : 1000,
                                  )}
                                  <small className="muted">
                                    {group.isSynthetic
                                      ? 'Sintético'
                                      : 'Não sintético'}{' '}
                                    · {group.known}/{group.total} com distância
                                    {group.missing
                                      ? ` · ${group.missing} ausente(s)`
                                      : ''}
                                  </small>
                                </span>
                              ))
                            ) : (
                              <span>
                                —<small className="muted">Sem atividades</small>
                              </span>
                            )}
                          </dd>
                        </div>
                      );
                    })}
                </dl>
              </MetricCard>
              <MetricCard
                label="Merecem atenção"
                description="Atividades distintas com eventos na análise atual"
              >
                <span className="text-accent" data-testid="dashboard-attention">
                  {data.attention.total ?? '—'}
                </span>
                <p className="muted small">
                  {data.attention.coverage.completed}/{data.activities.total}{' '}
                  com análise atual · {data.attention.coverage.missing} sem
                  análise concluída
                  {data.attention.coverage.invalid
                    ? ` · ${data.attention.coverage.invalid} indisponível(is)`
                    : ''}
                </p>
              </MetricCard>
            </div>
            <div className="dashboard-grid">
              <Card
                title="Atividades que merecem atenção"
                aside={
                  <Link
                    className="small"
                    href={`/analise-esportiva?${selected}`}
                  >
                    Ver análises →
                  </Link>
                }
                className="attention-card"
              >
                {data.attention.status === 'unavailable' ? (
                  <p role="status">
                    Resumo de eventos indisponível: há dados de análise
                    inválidos. Os indicadores básicos continuam disponíveis.
                  </p>
                ) : !data.attention.items.length ? (
                  <div className="empty-state">
                    <h3>Nenhum evento disponível neste recorte</h3>
                    <p>
                      Ausência de análise concluída não confirma ausência de
                      eventos esportivos.
                    </p>
                  </div>
                ) : (
                  <div className="attention-list">
                    {data.attention.items.map((a) => (
                      <article key={a.id}>
                        <div>
                          <h3>
                            {a.athleteName}{' '}
                            <span>· {sports[a.sport] ?? a.sport}</span>
                          </h3>
                          <p>
                            {new Date(a.startedAt).toLocaleString('pt-BR', {
                              timeZone: 'UTC',
                            })}{' '}
                            UTC · {a.eventCount} evento(s) determinístico(s)
                          </p>
                          <Badge>
                            {a.isSynthetic
                              ? 'Dados sintéticos'
                              : 'Dados não sintéticos'}
                          </Badge>
                        </div>
                        <Link
                          className="button"
                          href={`/analise-esportiva/${a.id}`}
                        >
                          Analisar <ArrowUpRight size={14} aria-hidden="true" />
                        </Link>
                      </article>
                    ))}
                  </div>
                )}
                <p className="section-footnote">
                  Até {data.attention.limit} atividades. Eventos não confirmam
                  causa ou diagnóstico.
                </p>
                <section
                  className="dashboard-pending"
                  aria-label="Pendências operacionais"
                >
                  <h3>
                    Pendências de acompanhamento ·{' '}
                    <span data-testid="dashboard-pending">
                      {data.monitoring.total}
                    </span>
                  </h3>
                  <p className="muted small">
                    Por atualização do item no período; sem filtro de
                    modalidade.
                  </p>
                  {!data.monitoring.items.length ? (
                    <p>Nenhuma pendência disponível neste período.</p>
                  ) : (
                    <ul>
                      {data.monitoring.items.map((item) => (
                        <li key={item.id}>
                          <Link href={item.href}>
                            {item.athleteName} · {monitoringLabels[item.kind]}
                          </Link>
                          {item.recovering && (
                            <span className="muted small">
                              {' '}
                              · recuperação em andamento
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                  <Link className="button" href={central}>
                    Ver central de monitoramento →
                  </Link>
                </section>
              </Card>
              <Card
                title="Insights relevantes"
                aside={<Badge>IA adiada</Badge>}
              >
                <div className="empty-state">
                  <Sparkles size={24} aria-hidden="true" />
                  <h3>Interpretação por IA adiada</h3>
                  <p>
                    O assistente e os insights por IA serão adicionados em uma
                    próxima etapa. Os eventos disponíveis são calculados por
                    regras determinísticas e podem ser investigados na análise.
                  </p>
                </div>
              </Card>
              <Card
                title="Atividades recentes"
                aside={
                  <Link className="small" href={`/atividades?${selected}`}>
                    Ver histórico →
                  </Link>
                }
                className="activities-card"
              >
                {!data.activities.items.length ? (
                  <div className="empty-state">
                    <h3>Nenhuma atividade neste período</h3>
                    <p>
                      Atividades publicadas aparecem com vínculo ativo e aceites
                      vigentes. Ajuste os filtros ou consulte seus alunos.
                    </p>
                    <Link className="button" href="/alunos">
                      Ver alunos
                    </Link>
                  </div>
                ) : (
                  <div
                    className="table-scroll"
                    role="region"
                    aria-label="Atividades persistidas recentes"
                    tabIndex={0}
                  >
                    <table>
                      <caption className="sr-only">
                        Atividades autorizadas no período selecionado
                      </caption>
                      <thead>
                        <tr>
                          <th scope="col">Aluno</th>
                          <th scope="col">Atividade / origem</th>
                          <th scope="col">Data UTC</th>
                          <th scope="col">Distância</th>
                          <th scope="col">Análise atual</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.activities.items.map((a) => (
                          <tr key={a.id}>
                            <td>
                              <Link href={`/alunos/${a.athleteId}`}>
                                {a.athleteName}
                              </Link>
                            </td>
                            <td>
                              <Link href={`/atividades/${a.id}`}>
                                <strong>{sports[a.sport] ?? a.sport}</strong>
                              </Link>
                              <p className="muted small">
                                {sources[a.source] ?? 'Origem registrada'} ·{' '}
                                {a.isSynthetic ? 'sintética' : 'não sintética'}
                              </p>
                            </td>
                            <td>
                              {new Date(a.startedAt).toLocaleString('pt-BR', {
                                timeZone: 'UTC',
                              })}
                            </td>
                            <td>
                              {formatNumber(
                                a.distanceMeters,
                                a.sport === 'swimming' ? ' m' : ' km',
                                a.sport === 'swimming' ? 1 : 1000,
                              )}
                            </td>
                            <td>
                              <Link href={`/analise-esportiva/${a.id}`}>
                                {analysisStatuses[a.analysisStatus] ??
                                  'Indisponível'}{' '}
                                →
                              </Link>
                              <Link
                                className="small dashboard-feedback-link"
                                href={`/atividades/${a.id}/feedback`}
                              >
                                Feedback →
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <p className="section-footnote">
                  Mostrando até {data.activities.limit} de{' '}
                  {data.activities.total} atividades · {filters.from} a{' '}
                  {filters.to} UTC.
                </p>
              </Card>
              <Card title="Resumo do planejamento" aside={<Badge>MVP 2</Badge>}>
                <div className="empty-state">
                  <span className="empty-icon">
                    <Clock3 size={22} aria-hidden="true" />
                  </span>
                  <h3>O próximo passo do acompanhamento</h3>
                  <p>
                    Prescrição de treinos estruturados e envio ao ecossistema
                    Garmin estão previstos para o MVP 2, sujeitos ao acesso
                    oficial.
                  </p>
                </div>
                <button className="button" disabled>
                  Criar treino · em breve
                </button>
              </Card>
            </div>
            <Card
              title="Alunos e status"
              aside={
                <Link className="small" href="/alunos">
                  Ver todos os alunos →
                </Link>
              }
              className="athletes-card"
            >
              {!data.athletes.items.length ? (
                <div className="empty-state">
                  <h3>Nenhum aluno cadastrado</h3>
                  <Link className="button" href="/alunos">
                    Cadastrar aluno
                  </Link>
                </div>
              ) : (
                <div className="athlete-grid">
                  {data.athletes.items.map((a) => (
                    <article className="athlete-tile" key={a.id}>
                      <h3>
                        <Link href={`/alunos/${a.id}`}>{a.name}</Link>
                      </h3>
                      <p>
                        Vínculo:{' '}
                        <span>
                          {a.relationshipStatus
                            ? relationshipLabels[a.relationshipStatus]
                            : 'Sem vínculo'}
                        </span>
                      </p>
                      <p>
                        Garmin:{' '}
                        <span>
                          {a.garmin
                            ? garminLabels[a.garmin.status]
                            : 'Indisponível para este vínculo'}
                        </span>
                      </p>
                      {a.garmin?.isSynthetic && <Badge>Simulação</Badge>}
                      {a.garmin && (
                        <p className="muted small">
                          {a.garmin.lastSyncedAt
                            ? `Última sincronização local: ${new Date(a.garmin.lastSyncedAt).toLocaleString('pt-BR', { timeZone: 'UTC' })} UTC`
                            : 'Sem sincronização registrada'}
                        </p>
                      )}
                    </article>
                  ))}
                </div>
              )}
              <p className="section-footnote">
                Até {data.athletes.limit} cadastros recentes. Vínculo e Garmin
                são estados independentes; fotografia atual.
              </p>
            </Card>
          </>
        ) : (
          <Card title="Dashboard indisponível">
            <p>
              Não foi possível obter um snapshot dos indicadores. Revise os
              filtros ou tente atualizar novamente.
            </p>
          </Card>
        )}
        <footer className="page-footer">
          <span>BalduTraining / BalduCore</span>
          <span>IA adiada · Planejamento futuro</span>
        </footer>
      </main>
    </div>
  );
}
