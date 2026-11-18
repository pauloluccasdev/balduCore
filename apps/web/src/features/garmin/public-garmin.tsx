'use client';
import { useEffect, useRef, useState } from 'react';
import { ThemeToggle } from '../../components/theme-toggle';
import { garminLabels, type GarminStatus } from './types';
async function api(path: string, body?: unknown, csrf?: string) {
  const response = await fetch(`/api/public/garmin${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    cache: 'no-store',
    headers:
      body === undefined
        ? {}
        : { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf ?? '' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(
      typeof data?.message === 'string'
        ? data.message
        : 'Conexão de teste indisponível.',
    );
  return data;
}
export function PublicGarmin() {
  const [status, setStatus] = useState<{
    status: GarminStatus;
    csrf: string;
    enabled: boolean;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch('/api/public/garmin', {
          cache: 'no-store',
        });
        if (response.status === 404) {
          setStatus({ status: 'not_connected', csrf: '', enabled: false });
          return;
        }
        if (!response.ok)
          throw new Error(
            'Não foi possível consultar a conexão. Recarregue ou solicite outro link ao treinador.',
          );
        setStatus(await response.json());
      } catch (error) {
        setError(
          error instanceof Error ? error.message : 'Conexão indisponível.',
        );
      }
    })();
  }, []);
  return (
    <div className="invitation-panel">
      <h2>Conexão esportiva</h2>
      {status && (
        <p>
          <strong>
            {status.status === 'not_connected'
              ? 'Garmin não conectada.'
              : garminLabels[status.status]}
          </strong>
        </p>
      )}
      <p className="small muted">
        Autorizar é uma etapa independente do aceite. O teste abaixo não utiliza
        conta Garmin real e não recebe atividades automaticamente.
      </p>
      {status?.enabled && status.status !== 'connected' && (
        <button
          className="button primary-button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError('');
            try {
              const result = await api('/start', {}, status.csrf);
              window.location.assign(result.url);
            } catch (error) {
              setError(
                error instanceof Error
                  ? error.message
                  : 'Autorização indisponível.',
              );
              setBusy(false);
            }
          }}
        >
          {busy ? 'Preparando…' : 'Simular autorização Garmin'}
        </button>
      )}
      {status?.status === 'connected' && (
        <p role="status">
          Conexão simulada concluída. O treinador poderá testar a sincronização
          com dados fictícios.
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
export function MockAuthorization() {
  const state = useRef('');
  const booted = useRef(false);
  const [csrf, setCsrf] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<'approve' | 'deny' | null>(null);
  useEffect(() => {
    const restart = () => {
      if (window.location.hash) window.location.reload();
    };
    window.addEventListener('hashchange', restart);
    return () => window.removeEventListener('hashchange', restart);
  }, []);
  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    state.current = window.location.hash.slice(1);
    window.history.replaceState(null, '', window.location.pathname);
    void (async () => {
      try {
        if (!/^[\w-]{43}$/.test(state.current))
          throw new Error(
            'Tentativa indisponível. Volte ao convite e inicie outra autorização.',
          );
        setCsrf((await api('')).csrf);
      } catch (error) {
        setError(
          error instanceof Error ? error.message : 'Tentativa indisponível.',
        );
      }
    })();
  }, []);
  async function finish(decision: 'approve' | 'deny') {
    setBusy(true);
    setError('');
    try {
      await api('/mock/finish', { state: state.current, decision }, csrf);
      state.current = '';
      setResult(decision);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'Não foi possível confirmar.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login-page public-page">
      <section className="card login-card public-card">
        <div className="public-heading">
          <div className="login-brand">
            Baldu<span>Training</span>
          </div>
          <ThemeToggle />
        </div>
        <div className="demo-code" role="note">
          <strong>Simulador local BalduCore</strong>
          <p>
            Esta tela não pertence à Garmin. Não informe login ou senha Garmin.
            Nenhuma conta real será acessada.
          </p>
        </div>
        <h1>
          {result === 'approve'
            ? 'Conexão simulada autorizada.'
            : result === 'deny'
              ? 'Autorização simulada recusada.'
              : 'Autorizar conexão de teste'}
        </h1>
        {!result && (
          <>
            <p>
              Você está testando somente a autorização de uma conta fictícia
              para compartilhar atividades sintéticas com o treinador do
              convite.
            </p>
            <button
              className="button primary-button"
              disabled={!csrf || busy}
              onClick={() => finish('approve')}
            >
              Autorizar conexão simulada
            </button>
            <button
              className="button"
              disabled={!csrf || busy}
              onClick={() => finish('deny')}
            >
              Recusar autorização simulada
            </button>
          </>
        )}
        {result === 'deny' && (
          <p>
            O vínculo esportivo permanece ativo; a conexão Garmin não foi
            realizada.
          </p>
        )}
        {result === 'approve' && (
          <p>
            A sincronização é assíncrona. Esta confirmação não significa que uma
            atividade já foi recebida.
          </p>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <a href="/convite" className="button">
          Voltar à confirmação do convite
        </a>
      </section>
    </main>
  );
}
