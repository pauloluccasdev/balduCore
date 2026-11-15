import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
export const API_ORIGIN =
  process.env.API_INTERNAL_ORIGIN ?? 'http://127.0.0.1:3001';
export const serverApi = async (path: string) => {
  const jar = await cookies();
  const session =
    jar.get('__Host-balducore_session') ?? jar.get('balducore_session');
  return fetch(`${API_ORIGIN}${path}`, {
    headers: session
      ? { cookie: `${session.name}=${encodeURIComponent(session.value)}` }
      : {},
    cache: 'no-store',
  });
};
export const requireCoach = cache(async () => {
  const response = await serverApi('/auth/session');
  if (response.status === 401) redirect('/login');
  if (!response.ok) throw new Error('Não foi possível verificar sua sessão.');
  return (await response.json()) as {
    coach: { id: string; name: string; email: string };
  };
});
