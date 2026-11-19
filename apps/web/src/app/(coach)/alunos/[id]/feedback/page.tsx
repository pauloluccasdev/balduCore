import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireCoach, serverApi } from '../../../../../lib/server-auth';
import { AthleteFeedbackHistory } from '../../../../../features/feedback/athlete-history';
import { Card } from '../../../../../components/ui';
export default async function History({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  await requireCoach();
  const { id } = await params;
  const response = await serverApi(`/athletes/${encodeURIComponent(id)}`);
  if (response.status === 404) notFound();
  if (!response.ok) throw new Error('Não foi possível carregar o aluno.');
  const athlete: { name: string } = await response.json();
  const query = await searchParams;
  const page =
    query.page && /^[1-9]\d{0,3}$/.test(query.page) ? Number(query.page) : 1;
  return (
    <main className="main-content" id="dashboard">
      <header className="page-header">
        <div>
          <Link href={`/alunos/${id}`}>← Perfil do aluno</Link>
          <h1>Diários de {athlete.name}</h1>
        </div>
      </header>
      <Card title="Feedback por atividade">
        <AthleteFeedbackHistory athleteId={id} page={page} />
      </Card>
    </main>
  );
}
