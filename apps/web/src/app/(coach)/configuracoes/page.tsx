import Link from 'next/link';
import { requireCoach, serverApi } from '../../../lib/server-auth';
import { Badge, Card } from '../../../components/ui';
import {
  garminLabels,
  type GarminStatus,
} from '../../../features/garmin/types';
export default async function Settings() {
  const session = await requireCoach();
  const response = await serverApi('/garmin');
  if (!response.ok)
    throw new Error('Não foi possível consultar as configurações.');
  const data: {
    enabled: boolean;
    workerOnline: boolean;
    connections: {
      athleteId: string;
      athleteName: string;
      status: GarminStatus;
      revocationStatus: string;
    }[];
  } = await response.json();
  return (
    <main className="main-content" id="dashboard" tabIndex={-1}>
      <header className="page-header">
        <div>
          <p className="eyebrow">CONTA E INTEGRAÇÕES</p>
          <h1>Configurações</h1>
          <p className="subtitle">
            Acompanhe autorizações e sincronização dos seus alunos.
          </p>
        </div>
      </header>
      <div className="profile-stack">
        <Card title="Sua conta">
          <p>{session.coach.name}</p>
          <p className="muted small">{session.coach.email}</p>
          <p className="small muted">
            {session.mode === 'demo'
              ? 'Conta fictícia local, sem login Google real.'
              : 'Autenticação gerenciada pelo Google.'}
          </p>
        </Card>
        <Card title="Integração Garmin">
          <Badge tone="warning">Integração oficial indisponível</Badge>
          <p className="small muted">
            Acesso real depende de aprovação, credenciais e documentação
            oficial. Não há sincronização com contas Garmin reais nesta entrega.
          </p>
          <dl className="profile-status">
            <dt>Ambiente de teste</dt>
            <dd>
              {data.enabled ? 'Mock local — dados sintéticos' : 'Desabilitado'}
            </dd>
            <dt>Processamento de teste</dt>
            <dd>{data.workerOnline ? 'Disponível' : 'Offline'}</dd>
          </dl>
          {!data.connections.length ? (
            <p className="muted">
              Nenhuma conexão iniciada. O aluno autoriza pela página do convite
              após aceitar o acompanhamento.
            </p>
          ) : (
            <ul className="invitation-list">
              {data.connections.map((connection) => (
                <li key={connection.athleteId}>
                  <Link href={`/alunos/${connection.athleteId}`}>
                    {connection.athleteName}
                  </Link>
                  <p className="small">
                    {garminLabels[connection.status]}
                    {connection.revocationStatus === 'pending'
                      ? ' · Revogação pendente, coleta bloqueada'
                      : ''}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </main>
  );
}
