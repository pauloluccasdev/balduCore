import Link from 'next/link';
import { serverApi } from '../../lib/server-auth';
import { sports } from '../activities/types';
export async function AthleteFeedbackHistory({
  athleteId,
  page = 1,
}: {
  athleteId: string;
  page?: number;
}) {
  const response = await serverApi(
    `/athletes/${encodeURIComponent(athleteId)}/feedback?page=${page}`,
  );
  if (!response.ok)
    return (
      <p role="status">
        Diários indisponíveis. É necessário vínculo ativo com aceites válidos.
        Tente novamente se o acompanhamento está ativo.
      </p>
    );
  const data: {
    items: {
      activityId: string;
      version: number;
      updatedAt: string;
      activity: { sport: string; startedAt: string; isSynthetic: boolean };
    }[];
    total: number;
  } = await response.json();
  return (
    <>
      {!data.total && (
        <p className="empty-state">
          Nenhum diário registrado. Abra uma atividade para adicionar feedback.
        </p>
      )}
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Atividade (UTC)</th>
              <th>Diário</th>
              <th>Última edição (UTC)</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((item) => (
              <tr key={item.activityId}>
                <td>
                  <Link href={`/atividades/${item.activityId}/feedback`}>
                    {sports[item.activity.sport] ?? item.activity.sport} ·{' '}
                    {new Date(item.activity.startedAt).toLocaleString('pt-BR', {
                      timeZone: 'UTC',
                    })}
                  </Link>
                  {item.activity.isSynthetic && (
                    <span className="muted small"> · sintética</span>
                  )}
                </td>
                <td>Revisão {item.version}</td>
                <td>
                  {new Date(item.updatedAt).toLocaleString('pt-BR', {
                    timeZone: 'UTC',
                  })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.total > 20 && (
        <nav className="pagination" aria-label="Páginas de diários do aluno">
          {page > 1 && (
            <Link
              className="button"
              href={`/alunos/${athleteId}/feedback?page=${page - 1}`}
            >
              Anterior
            </Link>
          )}
          <span>Página {page}</span>
          {page * 20 < data.total && (
            <Link
              className="button"
              href={`/alunos/${athleteId}/feedback?page=${page + 1}`}
            >
              Próxima
            </Link>
          )}
        </nav>
      )}
    </>
  );
}
