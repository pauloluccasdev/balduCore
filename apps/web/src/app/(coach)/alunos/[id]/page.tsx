import Link from 'next/link';
import { InvitationPanel } from '../../../../features/invitations/invitation-panel';
import { notFound } from 'next/navigation';
import { requireCoach, serverApi } from '../../../../lib/server-auth';
import { Card, Badge } from '../../../../components/ui';
import { AthleteForm } from '../../../../features/athletes/athlete-form';
import { statusLabel, type Athlete } from '../../../../features/athletes/types';
export default async function Profile({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireCoach();
  const { id } = await params;
  const [response, invitationsResponse] = await Promise.all([
    serverApi(`/athletes/${encodeURIComponent(id)}`),
    session.mode === 'demo'
      ? serverApi(`/athletes/${encodeURIComponent(id)}/invitations`)
      : Promise.resolve(null),
  ]);
  if (response.status === 404) notFound();
  if (!response.ok) throw new Error('Não foi possível carregar o perfil.');
  const athlete: Athlete = await response.json();
  if (invitationsResponse && !invitationsResponse.ok)
    throw new Error('Não foi possível carregar convites.');
  const invitations = invitationsResponse
    ? (await invitationsResponse.json()).items
    : [];
  return (
    <main className="main-content" id="dashboard">
      <header className="page-header">
        <div>
          <Link className="muted small" href="/alunos">
            ← Voltar para alunos
          </Link>
          <h1>{athlete.name}</h1>
          <p className="subtitle">{athlete.email}</p>
        </div>
        <Badge>{statusLabel[athlete.relationship?.status ?? 'pending']}</Badge>
      </header>
      <div className="students-layout">
        <div className="profile-stack">
          <Card title="Dados do aluno">
            <AthleteForm key={athlete.version} athlete={athlete} />
          </Card>
          {session.mode === 'demo' && (
            <Card title="Convites e aceites">
              <InvitationPanel
                initialItems={invitations}
                athleteId={athlete.id}
                status={athlete.relationship?.status ?? 'pending'}
              />
            </Card>
          )}
          <Card title="Histórico esportivo">
            <div className="empty-state">
              <p>
                Atividades e análises estarão disponíveis após a integração
                esportiva. Nenhum dado demonstrativo é associado a este
                cadastro.
              </p>
            </div>
          </Card>
        </div>
        <Card title="Acompanhamento">
          <dl className="profile-status">
            <dt>Vínculo esportivo</dt>
            <dd>{statusLabel[athlete.relationship?.status ?? 'pending']}</dd>
            <dt>Garmin</dt>
            <dd>Não conectada</dd>
          </dl>
          <p className="muted small">
            Vínculo e autorização Garmin são independentes. O aceite será feito
            pelo aluno na página pública. Convites estão disponíveis no modo
            demonstrativo local.
          </p>
        </Card>
      </div>
    </main>
  );
}
