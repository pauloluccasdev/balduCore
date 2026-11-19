import { test, expect } from '@playwright/test';
import { sampleActivity } from '../../apps/api/src/test-support/fit-fixture';
// Exercita hidratação com navegador em fuso diferente do servidor UTC.
test.use({ timezoneId: 'America/Sao_Paulo' });
test('central: atividade, eventos, feedback, leitura, falha e isolamento responsivo', async ({
  page,
  browser,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/login');
  await page
    .getByRole('button', { name: 'Entrar como Treinador Demo 1', exact: true })
    .click();
  await expect(page).toHaveURL('/');
  const origin = 'http://127.0.0.1:3000';
  const session = await (await page.request.get('/api/auth/session')).json();
  const headers = { origin, 'x-csrf-token': session.csrf };
  const name = `Central sintética ${info.project.name} ${Date.now()}`;
  const athlete = await (
    await page.request.post('/api/athletes', {
      headers,
      data: {
        name,
        email: `monitoring-${info.project.name}-${Date.now()}@example.test`,
      },
    })
  ).json();
  const invite = await (
    await page.request.post(`/api/athletes/${athlete.id}/invitations`, {
      headers,
      data: {},
    })
  ).json();
  const student = await browser.newContext({ baseURL: origin });
  const other = await browser.newContext({ baseURL: origin });
  try {
    expect(
      (
        await student.request.post('/api/public/invitation/redeem', {
          headers: { origin },
          data: { token: new URL(invite.url).hash.slice(1) },
        })
      ).status(),
    ).toBe(201);
    const enrollment = await (
      await student.request.get('/api/public/enrollment')
    ).json();
    const invitations = await (
      await page.request.get(`/api/athletes/${athlete.id}/invitations`)
    ).json();
    const publicHeaders = { origin, 'x-csrf-token': enrollment.csrf };
    expect(
      (
        await student.request.post('/api/public/enrollment/verify', {
          headers: publicHeaders,
          data: { email: athlete.email, code: invitations.items[0].demoCode },
        })
      ).status(),
    ).toBe(201);
    expect(
      (
        await student.request.post('/api/public/enrollment/accept', {
          headers: publicHeaders,
          data: {
            name,
            email: athlete.email,
            accompaniment: true,
            dataSharing: true,
            documents: enrollment.documents.map(
              (doc: { id: string; contentHash: string }) => ({
                id: doc.id,
                contentHash: doc.contentHash,
              }),
            ),
          },
        })
      ).status(),
    ).toBe(201);
    expect(
      (
        await page.request.post(`/api/athletes/${athlete.id}/fit-imports`, {
          headers: {
            ...headers,
            'content-type': 'application/octet-stream',
            'x-demo-file': 'true',
          },
          data: sampleActivity(
            new Date(Date.now() + Math.floor(Math.random() * 1000000000)),
            { detailed: true },
          ),
        })
      ).status(),
    ).toBe(202);
    let id = '';
    await expect
      .poll(async () => {
        const items = await (
          await page.request.get(`/api/athletes/${athlete.id}/fit-imports`)
        ).json();
        id = items[0]?.activityId ?? '';
        return Boolean(id);
      })
      .toBe(true);
    await expect
      .poll(
        async () =>
          (
            await (
              await page.request.get(`/api/activities/${id}/analysis`)
            ).json()
          ).analysis?.status,
      )
      .toBe('completed');

    const central = `/monitoramento?athleteId=${athlete.id}`;
    await page.goto(central);
    await expect(
      page.getByRole('heading', {
        name: 'Central de Monitoramento',
        exact: true,
      }),
    ).toBeVisible();
    const pendingRow = page
      .getByRole('row')
      .filter({ hasText: 'Sem feedback nesta revisão' });
    await expect(pendingRow).toHaveCount(1);
    await expect(
      page.getByText(
        '3 evento(s) agrupado(s); consulte as evidências na análise.',
        { exact: true },
      ),
    ).toBeVisible();
    await pendingRow.getByRole('button').click();
    await expect(pendingRow.getByText('Lido', { exact: true })).toBeVisible();
    await pendingRow
      .getByRole('link', { name: 'Registrar feedback', exact: true })
      .click();
    await expect(page).toHaveURL(`/atividades/${id}/feedback`);
    await page
      .getByRole('textbox', { name: 'Observações', exact: true })
      .fill('Observação sintética para acompanhamento da revisão atual.');
    await page
      .getByRole('button', { name: 'Salvar diário', exact: true })
      .click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Diário salvo. Revisão 1.' }),
    ).toBeVisible();
    await page.goto(central);
    await expect(
      pendingRow.getByText('Resolvido / contexto anterior', { exact: true }),
    ).toBeVisible();
    await expect(pendingRow.getByText('Lido', { exact: true })).toBeVisible();
    await page
      .getByRole('combobox', { name: 'Categoria', exact: true })
      .selectOption('feedback_pending');
    await page
      .getByRole('combobox', { name: 'Estado', exact: true })
      .selectOption('active');
    await page
      .getByRole('button', { name: 'Aplicar filtros', exact: true })
      .click();
    await expect(
      page.getByRole('heading', {
        name: 'Nenhum item nestes filtros',
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole('combobox', { name: 'Estado', exact: true })
      .selectOption('all');
    await page
      .getByRole('button', { name: 'Aplicar filtros', exact: true })
      .click();
    await expect(
      pendingRow.getByText('Resolvido / contexto anterior', { exact: true }),
    ).toBeVisible();
    const diary = await (
      await page.request.get(`/api/activities/${id}/feedback`)
    ).json();
    expect(
      (
        await page.request.put(`/api/activities/${id}/feedback`, {
          headers,
          data: {
            expectedVersion: diary.version,
            inputRevision: diary.activity.revision,
            inputHash: diary.activity.dataHash,
            analysisId: null,
            content: {
              execution: '',
              observations: '',
              decisions: '',
              points: [],
              verdicts: [],
            },
          },
        })
      ).status(),
    ).toBe(200);
    // O clique da tela antiga deve conflitar com a pendência reaberta, sem ocultá-la.
    await pendingRow.getByRole('button').click();
    await expect(
      page.getByRole('alert').filter({ hasText: 'O item foi atualizado.' }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Atualizar central', exact: true })
      .click();
    await expect(pendingRow.getByText('Ativo', { exact: true })).toBeVisible();
    await expect(
      pendingRow.getByText('Não lido', { exact: true }),
    ).toBeVisible();
    const listUrl = (url: URL) => url.pathname === '/api/monitoring';
    await page.route(listUrl, (route) =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Falha de teste ao atualizar.' }),
      }),
    );
    await page
      .getByRole('button', { name: 'Atualizar central', exact: true })
      .click();
    await expect(
      page
        .getByRole('alert')
        .filter({ hasText: 'última consulta bem-sucedida' }),
    ).toBeVisible();
    await expect(pendingRow.getByText('Ativo', { exact: true })).toBeVisible();
    await page.unroute(listUrl);
    // Falha terminal no provider mock: nenhuma resposta ou credencial Garmin real.
    const start = await student.request.post('/api/public/garmin/start', {
      headers: publicHeaders,
      data: {},
    });
    expect(start.status()).toBe(201);
    const state = new URL((await start.json()).url).hash.slice(1);
    expect(
      (
        await student.request.post('/api/public/garmin/mock/finish', {
          headers: publicHeaders,
          data: { state, decision: 'approve' },
        })
      ).status(),
    ).toBe(201);
    expect(
      (
        await page.request.post(`/api/athletes/${athlete.id}/garmin/mock`, {
          headers,
          data: { scenario: 'permanent_failure' },
        })
      ).status(),
    ).toBe(201);
    await expect
      .poll(
        async () =>
          (
            await (
              await page.request.get(
                `/api/monitoring?athleteId=${athlete.id}&type=sync_failure`,
              )
            ).json()
          ).pending,
      )
      .toBe(1);
    await page.goto(central);
    await expect(
      page.getByRole('row').filter({ hasText: 'Falha de sincronização' }),
    ).toHaveCount(1);
    await expect(
      page
        .getByRole('heading', { name: 'Pendências ativas', exact: true })
        .locator('..')
        .getByText('2', { exact: true }),
    ).toBeVisible();
    await page
      .getByRole('textbox', { name: 'Buscar aluno', exact: true })
      .fill(name);
    await expect(
      page.getByRole('combobox', { name: 'Aluno', exact: true }),
    ).toHaveValue(athlete.id);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      ),
    ).toBe(false);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: info.outputPath('monitoring-dark.png'),
      fullPage: true,
    });
    await page.getByRole('button', { name: 'Modo claro', exact: true }).click();
    await page.screenshot({
      path: info.outputPath('monitoring-light.png'),
      fullPage: true,
    });
    expect((await student.request.get('/api/monitoring')).status()).toBe(401);
    expect(
      (
        await other.request.post('/api/auth/demo', {
          headers: { origin },
          data: { account: '2' },
        })
      ).status(),
    ).toBe(200);
    const outsider = await (
      await other.request.get(`/api/monitoring?athleteId=${athlete.id}`)
    ).json();
    expect(outsider.total).toBe(0);
    expect(outsider.unread).toBe(0);
    expect(outsider.pending).toBe(0);
    const current = await (
      await page.request.get(`/api/monitoring?athleteId=${athlete.id}`)
    ).json();
    const otherSession = await (
      await other.request.get('/api/auth/session')
    ).json();
    expect(
      (
        await other.request.patch(
          `/api/monitoring/${current.items[0].id}/read`,
          {
            headers: { origin, 'x-csrf-token': otherSession.csrf },
            data: { expectedVersion: current.items[0].version, read: true },
          },
        )
      ).status(),
    ).toBe(404);
    expect(errors).toEqual([]);
  } finally {
    await student.close();
    await other.close();
  }
});
