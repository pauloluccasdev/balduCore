import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createTestApp } from './test-support/test-app.js';
import { digest } from './modules/auth/security.js';

type App = Awaited<ReturnType<typeof createTestApp>>;
const cookieOf = (response: Response) =>
  response.headers.getSetCookie()[0]?.split(';')[0] ?? '';
async function context(app: App) {
  const post = (
    path: string,
    body: unknown,
    cookie = '',
    csrf = '',
    origin = app.config.APP_ORIGIN,
  ) =>
    fetch(`${app.base}${path}`, {
      method: 'POST',
      headers: {
        origin,
        cookie,
        'content-type': 'application/json',
        ...(csrf ? { 'x-csrf-token': csrf } : {}),
      },
      body: JSON.stringify(body),
    });
  const login = async (account: string) => {
    const response = await post('/auth/demo', { account });
    const cookie = cookieOf(response);
    const session = await (
      await fetch(`${app.base}/auth/session`, { headers: { cookie } })
    ).json();
    return {
      cookie,
      csrf: session.csrf as string,
      id: session.coach.id as string,
    };
  };
  const coach = await login('1');
  const other = await login('2');
  const athleteResponse = await post(
    '/athletes',
    {
      name: 'Participante fictício',
      email: `invite-${randomUUID()}@example.test`,
    },
    coach.cookie,
    coach.csrf,
  );
  assert.equal(athleteResponse.status, 201);
  const athlete = await athleteResponse.json();
  const create = async () => {
    const response = await post(
      `/athletes/${athlete.id}/invitations`,
      {},
      coach.cookie,
      coach.csrf,
    );
    assert.equal(response.status, 201);
    return response.json();
  };
  const get = (path: string, cookie = '') =>
    fetch(`${app.base}${path}`, { headers: { cookie } });
  const redeem = async (invite: { url: string }) => {
    const response = await post('/public/invitation/redeem', {
      token: new URL(invite.url).hash.slice(1),
    });
    assert.equal(response.status, 201);
    const cookie = cookieOf(response);
    assert.match(response.headers.get('set-cookie')!, /HttpOnly/i);
    assert.doesNotMatch(
      response.headers.get('set-cookie')!,
      /balducore_session=/,
    );
    const session = await (await get('/public/enrollment', cookie)).json();
    return { cookie, session };
  };
  const code = async (invite: { id: string }) => {
    const list = await (
      await get(`/athletes/${athlete.id}/invitations`, coach.cookie)
    ).json();
    return list.items.find((item: { id: string }) => item.id === invite.id)
      .demoCode as string;
  };
  const acceptance = (session: {
    documents: { id: string; contentHash: string }[];
  }) => ({
    name: 'Nome confirmado fictício',
    email: athlete.email,
    accompaniment: true,
    dataSharing: true,
    documents: session.documents.map(({ id, contentHash }) => ({
      id,
      contentHash,
    })),
  });
  return { post, get, coach, other, athlete, create, redeem, code, acceptance };
}

