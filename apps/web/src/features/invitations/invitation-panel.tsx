'use client';
import { useCallback, useState, useId } from 'react';
import { useRouter } from 'next/navigation';
import { mutate } from '../../lib/client-api';
import { Badge } from '../../components/ui';

export type Invitation = {
  id: string;
  status: 'pending' | 'used' | 'expired' | 'revoked';
  expiresAt: string;
  acceptedAt: string | null;
  purpose?: string;
  demoCode: string | null;
  codeExpiresAt: string | null;
  codeUnavailable: boolean;
};
const labels = {
  pending: 'Pendente',
  used: 'Utilizado',
  expired: 'Expirado',
  revoked: 'Revogado',
};
export function ShareLink({
  url,
  label = 'Link exclusivo — guarde antes de sair desta página',
}: {
  url: string;
  label?: string;
}) {
  const id = useId();
  const [copied, setCopied] = useState(false);
  return (
    <div className="share-link">
      <label htmlFor={id}>{label}</label>
      <textarea
        id={id}
        rows={3}
        readOnly
        value={url}
        onFocus={(event) => event.currentTarget.select()}
      />
      <button
        type="button"
        className="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
          } catch {
            setCopied(false);
          }
        }}
      >
        {copied ? 'Link copiado' : 'Copiar link'}
      </button>
      <p className="small muted">
        Compartilhe manualmente apenas com o destinatário. O segredo não poderá
        ser recuperado; gere outro link se necessário.
      </p>
    </div>
  );
}
export function InvitationPanel({
  athleteId,
  status,
  initialItems,
}: {
  athleteId: string;
  status: 'pending' | 'active' | 'ended';
  initialItems: Invitation[];
}) {
  const router = useRouter();
  const [items, setItems] = useState<Invitation[]>(initialItems);
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const response = await fetch(`/api/athletes/${athleteId}/invitations`, {
      cache: 'no-store',
    });
    if (!response.ok) throw new Error('Não foi possível consultar convites.');
    setItems((await response.json()).items);
  }, [athleteId]);
  async function action(path: string) {
    setBusy(true);
    setError('');
    try {
      const result = await mutate(`/athletes/${athleteId}/${path}`, 'POST');
      if (result.url) setUrl(result.url);
      else if (path.endsWith('/revoke')) setUrl('');
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
      <p className="small muted">
        Convites e aceites demonstrativos. Não envie a alunos reais. Nenhuma
        mensagem é enviada automaticamente.
      </p>
      {status === 'pending' && (
        <>
          <button
            className="button primary-button"
            disabled={busy}
            onClick={() => action('invitations')}
          >
            Gerar convite de teste
          </button>
          <p className="small muted">
            Válido por 48 horas. Gerar outro revoga os anteriores, inclusive
            jornadas em andamento.
          </p>
        </>
      )}
      {status === 'active' && (
        <>
          <button
            className="button"
            disabled={busy}
            onClick={() => action('withdrawal-link')}
          >
            Gerar link de encerramento
          </button>
          <p className="small muted">
            Válido por sete dias. Substitui o link anterior e sua sessão
            pública. O vínculo continua ativo até a confirmação do aluno.
          </p>
        </>
      )}
      {status === 'ended' && (
        <p>
          Vínculo encerrado. Nova vinculação não está disponível nesta etapa.
        </p>
      )}
      {url && <ShareLink key={url} url={url} />}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <div className="card-heading">
        <h3>Últimos convites</h3>
        <button
          className="button"
          disabled={busy}
          onClick={async () => {
            setError('');
            try {
              await load();
            } catch {
              setError('Não foi possível atualizar.');
            }
          }}
        >
          Atualizar convites
        </button>
      </div>
      {!items.length && <p className="muted small">Nenhum convite emitido.</p>}
      <ul className="invitation-list">
        {items.map((item) => (
          <li key={item.id}>
            <Badge tone={item.status === 'pending' ? 'warning' : 'neutral'}>
              {labels[item.status]}
            </Badge>
            <p className="small">
              Expira em {new Date(item.expiresAt).toLocaleString('pt-BR')}
            </p>
            {item.acceptedAt ? (
              <p className="small">Aceite demonstrativo registrado.</p>
            ) : (
              item.status === 'used' && (
                <p className="small muted">
                  {item.purpose === 'garmin'
                    ? 'Link de conexão resgatado; aceite esportivo anterior preservado.'
                    : 'Link resgatado; acompanhamento ainda não aceito.'}
                </p>
              )
            )}
            {item.codeUnavailable && (
              <p className="small form-error">
                Código indisponível após reinício. Gere outro convite de teste.
              </p>
            )}
            {item.demoCode && (
              <div className="demo-code" role="note">
                <strong>
                  Código simulado: <span>{item.demoCode}</span>
                </strong>
                <p className="small">
                  Somente para teste. Informe ao participante fictício. Expira
                  em {new Date(item.codeExpiresAt!).toLocaleTimeString('pt-BR')}
                  . Não foi enviado por e-mail.
                </p>
              </div>
            )}
            {!item.acceptedAt && ['pending', 'used'].includes(item.status) && (
              <button
                className="button"
                disabled={busy}
                onClick={() => action(`invitations/${item.id}/revoke`)}
              >
                Revogar convite
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
