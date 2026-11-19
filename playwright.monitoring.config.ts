import { defineConfig } from '@playwright/test';
import demo from './playwright.demo.config';
// Servidor isolado preserva limites reais de login da conta demo compartilhada.
export default defineConfig({
  ...demo,
  testMatch: ['**/monitoring.spec.ts'],
  workers: 1,
});
