'use client';
import { useSyncExternalStore } from 'react';
import { Moon, Sun } from 'lucide-react';
function subscribe(callback: () => void) {
  function sync() {
    try {
      document.documentElement.dataset.theme =
        localStorage.getItem('balducore-theme') === 'light' ? 'light' : 'dark';
    } catch {
      /* preferência opcional */
    }
    callback();
  }
  window.addEventListener('storage', sync);
  window.addEventListener('balducore-theme', callback);
  return () => {
    window.removeEventListener('storage', sync);
    window.removeEventListener('balducore-theme', callback);
  };
}
export function ThemeToggle() {
  const theme = useSyncExternalStore(
    subscribe,
    () => document.documentElement.dataset.theme ?? 'dark',
    () => 'dark',
  );
  function toggle() {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem('balducore-theme', next);
    } catch {
      /* Sem storage, a troca ainda funciona nesta página. */
    }
    window.dispatchEvent(new Event('balducore-theme'));
  }
  return (
    <button className="button theme-toggle" onClick={toggle}>
      {theme === 'dark' ? (
        <Sun size={16} aria-hidden="true" />
      ) : (
        <Moon size={16} aria-hidden="true" />
      )}
      <span>Modo {theme === 'dark' ? 'claro' : 'escuro'}</span>
    </button>
  );
}
