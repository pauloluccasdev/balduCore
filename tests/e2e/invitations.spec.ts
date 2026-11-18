import { test, expect } from '@playwright/test';

test('convite público: verificação demo, aceites, retomada e encerramento sem dashboard', async ({
  page,
  browser,
}, info) => {
  const name = `Participante convite ${info.project.name} ${Date.now()}`;
  const email = `inv-${info.project.name}-${Date.now()}@example.test`;
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/login');
  await page
    .getByRole('button', { name: 'Entrar como Treinador Demo 1', exact: true })
    .click();
  await expect(page).toHaveURL('/');
  await page.goto('/alunos');
  await page.getByLabel('Nome completo', { exact: true }).fill(name);
  await page.getByLabel('E-mail', { exact: true }).fill(email);
  await page
    .getByRole('button', { name: 'Cadastrar aluno', exact: true })
    .click();
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  const profile = page.url();
  await page.getByRole('button', { name: 'Gerar convite de teste' }).click();
  const share = page.getByLabel(
    'Link exclusivo — guarde antes de sair desta página',
  );
  await expect(share).toBeVisible();
  const url = await share.inputValue();
  expect(new URL(url).hash).toMatch(/^#[\w-]{43}$/);
  const studentContext = await browser.newContext({
    viewport: page.viewportSize()!,
  });
  const student = await studentContext.newPage();
  student.on('pageerror', (error) => errors.push(error.message));
  try {
    await student.goto(url);
    await expect(
      student.getByRole('button', { name: 'Iniciar aceite' }),
    ).toBeVisible();
    await expect(student).toHaveURL('/convite');
    await expect(student.locator('.sidebar')).toHaveCount(0);
    expect((await student.request.get('/api/auth/session')).status()).toBe(401);
    await student.getByRole('button', { name: 'Iniciar aceite' }).click();
    await expect(student.getByLabel('Código demonstrativo')).toBeVisible();
    await page.getByRole('button', { name: 'Atualizar convites' }).click();
    const code = (
      await page.locator('.demo-code strong span').innerText()
    ).trim();
    await student.getByLabel('Nome completo', { exact: true }).fill(name);
    await student.getByLabel('E-mail do convite').fill(email);
    await student.getByLabel('Código demonstrativo').fill(code);
    await student
      .getByRole('button', { name: 'Verificar código de teste' })
      .click();
    await expect(
      student.getByText('Verificação simulada concluída.', { exact: false }),
    ).toBeVisible();
    // Retomada depois da verificação: não reutiliza convite e permite preencher dados novamente.
    await student.reload();
    await expect(
      student.getByRole('button', { name: 'Confirmar aceites demonstrativos' }),
    ).toBeVisible();
    await student.getByLabel('Nome completo', { exact: true }).fill(name);
    await student.getByLabel('E-mail do convite').fill(email);
    const checks = student.getByRole('checkbox');
    await expect(checks).toHaveCount(2);
    await expect(checks.nth(0)).not.toBeChecked();
    await expect(checks.nth(1)).not.toBeChecked();
    await student
      .getByText('Acompanhamento esportivo · demo-1 · exemplo', { exact: true })
      .click();
    await student
      .getByText('Termos e política de privacidade · demo-1 · exemplo', {
        exact: true,
      })
      .click();
    await student.screenshot({
      path: info.outputPath('public-consents-dark.png'),
      fullPage: true,
    });
    await student.getByRole('button', { name: 'Modo claro' }).click();
    await expect(student.locator('html')).toHaveAttribute(
      'data-theme',
      'light',
    );
    await student.screenshot({
      path: info.outputPath('public-consents-light.png'),
      fullPage: true,
    });
    const overflow = await student.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflow).toBe(false);
    await checks.nth(0).check();
    await checks.nth(1).check();
    await student
      .getByRole('button', { name: 'Confirmar aceites demonstrativos' })
      .click();
    await expect(
      student.getByRole('heading', { name: 'Acompanhamento aceito.' }),
    ).toBeVisible();
    await expect(
      student.getByText('Garmin não conectada.', { exact: true }),
    ).toBeVisible();
    const withdrawalUrl = await student
      .getByLabel('Link exclusivo — guarde antes de sair desta página')
      .inputValue();
    await page.goto(profile);
    await expect(
      page.getByText('Ativo', { exact: true }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Gerar link de encerramento' }),
    ).toBeVisible();
    await student.reload();
    await expect(
      student.getByRole('heading', { name: 'Acompanhamento aceito.' }),
    ).toBeVisible();
    await student.goto(withdrawalUrl);
    await student.getByRole('button', { name: 'Abrir confirmação' }).click();
    await expect(student).toHaveURL('/encerrar');
    await student.getByRole('checkbox').check();
    await student
      .getByRole('button', { name: 'Confirmar encerramento' })
      .click();
    await expect(
      student.getByRole('heading', { name: 'Vínculo encerrado.' }),
    ).toBeVisible();
    await student.screenshot({
      path: info.outputPath('public-withdrawal-light.png'),
      fullPage: true,
    });
    await student.reload();
    await expect(
      student.getByRole('heading', { name: 'Vínculo encerrado.' }),
    ).toBeVisible();
    await page.goto(profile);
    await expect(
      page.getByText('Encerrado', { exact: true }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Gerar convite de teste' }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Gerar link de encerramento' }),
    ).toHaveCount(0);
    const studentSession = await student.request.get('/api/auth/session');
    expect(studentSession.status()).toBe(401);
    expect(errors).toEqual([]);
  } finally {
    await studentContext.close();
  }
});

test('convite revogado não inicia jornada e não revela destinatário', async ({
  page,
  browser,
}, info) => {
  await page.goto('/login');
  await page
    .getByRole('button', { name: 'Entrar como Treinador Demo 1', exact: true })
    .click();
  await expect(page).toHaveURL('/');
  await page.goto('/alunos');
  const email = `revoked-${info.project.name}-${Date.now()}@example.test`;
  await page
    .getByLabel('Nome completo', { exact: true })
    .fill('Destinatário fictício revogado');
  await page.getByLabel('E-mail', { exact: true }).fill(email);
  await page
    .getByRole('button', { name: 'Cadastrar aluno', exact: true })
    .click();
  await page.getByRole('button', { name: 'Gerar convite de teste' }).click();
  const url = await page
    .getByLabel('Link exclusivo — guarde antes de sair desta página')
    .inputValue();
  await page
    .getByRole('button', { name: 'Revogar convite', exact: true })
    .click();
  await expect(page.getByText('Revogado', { exact: true })).toBeVisible();
  const studentContext = await browser.newContext({
    viewport: page.viewportSize()!,
  });
  try {
    const student = await studentContext.newPage();
    await student.goto(url);
    await expect(student.locator('.form-error[role=alert]')).toContainText(
      'Link indisponível',
    );
    await expect(student.getByLabel('Nome completo')).toHaveCount(0);
    await expect(
      student.getByRole('button', { name: 'Iniciar aceite' }),
    ).toHaveCount(0);
    expect(await student.locator('body').innerText()).not.toContain(email);
    expect(new URL(student.url()).hash).toBe('');
  } finally {
    await studentContext.close();
  }
});
