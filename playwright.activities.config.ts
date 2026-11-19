import { defineConfig } from '@playwright/test';
import demo from './playwright.demo.config';
// Conta demo compartilhada: testar upload serialmente respeita o limite por coach.
// Servidor independente também preserva o rate limit real de login da suíte demo.
export default defineConfig({
  ...demo,
  testMatch: ['**/activities.spec.ts', '**/analysis.spec.ts'],
  workers: 1,
});
