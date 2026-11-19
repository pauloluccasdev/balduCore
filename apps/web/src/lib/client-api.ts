export async function mutate(
  path: string,
  method: 'POST' | 'PATCH' | 'PUT',
  body?: unknown,
) {
  const session = await fetch('/api/auth/session', { cache: 'no-store' });
  if (session.status === 401) {
    window.location.assign('/login');
    throw new Error('Sua sessão expirou. Entre novamente.');
  }
  if (!session.ok)
    throw new Error('Não foi possível verificar sua sessão. Tente novamente.');
  const { csrf } = await session.json();
  const response = await fetch(`/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (response.status === 401) {
    window.location.assign('/login');
    throw new Error('Sua sessão expirou.');
  }
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(
      typeof data?.message === 'string'
        ? data.message
        : 'Não foi possível salvar. Tente novamente.',
    );
  }
  return response.status === 204 ? null : response.json();
}
