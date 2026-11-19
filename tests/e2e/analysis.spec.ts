import { test, expect } from '@playwright/test';
import { sampleActivity } from '../../apps/api/src/test-support/fit-fixture';
test('análise FIT: gráficos, eventos com evidência, seleção de splits/km e comparação responsiva', async ({
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
  const session = await (await page.request.get('/api/auth/session')).json(),
    origin = 'http://127.0.0.1:3000',
    headers = { origin, 'x-csrf-token': session.csrf };
  const name = `Análise sintética ${info.project.name} ${Date.now()}`;
  const athlete = await (
    await page.request.post('/api/athletes', {
      headers,
      data: {
        name,
        email: `analysis-${info.project.name}-${Date.now()}@example.test`,
      },
    })
  ).json();
  const invite = await (
    await page.request.post(`/api/athletes/${athlete.id}/invitations`, {
      headers,
      data: {},
    })
  ).json();
  const context = await browser.newContext({ baseURL: origin });
  try {
    expect(
      (
        await context.request.post('/api/public/invitation/redeem', {
          headers: { origin },
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
    const publicHeaders = { origin, 'x-csrf-token': enrollment.csrf };
    expect(
      (
        await context.request.post('/api/public/enrollment/verify', {
          headers: publicHeaders,
          data: { email: athlete.email, code: invitations.items[0].demoCode },
        })
      ).status(),
    ).toBe(201);
    expect(
      (
        await context.request.post('/api/public/enrollment/accept', {
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
    await page.goto(`/alunos/${athlete.id}`);
    await page
      .getByLabel('Arquivo FIT de teste', { exact: true })
      .setInputFiles({
        name: 'analise-sintetica.fit',
        mimeType: 'application/octet-stream',
        buffer: sampleActivity(
          new Date(Date.now() + Math.floor(Math.random() * 1000000000)),
          { detailed: true },
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
    let activityId = '';
    await expect
      .poll(async () => {
        const items = await (
          await page.request.get(`/api/athletes/${athlete.id}/fit-imports`)
        ).json();
        activityId = items[0]?.activityId ?? '';
        return Boolean(activityId);
      })
      .toBe(true);
    await expect
      .poll(async () => {
        const data = await (
          await page.request.get(`/api/activities/${activityId}/analysis`)
        ).json();
        return data.analysis?.status;
      })
      .toBe('completed');
    await page
      .getByRole('link', { name: 'Análises do aluno →', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Análise esportiva', exact: true }),
    ).toBeVisible();
    await page
      .getByRole('link', { name: 'Analisar atividade →', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Contexto da análise', exact: true }),
    ).toBeVisible();
    await expect(page.getByText('3 eventos', { exact: true })).toBeVisible();
    for (const chart of [
      'Ritmo',
      'Frequência cardíaca',
      'Cadência',
      'Elevação',
    ])
      await expect(
        page.getByRole('heading', { name: chart, exact: true }),
      ).toBeVisible();
    await expect(page.locator('.recharts-surface').first()).toBeVisible();
    await expect(
      page.getByText('Split com 3 evento(s)', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText('Nenhum trecho selecionado.', { exact: true }),
    ).toBeVisible();
    const chart = page.locator('.recharts-wrapper').first();
    const box = await chart.boundingBox();
    expect(box).not.toBeNull();
    await chart.click({ position: { x: box!.width * 0.4, y: 100 } });
    await expect(
      page.getByText('Trechos selecionados nos controles abaixo.', {
        exact: true,
      }),
    ).toBeVisible();
    await chart.click({ position: { x: box!.width * 0.7, y: 100 } });
    expect(
      Number(await page.getByLabel('Fim do trecho A').inputValue()),
    ).toBeGreaterThan(
      Number(await page.getByLabel('Início do trecho A').inputValue()),
    );
    await page
      .getByRole('button', { name: 'Selecionar split 1', exact: true })
      .click();
    await expect(page.getByLabel('Tipo do trecho A')).toHaveValue('splits');
    await expect(page.getByLabel('Início do trecho A')).toHaveValue('1');
    await page
      .getByRole('button', { name: 'Investigar splits 1 e 2', exact: true })
      .first()
      .click();
    await page
      .getByRole('button', { name: 'Comparar trechos', exact: true })
      .click();
    await expect(
      page
        .getByRole('status')
        .filter({ hasText: 'Diferença de ritmo (B − A): 30 s/km.' }),
    ).toBeVisible();
    await page.getByText('Evidências e regra', { exact: true }).first().click();
    await expect(page.getByText(/limiar ≥ 30 e ≥ 15%/)).toBeVisible();
    await page
      .getByRole('combobox', { name: 'Eixo dos gráficos', exact: true })
      .selectOption('distance');
    await expect(
      page.getByRole('combobox', { name: 'Eixo dos gráficos', exact: true }),
    ).toHaveValue('distance');
    await page.getByLabel('Tipo do trecho A').selectOption('distance');
    await page.getByLabel('Início do trecho A').fill('0');
    await page.getByLabel('Fim do trecho A').fill('1');
    await page.getByLabel('Tipo do trecho B').selectOption('distance');
    await page.getByLabel('Início do trecho B').fill('1');
    await page.getByLabel('Fim do trecho B').fill('2');
    await page
      .getByRole('button', { name: 'Comparar trechos', exact: true })
      .click();
    await expect(
      page.getByText('Limites efetivos:', { exact: false }).first(),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      ),
    ).toBe(false);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: info.outputPath('analysis-dark.png'),
      fullPage: true,
    });
    await page.getByRole('button', { name: 'Modo claro', exact: true }).click();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: info.outputPath('analysis-light.png'),
      fullPage: true,
    });
    await page
      .getByRole('button', { name: 'Limpar seleção', exact: true })
      .click();
    await expect(page.getByLabel('Tipo do trecho A')).toHaveValue('time');
    await expect(
      page.getByText('Nenhum trecho selecionado.', { exact: true }),
    ).toBeVisible();
    expect(errors).toEqual([]);
    expect(
      (
        await context.request.get(`/api/activities/${activityId}/analysis`)
      ).status(),
    ).toBe(401);
  } finally {
    await context.close();
  }
});
