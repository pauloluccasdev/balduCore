import { test, expect } from '@playwright/test';
import { sampleActivity } from '../../apps/api/src/test-support/fit-fixture';
// Exercita hidratação com navegador em fuso diferente do servidor UTC.
test.use({ timezoneId: 'America/Sao_Paulo' });
test('feedback: salvar, avaliar, editar com histórico, recuperar erro/conflito e isolamento responsivo', async ({
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
  const name = `Feedback sintético ${info.project.name} ${Date.now()}`;
  const athlete = await (
    await page.request.post('/api/athletes', {
      headers,
      data: {
        name,
        email: `feedback-${info.project.name}-${Date.now()}@example.test`,
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
    const path = `/atividades/${id}/feedback`,
      api = `/api/activities/${id}/feedback`;
    await page.goto(`/atividades/${id}`);
    await page
      .getByRole('link', { name: 'Feedback do treinador →', exact: true })
      .click();
    await expect(page).toHaveURL(path);
    await expect(
      page.getByRole('heading', { name: 'Feedback do treinador', exact: true }),
    ).toBeVisible();
    await page
      .getByRole('textbox', {
        name: 'Como o aluno executou a atividade?',
        exact: true,
      })
      .fill('Execução observada pelo treinador, sem causa atribuída.');
    await page
      .getByRole('textbox', { name: 'Observações', exact: true })
      .fill('Registro inicial sintético.');
    await page
      .getByRole('textbox', { name: 'Decisões técnicas', exact: true })
      .fill('Acompanhar ritmo no próximo treino.');
    await page
      .getByRole('combobox', { name: 'Categoria', exact: true })
      .selectOption('hydration');
    await page
      .getByRole('combobox', { name: 'Origem do contexto', exact: true })
      .selectOption('athlete_report');
    await page
      .getByRole('combobox', { name: 'Escopo', exact: true })
      .selectOption('distance');
    await page.getByLabel('Início (m)', { exact: true }).fill('0');
    await page.getByLabel('Fim (m)', { exact: true }).fill('1000');
    await page
      .getByLabel('Contexto do ponto')
      .fill('Aluno informou parada para hidratação.');
    await page
      .getByRole('button', { name: 'Adicionar ponto', exact: true })
      .click();
    await page
      .getByRole('combobox', {
        name: 'Avaliação de Variação de ritmo · split 2',
        exact: true,
      })
      .selectOption('correct');
    await page
      .getByRole('button', { name: 'Salvar diário', exact: true })
      .click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Diário salvo. Revisão 1.' }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole('textbox', { name: 'Observações', exact: true }),
    ).toHaveValue('Registro inicial sintético.');
    await expect(
      page.getByRole('combobox', {
        name: 'Avaliação de Variação de ritmo · split 2',
        exact: true,
      }),
    ).toHaveValue('correct');
    await expect(
      page.getByText('Aluno informou parada para hidratação.', { exact: true }),
    ).toBeVisible();
    await page
      .getByRole('textbox', { name: 'Observações', exact: true })
      .fill('Registro revisado sintético.');
    await page.route(`**${api}`, async (route) => {
      if (route.request().method() === 'PUT')
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Falha de teste ao salvar.' }),
        });
      else await route.continue();
    });
    await page
      .getByRole('button', { name: 'Salvar diário', exact: true })
      .click();
    await expect(
      page.getByRole('alert').filter({ hasText: 'Falha de teste ao salvar.' }),
    ).toBeVisible();
    await expect(
      page.getByRole('textbox', { name: 'Observações', exact: true }),
    ).toHaveValue('Registro revisado sintético.');
    await page.unroute(`**${api}`);
    await page
      .getByRole('button', { name: 'Salvar diário', exact: true })
      .click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Diário salvo. Revisão 2.' }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Abrir revisão 1', exact: true })
      .click();
    const revision = page.getByRole('article', {
      name: 'Conteúdo da revisão 1',
    });
    await expect(revision).toContainText('Registro inicial sintético.');
    await expect(revision).not.toContainText('Registro revisado sintético.');
    // Outra aba publica revisão 3; a edição local da versão 2 precisa permanecer intacta.
    const current = await (await page.request.get(api)).json();
    expect(
      (
        await page.request.put(api, {
          headers,
          data: {
            expectedVersion: 2,
            inputRevision: current.activity.revision,
            inputHash: current.activity.dataHash,
            analysisId: current.analysis.id,
            content: {
              ...current.content,
              observations: 'Alteração de outra sessão.',
            },
          },
        })
      ).status(),
    ).toBe(200);
    await page
      .getByRole('textbox', { name: 'Observações', exact: true })
      .fill('Texto local preservado no conflito.');
    await page
      .getByRole('button', { name: 'Salvar diário', exact: true })
      .click();
    await expect(
      page.getByRole('alert').filter({ hasText: 'outra sessão' }),
    ).toBeVisible();
    await expect(
      page.getByRole('textbox', { name: 'Observações', exact: true }),
    ).toHaveValue('Texto local preservado no conflito.');
    page.once('dialog', (dialog) => dialog.accept());
    await page
      .getByRole('button', { name: 'Recarregar versão salva', exact: true })
      .click();
    await expect(
      page.getByRole('textbox', { name: 'Observações', exact: true }),
    ).toHaveValue('Alteração de outra sessão.');
    await page
      .getByRole('textbox', { name: 'Observações', exact: true })
      .focus();
    await page.keyboard.press('Tab');
    await expect(
      page.getByRole('textbox', { name: 'Decisões técnicas', exact: true }),
    ).toBeFocused();
    await page
      .getByRole('textbox', { name: 'Observações', exact: true })
      .fill('Rascunho local para testar aviso de saída.');
    page.once('dialog', (dialog) => dialog.dismiss());
    await page
      .getByRole('link', { name: 'Ver atividade', exact: true })
      .click();
    await expect(page).toHaveURL(path);
    await expect(
      page.getByRole('textbox', { name: 'Observações', exact: true }),
    ).toHaveValue('Rascunho local para testar aviso de saída.');
    await page
      .getByRole('textbox', { name: 'Observações', exact: true })
      .fill('Alteração de outra sessão.');
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      ),
    ).toBe(false);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: info.outputPath('feedback-dark.png'),
      fullPage: true,
    });
    await page.getByRole('button', { name: 'Modo claro', exact: true }).click();
    await page.screenshot({
      path: info.outputPath('feedback-light.png'),
      fullPage: true,
    });
    await page
      .getByRole('link', { name: '← Perfil do aluno', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Diários do treinador', exact: true }),
    ).toBeVisible();
    const diary = page.getByRole('link').filter({ hasText: 'Corrida ·' });
    await expect(diary).toHaveCount(1);
    await diary.click();
    await expect(page).toHaveURL(path);
    expect((await student.request.get(api)).status()).toBe(401);
    expect(
      (
        await other.request.post('/api/auth/demo', {
          headers: { origin },
          data: { account: '2' },
        })
      ).status(),
    ).toBe(200);
    for (const url of [
      api,
      `${api}/revisions`,
      `${api}/revisions/1`,
      `/api/athletes/${athlete.id}/feedback`,
    ])
      expect((await other.request.get(url)).status()).toBe(404);
    const otherPage = await other.newPage();
    await otherPage.goto(path);
    await expect(
      otherPage.getByText(/não encontrad|404/i).first(),
    ).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await student.close();
    await other.close();
  }
});
