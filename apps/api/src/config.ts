import { z } from 'zod';
const schema = z.object({
  DATABASE_URL: z
    .string()
    .url()
    .refine((value) =>
      ['postgres:', 'postgresql:'].includes(new URL(value).protocol),
    ),
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
  return result.data;
}
