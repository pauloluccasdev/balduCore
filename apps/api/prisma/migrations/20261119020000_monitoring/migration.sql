-- CreateTable
CREATE TABLE "MonitoringEvent" (
    "id" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "deduplicationKey" TEXT NOT NULL,
    "activityId" TEXT,
    "analysisId" TEXT,
    "fitImportId" TEXT,
    "integrationEventId" TEXT,
    "connectionId" TEXT,
    "generation" INTEGER,
    "inputRevision" INTEGER,
    "inputHash" TEXT,
    "algorithmVersion" TEXT,
    "eventCount" INTEGER NOT NULL DEFAULT 0,
    "errorCode" TEXT,
    "state" TEXT NOT NULL DEFAULT 'active',
    "signature" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "readAt" TIMESTAMP(3),
    "readVersion" INTEGER,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "timeBasis" TEXT NOT NULL DEFAULT 'source',

    CONSTRAINT "MonitoringEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MonitoringEvent_coachId_updatedAt_id_idx" ON "MonitoringEvent"("coachId", "updatedAt", "id");

-- CreateIndex
CREATE INDEX "MonitoringEvent_coachId_athleteId_kind_idx" ON "MonitoringEvent"("coachId", "athleteId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "MonitoringEvent_coachId_deduplicationKey_key" ON "MonitoringEvent"("coachId", "deduplicationKey");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationEvent_coachId_athleteId_id_key" ON "IntegrationEvent"("coachId", "athleteId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "FitImport_coachId_athleteId_id_key" ON "FitImport"("coachId", "athleteId", "id");

-- AddForeignKey
ALTER TABLE "MonitoringEvent" ADD CONSTRAINT "MonitoringEvent_coachId_athleteId_fkey" FOREIGN KEY ("coachId", "athleteId") REFERENCES "CoachAthleteRelationship"("coachId", "athleteId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitoringEvent" ADD CONSTRAINT "MonitoringEvent_coachId_athleteId_activityId_fkey" FOREIGN KEY ("coachId", "athleteId", "activityId") REFERENCES "Activity"("coachId", "athleteId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitoringEvent" ADD CONSTRAINT "MonitoringEvent_coachId_athleteId_activityId_analysisId_fkey" FOREIGN KEY ("coachId", "athleteId", "activityId", "analysisId") REFERENCES "SportsAnalysis"("coachId", "athleteId", "activityId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitoringEvent" ADD CONSTRAINT "MonitoringEvent_coachId_athleteId_fitImportId_fkey" FOREIGN KEY ("coachId", "athleteId", "fitImportId") REFERENCES "FitImport"("coachId", "athleteId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitoringEvent" ADD CONSTRAINT "MonitoringEvent_coachId_athleteId_integrationEventId_fkey" FOREIGN KEY ("coachId", "athleteId", "integrationEventId") REFERENCES "IntegrationEvent"("coachId", "athleteId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitoringEvent" ADD CONSTRAINT "MonitoringEvent_coachId_athleteId_connectionId_fkey" FOREIGN KEY ("coachId", "athleteId", "connectionId") REFERENCES "GarminConnection"("coachId", "athleteId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A projeção tem referências tipadas e um único destinatário, sem IDs livres.
ALTER TABLE "MonitoringEvent" ADD CONSTRAINT "MonitoringEvent_state_check" CHECK (
  "state" IN ('active', 'resolved') AND "version" > 0 AND "eventCount" >= 0
  AND "timeBasis" IN ('source', 'reconstructed')
  AND (("readAt" IS NULL AND "readVersion" IS NULL) OR ("readAt" IS NOT NULL AND "readVersion" > 0 AND "readVersion" <= "version"))
);
ALTER TABLE "MonitoringEvent" ADD CONSTRAINT "MonitoringEvent_source_check" CHECK (
  ("kind" = 'activity_available' AND "activityId" IS NOT NULL AND "analysisId" IS NULL AND "fitImportId" IS NULL AND "integrationEventId" IS NULL AND "connectionId" IS NULL AND "inputRevision" > 0 AND "inputHash" IS NOT NULL)
  OR ("kind" IN ('analysis_completed', 'sports_events', 'feedback_pending', 'analysis_failure') AND "activityId" IS NOT NULL AND "analysisId" IS NOT NULL AND "fitImportId" IS NULL AND "integrationEventId" IS NULL AND "connectionId" IS NULL AND "inputRevision" > 0 AND "inputHash" IS NOT NULL AND "algorithmVersion" IS NOT NULL)
  OR ("kind" = 'fit_failure' AND "fitImportId" IS NOT NULL AND "activityId" IS NULL AND "analysisId" IS NULL AND "integrationEventId" IS NULL AND "connectionId" IS NULL)
  OR ("kind" = 'sync_failure' AND "integrationEventId" IS NOT NULL AND "connectionId" IS NOT NULL AND "generation" IS NOT NULL AND "activityId" IS NULL AND "analysisId" IS NULL AND "fitImportId" IS NULL)
  OR ("kind" = 'connection_failure' AND "connectionId" IS NOT NULL AND "generation" IS NOT NULL AND "activityId" IS NULL AND "analysisId" IS NULL AND "fitImportId" IS NULL AND "integrationEventId" IS NULL)
);
