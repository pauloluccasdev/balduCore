-- CreateEnum
CREATE TYPE "AnalysisStatus" AS ENUM ('queued', 'processing', 'retry', 'completed', 'failed', 'cancelled');

-- CreateTable
CREATE TABLE "SportsAnalysis" (
    "id" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "inputRevision" INTEGER NOT NULL,
    "inputHash" TEXT NOT NULL,
    "algorithmVersion" TEXT NOT NULL,
    "namespace" TEXT NOT NULL,
    "status" "AnalysisStatus" NOT NULL DEFAULT 'queued',
    "result" JSONB,
    "jobId" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "runToken" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "SportsAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SportsAnalysis_coachId_athleteId_activityId_createdAt_idx" ON "SportsAnalysis"("coachId", "athleteId", "activityId", "createdAt");

-- CreateIndex
CREATE INDEX "SportsAnalysis_namespace_status_idx" ON "SportsAnalysis"("namespace", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SportsAnalysis_activityId_inputRevision_inputHash_algorithm_key" ON "SportsAnalysis"("activityId", "inputRevision", "inputHash", "algorithmVersion");

-- AddForeignKey
ALTER TABLE "SportsAnalysis" ADD CONSTRAINT "SportsAnalysis_coachId_athleteId_activityId_fkey" FOREIGN KEY ("coachId", "athleteId", "activityId") REFERENCES "Activity"("coachId", "athleteId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
