'use client';
import { useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Card, Badge, MetricCard } from '../../components/ui';
import { ThemeToggle } from '../../components/theme-toggle';
import { mutate } from '../../lib/client-api';
import { sports, sources, formatNumber, formatPace } from '../activities/types';
import {
  type Workspace,
  type Selection,
  type Comparison,
  type AnalysisEvent,
  basisLabels,
  qualityLabels,
  eventLabels,
} from './types';
const Charts = dynamic(
  () => import('./charts').then((module) => module.Charts),
  { ssr: false, loading: () => <p role="status">Carregando gráficos…</p> },
);
const statusLabels: Record<string, string> = {
  not_requested: 'Ainda não solicitada',
  queued: 'Na fila',
  processing: 'Processando',
  retry: 'Aguardando nova tentativa',
  completed: 'Concluída',
  failed: 'Falhou',
  cancelled: 'Cancelada',
};
function SegmentCard({
  comparison,
  index,
}: {
  comparison: Comparison;
  index: number;
}) {
  const result = comparison.segments[index];
  return (
    <div className="segment-result">
      <h3>Trecho {index === 0 ? 'A' : 'B'}</h3>
      {!result.available ? (
        <p>Sem observações suficientes nesta seleção.</p>
      ) : (
        <>
          <p className="muted small">
            Limites efetivos:{' '}
            {formatNumber(
              result.actual
                ? result.actual.from +
                    (result.requested.kind === 'splits' ? 1 : 0)
                : null,
            )}{' '}
            →{' '}
            {formatNumber(
              result.actual
                ? result.actual.to +
                    (result.requested.kind === 'splits' ? 1 : 0)
                : null,
            )}{' '}
            (
            {result.requested.kind === 'time'
              ? 's'
              : result.requested.kind === 'distance'
                ? 'm'
                : 'split'}
            ).
          </p>
          <dl className="profile-status">
            <dt>Distância / tempo</dt>
            <dd>
              {formatNumber(result.distanceMeters ?? null, ' m')} /{' '}
              {formatNumber(result.durationSeconds ?? null, ' s')}
            </dd>
            <dt>Ritmo · {basisLabels[result.basis ?? 'unavailable']}</dt>
            <dd>{formatPace(result.paceSecondsPerKm ?? null)}</dd>
            <dt>Amostras / splits</dt>
            <dd>
              {result.sampleCount ?? 0} / {result.splitCount ?? 0}
            </dd>
            <dt>Lacunas &gt; 30 s</dt>
            <dd>{result.gaps ?? '—'}</dd>
            {result.heartRate && (
              <>
                <dt>FC das amostras (média / mín. / máx.)</dt>
                <dd>
                  {formatNumber(result.heartRate.mean, ' bpm')} /{' '}
                  {formatNumber(result.heartRate.min)} /{' '}
                  {formatNumber(result.heartRate.max)} ·{' '}
                  {result.heartRate.count} valores, {result.heartRate.missing}{' '}
                  ausentes
                </dd>
              </>
            )}
            {result.cadence && (
              <>
                <dt>Cadência das amostras (média / mín. / máx.)</dt>
                <dd>
                  {formatNumber(result.cadence.mean, ' ciclos/min')} /{' '}
                  {formatNumber(result.cadence.min)} /{' '}
                  {formatNumber(result.cadence.max)} · {result.cadence.count}{' '}
                  valores
                </dd>
              </>
            )}
          </dl>
          {result.incomplete && (
            <p className="muted small">
              Dados incompletos; métricas indisponíveis foram preservadas.
            </p>
          )}
        </>
      )}
    </div>
  );
}
export function AnalysisWorkspace({ initial }: { initial: Workspace }) {
  const [workspace, setWorkspace] = useState(initial),
    [a, setA] = useState<Selection>({ kind: 'time', from: 0, to: 300 }),
    [b, setB] = useState<Selection>({ kind: 'time', from: 300, to: 600 });
  const [comparison, setComparison] = useState<Comparison | null>(null),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false),
    [anchor, setAnchor] = useState<number | null>(null);
  const [selectionActive, setSelectionActive] = useState(false);
  const activity = workspace.activity,
    result = workspace.analysis.result;
  async function reload(
    axis = workspace.series.axis,
    eventPage = workspace.eventPage,
    splitPage = workspace.splitPage,
  ) {
    const response = await fetch(
      `/api/activities/${activity.id}/analysis?axis=${axis}&eventPage=${eventPage}&splitPage=${splitPage}`,
      { cache: 'no-store' },
    );
    if (!response.ok)
      throw new Error(
        response.status === 404
          ? 'Atividade indisponível. Verifique o vínculo.'
          : 'Não foi possível atualizar a análise.',
      );
    const next: Workspace = await response.json();
    setWorkspace(next);
    if (
      next.activity.dataHash !== activity.dataHash ||
      next.activity.revision !== activity.revision
    ) {
      setComparison(null);
      setSelectionActive(false);
      setMessage('Atividade atualizada. Selecione os trechos novamente.');
      setAnchor(null);
    }
  }
  async function action(run: () => Promise<void>) {
    setBusy(true);
    setMessage('');
    try {
      await run();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Não foi possível concluir.',
      );
    } finally {
      setBusy(false);
    }
  }
  const request = () =>
    action(async () => {
      await mutate(`/activities/${activity.id}/analysis`, 'POST', {});
      await reload();
      setMessage(
        'Solicitação registrada. Atualize para acompanhar o processamento.',
      );
    });
  const inspect = () =>
    action(async () => {
      const normalized = (value: Selection) => ({
        ...value,
        from:
          value.kind === 'distance'
            ? value.from * 1000
            : value.kind === 'splits'
              ? value.from - 1
              : value.from,
        to:
          value.kind === 'distance'
            ? value.to * 1000
            : value.kind === 'splits'
              ? value.to - 1
              : value.to,
      });
      const response: Comparison = await mutate(
        `/activities/${activity.id}/analysis/compare`,
        'POST',
        {
          inputRevision: activity.revision,
          inputHash: activity.dataHash,
          segments: [normalized(a), normalized(b)],
        },
      );
      setComparison(response);
      setSelectionActive(true);
    });
  function point(x: number) {
    if (busy) return;
    const value = workspace.series.axis === 'distance' ? x / 1000 : x;
    setComparison(null);
    setSelectionActive(true);
    if (anchor === null) {
      setAnchor(value);
      setA({ kind: workspace.series.axis, from: value, to: value });
    } else {
      setA({
        kind: workspace.series.axis,
        from: Math.min(value, anchor),
        to: Math.max(value, anchor),
      });
      setAnchor(null);
    }
  }
  function selectSplit(ordinal: number) {
    setA({ kind: 'splits', from: ordinal + 1, to: ordinal + 1 });
    setComparison(null);
    setSelectionActive(true);
    setAnchor(null);
  }
  function selectEvent(event: AnalysisEvent) {
    setA({
      kind: 'splits',
      from: event.previous.ordinal + 1,
      to: event.previous.ordinal + 1,
    });
    setB({
      kind: 'splits',
      from: event.current.ordinal + 1,
      to: event.current.ordinal + 1,
    });
    setComparison(null);
    setSelectionActive(true);
    setAnchor(null);
  }
  let range: [number, number] | null =
    a.kind === workspace.series.axis
      ? [
          a.from * (a.kind === 'distance' ? 1000 : 1),
          a.to * (a.kind === 'distance' ? 1000 : 1),
        ]
      : null;
  if (a.kind === 'splits' && workspace.series.axis === 'time') {
    const first = workspace.splits.items.find(
        (split) => split.ordinal === a.from - 1,
      ),
      last = workspace.splits.items.find((split) => split.ordinal === a.to - 1);
    if (first?.startedAt && last?.endedAt)
      range = [
        (new Date(first.startedAt).getTime() -
          new Date(activity.startedAt).getTime()) /
          1000,
        (new Date(last.endedAt).getTime() -
          new Date(activity.startedAt).getTime()) /
          1000,
      ];
  }
  if (!selectionActive) range = null;
  return (
    <main id="dashboard" className="main-content analysis-page" tabIndex={-1}>
      <nav className="feedback-links" aria-label="Feedback da atividade">
        <Link
          className="button"
          href={`/atividades/${initial.activity.id}/feedback`}
        >
          Feedback do treinador →
        </Link>
      </nav>
      <header className="page-header">
        <div>
          <Link
            className="muted small"
            href={`/atividades?athleteId=${activity.athleteId}`}
          >
            Atividades / {activity.athleteName}
          </Link>
          <h1>Análise esportiva</h1>
          <p className="subtitle">
            {sports[activity.sport]} ·{' '}
            {new Date(activity.startedAt).toLocaleString('pt-BR', {
              timeZone: 'UTC',
            })}{' '}
            UTC · {sources[activity.source]}
          </p>
        </div>
        <ThemeToggle />
      </header>
      <div className="demo-banner">
        <Badge tone="warning">Dados sintéticos</Badge> Análise determinística ·
        regras demonstrativas · {statusLabels[workspace.analysis.status]}
      </div>
      <div className="analysis-layout">
        <div className="analysis-main">
          <section className="metrics-grid analysis-metrics">
            <MetricCard label="Distância">
              {formatNumber(activity.distanceMeters, ' km', 1000)}
            </MetricCard>
            <MetricCard
              label={`Tempo (${basisLabels[activity.durationBasis]})`}
            >
              {formatNumber(activity.durationSeconds, ' min', 60)}
            </MetricCard>
            <MetricCard label="Ritmo médio">
              {formatPace(
                activity.distanceMeters !== null &&
                  activity.distanceMeters > 0 &&
                  activity.durationSeconds !== null &&
                  activity.durationSeconds > 0
                  ? activity.durationSeconds / (activity.distanceMeters / 1000)
                  : null,
              )}
            </MetricCard>
            <MetricCard label="FC média">
              {formatNumber(activity.avgHeartRateBpm, ' bpm')}
            </MetricCard>
            <MetricCard label="FC máxima">
              {formatNumber(activity.maxHeartRateBpm, ' bpm')}
            </MetricCard>
            <MetricCard label="Splits recebidos">
              {workspace.splits.total}
            </MetricCard>
          </section>
          <div className="analysis-toolbar">
            <label>
              Eixo dos gráficos
              <select
                value={workspace.series.axis}
                disabled={busy}
                onChange={(event) => {
                  const axis = event.target.value as 'time' | 'distance';
                  setAnchor(null);
                  void action(() => reload(axis));
                }}
              >
                <option value="time">Tempo decorrido</option>
                <option
                  value="distance"
                  disabled={!workspace.series.distanceAxisAvailable}
                >
                  Distância acumulada
                </option>
              </select>
            </label>
            <button
              className="button"
              disabled={busy}
              onClick={() => void action(() => reload())}
            >
              Atualizar análise
            </button>
            {workspace.analysis.status !== 'completed' && (
              <button
                className="button primary-button"
                disabled={busy}
                onClick={() => void request()}
              >
                {workspace.analysis.status === 'failed'
                  ? 'Tentar análise novamente'
                  : 'Solicitar análise'}
              </button>
            )}
          </div>
          <p role="status">{message}</p>
          {workspace.analysis.obsolete && (
            <p role="status">
              A análise anterior está obsoleta. Solicite a análise da revisão
              atual.
            </p>
          )}
          <Charts workspace={workspace} range={range} onPoint={point} />
          <Card title="Comparação por segmentos">
            <p className="muted small">
              Dois cliques no gráfico selecionam os limites do trecho A. Use os
              controles para teclado, celular e comparação. Limites ajustados
              aos dados observados, sem interpolação.
            </p>
            <form
              className="analysis-selections"
              onSubmit={(event) => {
                event.preventDefault();
                void inspect();
              }}
            >
              {(
                [
                  { name: 'A', value: a, set: setA },
                  { name: 'B', value: b, set: setB },
                ] as const
              ).map(({ name, value, set }) => (
                <fieldset key={name} disabled={busy}>
                  <legend>Trecho {name}</legend>
                  <label>
                    Tipo do trecho {name}
                    <select
                      value={value.kind}
                      onChange={(event) => {
                        set({
                          kind: event.target.value as Selection['kind'],
                          from: event.target.value === 'splits' ? 1 : 0,
                          to: event.target.value === 'splits' ? 1 : 300,
                        });
                        setComparison(null);
                        setSelectionActive(true);
                      }}
                    >
                      <option value="time">Tempo (s)</option>
                      <option
                        value="distance"
                        disabled={!workspace.series.distanceAxisAvailable}
                      >
                        Distância (km)
                      </option>
                      <option value="splits">Splits (número)</option>
                    </select>
                  </label>
                  <label>
                    Início do trecho {name}
                    <input
                      type="number"
                      step={value.kind === 'splits' ? 1 : 'any'}
                      min={
                        value.kind === 'splits'
                          ? 1
                          : value.kind === 'time'
                            ? -604800
                            : 0
                      }
                      value={value.from}
                      required
                      onChange={(event) => {
                        set({ ...value, from: Number(event.target.value) });
                        setComparison(null);
                        setSelectionActive(true);
                      }}
                    />
                  </label>
                  <label>
                    Fim do trecho {name}
                    <input
                      type="number"
                      step={value.kind === 'splits' ? 1 : 'any'}
                      min={value.from}
                      value={value.to}
                      required
                      onChange={(event) => {
                        set({ ...value, to: Number(event.target.value) });
                        setComparison(null);
                        setSelectionActive(true);
                      }}
                    />
                  </label>
                </fieldset>
              ))}
              <button className="button primary-button" disabled={busy}>
                Comparar trechos
              </button>
              <button
                className="button"
                type="button"
                disabled={busy}
                onClick={() => {
                  setComparison(null);
                  setA({ kind: 'time', from: 0, to: 300 });
                  setB({ kind: 'time', from: 300, to: 600 });
                  setSelectionActive(false);
                  setAnchor(null);
                }}
              >
                Limpar seleção
              </button>
            </form>
            {comparison && (
              <>
                <div className="analysis-segment-results">
                  <SegmentCard comparison={comparison} index={0} />
                  <SegmentCard comparison={comparison} index={1} />
                </div>
                <p role="status">
                  {comparison.comparable
                    ? `Diferença de ritmo (B − A): ${formatNumber(comparison.paceDeltaSecondsPerKm, ' s/km')}.`
                    : 'Bases temporais diferentes ou dados indisponíveis; ritmos não comparados.'}
                </p>
                <p className="muted small">
                  Médias de sensores são aritméticas das amostras disponíveis,
                  sem ponderação pelo tempo. Trechos de amostras usam tempo
                  decorrido; splits usam sua base recebida.
                </p>
              </>
            )}
          </Card>
          <Card title={`Splits recebidos (${workspace.splits.total})`}>
            <div
              className="table-scroll activities-scroll"
              tabIndex={0}
              role="region"
              aria-label="Splits da análise"
            >
              <table>
                <thead>
                  <tr>
                    <th>Split</th>
                    <th>Distância</th>
                    <th>Ritmo</th>
                    <th>FC média</th>
                    <th>Cadência</th>
                    <th>Base</th>
                    <th>Selecionar</th>
                  </tr>
                </thead>
                <tbody>
                  {workspace.splits.items.map((split) => {
                    const duration = split.timerSeconds ?? split.elapsedSeconds;
                    return (
                      <tr key={split.ordinal}>
                        <td>{split.ordinal + 1}</td>
                        <td>{formatNumber(split.distanceMeters, ' m')}</td>
                        <td>
                          {formatPace(
                            split.distanceMeters !== null &&
                              split.distanceMeters > 0 &&
                              duration !== null &&
                              duration > 0
                              ? duration / (split.distanceMeters / 1000)
                              : null,
                          )}
                        </td>
                        <td>{formatNumber(split.avgHeartRateBpm, ' bpm')}</td>
                        <td>
                          {formatNumber(split.avgCadenceRpm, ' ciclos/min')}
                        </td>
                        <td>
                          {split.timerSeconds !== null
                            ? 'cronômetro'
                            : split.elapsedSeconds !== null
                              ? 'decorrido'
                              : '—'}
                        </td>
                        <td>
                          <button
                            className="button"
                            disabled={busy}
                            onClick={() => selectSplit(split.ordinal)}
                          >
                            Selecionar split {split.ordinal + 1}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {!workspace.splits.total && (
              <p className="empty-state">
                Nenhum split recebido; não foram fabricados quilômetros.
              </p>
            )}
            <nav className="pagination" aria-label="Paginação de splits">
              {workspace.splitPage > 1 && (
                <button
                  className="button"
                  disabled={busy}
                  onClick={() =>
                    void action(() =>
                      reload(
                        workspace.series.axis,
                        workspace.eventPage,
                        workspace.splitPage - 1,
                      ),
                    )
                  }
                >
                  Splits anteriores
                </button>
              )}
              {workspace.splitPage * 100 < workspace.splits.total && (
                <button
                  className="button"
                  disabled={busy}
                  onClick={() =>
                    void action(() =>
                      reload(
                        workspace.series.axis,
                        workspace.eventPage,
                        workspace.splitPage + 1,
                      ),
                    )
                  }
                >
                  Próximos splits
                </button>
              )}
            </nav>
          </Card>
          <Card
            title="Eventos detectados"
            aside={<Badge>{result?.eventCount ?? 0} eventos</Badge>}
          >
            {!result ? (
              <p className="empty-state">
                Resultado ainda indisponível. Solicite ou atualize o
                processamento.
              </p>
            ) : !result.eventCount ? (
              <p className="empty-state">
                Nenhuma diferença atende às regras nesta atividade. Splits
                incompletos ou não comparáveis não geram eventos.
              </p>
            ) : (
              <>
                <div className="analysis-events">
                  {result.events.map((event) => (
                    <article className="analysis-event" key={event.id}>
                      <Badge>Evento observado</Badge>
                      <h3>{eventLabels[event.type]}</h3>
                      <p>
                        Splits {event.previous.ordinal + 1} →{' '}
                        {event.current.ordinal + 1}:{' '}
                        {event.direction === 'increase' ? 'aumento' : 'redução'}{' '}
                        de{' '}
                        {formatNumber(
                          Math.abs(event.delta),
                          event.type === 'pace_change'
                            ? ' s/km'
                            : event.type === 'heart_rate_change'
                              ? ' bpm'
                              : ' ciclos/min',
                        )}
                        {event.relativeDelta !== null
                          ? ` (${formatNumber(Math.abs(event.relativeDelta) * 100)}%)`
                          : ''}
                        .
                      </p>
                      <details>
                        <summary>Evidências e regra</summary>
                        <p>
                          Regra {workspace.analysis.version}: limiar ≥{' '}
                          {event.absoluteThreshold}
                          {event.relativeThreshold !== null
                            ? ` e ≥ ${event.relativeThreshold * 100}%`
                            : ''}
                          . Base: {basisLabels[event.current.basis]}.
                        </p>
                        <p>
                          Anterior:{' '}
                          {formatNumber(event.previous.distanceMeters, ' m')} /{' '}
                          {formatNumber(event.previous.durationSeconds, ' s')};
                          FC {formatNumber(event.previous.heartRateBpm, ' bpm')}
                          ; cadência{' '}
                          {formatNumber(
                            event.previous.cadenceRpm,
                            ' ciclos/min',
                          )}
                          .
                        </p>
                        <p>
                          Atual:{' '}
                          {formatNumber(event.current.distanceMeters, ' m')} /{' '}
                          {formatNumber(event.current.durationSeconds, ' s')};
                          FC {formatNumber(event.current.heartRateBpm, ' bpm')};
                          cadência{' '}
                          {formatNumber(
                            event.current.cadenceRpm,
                            ' ciclos/min',
                          )}
                          .
                        </p>
                        {event.distanceMissing && (
                          <p>
                            Distância ausente em um dos splits; comparabilidade
                            limitada.
                          </p>
                        )}
                        <p>
                          Revisão {activity.revision}. Estes valores não
                          comprovam causa ou sensação do aluno.
                        </p>
                      </details>
                      <button
                        className="button"
                        disabled={busy}
                        onClick={() => selectEvent(event)}
                      >
                        Investigar splits {event.previous.ordinal + 1} e{' '}
                        {event.current.ordinal + 1}
                      </button>
                    </article>
                  ))}
                </div>
                <nav className="pagination" aria-label="Paginação de eventos">
                  {workspace.eventPage > 1 && (
                    <button
                      className="button"
                      disabled={busy}
                      onClick={() =>
                        void action(() =>
                          reload(
                            workspace.series.axis,
                            workspace.eventPage - 1,
                          ),
                        )
                      }
                    >
                      Eventos anteriores
                    </button>
                  )}
                  {workspace.eventPage * 50 < result.eventCount && (
                    <button
                      className="button"
                      disabled={busy}
                      onClick={() =>
                        void action(() =>
                          reload(
                            workspace.series.axis,
                            workspace.eventPage + 1,
                          ),
                        )
                      }
                    >
                      Próximos eventos
                    </button>
                  )}
                </nav>
              </>
            )}
          </Card>
        </div>
        <aside className="analysis-context">
          <Card title="Contexto da análise">
            <Badge>Determinístico · sem IA</Badge>
            <h3>{activity.athleteName}</h3>
            <p>
              {result?.summary ??
                'Gráficos mostram os dados disponíveis enquanto a análise aguarda processamento.'}
            </p>
            <p role="status">
              {selectionActive
                ? 'Trechos selecionados nos controles abaixo.'
                : 'Nenhum trecho selecionado.'}
            </p>
            <dl className="profile-status">
              {selectionActive && (
                <>
                  <dt>Trecho A solicitado</dt>
                  <dd>
                    {a.from} → {a.to} (
                    {a.kind === 'distance'
                      ? 'km'
                      : a.kind === 'time'
                        ? 's'
                        : 'splits'}
                    )
                  </dd>
                  <dt>Trecho B solicitado</dt>
                  <dd>
                    {b.from} → {b.to} (
                    {b.kind === 'distance'
                      ? 'km'
                      : b.kind === 'time'
                        ? 's'
                        : 'splits'}
                    )
                  </dd>
                </>
              )}
              <dt>Tempo de cronômetro / decorrido</dt>
              <dd>
                {formatNumber(activity.timerSeconds, ' s')} /{' '}
                {formatNumber(activity.elapsedSeconds, ' s')}
              </dd>
            </dl>
            <p className="muted small">
              Cronômetro não é necessariamente tempo em movimento. Valores
              ausentes aparecem como —.
            </p>
            {result && (
              <ul className="analysis-quality">
                {result.quality.map((code) => (
                  <li key={code}>{qualityLabels[code] ?? code}</li>
                ))}
              </ul>
            )}
            <Link href={`/atividades/${activity.id}`}>
              Consultar dados recebidos →
            </Link>
            <p className="muted small">
              AI Coach: adiado como débito técnico DT-IA-01.
            </p>
          </Card>
        </aside>
      </div>
    </main>
  );
}
