import { API_ORIGIN } from '../../lib/server-auth';
import { ThemeToggle } from '../../components/theme-toggle';
export const dynamic = 'force-dynamic';
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  let configured = false;
  try {
    const response = await fetch(`${API_ORIGIN}/auth/status`, {
      cache: 'no-store',
    });
    if (response.ok) configured = Boolean((await response.json()).configured);
  } catch {
    /* Falha fechada: não prometer login disponível. */
  }
  const { error } = await searchParams;
  return (
    <main className="login-page">
      <div className="login-card card">
        <div className="login-brand">
          Baldu<span>Training</span>
        </div>
        <p className="muted">Gestão e inteligência esportiva</p>
        <h1>Seu acompanhamento começa aqui.</h1>
        <p>Acesso exclusivo para treinadores previamente autorizados.</p>
        {error && (
          <p role="alert" className="form-error">
            Não foi possível entrar. Verifique a conta autorizada e tente
            novamente.
          </p>
        )}
        {configured ? (
          <a className="button primary-button" href="/api/auth/google">
            Entrar com Google
          </a>
        ) : (
          <p role="status" className="empty-state">
            O acesso está temporariamente indisponível. Entre em contato com o
            responsável pela plataforma.
          </p>
        )}
        <p className="small muted">
          O aluno participa somente pela página de convite. Não é necessário
          criar uma conta de treinador.
        </p>
        <ThemeToggle />
      </div>
    </main>
  );
}
