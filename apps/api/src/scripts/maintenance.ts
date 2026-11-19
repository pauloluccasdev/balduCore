import {
  reconcileMonitoring,
  reconciliationArguments,
} from '../modules/monitoring/reconcile.js';
import { createDatabase } from '../database.js';
import { readConfig } from '../config.js';
const database = createDatabase(readConfig(process.env).DATABASE_URL);
try {
  const command = process.argv[2];
  if (command === 'reconcile-monitoring') {
    const result = await reconcileMonitoring(
      database.client,
      reconciliationArguments(process.argv.slice(3)),
    );
    console.log(JSON.stringify({ action: 'monitoring.reconciled', ...result }));
  } else if (command === 'cleanup-auth') {
    const now = new Date();
    const expired = await database.client.$transaction([
      database.client.authAttempt.deleteMany({
        where: { expiresAt: { lt: now } },
      }),
      database.client.coachSession.deleteMany({
        where: {
          OR: [{ expiresAt: { lt: now } }, { revokedAt: { not: null } }],
        },
      }),
      database.client.rateLimitBucket.deleteMany({
        where: { expiresAt: { lt: now } },
      }),
    ]);
    console.log(
      JSON.stringify({
        action: 'auth.cleanup',
        deleted: expired.map((item) => item.count),
      }),
    );
  } else if (command === 'disable-coach' && process.argv[3]) {
    await database.client.$transaction(async (tx) => {
      const coach = await tx.coach.update({
        where: { id: process.argv[3] },
        data: { enabled: false },
      });
      await tx.coachSession.updateMany({
        where: { coachId: coach.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          coachId: coach.id,
          action: 'coach.disabled',
          resourceId: coach.id,
        },
      });
    });
    console.log(JSON.stringify({ action: 'coach.disabled' }));
  } else throw new Error('Invalid command');
} catch {
  console.error(
    'Operação não concluída. Verifique comando, identificador e banco.',
  );
  process.exitCode = 1;
} finally {
  await database.close();
}
