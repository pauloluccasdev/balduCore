'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { mutate } from '../../lib/client-api';
import { ShareLink } from '../invitations/invitation-panel';
import { Badge } from '../../components/ui';
import { garminLabels, type GarminSnapshot } from './types';
const scenarios = [
  ['sample', 'Atividade demonstrativa'],
  ['duplicate', 'Entrega repetida'],
  ['updated', 'Atualização de atividade'],
  ['out_of_order', 'Versão antiga'],
  ['temporary_failure', 'Falha temporária'],
  ['permanent_failure', 'Falha permanente'],
  ['invalid_payload', 'Dados inválidos'],
  ['expired_token', 'Renovação de autorização'],
  ['invalid_refresh', 'Autorização inválida'],
  ['provider_revocation', 'Revogação pelo provedor'],
  ['revocation_failure', 'Falha temporária na revogação'],
];
const eventLabels: Record<string, string> = {
  queued: 'Na fila',
  processing: 'Processando',
  retry: 'Nova tentativa agendada',
  processed: 'Concluído',
  ignored: 'Duplicata ou versão antiga',
  failed: 'Requer revisão',
  cancelled: 'Cancelado',
};
export function GarminPanel({
  athleteId,
  relationshipStatus,
  initial,
}: {
  athleteId: string;
  relationshipStatus: string;
  initial: GarminSnapshot;
}) {
  const [data, setData] = useState(initial);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [scenario, setScenario] = useState('sample');
  const [url, setUrl] = useState('');
  const router = useRouter();
  const load = useCallback(async () => {
    const response = await fetch(`/api/athletes/${athleteId}/garmin`, {
      cache: 'no-store',
    });
    if (!response.ok)
      throw new Error('Não foi possível consultar a integração.');
    setData(await response.json());
  }, [athleteId]);
  const pending = data.events.some((event) =>
    ['queued', 'processing', 'retry'].includes(event.status),
  );
  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(() => {
      void load().catch(() =>
        setError('Atualização indisponível. Tente novamente.'),
      );
    }, 2000);
    return () => clearInterval(timer);
  }, [pending, load]);
  async function action(path: string, body?: unknown) {
    setBusy(true);
    setError('');
    try {
      const result = await mutate(
        `/athletes/${athleteId}/garmin/${path}`,
        'POST',
        body,
      );
      if (result.url) setUrl(result.url);
      await load();
      router.refresh();
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'Não foi possível concluir.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="invitation-panel">
      <Badge
        tone={
          data.status === 'connected'
            ? 'success'
            : data.status === 'error'
              ? 'danger'
              : 'neutral'
        }
      >
        {garminLabels[data.status]}
      </Badge>
      <p className="small muted">
        Integração oficial indisponível. Esta área usa somente atividades e
        autorizações simuladas, sem acessar contas Garmin reais.
      </p>
      {!data.enabled && (
        <p role="note">
          Mock local desabilitado. Consulte a configuração de desenvolvimento no
          README.
        </p>
      )}
      <dl className="profile-status">
        <dt>Processamento</dt>
        <dd>
          {data.workerOnline
            ? 'Disponível'
            : 'Offline — recebimentos aguardam processamento'}
        </dd>
        <dt>Atividades de teste recebidas</dt>
        <dd>{data.activityCount}</dd>
        <dt>Última sincronização</dt>
        <dd>
          {data.lastSyncedAt
            ? new Date(data.lastSyncedAt).toLocaleString('pt-BR')
            : 'Ainda não sincronizada'}
        </dd>
        <dt>Revogação</dt>
        <dd>
          {data.revocationStatus === 'pending'
            ? 'Pendente — coleta já bloqueada'
            : data.revocationStatus === 'failed'
              ? 'Falhou — coleta permanece bloqueada'
              : data.revocationStatus === 'completed'
                ? 'Concluída'
                : 'Sem pendências'}
        </dd>
      </dl>
      {data.lastError && (
        <p className="form-error" role="status">
          Há uma falha registrada. Confira os recebimentos abaixo; autorizações
          inválidas exigem nova conexão.
        </p>
      )}
      <button
        className="button"
        disabled={busy}
        onClick={async () => {
          setError('');
          try {
            await load();
            router.refresh();
          } catch {
            setError('Não foi possível atualizar a integração.');
          }
        }}
      >
        Atualizar integração
      </button>
      {data.enabled &&
        relationshipStatus === 'active' &&
        ['not_connected', 'disconnected'].includes(data.status) &&
        !['pending', 'failed'].includes(data.revocationStatus) && (
          <button
            className="button"
            disabled={busy}
            onClick={() => action('authorization-link')}
          >
            Gerar link para conexão de teste
          </button>
        )}
      {url && <ShareLink url={url} label="Link para autorização Garmin mock" />}
      {data.enabled &&
        relationshipStatus === 'active' &&
        data.status === 'connected' && (
          <details className="consent-document">
            <summary>Ferramentas de teste local</summary>
            <div className="athlete-form">
              <label htmlFor="garmin-scenario">Cenário de sincronização</label>
              <select
                id="garmin-scenario"
                value={scenario}
                onChange={(event) => setScenario(event.target.value)}
              >
                {scenarios.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <button
                className="button"
                disabled={busy}
                onClick={() => action('mock', { scenario })}
              >
                Simular evento de teste
              </button>
            </div>
          </details>
        )}
      {['connected', 'awaiting_authorization', 'error'].includes(
        data.status,
      ) && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void action('disconnect');
          }}
          className="athlete-form"
        >
          <label className="consent-check">
            <input type="checkbox" required />
            Confirmo a desconexão simulada. O vínculo esportivo continuará
            ativo.
          </label>
          <button className="button" disabled={busy}>
            Desconectar integração simulada
          </button>
        </form>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <h3>Recebimentos e sincronização</h3>
      {!data.events.length && (
        <p className="muted small">
          Nenhum recebimento registrado. Aceitar o convite não recebe atividades
          automaticamente.
        </p>
      )}
      <ul className="invitation-list">
        {data.events.map((event) => (
          <li key={event.id}>
            <strong>
              {event.kind === 'revoke'
                ? 'Revogação da conexão'
                : event.kind === 'connection_revoked'
                  ? 'Revogação pelo provedor'
                  : 'Atividade simulada'}
            </strong>
            <p className="small">
              {new Date(event.createdAt).toLocaleString('pt-BR')} ·{' '}
              {eventLabels[event.status] ?? event.status} · {event.attempts}{' '}
              tentativa(s)
            </p>
            {event.status === 'failed' && (
              <>
                <p className="small muted">
                  {event.errorCode === 'authorization_expired'
                    ? 'Autorização recusada. Desconecte e solicite nova autorização ao aluno.'
                    : 'Falha persistida para revisão. Reprocessar não corrige dados inválidos.'}
                </p>
                <button
                  className="button"
                  disabled={
                    busy ||
                    (event.kind !== 'revoke' && data.status !== 'connected')
                  }
                  onClick={() => action(`events/${event.id}/retry`)}
                >
                  Reprocessar falha
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
