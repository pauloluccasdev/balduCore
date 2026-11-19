import { test, expect } from '@playwright/test';
import { sampleActivity } from '../../apps/api/src/test-support/fit-fixture';
test('FIT de teste no perfil, publicação, histórico filtrado, detalhes e temas responsivos', async ({
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
  const session = await (await page.request.get('/api/auth/session')).json();
  const headers = {
    origin: 'http://127.0.0.1:3000',
    'x-csrf-token': session.csrf,
  };
  const name = `Atividade FIT ${info.project.name} ${Date.now()}`;
  const athlete = await (
    await page.request.post('/api/athletes', {
      headers,
      data: {
        name,
        email: `fit-${info.project.name}-${Date.now()}@example.test`,
      },
    })
  ).json();
  const invite = await (
    await page.request.post(`/api/athletes/${athlete.id}/invitations`, {
      headers,
      data: {},
    })
  ).json();
  const context = await browser.newContext({
    baseURL: 'http://127.0.0.1:3000',
  });
  try {
    const publicHeaders = { origin: 'http://127.0.0.1:3000' };
    expect(
      (
        await context.request.post('/api/public/invitation/redeem', {
          headers: publicHeaders,
          data: { token: new URL(invite.url).hash.slice(1) },
        })
      ).status(),
    ).toBe(201);
    const enrollment = await (
      await context.request.get('/api/public/enrollment')
    ).json();
    const invitations = await (
      await page.request.get(`/api/athletes/${athlete.id}/invitations`)
    ).json();
    const mutationHeaders = {
      ...publicHeaders,
      'x-csrf-token': enrollment.csrf,
    };
    expect(
      (
        await context.request.post('/api/public/enrollment/verify', {
          headers: mutationHeaders,
          data: { email: athlete.email, code: invitations.items[0].demoCode },
        })
      ).status(),
    ).toBe(201);
    expect(
      (
        await context.request.post('/api/public/enrollment/accept', {
          headers: mutationHeaders,
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
    await page.goto(`/alunos/${athlete.id}`);
    await page
      .getByLabel('Arquivo FIT de teste', { exact: true })
      .setInputFiles({
        name: 'atividade-sintetica.fit',
        mimeType: 'application/octet-stream',
        buffer: sampleActivity(
          new Date(Date.now() + Math.floor(Math.random() * 1000000000)),
        ),
      });
    await page
      .getByLabel(
        'Confirmo que este arquivo contém apenas dados sintéticos de teste.',
      )
      .check();
    await page
      .getByRole('button', { name: 'Importar FIT de teste', exact: true })
      .click();
    await expect(
      page.getByRole('status').filter({ hasText: 'FIT recebido.' }),
    ).toBeVisible();
    await expect
      .poll(async () => {
        await page
          .getByRole('button', { name: 'Atualizar processamento', exact: true })
          .click();
        return page
          .getByRole('link', { name: 'Ver atividade →', exact: true })
          .count();
      })
      .toBe(1);
    expect(
      (
        await (
          await page.request.get(`/api/athletes/${athlete.id}/garmin`)
        ).json()
      ).status,
    ).toBe('not_connected');
    await page.getByRole('link', { name: 'Consultar histórico →' }).click();
    await expect(
      page.getByRole('heading', { name: 'Atividades dos Alunos', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: new RegExp(name) }),
    ).toBeVisible();
    await page
      .getByRole('combobox', { name: 'Origem', exact: true })
      .selectOption('manual_fit');
    await page.getByRole('button', { name: 'Filtrar', exact: true }).click();
    await expect(page).toHaveURL(/source=manual_fit/);
    await expect(
      page.getByRole('button', { name: new RegExp(name) }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      ),
    ).toBe(false);
    await page.screenshot({
      path: info.outputPath('activities-dark.png'),
      fullPage: true,
    });
    await page.getByRole('button', { name: 'Modo claro', exact: true }).click();
    await page.screenshot({
      path: info.outputPath('activities-light.png'),
      fullPage: true,
    });
    await page
      .getByRole('link', { name: 'Explorar dados', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: `Corrida · ${name}`, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', {
        name: 'Amostras recebidas (3)',
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Splits recebidos (1)', exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: info.outputPath('activity-details.png'),
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      ),
    ).toBe(false);
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});
