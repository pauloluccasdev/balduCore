import { Prisma } from '../../generated/prisma/client.js';
import { DEMO_DOCUMENTS } from '../consents/consents.service.js';
import { ALGORITHM_VERSION } from '../sports-analysis/calculations.js';
const currentAnalysis = Prisma.sql`a."revision" = s."inputRevision" AND a."dataHash" = s."inputHash" AND s."algorithmVersion" = ${ALGORITHM_VERSION}`;
const meaningful = Prisma.sql`fr."inputRevision" = a."revision" AND fr."inputHash" = a."dataHash" AND (fr."analysisId" IS NULL OR fr."analysisId" = s.id) AND
  (COALESCE(fr.content->>'execution', '') <> '' OR COALESCE(fr.content->>'observations', '') <> '' OR COALESCE(fr.content->>'decisions', '') <> '' OR jsonb_array_length(COALESCE(fr.content->'points', '[]'::jsonb)) > 0 OR jsonb_array_length(COALESCE(fr.content->'verdicts', '[]'::jsonb)) > 0)`;
// A projeção organiza a central. Fonte, vínculo e consentimentos continuam autoridades.
export function visible(coachId: string) {
  return Prisma.sql`WITH visible AS (
    SELECT m.*, athlete.name AS "athleteName",
      COALESCE(a."isSynthetic", g."isSynthetic", true) AS "isSynthetic",
      CASE
        WHEN m.kind = 'activity_available' THEN CASE WHEN m."inputRevision" = a.revision AND m."inputHash" = a."dataHash" THEN 'active' ELSE 'resolved' END
        WHEN m.kind IN ('analysis_completed', 'sports_events') THEN CASE WHEN ${currentAnalysis} AND s.status = 'completed' THEN 'active' ELSE 'resolved' END
        WHEN m.kind = 'feedback_pending' THEN CASE WHEN ${currentAnalysis} AND s.status = 'completed' AND NOT COALESCE((${meaningful}), false) THEN 'active' ELSE 'resolved' END
        WHEN m.kind = 'fit_failure' THEN CASE WHEN f.status = 'failed' OR (m.state = 'active' AND f.status IN ('queued','retry','processing')) THEN 'active' ELSE 'resolved' END
        WHEN m.kind = 'analysis_failure' THEN CASE WHEN ${currentAnalysis} AND (s.status = 'failed' OR (m.state = 'active' AND s.status IN ('queued','retry','processing'))) THEN 'active' ELSE 'resolved' END
        WHEN m.kind = 'sync_failure' THEN CASE WHEN i.kind = 'activity' AND i."connectionId" = g.id AND i.generation = g.generation AND g.status IN ('connected','error') AND (i.status = 'failed' OR (m.state = 'active' AND i.status IN ('queued','retry','processing'))) THEN 'active' ELSE 'resolved' END
        WHEN m.kind = 'connection_failure' THEN CASE WHEN g.status = 'error' AND g.generation = m.generation THEN 'active' ELSE 'resolved' END
      END AS "effectiveState",
      COALESCE((m.kind = 'fit_failure' AND f.status IN ('queued','retry','processing')) OR (m.kind = 'analysis_failure' AND s.status IN ('queued','retry','processing')) OR (m.kind = 'sync_failure' AND i.status IN ('queued','retry','processing')), false) AS recovering
    FROM "MonitoringEvent" m
    JOIN "CoachAthleteRelationship" r ON r."coachId" = m."coachId" AND r."athleteId" = m."athleteId"
    JOIN "Coach" c ON c.id = r."coachId"
    JOIN "Athlete" athlete ON athlete.id = m."athleteId" AND athlete."coachId" = m."coachId"
    LEFT JOIN "Activity" a ON a.id = m."activityId" AND a."coachId" = m."coachId" AND a."athleteId" = m."athleteId"
    LEFT JOIN "SportsAnalysis" s ON s.id = m."analysisId" AND s."activityId" = a.id AND s."coachId" = m."coachId" AND s."athleteId" = m."athleteId"
    LEFT JOIN "FitImport" f ON f.id = m."fitImportId" AND f."coachId" = m."coachId" AND f."athleteId" = m."athleteId"
    LEFT JOIN "IntegrationEvent" i ON i.id = m."integrationEventId" AND i."coachId" = m."coachId" AND i."athleteId" = m."athleteId"
    LEFT JOIN "GarminConnection" g ON g.id = m."connectionId" AND g."coachId" = m."coachId" AND g."athleteId" = m."athleteId"
    LEFT JOIN "CoachFeedback" feedback ON feedback."activityId" = a.id AND feedback."coachId" = m."coachId"
    LEFT JOIN "CoachFeedbackRevision" fr ON fr."feedbackId" = feedback.id AND fr.version = feedback.version
    WHERE m."coachId" = ${coachId} AND c.enabled AND r.status = 'active'
      AND NOT EXISTS (SELECT 1 FROM "ConsentEvidence" ce WHERE ce."coachId" = m."coachId" AND ce."athleteId" = m."athleteId" AND ce."documentId" IN (${Prisma.join(DEMO_DOCUMENTS.map((doc) => doc.id))}) AND ce.decision = 'withdrawn')
      AND (SELECT COUNT(DISTINCT ce."documentId") FROM "ConsentEvidence" ce WHERE ce."coachId" = m."coachId" AND ce."athleteId" = m."athleteId" AND ce."documentId" IN (${Prisma.join(DEMO_DOCUMENTS.map((doc) => doc.id))}) AND ce.decision = 'accepted') = ${DEMO_DOCUMENTS.length}
      AND (m.kind NOT IN ('analysis_completed','sports_events') OR s.status = 'completed')
  )`;
}
export const unread = Prisma.sql`("readAt" IS NULL OR "readVersion" IS DISTINCT FROM version OR state <> "effectiveState")`;