test('convite demonstrativo: isolamento, aceites atômicos, evidências e encerramento público idempotente', async () => {
  const app = await createTestApp(0, undefined, 'demo');
  try {
    const c = await context(app);
    const path = `/athletes/${c.athlete.id}`;
    assert.equal(
      (await c.post(`${path}/invitations`, {}, c.other.cookie, c.other.csrf))
        .status,
      404,
    );
    assert.equal(
      (await c.get(`${path}/invitations`, c.other.cookie)).status,
      404,
    );
    assert.equal(
      (await c.post(`${path}/invitations`, {}, c.coach.cookie)).status,
      403,
    );
    const invite = await c.create();
    const rawToken = new URL(invite.url).hash.slice(1);
    const stored = await app.database.client.invitation.findUniqueOrThrow({
      where: { id: invite.id },
    });
    assert.equal(stored.tokenHash, digest(rawToken));
    assert.notEqual(stored.tokenHash, rawToken);
    assert.equal((await c.get('/public/invitation/redeem')).status, 404);
    for (let index = 0; index < 2; index++)
      assert.equal(
        (await c.post('/public/invitation/preview', { token: rawToken }))
          .status,
        201,
      );
    assert.equal(
      (
        await app.database.client.invitation.findUniqueOrThrow({
          where: { id: invite.id },
        })
      ).consumedAt,
      null,
    );
    const student = await c.redeem(invite);
    assert.equal((await c.get('/auth/session', student.cookie)).status, 401);
    assert.equal(student.session.verificationMode, 'demo');
    assert.equal(student.session.garminStatus, 'not_connected');
    assert.ok(!JSON.stringify(student.session).includes(c.athlete.email));
    assert.equal(student.session.code, undefined);
    const code = await c.code(invite);
    assert.match(code, /^\d{6}$/);
    const enrollment =
      await app.database.client.enrollmentSession.findUniqueOrThrow({
        where: { invitationId: invite.id },
      });
    assert.notEqual(enrollment.codeHash, digest(code));
    assert.notEqual(enrollment.encryptedCode, code);
    assert.equal(
      (
        await c.post(
          '/public/enrollment/accept',
          c.acceptance(student.session),
          student.cookie,
          student.session.csrf,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await c.post(
          '/public/enrollment/verify',
          { email: 'wrong@example.test', code },
          student.cookie,
          student.session.csrf,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await c.post(
          '/public/enrollment/verify',
          { email: c.athlete.email, code },
          student.cookie,
          student.session.csrf,
          'https://evil.test',
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await c.post(
          '/public/enrollment/verify',
          { email: c.athlete.email, code },
          student.cookie,
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await c.post(
          '/public/enrollment/verify',
          { email: c.athlete.email, code },
          student.cookie,
          student.session.csrf,
        )
      ).status,
      201,
    );
    assert.equal(await c.code(invite), null);
    assert.equal(
      (
        await c.post(
          '/public/enrollment/accept',
          { ...c.acceptance(student.session), dataSharing: false },
          student.cookie,
          student.session.csrf,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await c.post(
          '/public/enrollment/accept',
          { ...c.acceptance(student.session), documents: [] },
          student.cookie,
          student.session.csrf,
        )
      ).status,
      400,
    );
    const tampered = c.acceptance(student.session);
    tampered.documents[0].contentHash = 'tampered';
    assert.equal(
      (
        await c.post(
          '/public/enrollment/accept',
          tampered,
          student.cookie,
          student.session.csrf,
        )
      ).status,
      409,
    );
    const responses = await Promise.all(
      [1, 2].map(() =>
        c.post(
          '/public/enrollment/accept',
          c.acceptance(student.session),
          student.cookie,
          student.session.csrf,
        ),
      ),
    );
    assert.deepEqual(
      responses.map((r) => r.status),
      [201, 201],
    );
    const results = await Promise.all(responses.map((r) => r.json()));
    const withdrawalUrl = results.find((r) => r.withdrawalUrl)
      .withdrawalUrl as string;
    assert.equal(
      await app.database.client.consentEvidence.count({
        where: { coachId: c.coach.id, athleteId: c.athlete.id },
      }),
      2,
    );
    const after = await (await c.get(path, c.coach.cookie)).json();
    assert.equal(after.relationship.status, 'active');
    assert.equal(after.name, 'Nome confirmado fictício');
    assert.equal(
      (await c.post(`${path}/invitations`, {}, c.coach.cookie, c.coach.csrf))
        .status,
      409,
    );
    assert.equal(
      (await c.post('/public/invitation/redeem', { token: rawToken })).status,
      410,
    );
    const withdrawalToken = new URL(withdrawalUrl).hash.slice(1);
    const withdrawalResponse = await c.post('/public/withdrawal/redeem', {
      token: withdrawalToken,
    });
    assert.equal(withdrawalResponse.status, 201);
    const withdrawalCookie = cookieOf(withdrawalResponse);
    const withdrawal = await (
      await c.get('/public/withdrawal', withdrawalCookie)
    ).json();
    assert.equal(
      (await c.get('/public/enrollment', withdrawalCookie)).status,
      410,
    );
    assert.equal(
      (
        await c.post(
          '/public/withdrawal/confirm',
          { confirm: false },
          withdrawalCookie,
          withdrawal.csrf,
        )
      ).status,
      400,
    );
    const ended = await Promise.all(
      [1, 2].map(() =>
        c.post(
          '/public/withdrawal/confirm',
          { confirm: true },
          withdrawalCookie,
          withdrawal.csrf,
        ),
      ),
    );
    assert.deepEqual(
      ended.map((r) => r.status),
      [201, 201],
    );
    const evidences = await app.database.client.consentEvidence.findMany({
      where: { coachId: c.coach.id, athleteId: c.athlete.id },
    });
    assert.equal(evidences.filter((e) => e.decision === 'accepted').length, 2);
    assert.equal(evidences.filter((e) => e.decision === 'withdrawn').length, 2);
    assert.ok(
      evidences.every((e) => e.isSynthetic && e.verificationMode === 'demo'),
    );
    assert.equal(
      (await (await c.get(path, c.coach.cookie)).json()).relationship.status,
      'ended',
    );
    assert.equal(
      (await c.post('/public/withdrawal/redeem', { token: withdrawalToken }))
        .status,
      410,
    );
    assert.equal(
      (await c.get('/public/enrollment', student.cookie)).status,
      410,
    );
    assert.equal(
      (
        await c.post(
          `${path}/withdrawal-link`,
          {},
          c.coach.cookie,
          c.coach.csrf,
        )
      ).status,
      409,
    );
  } finally {
    await app.close();
  }
});

test('concorrência no resgate e revogação de jornada: apenas um vencedor e nenhum aceite posterior', async () => {
  const app = await createTestApp(0, undefined, 'demo');
  try {
    const c = await context(app);
    const invite = await c.create();
    const token = new URL(invite.url).hash.slice(1);
    const responses = await Promise.all(
      [1, 2].map(() => c.post('/public/invitation/redeem', { token })),
    );
    assert.deepEqual(responses.map((r) => r.status).sort(), [201, 410]);
    const studentCookie = cookieOf(responses.find((r) => r.status === 201)!);
    const session = await (
      await c.get('/public/enrollment', studentCookie)
    ).json();
    assert.equal(
      await app.database.client.enrollmentSession.count({
        where: { invitationId: invite.id },
      }),
      1,
    );
    assert.equal(
      (
        await c.post(
          `/athletes/${c.athlete.id}/invitations/${invite.id}/revoke`,
          {},
          c.other.cookie,
          c.other.csrf,
        )
      ).status,
      404,
    );
    assert.equal(
      (
        await c.post(
          `/athletes/${c.athlete.id}/invitations/${invite.id}/revoke`,
          {},
          c.coach.cookie,
          c.coach.csrf,
        )
      ).status,
      201,
    );
    assert.equal(
      (await c.get('/public/enrollment', studentCookie)).status,
      410,
    );
    assert.equal(
      (
        await c.post(
          '/public/enrollment/accept',
          c.acceptance(session),
          studentCookie,
          session.csrf,
        )
      ).status,
      410,
    );
    assert.equal(
      await app.database.client.consentEvidence.count({
        where: { athleteId: c.athlete.id },
      }),
      0,
    );
    const old = await c.create();
    const newer = await c.create();
    assert.equal(
      (
        await c.post('/public/invitation/preview', {
          token: new URL(old.url).hash.slice(1),
        })
      ).status,
      410,
    );
    assert.equal(
      (
        await c.post('/public/invitation/preview', {
          token: new URL(newer.url).hash.slice(1),
        })
      ).status,
      201,
    );
  } finally {
    await app.close();
  }
});

test('expiração de convite, sessão e código; bloqueio após cinco erros; alteração do destinatário', async () => {
  const app = await createTestApp(0, undefined, 'demo');
  try {
    const c = await context(app);
    const expired = await c.create();
    await app.database.client.invitation.update({
      where: { id: expired.id },
      data: { expiresAt: new Date(0) },
    });
    assert.equal(
      (
        await c.post('/public/invitation/redeem', {
          token: new URL(expired.url).hash.slice(1),
        })
      ).status,
      410,
    );
    const invite = await c.create();
    const student = await c.redeem(invite);
    const code = await c.code(invite);
    const wrong = code === '000000' ? '000001' : '000000';
    for (let index = 0; index < 5; index++)
      assert.equal(
        (
          await c.post(
            '/public/enrollment/verify',
            { email: c.athlete.email, code: wrong },
            student.cookie,
            student.session.csrf,
          )
        ).status,
        400,
      );
    assert.equal(
      (
        await c.post(
          '/public/enrollment/verify',
          { email: c.athlete.email, code },
          student.cookie,
          student.session.csrf,
        )
      ).status,
      410,
    );
    assert.equal(
      (
        await app.database.client.enrollmentSession.findUniqueOrThrow({
          where: { invitationId: invite.id },
        })
      ).codeAttempts,
      5,
    );
    assert.equal(await c.code(invite), null);
    const codeExpiredInvite = await c.create();
    const codeExpiredStudent = await c.redeem(codeExpiredInvite);
    await app.database.client.enrollmentSession.update({
      where: { invitationId: codeExpiredInvite.id },
      data: { codeExpiresAt: new Date(0) },
    });
    assert.equal(
      (
        await c.post(
          '/public/enrollment/verify',
          { email: c.athlete.email, code: '123456' },
          codeExpiredStudent.cookie,
          codeExpiredStudent.session.csrf,
        )
      ).status,
      410,
    );
    await app.database.client.enrollmentSession.update({
      where: { invitationId: codeExpiredInvite.id },
      data: { expiresAt: new Date(0) },
    });
    assert.equal(
      (await c.get('/public/enrollment', codeExpiredStudent.cookie)).status,
      410,
    );
    const emailInvite = await c.create();
    const emailStudent = await c.redeem(emailInvite);
    const updated = await fetch(`${app.base}/athletes/${c.athlete.id}`, {
      method: 'PATCH',
      headers: {
        cookie: c.coach.cookie,
        origin: app.config.APP_ORIGIN,
        'x-csrf-token': c.coach.csrf,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        name: c.athlete.name,
        email: `changed-${randomUUID()}@example.test`,
        version: c.athlete.version,
      }),
    });
    assert.equal(updated.status, 200);
    assert.equal(
      (await c.get('/public/enrollment', emailStudent.cookie)).status,
      410,
    );
    assert.equal(
      (
        await c.get(`/athletes/${c.athlete.id}/invitations`, c.coach.cookie)
      ).headers.get('cache-control'),
      'no-store',
    );
  } finally {
    await app.close();
  }
});

test('integridade de tenant/aluno nos consentimentos; reemissão e expiração do acesso de encerramento', async () => {
  const app = await createTestApp(0, undefined, 'demo');
  try {
    const c = await context(app);
    const invite = await c.create();
    const student = await c.redeem(invite);
    await c.post(
      '/public/enrollment/verify',
      { email: c.athlete.email, code: await c.code(invite) },
      student.cookie,
      student.session.csrf,
    );
    const accepted = await c.post(
      '/public/enrollment/accept',
      c.acceptance(student.session),
      student.cookie,
      student.session.csrf,
    );
    assert.equal(accepted.status, 201);
    const firstLink = (await accepted.json()).withdrawalUrl;
    const enrollment =
      await app.database.client.enrollmentSession.findUniqueOrThrow({
        where: { invitationId: invite.id },
      });
    const another = await c.post(
      '/athletes',
      {
        name: 'Outro aluno fictício',
        email: `another-${randomUUID()}@example.test`,
      },
      c.coach.cookie,
      c.coach.csrf,
    );
    const otherAthlete = await another.json();
    await assert.rejects(
      app.database.client.consentEvidence.create({
        data: {
          coachId: c.other.id,
          athleteId: c.athlete.id,
          enrollmentId: enrollment.id,
          documentId: student.session.documents[0].id,
          decision: 'withdrawn',
        },
      }),
      (error: unknown) =>
        Boolean(
          error &&
          typeof error === 'object' &&
          'code' in error &&
          error.code === 'P2003',
        ),
    );
    await assert.rejects(
      app.database.client.consentEvidence.create({
        data: {
          coachId: c.coach.id,
          athleteId: otherAthlete.id,
          enrollmentId: enrollment.id,
          documentId: student.session.documents[0].id,
          decision: 'withdrawn',
        },
      }),
      (error: unknown) =>
        Boolean(
          error &&
          typeof error === 'object' &&
          'code' in error &&
          error.code === 'P2003',
        ),
    );
    const firstSessionResponse = await c.post('/public/withdrawal/redeem', {
      token: new URL(firstLink).hash.slice(1),
    });
    const firstCookie = cookieOf(firstSessionResponse);
    assert.equal((await c.get('/public/withdrawal', firstCookie)).status, 200);
    assert.equal(
      (
        await c.post(
          `/athletes/${c.athlete.id}/withdrawal-link`,
          {},
          c.other.cookie,
          c.other.csrf,
        )
      ).status,
      404,
    );
    const renewed = await c.post(
      `/athletes/${c.athlete.id}/withdrawal-link`,
      {},
      c.coach.cookie,
      c.coach.csrf,
    );
    const renewedToken = new URL((await renewed.json()).url).hash.slice(1);
    assert.equal((await c.get('/public/withdrawal', firstCookie)).status, 410);
    const nextSessionResponse = await c.post('/public/withdrawal/redeem', {
      token: renewedToken,
    });
    const nextCookie = cookieOf(nextSessionResponse);
    await app.database.client.withdrawalAccess.update({
      where: { tokenHash: digest(renewedToken) },
      data: { sessionExpiresAt: new Date(0) },
    });
    assert.equal((await c.get('/public/withdrawal', nextCookie)).status, 410);
    assert.equal(
      (await c.get(`/athletes/${c.athlete.id}`, c.coach.cookie)).status,
      200,
    );
    const renewedAgain = await c.post(
      `/athletes/${c.athlete.id}/withdrawal-link`,
      {},
      c.coach.cookie,
      c.coach.csrf,
    );
    const expiredToken = new URL((await renewedAgain.json()).url).hash.slice(1);
    await app.database.client.withdrawalAccess.update({
      where: { tokenHash: digest(expiredToken) },
      data: { expiresAt: new Date(0) },
    });
    assert.equal(
      (await c.post('/public/withdrawal/redeem', { token: expiredToken }))
        .status,
      410,
    );
  } finally {
    await app.close();
  }
});

test('jornada simulada ausente no modo Google; entradas e rate limit públicos', async () => {
  const google = await createTestApp();
  try {
    assert.equal((await fetch(`${google.base}/public/enrollment`)).status, 404);
  } finally {
    await google.close();
  }
  const app = await createTestApp(0, undefined, 'demo');
  try {
    const c = await context(app);
    assert.equal(
      (await c.post('/public/invitation/redeem', { token: 'invalid' })).status,
      400,
    );
    assert.equal(
      (
        await c.post('/public/invitation/redeem', {
          token: 'a'.repeat(43),
          athleteId: c.athlete.id,
        })
      ).status,
      400,
    );
    assert.equal(
      (await c.post('/public/invitation/redeem', { token: 'a'.repeat(43) }))
        .status,
      410,
    );
    let last = 0;
    for (let index = 0; index < 31; index++)
      last = (
        await c.post('/public/invitation/preview', { token: 'b'.repeat(43) })
      ).status;
    assert.equal(last, 429);
  } finally {
    await app.close();
  }
});

test('aceite concorrente com revogação permanece consistente; chave demo rotacionada não quebra o perfil', async () => {
  const app = await createTestApp(0, undefined, 'demo');
  try {
    const c = await context(app);
    const invite = await c.create();
    const student = await c.redeem(invite);
    const code = await c.code(invite);
    await c.post(
      '/public/enrollment/verify',
      { email: c.athlete.email, code },
      student.cookie,
      student.session.csrf,
    );
    const [accept, revoke] = await Promise.all([
      c.post(
        '/public/enrollment/accept',
        c.acceptance(student.session),
        student.cookie,
        student.session.csrf,
      ),
      c.post(
        `/athletes/${c.athlete.id}/invitations/${invite.id}/revoke`,
        {},
        c.coach.cookie,
        c.coach.csrf,
      ),
    ]);
    assert.equal(revoke.status, 201);
    assert.ok([201, 410].includes(accept.status));
    const athlete = await (
      await c.get(`/athletes/${c.athlete.id}`, c.coach.cookie)
    ).json();
    const acceptedCount = await app.database.client.consentEvidence.count({
      where: { athleteId: c.athlete.id, decision: 'accepted' },
    });
    assert.equal(
      athlete.relationship.status,
      accept.status === 201 ? 'active' : 'pending',
    );
    assert.equal(acceptedCount, accept.status === 201 ? 2 : 0);
    const second = await context(app);
    const secondInvite = await second.create();
    await second.redeem(secondInvite);
    const enrollment =
      await app.database.client.enrollmentSession.findUniqueOrThrow({
        where: { invitationId: secondInvite.id },
      });
    // Material de uma chave antiga não deve provocar erro 503 ao abrir o perfil.
    await app.database.client.enrollmentSession.update({
      where: { id: enrollment.id },
      data: { encryptedCode: 'unreadable-old-key' },
    });
    const response = await second.get(
      `/athletes/${second.athlete.id}/invitations`,
      second.coach.cookie,
    );
    assert.equal(response.status, 200);
    const item = (await response.json()).items.find(
      (i: { id: string }) => i.id === secondInvite.id,
    );
    assert.equal(item.demoCode, null);
    assert.equal(item.codeUnavailable, true);
  } finally {
    await app.close();
  }
});
