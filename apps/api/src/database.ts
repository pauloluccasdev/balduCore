import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.js';
export interface DatabaseHealth {
  ping(): Promise<void>;
  close(): Promise<void>;
}
export function createDatabase(
  url: string,
): DatabaseHealth & { client: PrismaClient } {
  const adapter = new PrismaPg({
    connectionString: url,
    connectionTimeoutMillis: 2000,
    query_timeout: 2000,
    max: 3,
  });
  const client = new PrismaClient({ adapter });
  return {
    client,
    async ping() {
      await client.$queryRaw`SELECT 1`;
    },
    async close() {
      await client.$disconnect();
    },
  };
}
