import { test, expect } from '@playwright/test';
test('acesso anônimo não revela dashboard nem alunos', async ({
  page,
  request,
}) => {
  await page.goto('/alunos');
  await expect(page).toHaveURL('/login');
  await expect(
    page.getByRole('heading', { name: 'Seu acompanhamento começa aqui.' }),
  ).toBeVisible();
  expect((await request.get('/api/athletes')).status()).toBe(401);
});
test('Google OIDC de teste → cadastro → busca → edição → logout', async ({
  page,
}, info) => {
  const name = `Aluno E2E ${info.project.name} ${Date.now()}`;
  const email = `${info.project.name}-${Date.now()}@example.test`;
  await page.goto('/login');
  await page.getByRole('link', { name: 'Entrar com Google' }).click();
  await expect(page).toHaveURL('/');
  await page.goto('/alunos');
  await page.getByLabel('Nome completo', { exact: true }).fill(name);
  await page.getByLabel('E-mail', { exact: true }).fill(email);
  await page
    .getByRole('button', { name: 'Cadastrar aluno', exact: true })
    .click();
  await expect(page).toHaveURL(/\/alunos\/[^/?]+$/);
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  await expect(
    page.getByRole('definition').filter({ hasText: /^Não conectada$/ }),
  ).toBeVisible();
  await expect(
    page.getByText('Pendente', { exact: true }).first(),
  ).toBeVisible();
  await page
    .getByLabel('Nome completo', { exact: true })
    .fill(`${name} editado`);
  await page.getByRole('button', { name: 'Salvar alterações' }).click();
  await expect(
    page.getByRole('heading', { name: `${name} editado`, exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath('athlete-profile.png'),
    fullPage: true,
  });
  await page.getByRole('link', { name: '← Voltar para alunos' }).click();
  await page.getByLabel('Buscar aluno').fill(email);
  await page.getByRole('button', { name: 'Buscar', exact: true }).click();
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await expect(page.locator('tbody')).toContainText(`${name} editado`);
  await page.screenshot({
    path: info.outputPath('athletes-list.png'),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole('button', { name: 'Sair', exact: true }).click();
  await expect(page).toHaveURL('/login');
  await page.goto('/alunos');
  await expect(page).toHaveURL('/login');
});
