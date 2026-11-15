import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readConfig } from './config.js';
test('configuração rejeita banco ausente, protocolo inválido e porta fora do intervalo sem expor valores', () => {
  for (const environment of [
    {},
    { DATABASE_URL: 'https://secret:password@example.com' },
    { DATABASE_URL: 'postgres://localhost/test', API_PORT: '70000' },
  ]) {
    assert.throws(
      () => readConfig(environment),
      (error: unknown) =>
        error instanceof Error &&
        error.message.startsWith('Configuração inválida:') &&
        !error.message.includes('password'),
    );
  }
});
test('padrões locais e URL postgres válida', () => {
  const config = readConfig({ DATABASE_URL: 'postgres://localhost/test' });
  assert.equal(config.API_HOST, '127.0.0.1');
  assert.equal(config.API_PORT, 3001);
});
