import { notFound } from 'next/navigation';
import { requireCoach, serverApi } from '../../../../lib/server-auth';
import { AnalysisWorkspace } from '../../../../features/analysis/workspace';
import type { Workspace } from '../../../../features/analysis/types';
export default async function Analysis({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireCoach();
  const { id } = await params;
  const response = await serverApi(
    `/activities/${encodeURIComponent(id)}/analysis`,
  );
  if (response.status === 404) notFound();
  if (!response.ok)
    throw new Error('Não foi possível carregar a análise esportiva.');
  const data: Workspace = await response.json();
  return <AnalysisWorkspace initial={data} />;
}
