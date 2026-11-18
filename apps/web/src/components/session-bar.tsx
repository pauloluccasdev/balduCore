'use client';
import { useState } from 'react';
import { mutate } from '../lib/client-api';
export function SessionBar({ name }: { name: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <div className="session-bar">
      <span>{name}</span>
      {error && <span role="alert">{error}</span>}
      <button
        className="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError('');
          try {
            await mutate('/auth/logout', 'POST');
            window.location.assign('/login');
          } catch {
            setError('Não foi possível sair. Tente novamente.');
            setBusy(false);
          }
        }}
      >
        {busy ? 'Saindo…' : 'Sair'}
      </button>
    </div>
  );
}
