import { notFound } from 'next/navigation';
import { requireCoach, serverApi } from '../../../../../lib/server-auth';
import { FeedbackEditor } from '../../../../../features/feedback/workspace';
import type {
  FeedbackWorkspace,
  History,
} from '../../../../../features/feedback/types';
export default async function Feedback({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireCoach();
  const { id } = await params;
  const base = `/activities/${encodeURIComponent(id)}/feedback`;
  const [response, historyResponse] = await Promise.all([
    serverApi(base),
    serverApi(`${base}/revisions`),
  ]);
  if (response.status === 404 || historyResponse.status === 404) notFound();
  if (!response.ok || !historyResponse.ok)
    throw new Error('Não foi possível carregar o diário.');
  const initial: FeedbackWorkspace = await response.json();
  const history: History = await historyResponse.json();
  return <FeedbackEditor initial={initial} initialHistory={history} />;
}
