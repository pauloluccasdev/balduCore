// Apenas o Playwright inicia este entrypoint; não existe env que habilite fixture no main.
import { createTestApp } from './test-app.js';
if (process.env.NODE_ENV === 'production')
  throw new Error('Servidor E2E proibido em produção.');
const server = await createTestApp(3001, 'http://127.0.0.1:3000');
// Relacionamentos de E2E usam identidades sintéticas; dados reais nunca são seeds.
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.once(signal, async () => {
    await server.close();
    process.exit(0);
  });
