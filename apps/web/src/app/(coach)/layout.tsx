import { requireCoach } from '../../lib/server-auth';
import { Sidebar } from '../../components/sidebar';
import { SessionBar } from '../../components/session-bar';
export const dynamic = 'force-dynamic';
export default async function CoachLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { coach, mode } = await requireCoach();
  return (
    <>
      <Sidebar />
      <SessionBar name={coach.name} />
      {mode === 'demo' && (
        <div className="demo-session-banner" role="note">
          <strong>Conta fictícia · Modo demonstração</strong>
          <span>
            Sem login Google. Todos os cadastros desta conta são dados de teste.
          </span>
        </div>
      )}
      {children}
    </>
  );
}
