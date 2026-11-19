import { Prisma } from '../../generated/prisma/client.js';
import { DEMO_DOCUMENTS } from '../consents/consents.service.js';
// Mesma política para listagens e autorização de recursos esportivos.
export const visibleRelationship: Prisma.CoachAthleteRelationshipWhereInput = {
  status: 'active',
  coach: { enabled: true },
  AND: DEMO_DOCUMENTS.map((doc) => ({
    consents: { some: { documentId: doc.id, decision: 'accepted' } },
  })),
  NOT: {
    consents: {
      some: {
        documentId: { in: DEMO_DOCUMENTS.map((doc) => doc.id) },
        decision: 'withdrawn',
      },
    },
  },
};
// Aliases internos fixos: r = relacionamento, c = coach; nunca recebidos do cliente.
export function visibleRelationshipSql() {
  return Prisma.sql`c.enabled AND r.status = 'active'
    AND NOT EXISTS (SELECT 1 FROM "ConsentEvidence" ce WHERE ce."coachId" = r."coachId" AND ce."athleteId" = r."athleteId" AND ce."documentId" IN (${Prisma.join(DEMO_DOCUMENTS.map((doc) => doc.id))}) AND ce.decision = 'withdrawn')
    AND (SELECT COUNT(DISTINCT ce."documentId") FROM "ConsentEvidence" ce WHERE ce."coachId" = r."coachId" AND ce."athleteId" = r."athleteId" AND ce."documentId" IN (${Prisma.join(DEMO_DOCUMENTS.map((doc) => doc.id))}) AND ce.decision = 'accepted') = ${DEMO_DOCUMENTS.length}`;
}
