import { test, expect } from '@playwright/test';
test('login fictício sem Google, cadastro e isolamento entre contas demo', async ({
  page,
}, info) => {
  const name = `Aluno fictício ${info.project.name} ${Date.now()}`;
  const email = `demo-${info.project.name}-${Date.now()}@example.test`;
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  await page.goto('/login');
  await expect(
    page.getByRole('link', { name: 'Entrar com Google' }),
  ).toHaveCount(0);
  await expect(page.getByRole('note')).toContainText('Modo demonstração local');
  await page
    .getByRole('button', { name: 'Entrar como Treinador Demo 1', exact: true })
    .click();
  await expect(page).toHaveURL('/');
  await expect(
    page.getByText('Conta fictícia · Modo demonstração'),
  ).toBeVisible();
  await page.goto('/alunos');
  await page.getByLabel('Nome completo', { exact: true }).fill(name);
  await page.getByLabel('E-mail', { exact: true }).fill(email);
  await page
    .getByRole('button', { name: 'Cadastrar aluno', exact: true })
    .click();
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  await expect(
    page.getByText('Conta fictícia · Modo demonstração'),
  ).toBeVisible();
  const profile = page.url();
  const api = await page.request.get('/api/auth/session');
  expect((await api.json()).isSynthetic).toBe(true);
  await page.screenshot({
    path: info.outputPath('demo-profile.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Sair', exact: true }).click();
  await expect(page).toHaveURL('/login');
  await page
    .getByRole('button', { name: 'Entrar como Treinador Demo 2', exact: true })
    .click();
  await expect(page).toHaveURL('/');
  await page.goto('/alunos');
  await page.getByLabel('Buscar aluno').fill(email);
  await page.getByRole('button', { name: 'Buscar', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Nenhum aluno encontrado.' }),
  ).toBeVisible();
  await page.goto(profile);
  await expect(
    page.getByRole('heading', { name: 'Aluno não encontrado.' }),
  ).toBeVisible();
  expect(requests.some((url) => url.includes('accounts.google.com'))).toBe(
    false,
  );
});
