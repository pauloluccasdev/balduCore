import { requireCoach } from '../../lib/server-auth';
import { Dashboard } from '../../features/dashboard/dashboard';
export default async function Page() {
  await requireCoach();
  return <Dashboard />;
}
