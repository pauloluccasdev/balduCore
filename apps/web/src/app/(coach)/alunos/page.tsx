import { garminLabels } from '../../../features/garmin/types';
import Link from 'next/link';
import { requireCoach, serverApi } from '../../../lib/server-auth';
import { ThemeToggle } from '../../../components/theme-toggle';
import { Card, Badge } from '../../../components/ui';
import { AthleteForm } from '../../../features/athletes/athlete-form';
import { statusLabel, type Athlete } from '../../../features/athletes/types';
export default async function Athletes({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  await requireCoach();
  const query = await searchParams;
  const params = new URLSearchParams();
  for (const key of ['q', 'status', 'page'] as const)
    if (typeof query[key] === 'string' && query[key])
      params.set(key, query[key]);
  const response = await serverApi(`/athletes?${params}`);
  const invalid = response.status === 400;
  if (response.status === 401) {
    await requireCoach();
  }
  if (!response.ok && !invalid) throw new Error('Falha ao carregar alunos.');
  const data: { items: Athlete[]; total: number; page: number; limit: number } =
    invalid
      ? { items: [], total: 0, page: 1, limit: 20 }
      : await response.json();
  function pageHref(page: number) {
    const next = new URLSearchParams(params);
    next.set('page', String(page));
    return `/alunos?${next}`;
  }
  return (
    <main className="main-content" id="dashboard">
      <header className="page-header">
        <div>
          <h1>Alunos</h1>
          <p className="subtitle">
            Gerencie seus alunos e acompanhe o estado do vínculo.
          </p>
        </div>
        <ThemeToggle />
      </header>
      <div className="students-layout">
        <Card title="Seus alunos" aside={<Badge>{data.total} alunos</Badge>}>
          <form className="athlete-filters" action="/alunos">
            <label>
              Buscar aluno
              <input
                name="q"
                maxLength={120}
                defaultValue={query.q}
                placeholder="Nome ou e-mail"
              />
            </label>
            <label>
              Vínculo
              <select name="status" defaultValue={query.status ?? ''}>
                <option value="">Todos os vínculos</option>
                <option value="pending">Pendente</option>
                <option value="active">Ativo</option>
                <option value="ended">Encerrado</option>
              </select>
            </label>
            <button className="button">Buscar</button>
            <Link className="button" href="/alunos">
              Limpar filtros
            </Link>
          </form>
          {invalid && (
            <p role="alert" className="form-error">
              Filtros inválidos. Limpe os filtros e tente novamente.
            </p>
          )}
          {!data.items.length ? (
            <div className="empty-state">
              <h3>
                {params.size
                  ? 'Nenhum aluno encontrado.'
                  : 'Seu acompanhamento começa com o primeiro aluno.'}
              </h3>
              <p>Cadastre um aluno ou ajuste os filtros.</p>
            </div>
          ) : (
            <div
              className="table-scroll"
              tabIndex={0}
              role="region"
              aria-label="Lista de alunos"
            >
              <table>
                <thead>
                  <tr>
                    <th scope="col">Aluno</th>
                    <th scope="col">E-mail</th>
                    <th scope="col">Vínculo</th>
                    <th scope="col">Garmin</th>
                    <th scope="col">Perfil</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((athlete) => (
                    <tr key={athlete.id}>
                      <td>
                        <strong>{athlete.name}</strong>
                      </td>
                      <td>{athlete.email}</td>
                      <td>
                        {statusLabel[athlete.relationship?.status ?? 'pending']}
                      </td>
                      <td>
                        {
                          garminLabels[
                            athlete.relationship?.garminConnection?.status ??
                              'not_connected'
                          ]
                        }
                      </td>
                      <td>
                        <Link className="button" href={`/alunos/${athlete.id}`}>
                          Abrir perfil
                          <span className="sr-only"> de {athlete.name}</span>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <nav aria-label="Paginação" className="pagination">
            {data.page > 1 && (
              <Link className="button" href={pageHref(data.page - 1)}>
                Anterior
              </Link>
            )}
            <span className="muted small">
              Página {data.page} de{' '}
              {Math.max(1, Math.ceil(data.total / data.limit))}
            </span>
            {data.page * data.limit < data.total && (
              <Link className="button" href={pageHref(data.page + 1)}>
                Próxima
              </Link>
            )}
          </nav>
        </Card>
        <Card title="Cadastrar aluno">
          <AthleteForm />
        </Card>
      </div>
    </main>
  );
}
