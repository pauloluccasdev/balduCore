'use client';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="main-content">
      <div className="card">
        <h1>Não foi possível carregar os dados.</h1>
        <p className="muted">Tente novamente em instantes.</p>
        <button className="button" onClick={reset}>
          Tentar novamente
        </button>
      </div>
    </main>
  );
}
