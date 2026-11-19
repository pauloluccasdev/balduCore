'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, Badge, MetricCard } from '../../components/ui';
import { ThemeToggle } from '../../components/theme-toggle';
import { mutate } from '../../lib/client-api';
import { sports, sources, formatNumber, formatPace } from '../activities/types';
import { eventLabels, basisLabels } from '../analysis/types';
import {
  type FeedbackWorkspace,
  type FeedbackContent,
  type History,
  type Revision,
  type PointScope,
  categories,
  origins,
  verdictLabels,
  scopeLabel,
} from './types';
async function read<T>(path: string): Promise<T> {
  const response = await fetch(`/api${path}`, { cache: 'no-store' });
  if (!response.ok)
    throw new Error(
      response.status === 404
        ? 'Diário indisponível para este acompanhamento.'
        : 'Não foi possível carregar os registros. Tente novamente.',
    );
  return response.json();
}
function RevisionView({ item }: { item: Revision }) {
  return (
    <article
      className="feedback-revision"
      aria-label={`Conteúdo da revisão ${item.version}`}
    >
      <h3>Revisão {item.version} · somente leitura</h3>
      <p className="muted small">
        {new Date(item.createdAt).toLocaleString('pt-BR', { timeZone: 'UTC' })}{' '}
        UTC · Autor (treinador): {item.authorName ?? 'Treinador responsável'} ·
        revisão da atividade: {item.inputRevision}
      </p>
      <p className="muted small">
        {item.analysisId
          ? 'Avaliação vinculada à análise desta revisão da atividade.'
          : 'Sem avaliação de análise associada.'}
      </p>
      {(
        [
          ['execution', 'Análise da execução'],
          ['observations', 'Observações'],
          ['decisions', 'Decisões técnicas'],
        ] as const
      ).map(([field, label]) => (
        <div key={field}>
          <h4>{label}</h4>
          <p className="feedback-text">
            {item.content[field] || 'Não informado'}
          </p>
        </div>
      ))}
      <h4>Pontos de atenção</h4>
      {!item.content.points.length && <p>Nenhum ponto registrado.</p>}
      {item.content.points.map((point) => (
        <p key={point.id} className="feedback-text">
          {categories[point.category]} · {scopeLabel(point.scope)} ·{' '}
          {origins[point.source]}: {point.note}
        </p>
      ))}
      <h4>Avaliações de eventos determinísticos</h4>
      {!item.content.verdicts.length && <p>Nenhuma avaliação registrada.</p>}
      {item.content.verdicts.map((v) => (
        <p key={v.eventId}>
          {v.eventId}: {verdictLabels[v.verdict]}
        </p>
      ))}
    </article>
  );
}
export function FeedbackEditor({
  initial,
  initialHistory,
}: {
  initial: FeedbackWorkspace;
  initialHistory: History;
}) {
  const [data, setData] = useState(initial);
  const [draft, setDraft] = useState<FeedbackContent>(initial.content);
  const [version, setVersion] = useState(initial.version);
  const [saved, setSaved] = useState(JSON.stringify(initial.content));
  const [history, setHistory] = useState(initialHistory);
  const [view, setView] = useState<Revision | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [category, setCategory] = useState<keyof typeof categories | ''>('');
  const [source, setSource] = useState<keyof typeof origins | ''>('');
  const [scopeKind, setScopeKind] = useState<'whole' | 'time' | 'distance'>(
    'whole',
  );
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [note, setNote] = useState('');
  const dirty = JSON.stringify(draft) !== saved;
  const unsavedPoint = Boolean(note || category || source || from || to);
  const hasChanges = dirty || unsavedPoint || confirmed;
  const base = `/activities/${data.activity.id}/feedback`;
  useEffect(() => {
    if (!hasChanges) return;
    const leave = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    const click = (event: MouseEvent) => {
      const target =
        event.target instanceof Element
          ? event.target.closest('a[href]')
          : null;
      if (
        target &&
        !window.confirm('Há alterações não salvas. Deseja sair e descartá-las?')
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener('beforeunload', leave);
    document.addEventListener('click', click, true);
    return () => {
      window.removeEventListener('beforeunload', leave);
      document.removeEventListener('click', click, true);
    };
  }, [hasChanges]);
  function update(
    field: 'execution' | 'observations' | 'decisions',
    value: string,
  ) {
    setDraft((prev) => ({ ...prev, [field]: value }));
    setMessage('');
  }
  function addPoint() {
    if (!category || !source || !note.trim()) {
      setError('Escolha categoria, origem e descreva o contexto do ponto.');
      return;
    }
    if (draft.points.length >= 20) {
      setError('Limite de 20 pontos por revisão.');
      return;
    }
    const scope: PointScope =
      scopeKind === 'whole'
        ? { kind: 'whole' }
        : { kind: scopeKind, from: Number(from), to: Number(to) };
    if (
      scope.kind !== 'whole' &&
      (!from ||
        !to ||
        !Number.isFinite(scope.from) ||
        !Number.isFinite(scope.to) ||
        scope.from < 0 ||
        scope.from >= scope.to)
    ) {
      setError('Informe um intervalo válido com início menor que fim.');
      return;
    }
    setDraft((prev) => ({
      ...prev,
      points: [
        ...prev.points,
        { id: crypto.randomUUID(), category, source, note: note.trim(), scope },
      ],
    }));
    setNote('');
    setCategory('');
    setSource('');
    setFrom('');
    setTo('');
    setError('');
    setMessage('');
  }
  async function save() {
    if (unsavedPoint) {
      setError(
        'Adicione o ponto em edição ou limpe seus campos antes de salvar o diário.',
      );
      return;
    }
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await mutate(base, 'PUT', {
        expectedVersion: version,
        inputRevision: data.activity.revision,
        inputHash: data.activity.dataHash,
        analysisId: draft.verdicts.length ? data.analysis.id : null,
        confirmContext: confirmed,
        content: draft,
      });
      setVersion(result.version);
      setSaved(JSON.stringify(draft));
      setConfirmed(false);
      setData((prev) => ({ ...prev, obsolete: false }));
      setMessage(`Diário salvo. Revisão ${result.version}.`);
      try {
        setHistory(await read<History>(`${base}/revisions`));
      } catch {
        setError(
          'Diário salvo, mas o histórico não pôde ser atualizado. Consulte-o novamente.',
        );
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível salvar. Seu texto foi preservado.',
      );
    } finally {
      setBusy(false);
    }
  }
  async function reload() {
    if (
      hasChanges &&
      !window.confirm(
        'Recarregar descarta as alterações locais. Deseja continuar?',
      )
    )
      return;
    setLoading(true);
    setError('');
    try {
      const [next, revisions] = await Promise.all([
        read<FeedbackWorkspace>(base),
        read<History>(`${base}/revisions`),
      ]);
      setData(next);
      setDraft(next.content);
      setSaved(JSON.stringify(next.content));
      setVersion(next.version);
      setHistory(revisions);
      setConfirmed(false);
      setView(null);
      setNote('');
      setCategory('');
      setSource('');
      setFrom('');
      setTo('');
      setMessage('Versão salva recarregada.');
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setLoading(false);
    }
  }
  async function events(page: number) {
    setLoading(true);
    setError('');
    try {
      const next = await read<FeedbackWorkspace>(`${base}?page=${page}`);
      if (
        next.activity.revision !== data.activity.revision ||
        next.activity.dataHash !== data.activity.dataHash ||
        next.analysis.id !== data.analysis.id
      )
        throw new Error(
          'Contexto atualizado. Recarregue o diário antes de continuar.',
        );
      setData((prev) => ({ ...prev, analysis: next.analysis }));
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setLoading(false);
    }
  }
  async function showHistory(page: number, revision?: number) {
    setLoading(true);
    setError('');
    try {
      if (revision)
        setView(await read<Revision>(`${base}/revisions/${revision}`));
      else setHistory(await read<History>(`${base}/revisions?page=${page}`));
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setLoading(false);
    }
  }
  const disabled = busy || loading;
  return (
    <main className="main-content" id="dashboard" tabIndex={-1}>
      <header className="page-header">
        <div>
          <Link
            className="muted small"
            href={`/alunos/${data.activity.athleteId}`}
          >
            ← Perfil do aluno
          </Link>
          <h1>Feedback do treinador</h1>
          <p className="subtitle">
            Registre observações, avalie os eventos e documente suas decisões.
          </p>
        </div>
        <ThemeToggle />
      </header>
      <nav className="feedback-links" aria-label="Contexto do feedback">
        <Link className="button" href={`/atividades/${data.activity.id}`}>
          Ver atividade
        </Link>
        <Link
          className="button"
          href={`/analise-esportiva/${data.activity.id}`}
        >
          Abrir análise esportiva →
        </Link>
      </nav>
      {data.activity.isSynthetic && (
        <p className="demo-notice">
          Atividade sintética de teste · {sources[data.activity.source]}
        </p>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <p role="status" aria-live="polite">
        {busy
          ? 'Salvando diário…'
          : message ||
            (hasChanges
              ? 'Há alterações não salvas.'
              : 'Sem alterações locais.')}
      </p>
      {data.obsolete && (
        <Card title="Contexto atualizado">
          <p>
            Este diário foi registrado para uma revisão anterior da atividade.
            Consulte o histórico antes de revisar suas observações.
          </p>
          <button
            type="button"
            className="button"
            disabled={disabled || confirmed}
            onClick={() => {
              setDraft((prev) => ({ ...prev, points: [], verdicts: [] }));
              setConfirmed(true);
              setMessage(
                'Novo contexto confirmado. Pontos e avaliações anteriores foram retirados desta edição. Revise os textos e adicione somente pontos atuais.',
              );
            }}
          >
            Confirmar novo contexto e retirar pontos e avaliações antigos
          </button>
        </Card>
      )}
      <fieldset
        className="feedback-fieldset"
        disabled={disabled || (data.obsolete && !confirmed)}
      >
        <legend className="sr-only">Diário e avaliação da atividade</legend>
        <div className="feedback-layout">
          <div className="profile-stack">
            <Card
              title={`${sports[data.activity.sport] ?? data.activity.sport} · ${data.activity.athleteName}`}
              aside={
                <Badge>
                  {version
                    ? `Diário · revisão ${version}`
                    : 'Diário não iniciado'}
                </Badge>
              }
            >
              <p className="muted small">
                {new Date(data.activity.startedAt).toLocaleString('pt-BR', {
                  timeZone: 'UTC',
                })}{' '}
                UTC · Revisão da atividade {data.activity.revision}
              </p>
              <div className="feedback-metrics">
                <MetricCard label="Distância">
                  {formatNumber(
                    data.activity.distanceMeters === null
                      ? null
                      : data.activity.distanceMeters / 1000,
                    ' km',
                  )}
                </MetricCard>
                <MetricCard
                  label={`Tempo (${basisLabels[data.activity.durationBasis] ?? data.activity.durationBasis})`}
                >
                  {formatNumber(data.activity.durationSeconds, ' s')}
                </MetricCard>
                <MetricCard label="Ritmo médio">
                  {formatPace(data.activity.paceSecondsPerKm)}
                </MetricCard>
                <MetricCard label="FC média">
                  {formatNumber(data.activity.avgHeartRateBpm, ' bpm')}
                </MetricCard>
              </div>
            </Card>
            <Card title="Análise da execução">
              <label className="form-field">
                Como o aluno executou a atividade?
                <textarea
                  rows={5}
                  maxLength={4000}
                  value={draft.execution}
                  onChange={(e) => update('execution', e.target.value)}
                  placeholder="Regularidade, ritmo e eventos observados."
                />
              </label>
            </Card>
            <Card
              title="Pontos de atenção do treino"
              aside={
                <span className="muted small">{draft.points.length}/20</span>
              }
            >
              <p className="muted small">
                Sensores não confirmam causas ou sensações. Registre a origem e
                o contexto informado.
              </p>
              <div className="feedback-point-form">
                <label className="form-field">
                  Categoria
                  <select
                    value={category}
                    onChange={(e) =>
                      setCategory(e.target.value as typeof category)
                    }
                  >
                    <option value="">Selecione</option>
                    {Object.entries(categories).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="form-field">
                  Origem do contexto
                  <select
                    value={source}
                    onChange={(e) => setSource(e.target.value as typeof source)}
                  >
                    <option value="">Selecione</option>
                    {Object.entries(origins).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="form-field">
                  Escopo
                  <select
                    value={scopeKind}
                    onChange={(e) => {
                      setScopeKind(e.target.value as typeof scopeKind);
                      setFrom('');
                      setTo('');
                    }}
                  >
                    <option value="whole">Atividade inteira</option>
                    <option value="distance">
                      Intervalo em metros (km × 1000)
                    </option>
                    <option value="time">
                      Intervalo em segundos decorridos
                    </option>
                  </select>
                </label>
                {scopeKind !== 'whole' && (
                  <div className="feedback-range">
                    <label className="form-field">
                      Início ({scopeKind === 'time' ? 's' : 'm'})
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={from}
                        onChange={(e) => setFrom(e.target.value)}
                      />
                    </label>
                    <label className="form-field">
                      Fim ({scopeKind === 'time' ? 's' : 'm'})
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={to}
                        onChange={(e) => setTo(e.target.value)}
                      />
                    </label>
                  </div>
                )}
                <label className="form-field">
                  Contexto do ponto
                  <textarea
                    rows={2}
                    maxLength={1000}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </label>
                <div className="feedback-links">
                  <button type="button" className="button" onClick={addPoint}>
                    Adicionar ponto
                  </button>
                  <button
                    type="button"
                    className="button"
                    onClick={() => {
                      setNote('');
                      setCategory('');
                      setSource('');
                      setFrom('');
                      setTo('');
                    }}
                  >
                    Limpar ponto em edição
                  </button>
                </div>
              </div>
              {!draft.points.length && (
                <p className="empty-state">
                  Nenhum ponto de atenção registrado.
                </p>
              )}
              {draft.points.map((point) => (
                <article key={point.id} className="feedback-point">
                  <h3>
                    {categories[point.category]}{' '}
                    <Badge>{scopeLabel(point.scope)}</Badge>
                  </h3>
                  <p className="muted small">{origins[point.source]}</p>
                  <p className="feedback-text">{point.note}</p>
                  <button
                    type="button"
                    className="button"
                    onClick={() =>
                      setDraft((prev) => ({
                        ...prev,
                        points: prev.points.filter((p) => p.id !== point.id),
                      }))
                    }
                    aria-label={`Remover ponto ${categories[point.category]}`}
                  >
                    Remover
                  </button>
                </article>
              ))}
            </Card>
            <Card title="Observações do treinador">
              <label className="form-field">
                Observações
                <textarea
                  rows={5}
                  maxLength={4000}
                  value={draft.observations}
                  onChange={(e) => update('observations', e.target.value)}
                />
              </label>
            </Card>
            <Card title="Decisões para os próximos treinos">
              <label className="form-field">
                Decisões técnicas
                <textarea
                  rows={5}
                  maxLength={4000}
                  value={draft.decisions}
                  onChange={(e) => update('decisions', e.target.value)}
                />
              </label>
              <p className="muted small">
                Registro técnico; não publica ou prescreve treinos.
              </p>
            </Card>
          </div>
          <div className="profile-stack">
            <Card
              title="Validação dos eventos"
              aside={<Badge>{draft.verdicts.length} avaliados</Badge>}
            >
              <p className="muted small">
                Avalie os eventos determinísticos com base nas evidências.
                Hipóteses de IA estão pendentes.
              </p>
              <p>
                {data.analysis.summary ??
                  'Sem análise concluída. Você pode registrar suas observações.'}
              </p>
              {data.analysis.total === 0 && (
                <p className="empty-state">
                  Nenhum evento disponível para avaliação.
                </p>
              )}
              {data.analysis.events.map((event) => (
                <article key={event.id} className="feedback-point">
                  <h3>{eventLabels[event.type]}</h3>
                  <Badge>
                    Splits {event.previous.ordinal + 1} →{' '}
                    {event.current.ordinal + 1}
                  </Badge>
                  <p className="muted small">
                    Regra {data.analysis.version} ·{' '}
                    {event.direction === 'increase' ? 'aumento' : 'redução'} de{' '}
                    {formatNumber(Math.abs(event.delta))}{' '}
                    {event.type === 'pace_change'
                      ? 's/km'
                      : event.type === 'heart_rate_change'
                        ? 'bpm'
                        : 'ciclos/min'}
                  </p>
                  <p>
                    Anterior:{' '}
                    {event.type === 'pace_change'
                      ? `${formatNumber(event.previous.durationSeconds)} s / ${formatNumber(event.previous.distanceMeters)} m`
                      : event.type === 'heart_rate_change'
                        ? formatNumber(event.previous.heartRateBpm, ' bpm')
                        : formatNumber(
                            event.previous.cadenceRpm,
                            ' ciclos/min',
                          )}{' '}
                    · Atual:{' '}
                    {event.type === 'pace_change'
                      ? `${formatNumber(event.current.durationSeconds)} s / ${formatNumber(event.current.distanceMeters)} m`
                      : event.type === 'heart_rate_change'
                        ? formatNumber(event.current.heartRateBpm, ' bpm')
                        : formatNumber(event.current.cadenceRpm, ' ciclos/min')}
                  </p>
                  <label className="form-field">
                    Avaliação de {eventLabels[event.type]} · split{' '}
                    {event.current.ordinal + 1}
                    <select
                      value={
                        draft.verdicts.find((v) => v.eventId === event.id)
                          ?.verdict ?? ''
                      }
                      onChange={(e) => {
                        const value = e.target.value as
                          keyof typeof verdictLabels | '';
                        if (
                          value &&
                          !draft.verdicts.some((v) => v.eventId === event.id) &&
                          draft.verdicts.length >= 100
                        ) {
                          setError('Limite de 100 avaliações por revisão.');
                          return;
                        }
                        setDraft((prev) => ({
                          ...prev,
                          verdicts: [
                            ...prev.verdicts.filter(
                              (v) => v.eventId !== event.id,
                            ),
                            ...(value
                              ? [{ eventId: event.id, verdict: value }]
                              : []),
                          ],
                        }));
                      }}
                    >
                      <option value="">Não avaliado</option>
                      {Object.entries(verdictLabels).map(([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                </article>
              ))}
              {data.analysis.total > 50 && (
                <nav className="pagination" aria-label="Páginas de eventos">
                  <button
                    type="button"
                    className="button"
                    disabled={data.analysis.page === 1}
                    onClick={() => void events(data.analysis.page - 1)}
                  >
                    Eventos anteriores
                  </button>
                  <span>
                    Página {data.analysis.page} · {data.analysis.total} eventos
                  </span>
                  <button
                    type="button"
                    className="button"
                    disabled={data.analysis.page * 50 >= data.analysis.total}
                    onClick={() => void events(data.analysis.page + 1)}
                  >
                    Próximos eventos
                  </button>
                </nav>
              )}
            </Card>
          </div>
        </div>
        <div className="card feedback-save">
          <span className="muted small">
            {unsavedPoint
              ? 'Adicione ou limpe o ponto em edição antes de salvar.'
              : hasChanges
                ? 'Há alterações não salvas. Preencha somente o que for útil.'
                : 'Tudo é opcional. Preencha o que for útil.'}
          </span>
          <button
            type="button"
            className="button primary"
            disabled={(!dirty && !confirmed) || unsavedPoint}
            onClick={() => void save()}
          >
            Salvar diário
          </button>
        </div>
      </fieldset>
      <div className="feedback-links">
        <button
          type="button"
          className="button"
          disabled={disabled}
          onClick={() => void reload()}
        >
          Recarregar versão salva
        </button>
      </div>
      <Card title="Histórico do diário">
        {!history.total && (
          <p className="empty-state">Nenhuma revisão salva.</p>
        )}
        <div
          className="table-scroll"
          tabIndex={0}
          role="region"
          aria-label="Histórico de revisões do diário"
        >
          <table className="data-table">
            <thead>
              <tr>
                <th>Revisão</th>
                <th>Data (UTC)</th>
                <th>Contexto da atividade</th>
                <th>Registro</th>
              </tr>
            </thead>
            <tbody>
              {history.items.map((item) => (
                <tr key={item.version}>
                  <td>{item.version}</td>
                  <td>
                    {new Date(item.createdAt).toLocaleString('pt-BR', {
                      timeZone: 'UTC',
                    })}
                  </td>
                  <td>
                    Revisão {item.inputRevision}
                    {item.inputHash !== data.activity.dataHash ||
                    item.inputRevision !== data.activity.revision
                      ? ' · anterior'
                      : ' · atual'}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="button"
                      disabled={disabled}
                      onClick={() =>
                        void showHistory(history.page, item.version)
                      }
                    >
                      Abrir revisão {item.version}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {history.total > 20 && (
          <nav className="pagination" aria-label="Páginas do histórico">
            <button
              className="button"
              type="button"
              disabled={disabled || history.page === 1}
              onClick={() => void showHistory(history.page - 1)}
            >
              Revisões anteriores
            </button>
            <span>Página {history.page}</span>
            <button
              className="button"
              type="button"
              disabled={disabled || history.page * 20 >= history.total}
              onClick={() => void showHistory(history.page + 1)}
            >
              Próximas revisões
            </button>
          </nav>
        )}
        {view && (
          <>
            <button
              type="button"
              className="button"
              onClick={() => setView(null)}
            >
              Fechar revisão
            </button>
            <RevisionView item={view} />
          </>
        )}
      </Card>
    </main>
  );
}
