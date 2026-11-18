import Link from 'next/link';
export default function Missing() {
  return (
    <main className="main-content">
      <div className="card">
        <h1>Aluno não encontrado.</h1>
        <p className="muted">Verifique o endereço ou volte para sua lista.</p>
        <Link className="button" href="/alunos">
          Voltar para alunos
        </Link>
      </div>
    </main>
  );
}
