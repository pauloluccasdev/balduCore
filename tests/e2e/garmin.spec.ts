import { test, expect } from '@playwright/test';
test('autorização mock, worker, duplicatas, retry e reconexão; retirada bloqueia conexão', async ({
  page,
  browser,
}, info) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/login');
  await page
    .getByRole('button', { name: 'Entrar como Treinador Demo 1', exact: true })
    .click();
  await expect(page).toHaveURL('/');
  await page.goto('/alunos');
  const name = `Aluno mock ${info.project.name} ${Date.now()}`;
  const email = `mock-${info.project.name}-${Date.now()}@example.test`;
  await page.getByLabel('Nome completo', { exact: true }).fill(name);
  await page.getByLabel('E-mail', { exact: true }).fill(email);
  await page
    .getByRole('button', { name: 'Cadastrar aluno', exact: true })
    .click();
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  const profile = page.url();
  const athleteId = new URL(profile).pathname.split('/').at(-1)!;
  await page.getByRole('button', { name: 'Gerar convite de teste' }).click();
  const url = await page
    .getByLabel('Link exclusivo — guarde antes de sair desta página')
    .inputValue();
  const context = await browser.newContext({
    viewport: page.viewportSize()!,
    baseURL: 'http://127.0.0.1:3000',
  });
  const student = await context.newPage();
  student.on('pageerror', (error) => errors.push(error.message));
  const networks: string[] = [];
  student.on('request', (request) => networks.push(request.url()));
  const status = async () =>
    (await page.request.get(`/api/athletes/${athleteId}/garmin`)).json();
  async function identify(link: string) {
    await student.goto(link);
    await student.getByRole('button', { name: 'Iniciar aceite' }).click();
    await expect(student.getByLabel('Código demonstrativo')).toBeVisible();
    await page.getByRole('button', { name: 'Atualizar convites' }).click();
    const code = await page.locator('.demo-code strong span').innerText();
    await student.getByLabel('Nome completo', { exact: true }).fill(name);
    await student.getByLabel('E-mail do convite').fill(email);
    await student.getByLabel('Código demonstrativo').fill(code);
    await student
      .getByRole('button', { name: 'Verificar código de teste' })
      .click();
  }
  async function simulate(scenario: string) {
    const details = page.locator('details').filter({
      has: page.getByText('Ferramentas de teste local', { exact: true }),
    });
    if (
      !(await details.evaluate(
        (element) => (element as HTMLDetailsElement).open,
      ))
    )
      await details.locator('summary').click();
    await page.getByLabel('Cenário de sincronização').selectOption(scenario);
    const response = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/athletes/${athleteId}/garmin/mock`) &&
        response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Simular evento de teste' }).click();
    expect((await response).status()).toBe(201);
    await expect(
      page.getByRole('button', { name: 'Simular evento de teste' }),
    ).toBeEnabled();
  }
  try {
    await student.goto('/convite');
    await expect(student.locator('.form-error[role=alert]')).toBeVisible();
    await identify(url);
    await student.getByRole('checkbox').nth(0).check();
    await student.getByRole('checkbox').nth(1).check();
    await student
      .getByRole('button', { name: 'Confirmar aceites demonstrativos' })
      .click();
    await expect(
      student.getByRole('heading', { name: 'Acompanhamento aceito.' }),
    ).toBeVisible();
    const withdrawalUrl = await student
      .getByLabel('Link exclusivo — guarde antes de sair desta página')
      .inputValue();
    await student
      .getByRole('button', { name: 'Simular autorização Garmin' })
      .click();
    await expect(student).toHaveURL('/garmin/mock');
    await expect(student.getByRole('note')).toContainText(
      'Esta tela não pertence à Garmin',
    );
    await student
      .getByRole('button', { name: 'Recusar autorização simulada' })
      .click();
    await expect(
      student.getByRole('heading', { name: 'Autorização simulada recusada.' }),
    ).toBeVisible();
    expect((await status()).status).toBe('not_connected');
    await student
      .getByRole('link', { name: 'Voltar à confirmação do convite' })
      .click();
    await student
      .getByRole('button', { name: 'Simular autorização Garmin' })
      .click();
    await student.getByRole('button', { name: 'Modo claro' }).click();
    await student.screenshot({
      path: info.outputPath('garmin-mock-light.png'),
      fullPage: true,
    });
    await student
      .getByRole('button', { name: 'Autorizar conexão simulada', exact: true })
      .click();
    await expect(
      student.getByRole('heading', { name: 'Conexão simulada autorizada.' }),
    ).toBeVisible();
    await page.goto(profile);
    await expect(
      page.getByText('Conectada · simulação', { exact: true }).first(),
    ).toBeVisible();
    await simulate('sample');
    await expect.poll(async () => (await status()).activityCount).toBe(1);
    await simulate('duplicate');
    await expect
      .poll(
        async () =>
          (await status()).events.filter((e: { status: string }) =>
            ['queued', 'retry', 'processing'].includes(e.status),
          ).length,
      )
      .toBe(0);
    await expect.poll(async () => (await status()).events.length).toBe(2);
    const eventCount = (await status()).events.length;
    await simulate('duplicate');
    await expect
      .poll(async () => (await status()).events.length)
      .toBe(eventCount);
    expect((await status()).activityCount).toBe(1);
    await simulate('temporary_failure');
    await expect
      .poll(
        async () =>
          (await status()).events.some(
            (e: { attempts: number; status: string }) =>
              e.attempts === 3 && e.status === 'ignored',
          ),
        { timeout: 15000 },
      )
      .toBe(true);
    await page.getByRole('button', { name: 'Atualizar integração' }).click();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: info.outputPath('garmin-profile-dark.png'),
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      ),
    ).toBe(false);
    if (info.project.name === 'mobile') {
      await page.getByRole('button', { name: 'Abrir menu' }).click();
      await page
        .getByRole('dialog')
        .getByRole('link', { name: 'Configurações', exact: true })
        .click();
    } else
      await page
        .getByRole('link', { name: 'Configurações', exact: true })
        .first()
        .click();
    await expect(
      page.getByRole('heading', { name: 'Configurações', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText('Mock local — dados sintéticos', { exact: true }),
    ).toBeVisible();
    await page.goto(profile);
    await page
      .getByLabel('Confirmo a desconexão simulada.', { exact: false })
      .check();
    await page
      .getByRole('button', { name: 'Desconectar integração simulada' })
      .click();
    await expect
      .poll(async () => (await status()).revocationStatus)
      .toBe('completed');
    await page.getByRole('button', { name: 'Atualizar integração' }).click();
    await page
      .getByRole('button', { name: 'Gerar link para conexão de teste' })
      .click();
    const reconnect = await page
      .getByLabel('Link para autorização Garmin mock')
      .inputValue();
    await identify(reconnect);
    await expect(
      student.getByRole('heading', {
        name: 'Identificação de teste confirmada.',
      }),
    ).toBeVisible();
    await expect(student.getByRole('checkbox')).toHaveCount(0);
    await student
      .getByRole('button', { name: 'Simular autorização Garmin' })
      .click();
    await student
      .getByRole('button', { name: 'Autorizar conexão simulada', exact: true })
      .click();
    await expect.poll(async () => (await status()).status).toBe('connected');
    await student.goto(withdrawalUrl);
    await student.getByRole('button', { name: 'Abrir confirmação' }).click();
    await student.getByRole('checkbox').check();
    await student
      .getByRole('button', { name: 'Confirmar encerramento' })
      .click();
    await expect(
      student.getByRole('heading', { name: 'Vínculo encerrado.' }),
    ).toBeVisible();
    await expect.poll(async () => (await status()).status).toBe('disconnected');
    expect((await status()).activityCount).toBe(0);
    expect((await student.request.get('/api/auth/session')).status()).toBe(401);
    expect(
      networks.some((url) => new URL(url).hostname.endsWith('garmin.com')),
    ).toBe(false);
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});
