'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { mutate } from '../../lib/client-api';
import type { Athlete } from './types';
export function AthleteForm({ athlete }: { athlete?: Athlete }) {
  const router = useRouter();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="athlete-form"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        setBusy(true);
        setError('');
        try {
          const saved = await mutate(
            athlete ? `/athletes/${athlete.id}` : '/athletes',
            athlete ? 'PATCH' : 'POST',
            {
              name: form.get('name'),
              email: form.get('email'),
              ...(athlete ? { version: athlete.version } : {}),
            },
          );
          router.push(`/alunos/${saved.id}`);
          router.refresh();
        } catch (error) {
          setError(error instanceof Error ? error.message : 'Erro ao salvar.');
        } finally {
          setBusy(false);
        }
      }}
    >
      <label htmlFor="athlete-name">Nome completo</label>
      <input
        id="athlete-name"
        name="name"
        autoComplete="name"
        minLength={3}
        maxLength={120}
        required
        defaultValue={athlete?.name}
      />
      <label htmlFor="athlete-email">E-mail</label>
      <input
        id="athlete-email"
        name="email"
        type="email"
        autoComplete="email"
        maxLength={254}
        required
        defaultValue={athlete?.email}
      />
      <p className="small muted">
        O cadastro não representa aceite de acompanhamento ou autorização
        Garmin.
      </p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button className="button primary-button" disabled={busy}>
        {busy ? 'Salvando…' : athlete ? 'Salvar alterações' : 'Cadastrar aluno'}
      </button>
    </form>
  );
}
