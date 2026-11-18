'use client';
import { useEffect, useRef, useState } from 'react';
import { ThemeToggle } from '../../components/theme-toggle';
import { ShareLink } from './invitation-panel';

type Session = {
  csrf: string;
  coachName: string;
  verified?: boolean;
  accepted?: boolean;
  ended?: boolean;
  expiresAt?: string;
  documents?: {
    id: string;
    purpose: string;
    version: string;
    content: string;
    contentHash: string;
  }[];
};
async function publicApi(path: string, body?: unknown, csrf?: string) {
  const response = await fetch(`/api/public/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    cache: 'no-store',
    headers:
      body === undefined
        ? {}
        : {
            'Content-Type': 'application/json',
            ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
          },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(
      typeof data?.message === 'string'
        ? data.message
        : response.status === 404
          ? 'Jornada demonstrativa indisponível neste ambiente.'
          : 'Não foi possível continuar. Tente novamente.',
    );
  return data;
}
export function PublicJourney({ kind }: { kind: 'invitation' | 'withdrawal' }) {
  const booted = useRef(false);
  const token = useRef('');
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [withdrawalUrl, setWithdrawalUrl] = useState('');
  const withdrawal = kind === 'withdrawal';
  const sessionPath = withdrawal ? 'withdrawal' : 'enrollment';
  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    token.current = window.location.hash.slice(1);
    // O segredo fica apenas em memória até a ação explícita; não chega a SSR, logs ou Referer.
    window.history.replaceState(null, '', window.location.pathname);
    void (async () => {
      try {
        if (token.current) {
          if (!/^[A-Za-z0-9_-]{43}$/.test(token.current))
            throw new Error('Link inválido. Solicite um novo ao treinador.');
          if (!withdrawal)
            await publicApi('invitation/preview', { token: token.current });
          setReady(true);
        } else {
          setSession(await publicApi(sessionPath));
        }
      } catch (error) {
        setError(error instanceof Error ? error.message : 'Link indisponível.');
      } finally {
        setLoading(false);
      }
    })();
  }, [withdrawal, sessionPath]);
  async function perform(work: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await work();
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'Não foi possível concluir.',
      );
    } finally {
      setBusy(false);
    }
  }
  const done = withdrawal ? session?.ended : session?.accepted;
  return (
    <main className="login-page public-page">
      <section
        className="card login-card public-card"
        aria-label="Acompanhamento esportivo"
      >
        <div className="public-heading">
          <div className="login-brand">
            Baldu<span>Training</span>
          </div>
          <ThemeToggle />
        </div>
        <div className="demo-code" role="note">
          <strong>Experiência demonstrativa</strong>
          <p className="small">
            Use somente nome e e-mail fictícios. A verificação é simulada e os
            textos são exemplos para teste. Nenhuma conta Garmin será conectada.
          </p>
        </div>
        <div>
          <p className="eyebrow">
            {withdrawal ? 'CONTROLE DO ACOMPANHAMENTO' : 'CONVITE INDIVIDUAL'}
          </p>
          <h1>
            {done
              ? withdrawal
                ? 'Vínculo encerrado.'
                : 'Acompanhamento aceito.'
              : withdrawal
                ? 'Encerrar acompanhamento'
                : 'Seu próximo passo no esporte.'}
          </h1>
        </div>
        {loading && <p role="status">Verificando acesso…</p>}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {!loading && ready && !session && (
          <>
            <p>
              {withdrawal
                ? 'Abra a confirmação para revisar e retirar os aceites deste vínculo demonstrativo.'
                : 'Confirme seus dados e os aceites de acompanhamento. Você não precisa de conta de treinador.'}
            </p>
            <button
              className="button primary-button"
              disabled={busy}
              onClick={() =>
                perform(async () => {
                  await publicApi(
                    withdrawal ? 'withdrawal/redeem' : 'invitation/redeem',
                    { token: token.current },
                  );
                  token.current = '';
                  setReady(false);
                  setSession(await publicApi(sessionPath));
                })
              }
            >
              {busy
                ? 'Abrindo…'
                : withdrawal
                  ? 'Abrir confirmação'
                  : 'Iniciar aceite'}
            </button>
            <p className="small muted">
              O link é de uso único. Após iniciar, conclua em até 30 minutos
              neste navegador. Se precisar de outro acesso, solicite ao
              treinador.
            </p>
          </>
        )}
        {session && (
          <p className="muted">
            Treinador: <strong>{session.coachName}</strong>
          </p>
        )}
        {session && !done && !withdrawal && (
          <form
            className="athlete-form"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              void perform(async () => {
                if (!session.verified) {
                  await publicApi(
                    'enrollment/verify',
                    { email, code },
                    session.csrf,
                  );
                  setSession({ ...session, verified: true });
                } else {
                  const result = await publicApi(
                    'enrollment/accept',
                    {
                      name,
                      email,
                      accompaniment: form.get('accompaniment') === 'on',
                      dataSharing: form.get('dataSharing') === 'on',
                      documents: session.documents!.map(
                        ({ id, contentHash }) => ({ id, contentHash }),
                      ),
                    },
                    session.csrf,
                  );
                  setWithdrawalUrl(result.withdrawalUrl ?? '');
                  setSession({ ...session, accepted: true });
                }
              });
            }}
          >
            <label htmlFor="public-name">Nome completo</label>
            <input
              id="public-name"
              autoComplete="name"
              minLength={3}
              maxLength={120}
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <label htmlFor="public-email">E-mail do convite</label>
            <input
              id="public-email"
              autoComplete="email"
              type="email"
              maxLength={254}
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            {!session.verified ? (
              <>
                <label htmlFor="public-code">Código demonstrativo</label>
                <input
                  id="public-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  required
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                />
                <p className="small muted">
                  O treinador encontra o código em “Atualizar convites”, no
                  perfil do aluno fictício. Nenhum e-mail foi enviado. Válido
                  por dez minutos, com até cinco tentativas.
                </p>
              </>
            ) : (
              <>
                <p className="small" role="status">
                  Verificação simulada concluída. Confira os documentos antes de
                  aceitar.
                </p>
                {session.documents?.map((doc) => (
                  <details className="consent-document" key={doc.id}>
                    <summary>
                      {doc.purpose === 'accompaniment'
                        ? 'Acompanhamento esportivo'
                        : 'Termos e política de privacidade'}{' '}
                      · {doc.version} · exemplo
                    </summary>
                    <p>{doc.content}</p>
                  </details>
                ))}
                <label className="consent-check">
                  <input name="accompaniment" type="checkbox" required />
                  Aceito simular o acompanhamento esportivo com este treinador.
                </label>
                <label className="consent-check">
                  <input name="dataSharing" type="checkbox" required />
                  Li os exemplos de termos e privacidade e aceito simular o
                  tratamento e compartilhamento dos dados fictícios.
                </label>
              </>
            )}
            <button className="button primary-button" disabled={busy}>
              {busy
                ? 'Processando…'
                : session.verified
                  ? 'Confirmar aceites demonstrativos'
                  : 'Verificar código de teste'}
            </button>
          </form>
        )}
        {session && !done && withdrawal && (
          <form
            className="athlete-form"
            onSubmit={(event) => {
              event.preventDefault();
              void perform(async () => {
                await publicApi(
                  'withdrawal/confirm',
                  { confirm: true },
                  session.csrf,
                );
                setSession({ ...session, ended: true });
              });
            }}
          >
            <p>
              A confirmação retira os aceites demonstrativos e encerra o vínculo
              com este treinador. As evidências anteriores permanecem no
              histórico de teste. Esta ação não representa revogação Garmin.
            </p>
            <label className="consent-check">
              <input type="checkbox" required />
              Confirmo a retirada dos aceites e o encerramento deste vínculo.
            </label>
            <button className="button primary-button" disabled={busy}>
              {busy ? 'Encerrando…' : 'Confirmar encerramento'}
            </button>
          </form>
        )}
        {done && (
          <div role="status" className="journey-confirmation">
            <p>
              {withdrawal
                ? 'A retirada dos aceites foi registrada. O vínculo demonstrativo está encerrado.'
                : 'Os aceites de teste foram registrados e o treinador poderá consultar o vínculo ativo.'}
            </p>
            <p>
              <strong>Garmin não conectada.</strong> A autorização oficial será
              disponibilizada em uma próxima etapa.
            </p>
          </div>
        )}
        {withdrawalUrl && (
          <>
            <h2>Guarde seu acesso de encerramento</h2>
            <ShareLink url={withdrawalUrl} />
            <p className="small muted">
              Válido por sete dias e de uso único. Se perder o link ou ele
              expirar, solicite outro ao treinador.
            </p>
            <a className="button" href={withdrawalUrl}>
              Revisar encerramento do vínculo
            </a>
          </>
        )}
        {session?.accepted && !withdrawalUrl && !withdrawal && (
          <p className="small muted">
            Para retirar os aceites, utilize o link guardado na confirmação ou
            solicite um novo ao treinador.
          </p>
        )}
        <p className="small muted">
          Esta página não oferece acesso ao dashboard do treinador.
        </p>
      </section>
    </main>
  );
}
