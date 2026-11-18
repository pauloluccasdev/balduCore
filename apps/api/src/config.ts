import { z } from 'zod';
import { randomBytes } from 'node:crypto';
const schema = z.object({
  DATABASE_URL: z
    .string()
    .url()
    .refine((value) =>
      ['postgres:', 'postgresql:'].includes(new URL(value).protocol),
    ),
  AUTH_MODE: z.enum(['google', 'demo']).default('google'),
  APP_ORIGIN: z.string().url().default('http://127.0.0.1:3000'),
  GOOGLE_CLIENT_ID: z.string().default(''),
  GOOGLE_CLIENT_SECRET: z.string().default(''),
  GOOGLE_ALLOWED_EMAILS: z.string().default(''),
  GOOGLE_ALLOWED_SUBJECTS: z.string().default(''),
  AUTH_SECRET: z.string().default(''),
  SESSION_HOURS: z.coerce.number().int().min(1).max(24).default(8),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  API_HOST: z.string().trim().min(1).default('127.0.0.1'),
  LOG_LEVEL: z
    .enum(['silent', 'fatal', 'error', 'warn', 'info', 'debug', 'trace'])
    .default('info'),
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
});
export type Config = z.infer<typeof schema>;
export function readConfig(environment: NodeJS.ProcessEnv): Config {
  const result = schema.safeParse(environment);
  if (!result.success) {
    // Nunca incluir valores das variáveis ou mensagens que ecoem credenciais.
    throw new Error(
      `Configuração inválida: ${[...new Set(result.error.issues.map((issue) => issue.path.join('.')))].join(', ')}`,
    );
  }
  const config = result.data;
  const origin = new URL(config.APP_ORIGIN);
  if (
    !['http:', 'https:'].includes(origin.protocol) ||
    origin.origin !== config.APP_ORIGIN ||
    (config.NODE_ENV === 'production' && origin.protocol !== 'https:')
  ) {
    throw new Error('Configuração inválida: APP_ORIGIN');
  }
  if (config.AUTH_MODE === 'demo') {
    const loopback = ['127.0.0.1', 'localhost', '[::1]'];
    if (
      config.NODE_ENV === 'production' ||
      !loopback.includes(origin.hostname) ||
      !['127.0.0.1', 'localhost', '::1'].includes(config.API_HOST)
    ) {
      throw new Error(
        'Modo demo permitido somente em ambiente local não produtivo.',
      );
    }
    // Chave efêmera exclusivamente local; não exige Google ou segredo de exemplo.
    if (!config.AUTH_SECRET)
      config.AUTH_SECRET = randomBytes(32).toString('base64');
  }
  const googleConfigured =
    config.AUTH_MODE === 'google' &&
    Boolean(
      config.GOOGLE_CLIENT_ID ||
      config.GOOGLE_CLIENT_SECRET ||
      config.AUTH_SECRET,
    );
  if (
    (googleConfigured &&
      (!config.GOOGLE_CLIENT_ID || !config.GOOGLE_CLIENT_SECRET)) ||
    ((googleConfigured || config.AUTH_MODE === 'demo') &&
      (!/^[A-Za-z0-9+/]{43}=$/.test(config.AUTH_SECRET) ||
        Buffer.from(config.AUTH_SECRET, 'base64').length !== 32))
  ) {
    throw new Error(
      'Configuração inválida: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, AUTH_SECRET',
    );
  }
  return config;
}
