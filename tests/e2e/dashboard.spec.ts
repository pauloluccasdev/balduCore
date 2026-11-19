import { test, expect } from '@playwright/test';
import { sampleActivity } from '../../apps/api/src/test-support/fit-fixture';
// Exercita hidratação com navegador em fuso diferente do servidor UTC.
test.use({ timezoneId: 'America/Sao_Paulo' });
test('dashboard: indicadores persistidos, filtros, links, falha parcial e retirada responsiva', async ({
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
  const baseline = await (await page.request.get('/api/dashboard')).json();
  const name = `Dashboard sintético ${info.project.name} ${Date.now()}`;
  const athlete = await (
    await page.request.post('/api/athletes', {
      headers,
      data: {
        name,
        email: `dashboard-${info.project.name}-${Date.now()}@example.test`,
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
            new Date(Date.now() - 1200000 - Math.floor(Math.random() * 600000)),
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

    await page.goto('/');
    await expect(page.getByTestId('dashboard-athletes')).toHaveText(
      String(baseline.athletes.total + 1),
    );
    await expect(page.getByTestId('dashboard-activities')).toHaveText(
      String(baseline.activities.total + 1),
    );
    await expect(
      page.getByRole('heading', {
        name: 'Interpretação por IA adiada',
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', {
        name: 'Criar treino · em breve',
        exact: true,
      }),
    ).toBeDisabled();
    const snapshot = await (await page.request.get('/api/dashboard')).json();
    expect(snapshot.activities.items.length).toBeLessThanOrEqual(5);
    expect(
      snapshot.athletes.items.some((a: { id: string }) => a.id === athlete.id),
    ).toBe(true);
    const recent = page.getByRole('region', {
      name: 'Atividades persistidas recentes',
      exact: true,
    });
    await expect(recent.locator('tbody tr')).toHaveCount(
      snapshot.activities.items.length,
    );
    const first = snapshot.activities.items[0];
    await recent.locator(`a[href="/atividades/${first.id}"]`).click();
    await expect(page).toHaveURL(`/atividades/${first.id}`);
    await page.goto('/');
    await page.getByRole('button', { name: '7 dias', exact: true }).click();
    await expect(
      page.getByRole('button', { name: '7 dias', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await page
      .getByRole('combobox', { name: 'Modalidade', exact: true })
      .selectOption('swimming');
    await page
      .getByRole('button', { name: 'Aplicar modalidade', exact: true })
      .click();
    const swimming = await (
      await page.request.get('/api/dashboard?period=7&sport=swimming')
    ).json();
    await expect(page.getByTestId('dashboard-activities')).toHaveText(
      String(swimming.activities.total),
    );
    await page
      .getByRole('link', { name: 'Ver análises →', exact: true })
      .click();
    await expect(page).toHaveURL(/\/analise-esportiva\?/);
    expect(new URL(page.url()).searchParams.get('sport')).toBe('swimming');
    expect(new URL(page.url()).searchParams.get('from')).toBe(
      swimming.filters.from,
    );
    expect(new URL(page.url()).searchParams.get('to')).toBe(
      swimming.filters.to,
    );
    await expect(page.locator('tbody tr')).toHaveCount(
      Math.min(swimming.activities.total, 20),
    );
    await page.goto('/?period=7&sport=running');
    const running = await (
      await page.request.get('/api/dashboard?period=7&sport=running')
    ).json();
    const match = (url: URL) => url.pathname === '/api/dashboard';
    await page.route(match, (route) =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Falha sintética de atualização.' }),
      }),
    );
    await page
      .getByRole('button', { name: 'Atualizar dashboard', exact: true })
      .click();
    await expect(
      page
        .getByRole('alert')
        .filter({ hasText: 'última consulta bem-sucedida' }),
    ).toBeVisible();
    await expect(page.getByTestId('dashboard-activities')).toHaveText(
      String(running.activities.total),
    );
    await page.unroute(match);
    await page
      .getByRole('button', { name: 'Atualizar dashboard', exact: true })
      .click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Dashboard atualizado.' }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth,
      ),
    ).toBe(false);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: info.outputPath('dashboard-dark.png'),
      fullPage: true,
    });
    await page.getByRole('button', { name: 'Modo claro', exact: true }).click();
    await page.screenshot({
      path: info.outputPath('dashboard-light.png'),
      fullPage: true,
    });
    await page.goto('/?period=invalid');
    await expect(
      page.getByRole('heading', {
        name: 'Dashboard indisponível',
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.getByTestId('dashboard-activities')).toHaveCount(0);
    expect((await student.request.get('/api/dashboard')).status()).toBe(401);
    expect(
      (
        await other.request.post('/api/auth/demo', {
          headers: { origin },
          data: { account: '2' },
        })
      ).status(),
    ).toBe(200);
    const foreign = await (await other.request.get('/api/dashboard')).json();
    expect(JSON.stringify(foreign)).not.toContain(athlete.id);
    expect(JSON.stringify(foreign)).not.toContain(name);
    const withdrawal = await (
      await page.request.post(`/api/athletes/${athlete.id}/withdrawal-link`, {
        headers,
        data: {},
      })
    ).json();
    expect(
      (
        await student.request.post('/api/public/withdrawal/redeem', {
          headers: { origin },
          data: { token: new URL(withdrawal.url).hash.slice(1) },
        })
      ).status(),
    ).toBe(201);
    const withdrawalSession = await (
      await student.request.get('/api/public/withdrawal')
    ).json();
    expect(
      (
        await student.request.post('/api/public/withdrawal/confirm', {
          headers: { origin, 'x-csrf-token': withdrawalSession.csrf },
          data: { confirm: true },
        })
      ).status(),
    ).toBe(201);
    await page.goto('/');
    await expect(page.getByTestId('dashboard-activities')).toHaveText(
      String(baseline.activities.total),
    );
    await expect(page.getByTestId('dashboard-athletes')).toHaveText(
      String(baseline.athletes.total + 1),
    );
    const ended = await (await page.request.get('/api/dashboard')).json();
    expect(
      ended.athletes.items.find((a: { id: string }) => a.id === athlete.id)
        .garmin,
    ).toBeNull();
    expect(errors).toEqual([]);
  } finally {
    await student.close();
    await other.close();
  }
});
