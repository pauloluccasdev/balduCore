import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { resolve } from 'node:path';
import { readConfig } from '../config.js';
try {
  const values = {
    GARMIN_PROVIDER: 'mock',
    GARMIN_TOKEN_KEY:
      process.env.GARMIN_TOKEN_KEY || randomBytes(32).toString('base64'),
    GARMIN_MOCK_SIGNING_KEY:
      process.env.GARMIN_MOCK_SIGNING_KEY || randomBytes(32).toString('base64'),
  };
  readConfig({ ...process.env, ...values }); // Falha antes de alterar arquivo fora de demo local.
  const path = resolve('../../.env');
  let content = readFileSync(path, 'utf8');
  for (const [key, value] of Object.entries(values)) {
    const pattern = new RegExp(`^${key}=.*$`, 'm');
    content = pattern.test(content)
      ? content.replace(pattern, `${key}=${value}`)
      : `${content.trimEnd()}\n${key}=${value}\n`;
  }
  const temporary = `${path}.garmin.tmp`;
  writeFileSync(temporary, content, { mode: 0o600 });
  renameSync(temporary, path);
  console.log(
    'Garmin mock local configurado no .env ignorado, sem exibir segredos. Reinicie API e worker. Nenhuma integração Garmin real foi ativada.',
  );
} catch {
  console.error(
    'Não foi possível preparar o mock. Verifique .env, AUTH_MODE=demo e origem/bind locais.',
  );
  process.exitCode = 1;
}
