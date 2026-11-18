import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { createTestApp } from './test-app.js';
export type TestApp = Awaited<ReturnType<typeof createTestApp>>;
export const cookieOf = (response: Response) =>
  response.headers.getSetCookie()[0]?.split(';')[0] ?? '';
export async function enrolledAthlete(app: TestApp) {
  const post = (path: string, data: unknown, cookie = '', csrf = '') =>
    fetch(`${app.base}${path}`, {
      method: 'POST',
      headers: {
        origin: app.config.APP_ORIGIN,
        cookie,
        'content-type': 'application/json',
        'x-csrf-token': csrf,
      },
      body: JSON.stringify(data),
    });
  const get = (path: string, cookie = '') =>
    fetch(`${app.base}${path}`, { headers: { cookie } });
  const login = async (account: string) => {
    const response = await post('/auth/demo', { account });
    const cookie = cookieOf(response);
    const session = await (await get('/auth/session', cookie)).json();
    return {
      cookie,
      csrf: session.csrf as string,
      id: session.coach.id as string,
    };
  };
  const coach = await login('1');
  const other = await login('2');
  const athlete = await (
    await post(
      '/athletes',
      {
        name: 'Participante fictício Garmin',
        email: `garmin-${randomUUID()}@example.test`,
      },
      coach.cookie,
      coach.csrf,
    )
  ).json();
  const invite = await (
    await post(
      `/athletes/${athlete.id}/invitations`,
      {},
      coach.cookie,
      coach.csrf,
    )
  ).json();
  const redeemed = await post('/public/invitation/redeem', {
    token: new URL(invite.url).hash.slice(1),
  });
  assert.equal(redeemed.status, 201);
  const cookie = cookieOf(redeemed);
  const session = await (await get('/public/enrollment', cookie)).json();
  const invites = await (
    await get(`/athletes/${athlete.id}/invitations`, coach.cookie)
  ).json();
  assert.equal(
    (
      await post(
        '/public/enrollment/verify',
        { email: athlete.email, code: invites.items[0].demoCode },
        cookie,
        session.csrf,
      )
    ).status,
    201,
  );
  const acceptance = await post(
    '/public/enrollment/accept',
    {
      name: athlete.name,
      email: athlete.email,
      accompaniment: true,
      dataSharing: true,
      documents: session.documents.map(
        ({ id, contentHash }: { id: string; contentHash: string }) => ({
          id,
          contentHash,
        }),
      ),
    },
    cookie,
    session.csrf,
  );
  assert.equal(acceptance.status, 201);
  const accepted = await acceptance.json();
  const start = async () => {
    const response = await post(
      '/public/garmin/start',
      {},
      cookie,
      session.csrf,
    );
    assert.equal(response.status, 201);
    return new URL((await response.json()).url).hash.slice(1);
  };
  const connect = async () => {
    const state = await start();
    const response = await post(
      '/public/garmin/mock/finish',
      { state, decision: 'approve' },
      cookie,
      session.csrf,
    );
    assert.equal(response.status, 201);
    return app.database.client.garminConnection.findUniqueOrThrow({
      where: {
        coachId_athleteId: { coachId: coach.id, athleteId: athlete.id },
      },
    });
  };
  const simulate = (scenario: string) =>
    post(
      `/athletes/${athlete.id}/garmin/mock`,
      { scenario },
      coach.cookie,
      coach.csrf,
    );
  return {
    athlete,
    coach,
    other,
    student: { cookie, csrf: session.csrf as string },
    post,
    get,
    start,
    connect,
    simulate,
    withdrawalUrl: accepted.withdrawalUrl as string,
  };
}
