import { defineConfig } from '@playwright/test';
import demo from './playwright.demo.config';
// Sessão do servidor isolada: não enfraquecer os limites de login demo na regressão.
export default defineConfig({
  ...demo,
  testMatch: ['**/dashboard.spec.ts'],
  workers: 1,
});
