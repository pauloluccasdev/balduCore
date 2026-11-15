import { requireCoach } from '../../lib/server-auth';
import { Sidebar } from '../../components/sidebar';
import { SessionBar } from '../../components/session-bar';
export const dynamic = 'force-dynamic';
export default async function CoachLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { coach } = await requireCoach();
  return (
    <>
      <Sidebar />
      <SessionBar name={coach.name} />
      {children}
    </>
  );
}
