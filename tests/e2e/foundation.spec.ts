import { test, expect } from '@playwright/test';
test.beforeEach(async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('link', { name: 'Entrar com Google' }).click();
  await expect(page).toHaveURL('/');
});
test('dashboard sintético, filtro, tema persistido, navegação e ausência de overflow', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Dashboard', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('note')).toContainText('sintéticos');
  await expect(page.getByRole('note')).toContainText(
    'Garmin não está integrada',
  );
  await expect(page.getByRole('table')).toHaveCount(1);
  await expect(page.locator('tbody tr')).toHaveCount(8);
  await page.getByRole('button', { name: '7 dias', exact: true }).click();
  await expect(page.locator('tbody tr')).toHaveCount(4);
  await expect(
    page.getByRole('button', { name: '7 dias', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '30 dias', exact: true }).click();
  await expect(page.locator('tbody tr')).toHaveCount(8);
  await expect(
    page.getByRole('button', { name: 'Criar treino · em breve' }),
  ).toBeDisabled();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.screenshot({
    path: testInfo.outputPath('dashboard-dark.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Modo claro' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.getByRole('button', { name: 'Modo escuro' })).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('dashboard-light.png'),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  if (testInfo.project.name === 'mobile') {
    await page.getByRole('button', { name: 'Abrir menu' }).click();
    const menu = page.getByRole('dialog', { name: 'Menu de navegação' });
    await expect(menu).toBeVisible();
    await expect(menu.getByText('Alunos', { exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(menu).not.toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Abrir menu' }),
    ).toBeFocused();
  } else {
    await expect(
      page.getByRole('navigation', { name: 'Navegação principal' }),
    ).toBeVisible();
  }
  expect(errors).toEqual([]);
});
test('mesma origem → proxy Next → Nest → Prisma → PostgreSQL', async ({
  request,
}) => {
  const response = await request.get('/api/health/ready');
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ status: 'ok', database: 'up' });
  expect(response.headers()['cache-control']).toBe('no-store');
  const absent = await request.get('/api/athletes');
  expect(absent.status()).toBe(401);
});
