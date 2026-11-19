'use client';
import { useEffect, useState } from 'react';
import type { AthleteOptions } from './types';
export function AthleteFilter({
  initial,
  selectedId,
  refreshToken,
}: {
  initial: AthleteOptions;
  selectedId: string;
  refreshToken: string;
}) {
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState(initial.items);
  const [selected, setSelected] = useState(selectedId);
  const [names, setNames] = useState(initial.selected);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/monitoring/athletes?q=${encodeURIComponent(query)}${selected ? `&selected=${selected}` : ''}`,
          { signal: controller.signal, cache: 'no-store' },
        );
        if (!response.ok)
          throw new Error('Não foi possível buscar alunos. Tente novamente.');
        const result: AthleteOptions = await response.json();
        if (!controller.signal.aborted) {
          setOptions(result.items);
          setNames(result.selected);
          setError('');
        }
      } catch {
        if (!controller.signal.aborted)
          setError(
            'Não foi possível buscar alunos. Altere a busca para tentar novamente.',
          );
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, selected, refreshToken]);
  return (
    <div className="monitoring-athlete-filter">
      <label>
        Buscar aluno
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          maxLength={120}
          placeholder="Buscar por nome"
        />
      </label>
      <label>
        Aluno
        <select
          name="athleteId"
          value={selected}
          onChange={(e) => {
            const id = e.target.value;
            setSelected(id);
            setNames(options.find((a) => a.id === id) ?? null);
          }}
        >
          <option value="">Todos os alunos</option>
          {names && !options.some((o) => o.id === names.id) && (
            <option value={names.id}>{names.name}</option>
          )}
          {options.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </label>
      {error && (
        <p className="form-error" role="status">
          {error}
        </p>
      )}
      <span className="muted small">
        Até 20 resultados por busca, somente com itens autorizados.
      </span>
    </div>
  );
}
