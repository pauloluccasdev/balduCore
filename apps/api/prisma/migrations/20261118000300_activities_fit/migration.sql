-- AlterTable
ALTER TABLE "Activity" ADD COLUMN     "avgCadenceRpm" DOUBLE PRECISION,
ADD COLUMN     "avgHeartRateBpm" DOUBLE PRECISION,
ADD COLUMN     "durationBasis" TEXT NOT NULL DEFAULT 'provided',
ADD COLUMN     "elapsedSeconds" DOUBLE PRECISION,
ADD COLUMN     "maxHeartRateBpm" DOUBLE PRECISION,
ADD COLUMN     "qualityWarnings" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "timerSeconds" DOUBLE PRECISION,
ADD COLUMN     "totalAscentMeters" DOUBLE PRECISION,
ALTER COLUMN "connectionId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "ActivitySample" (
    "coachId" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "distanceMeters" DOUBLE PRECISION,
    "speedMetersPerSecond" DOUBLE PRECISION,
    "heartRateBpm" DOUBLE PRECISION,
    "cadenceRpm" DOUBLE PRECISION,
    "altitudeMeters" DOUBLE PRECISION,

    CONSTRAINT "ActivitySample_pkey" PRIMARY KEY ("activityId","ordinal")
);

-- CreateTable
CREATE TABLE "ActivitySplit" (
    "coachId" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "distanceMeters" DOUBLE PRECISION,
    "timerSeconds" DOUBLE PRECISION,
    "elapsedSeconds" DOUBLE PRECISION,
    "avgHeartRateBpm" DOUBLE PRECISION,
    "avgCadenceRpm" DOUBLE PRECISION,

    CONSTRAINT "ActivitySplit_pkey" PRIMARY KEY ("activityId","ordinal")
);

-- CreateTable
CREATE TABLE "FitImport" (
    "id" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "fileHash" TEXT NOT NULL,
    "normalized" JSONB,
    "namespace" TEXT NOT NULL,
    "status" "IntegrationEventStatus" NOT NULL DEFAULT 'queued',
    "activityId" TEXT,
    "jobId" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "runToken" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "FitImport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ActivitySample_coachId_activityId_timestamp_idx" ON "ActivitySample"("coachId", "activityId", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "FitImport_activityId_key" ON "FitImport"("activityId");

-- CreateIndex
CREATE INDEX "FitImport_coachId_athleteId_createdAt_idx" ON "FitImport"("coachId", "athleteId", "createdAt");

-- CreateIndex
CREATE INDEX "FitImport_namespace_status_idx" ON "FitImport"("namespace", "status");

-- CreateIndex
CREATE UNIQUE INDEX "FitImport_coachId_fileHash_key" ON "FitImport"("coachId", "fileHash");

-- CreateIndex
CREATE UNIQUE INDEX "FitImport_coachId_athleteId_activityId_key" ON "FitImport"("coachId", "athleteId", "activityId");

-- CreateIndex
CREATE UNIQUE INDEX "Activity_coachId_athleteId_id_key" ON "Activity"("coachId", "athleteId", "id");

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_coachId_athleteId_fkey" FOREIGN KEY ("coachId", "athleteId") REFERENCES "CoachAthleteRelationship"("coachId", "athleteId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivitySample" ADD CONSTRAINT "ActivitySample_coachId_athleteId_activityId_fkey" FOREIGN KEY ("coachId", "athleteId", "activityId") REFERENCES "Activity"("coachId", "athleteId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivitySplit" ADD CONSTRAINT "ActivitySplit_coachId_athleteId_activityId_fkey" FOREIGN KEY ("coachId", "athleteId", "activityId") REFERENCES "Activity"("coachId", "athleteId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FitImport" ADD CONSTRAINT "FitImport_coachId_athleteId_fkey" FOREIGN KEY ("coachId", "athleteId") REFERENCES "CoachAthleteRelationship"("coachId", "athleteId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FitImport" ADD CONSTRAINT "FitImport_coachId_athleteId_activityId_fkey" FOREIGN KEY ("coachId", "athleteId", "activityId") REFERENCES "Activity"("coachId", "athleteId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
