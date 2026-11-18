import { defineConfig } from '@playwright/test';
import base from './playwright.config';
export default defineConfig({
  ...base,
  testMatch: '**/demo.spec.ts',
  webServer: [
    {
      command: 'pnpm --filter @balducore/api test:e2e:server',
      url: 'http://127.0.0.1:3001/health',
      reuseExistingServer: false,
      env: { E2E_AUTH_MODE: 'demo' },
    },
    {
      command: 'pnpm --filter @balducore/web start',
      url: 'http://127.0.0.1:3000',
      reuseExistingServer: false,
    },
  ],
});
