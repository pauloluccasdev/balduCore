import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { spawnSync } from 'node:child_process';
if (existsSync('.env')) loadEnvFile('.env');
let isolated = false;
try {
  isolated = Boolean(
    process.env.TEST_DATABASE_URL &&
    process.env.DATABASE_URL &&
    new URL(process.env.TEST_DATABASE_URL).pathname !==
      new URL(process.env.DATABASE_URL).pathname,
  );
} catch {
  /* Mensagem abaixo omite valores das URLs. */
}
if (process.env.NODE_ENV === 'production' || !isolated) {
  throw new Error(
    'Configure TEST_DATABASE_URL com nome de banco diferente de DATABASE_URL, fora de produção.',
  );
}
const result = spawnSync('pnpm', ['db:deploy'], {
  stdio: 'inherit',
  env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL },
});
process.exitCode = result.status ?? 1;
