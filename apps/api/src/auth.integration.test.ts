import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp } from './test-support/test-app.js';
import { digest } from './modules/auth/security.js';
test('OIDC assinado, vínculo pendente, concorrência, CSRF, autorização, expiração e revogação', async () => {
  const server = await createTestApp();
  const { base, database, config } = server;
  const suffix = String(Date.now());
  const tokens: string[] = [];
  async function login(subject: string, email: string, mode = 'valid') {
    const start = await fetch(`${base}/auth/google`, { redirect: 'manual' });
    assert.equal(start.status, 303);
    const browser = start.headers.get('set-cookie')!.split(';')[0];
    const authorize = new URL(start.headers.get('location')!);
    authorize.searchParams.set('sub', subject);
    authorize.searchParams.set('email', email);
    authorize.searchParams.set('mode', mode);
    const approved = await fetch(authorize, { redirect: 'manual' });
    const callback = new URL(approved.headers.get('location')!);
    const result = await fetch(
      `${base}/auth/google/callback${callback.search}`,
      { redirect: 'manual', headers: { cookie: browser } },
    );
    const sessionCookie = result.headers
      .getSetCookie()
      .find((item) => item.startsWith('balducore_session='))
      ?.split(';')[0];
    if (sessionCookie) tokens.push(sessionCookie);
    return { result, cookie: sessionCookie, browser, callback };
  }
  async function session(cookie: string) {
    const r = await fetch(`${base}/auth/session`, { headers: { cookie } });
    assert.equal(r.status, 200);
    return r.json();
  }
  async function mutation(
    path: string,
    cookie: string,
    csrf: string,
    body: unknown,
    method = 'POST',
    origin = config.APP_ORIGIN,
  ) {
    return fetch(`${base}${path}`, {
      method,
      headers: {
        cookie,
        origin,
        'content-type': 'application/json',
        'x-csrf-token': csrf,
      },
      body: JSON.stringify(body),
    });
  }
  const coachSubjects = [`a-${suffix}`, `b-${suffix}`];
  try {
    assert.equal((await fetch(`${base}/athletes`)).status, 401);
    for (const mode of ['nonce', 'audience', 'expired', 'signature']) {
      const denied = await login(
        `invalid-${suffix}`,
        'coach.a@gmail.com',
        mode,
      );
      assert.equal(denied.cookie, undefined);
    }
    const notAllowed = await login(`outsider-${suffix}`, 'unknown@gmail.com');
    assert.equal(notAllowed.cookie, undefined);
    // Browser incorreto não consome uma tentativa válida; expiração bloqueia retorno.
    const beginning = await fetch(`${base}/auth/google`, {
      redirect: 'manual',
    });
    const loginBrowser = beginning.headers.get('set-cookie')!.split(';')[0];
    const approvedLogin = await fetch(beginning.headers.get('location')!, {
      redirect: 'manual',
    });
    const pendingCallback = new URL(approvedLogin.headers.get('location')!);
    const wrongBrowser = await fetch(
      `${base}/auth/google/callback${pendingCallback.search}`,
      {
        redirect: 'manual',
        headers: { cookie: 'balducore_login=wrong-browser' },
      },
    );
    assert.ok(
      !wrongBrowser.headers
        .getSetCookie()
        .some((item) => item.startsWith('balducore_session=')),
    );
    await database.client.authAttempt.update({
      where: { stateHash: digest(pendingCallback.searchParams.get('state')!) },
      data: { expiresAt: new Date(0) },
    });
    const expiredAttempt = await fetch(
      `${base}/auth/google/callback${pendingCallback.search}`,
      { redirect: 'manual', headers: { cookie: loginBrowser } },
    );
    assert.ok(
      !expiredAttempt.headers
        .getSetCookie()
        .some((item) => item.startsWith('balducore_session=')),
    );
    const [a, parallel] = await Promise.all([
      login(coachSubjects[0], 'coach.a@gmail.com'),
      login(coachSubjects[0], 'coach.a@gmail.com'),
    ]);
    assert.ok(parallel.cookie);
    const b = await login(coachSubjects[1], 'coach.b@gmail.com');
    assert.ok(a.cookie);
    assert.ok(b.cookie);
    assert.match(a.result.headers.getSetCookie()[0], /HttpOnly/);
    assert.match(a.result.headers.getSetCookie()[0], /SameSite=Lax/);
    const sa = await session(a.cookie);
    const sb = await session(b.cookie);
    assert.equal(
      (
        await fetch(`${base}/auth/google/callback${a.callback.search}`, {
          redirect: 'manual',
          headers: { cookie: a.browser },
        })
      ).headers
        .getSetCookie()
        .some((item) => item.startsWith('balducore_session=')),
      false,
    );
    const body = {
      name: 'Aluno de teste',
      email: `ALUNO-${suffix}@example.test`,
    };
    assert.equal(
      (await mutation('/athletes', a.cookie, 'invalid', body)).status,
      403,
    );
    assert.equal(
      (
        await mutation(
          '/athletes',
          a.cookie,
          sa.csrf,
          body,
          'POST',
          'https://evil.example',
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await mutation('/athletes', a.cookie, sa.csrf, {
          ...body,
          coachId: sb.coach.id,
        })
      ).status,
      400,
    );
    const race = await Promise.all([
      mutation('/athletes', a.cookie, sa.csrf, body),
      mutation('/athletes', a.cookie, sa.csrf, body),
    ]);
    assert.deepEqual(race.map((r) => r.status).sort(), [201, 409]);
    const athlete = await race.find((r) => r.status === 201)!.json();
    assert.equal(athlete.relationship.status, 'pending');
    assert.equal(athlete.email, body.email.toLowerCase());
    assert.equal(
      (await mutation('/athletes', b.cookie, sb.csrf, body)).status,
      201,
    );
    assert.equal(
      (
        await fetch(`${base}/athletes/${athlete.id}`, {
          headers: { cookie: b.cookie },
        })
      ).status,
      404,
    );
    assert.equal(
      (
        await mutation(
          `/athletes/${athlete.id}`,
          b.cookie,
          sb.csrf,
          { name: 'Outro aluno', email: body.email, version: 1 },
          'PATCH',
        )
      ).status,
      404,
    );
    const edits = await Promise.all([
      mutation(
        `/athletes/${athlete.id}`,
        a.cookie,
        sa.csrf,
        { ...body, version: 1 },
        'PATCH',
      ),
      mutation(
        `/athletes/${athlete.id}`,
        a.cookie,
        sa.csrf,
        { ...body, version: 1 },
        'PATCH',
      ),
    ]);
    assert.deepEqual(edits.map((r) => r.status).sort(), [200, 409]);
    assert.equal(
      (
        await mutation(
          `/athletes/${athlete.id}`,
          a.cookie,
          sa.csrf,
          { ...body, version: 2, status: 'active' },
          'PATCH',
        )
      ).status,
      400,
    );
    const listed = await (
      await fetch(`${base}/athletes?q=${suffix}&status=pending`, {
        headers: { cookie: a.cookie },
      })
    ).json();
    assert.equal(listed.total, 1);
    assert.equal(listed.items[0].id, athlete.id);
    assert.equal(
      (
        await fetch(`${base}/athletes?limit=1000`, {
          headers: { cookie: a.cookie },
        })
      ).status,
      400,
    );
    await assert.rejects(
      database.client.$transaction(async (tx) => {
        await tx.coachAthleteRelationship.delete({
          where: { athleteId: athlete.id },
        });
        await tx.coachAthleteRelationship.create({
          data: { coachId: sb.coach.id, athleteId: athlete.id },
        });
      }),
      (error: unknown) =>
        Boolean(
          error &&
          typeof error === 'object' &&
          'code' in error &&
          error.code === 'P2003',
        ),
    );
    assert.ok(
      await database.client.auditLog.count({
        where: { coachId: sa.coach.id, action: 'athlete.updated' },
      }),
    );
    const token = a.cookie.split('=')[1];
    assert.ok(
      await database.client.coachSession.findUnique({
        where: { tokenHash: digest(token) },
      }),
    );
    await database.client.coachSession.updateMany({
      where: { tokenHash: digest(token) },
      data: { expiresAt: new Date(0) },
    });
    assert.equal(
      (await fetch(`${base}/auth/session`, { headers: { cookie: a.cookie } }))
        .status,
      401,
    );
    await database.client.coach.update({
      where: { id: sb.coach.id },
      data: { enabled: false },
    });
    assert.equal(
      (await fetch(`${base}/athletes`, { headers: { cookie: b.cookie } }))
        .status,
      401,
    );
    await database.client.coach.update({
      where: { id: sb.coach.id },
      data: { enabled: true },
    });
    assert.equal(
      (await mutation('/auth/logout', b.cookie, sb.csrf, {})).status,
      204,
    );
    assert.equal(
      (await fetch(`${base}/auth/session`, { headers: { cookie: b.cookie } }))
        .status,
      401,
    );
    const limited = await Promise.all(
      Array.from({ length: 8 }, () =>
        fetch(`${base}/auth/google`, { redirect: 'manual' }),
      ),
    );
    assert.ok(limited.some((response) => response.status === 429));
  } finally {
    const coaches = await database.client.coach.findMany({
      where: { subject: { in: coachSubjects } },
    });
    const ids = coaches.map((c) => c.id);
    await database.client.auditLog.deleteMany({
      where: { coachId: { in: ids } },
    });
    await database.client.coachAthleteRelationship.deleteMany({
      where: { coachId: { in: ids } },
    });
    await database.client.athlete.deleteMany({
      where: { coachId: { in: ids } },
    });
    await database.client.coachSession.deleteMany({
      where: { coachId: { in: ids } },
    });
    await database.client.coach.deleteMany({ where: { id: { in: ids } } });
    await server.close();
  }
});
