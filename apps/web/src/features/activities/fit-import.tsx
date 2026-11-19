'use client';
import { useState, useRef } from 'react';
import Link from 'next/link';
interface ImportStatus {
  id: string;
  status: string;
  activityId: string | null;
  attempts: number;
  errorCode: string | null;
}
const labels: Record<string, string> = {
  queued: 'Na fila',
  processing: 'Processando',
  retry: 'Aguardando nova tentativa',
  processed: 'Concluída',
  failed: 'Falhou',
  cancelled: 'Cancelada',
};
export function FitImport({ athleteId }: { athleteId: string }) {
  const [items, setItems] = useState<ImportStatus[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  async function refresh() {
    const response = await fetch(`/api/athletes/${athleteId}/fit-imports`, {
      cache: 'no-store',
    });
    if (!response.ok)
      throw new Error(
        'Não foi possível consultar importações. Verifique o vínculo.',
      );
    setItems(await response.json());
  }
  async function upload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      const data = new FormData(event.currentTarget);
      const file = data.get('file');
      if (!(file instanceof File) || !file.size || file.size > 5 * 1024 * 1024)
        throw new Error('Selecione um FIT de teste de até 5 MiB.');
      const session = await fetch('/api/auth/session', { cache: 'no-store' });
      if (!session.ok) throw new Error('Entre novamente para importar.');
      const { csrf } = await session.json();
      const response = await fetch(`/api/athletes/${athleteId}/fit-imports`, {
        method: 'POST',
        headers: {
          'content-type': 'application/octet-stream',
          'x-csrf-token': csrf,
          'x-demo-file': 'true',
        },
        body: file,
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.message ?? 'Falha na importação.');
      setMessage(
        'FIT recebido. A publicação ocorre pelo worker; consulte o processamento abaixo.',
      );
      form.current?.reset();
      await refresh();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Falha na importação.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="invitation-panel">
      <p className="muted small">
        Somente arquivos sintéticos de teste, até 5 MiB, uma sessão, 20 mil
        amostras e 2 mil splits. O FIT bruto é descartado; GPS e identificadores
        de dispositivo não são persistidos. Não exige conexão Garmin.
      </p>
      <form ref={form} className="athlete-form" onSubmit={upload}>
        <label>
          Arquivo FIT de teste
          <input type="file" name="file" accept=".fit" required />
        </label>
        <label className="consent-check">
          <input type="checkbox" required />
          Confirmo que este arquivo contém apenas dados sintéticos de teste.
        </label>
        <button className="button primary-button" disabled={busy}>
          {busy ? 'Validando FIT…' : 'Importar FIT de teste'}
        </button>
      </form>
      <p role="status">{message}</p>
      <button
        className="button"
        disabled={busy}
        onClick={() => {
          void refresh().catch((error) => setMessage(error.message));
        }}
      >
        Atualizar processamento
      </button>
      {items.length > 0 && (
        <ul className="import-status-list">
          {items.map((item) => (
            <li key={item.id}>
              <span>
                {labels[item.status] ?? item.status} · {item.attempts}{' '}
                tentativa(s)
              </span>
              {item.errorCode && <code>{item.errorCode}</code>}
              {item.activityId && (
                <Link href={`/atividades/${item.activityId}`}>
                  Ver atividade →
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
