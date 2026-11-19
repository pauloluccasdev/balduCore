-- CreateTable
CREATE TABLE "CoachFeedback" (
    "id" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoachFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoachFeedbackRevision" (
    "id" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "feedbackId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "inputRevision" INTEGER NOT NULL,
    "inputHash" TEXT NOT NULL,
    "analysisId" TEXT,
    "content" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoachFeedbackRevision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CoachFeedback_activityId_key" ON "CoachFeedback"("activityId");

-- CreateIndex
CREATE INDEX "CoachFeedback_coachId_athleteId_updatedAt_idx" ON "CoachFeedback"("coachId", "athleteId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CoachFeedback_coachId_athleteId_activityId_key" ON "CoachFeedback"("coachId", "athleteId", "activityId");

-- CreateIndex
CREATE UNIQUE INDEX "CoachFeedback_coachId_athleteId_activityId_id_key" ON "CoachFeedback"("coachId", "athleteId", "activityId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "CoachFeedbackRevision_feedbackId_version_key" ON "CoachFeedbackRevision"("feedbackId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "SportsAnalysis_coachId_athleteId_activityId_id_key" ON "SportsAnalysis"("coachId", "athleteId", "activityId", "id");

-- AddForeignKey
ALTER TABLE "CoachFeedback" ADD CONSTRAINT "CoachFeedback_coachId_athleteId_activityId_fkey" FOREIGN KEY ("coachId", "athleteId", "activityId") REFERENCES "Activity"("coachId", "athleteId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachFeedbackRevision" ADD CONSTRAINT "CoachFeedbackRevision_coachId_athleteId_activityId_feedbac_fkey" FOREIGN KEY ("coachId", "athleteId", "activityId", "feedbackId") REFERENCES "CoachFeedback"("coachId", "athleteId", "activityId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachFeedbackRevision" ADD CONSTRAINT "CoachFeedbackRevision_coachId_athleteId_activityId_analysi_fkey" FOREIGN KEY ("coachId", "athleteId", "activityId", "analysisId") REFERENCES "SportsAnalysis"("coachId", "athleteId", "activityId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
