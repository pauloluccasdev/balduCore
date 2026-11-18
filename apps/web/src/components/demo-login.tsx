'use client';
import { useState } from 'react';
export function DemoLogin() {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  async function login(account: '1' | '2') {
    setBusy(account);
    setError('');
    try {
      const response = await fetch('/api/auth/demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account }),
      });
      if (!response.ok)
        throw new Error(
          'Não foi possível entrar na demonstração. Verifique se o ambiente local está disponível.',
        );
      window.location.assign('/');
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'Não foi possível entrar.',
      );
      setBusy(null);
    }
  }
  return (
    <div className="demo-login-options">
      <p className="empty-state" role="note">
        Modo demonstração local. Use somente alunos e informações de teste.
      </p>
      <button
        className="button primary-button"
        disabled={busy !== null}
        onClick={() => login('1')}
      >
        {busy === '1' ? 'Entrando…' : 'Entrar como Treinador Demo 1'}
      </button>
      <button
        className="button"
        disabled={busy !== null}
        onClick={() => login('2')}
      >
        {busy === '2' ? 'Entrando…' : 'Entrar como Treinador Demo 2'}
      </button>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </div>
  );
}
