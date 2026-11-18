import { ConflictException, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import type { IntegrationQueue } from '../activity-processing/queue.js';
import { DEMO_DOCUMENTS } from '../consents/consents.service.js';
import { digest } from '../auth/security.js';
export type Scope = { coachId: string; athleteId: string };
export async function lockRelationship(
  tx: Prisma.TransactionClient,
  scope: Scope,
) {
  const rows = await tx.$queryRaw<
    { status: string }[]
  >`SELECT "status" FROM "CoachAthleteRelationship" WHERE "coachId" = ${scope.coachId} AND "athleteId" = ${scope.athleteId} FOR UPDATE`;
  if (!rows.length) throw new NotFoundException('Aluno não encontrado.');
  return rows[0].status;
}
export async function eligible(tx: Prisma.TransactionClient, scope: Scope) {
  scope = { coachId: scope.coachId, athleteId: scope.athleteId };
  const relationship = await tx.coachAthleteRelationship.findUnique({
    where: { coachId_athleteId: scope },
    include: { coach: true },
  });
  if (
    !relationship ||
    relationship.status !== 'active' ||
    !relationship.coach.enabled
  )
    return false;
  const consent = await tx.consentEvidence.findMany({
    where: {
      ...scope,
      documentId: { in: DEMO_DOCUMENTS.map((doc) => doc.id) },
    },
  });
  return DEMO_DOCUMENTS.every(
    (doc) =>
      consent.some(
        (item) => item.documentId === doc.id && item.decision === 'accepted',
      ) &&
      !consent.some(
        (item) => item.documentId === doc.id && item.decision === 'withdrawn',
      ),
  );
}
export async function requireEligible(
  tx: Prisma.TransactionClient,
  scope: Scope,
) {
  if (!(await eligible(tx, scope)))
    throw new ConflictException(
      'É necessário vínculo ativo com aceites demonstrativos válidos.',
    );
}
// O chamador mantém o lock do relacionamento; persistência e enfileiramento na mesma transação.
export async function disconnectInTransaction(
  tx: Prisma.TransactionClient,
  scope: Scope,
  namespace: string,
  queue?: IntegrationQueue,
  externallyRevoked = false,
) {
  scope = { coachId: scope.coachId, athleteId: scope.athleteId };
  const connection = await tx.garminConnection.findUnique({
    where: { coachId_athleteId: scope },
  });
  if (!connection || connection.status === 'disconnected') return;
  await tx.garminAuthorizationAttempt.updateMany({
    where: { connectionId: connection.id, consumedAt: null },
    data: { consumedAt: new Date(), outcome: 'revoked' },
  });
  await tx.integrationEvent.updateMany({
    where: {
      connectionId: connection.id,
      kind: 'activity',
      status: { in: ['queued', 'processing', 'retry'] },
    },
    data: {
      status: 'cancelled',
      runToken: null,
      leaseUntil: null,
      errorCode: 'connection_revoked',
      encryptedPayload: null,
    },
  });
  const pending = Boolean(
    connection.encryptedCredentials && !externallyRevoked,
  );
  await tx.garminConnection.update({
    where: { id: connection.id },
    data: {
      status: 'disconnected',
      generation: { increment: 1 },
      encryptedCredentials: null,
      externalAccountHash: null,
      tokenExpiresAt: null,
      refreshLease: null,
      refreshLeaseUntil: null,
      revocationStatus: pending ? 'pending' : 'completed',
      lastError: null,
    },
  });
  if (pending) {
    const event = await tx.integrationEvent.create({
      data: {
        ...scope,
        connectionId: connection.id,
        generation: connection.generation,
        kind: 'revoke',
        deliveryId: `revoke-${connection.generation}`,
        payloadHash: digest(connection.encryptedCredentials!),
        encryptedPayload: connection.encryptedCredentials,
        namespace,
      },
    });
    if (queue) {
      const jobId = await queue.send(tx, event.id);
      await tx.integrationEvent.update({
        where: { id: event.id },
        data: { jobId },
      });
    }
  }
  await tx.auditLog.create({
    data: {
      coachId: scope.coachId,
      resourceId: connection.id,
      action: externallyRevoked
        ? 'garmin.mock.provider_revoked'
        : 'garmin.mock.disconnected',
    },
  });
}
