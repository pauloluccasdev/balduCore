-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "RelationshipStatus" AS ENUM ('pending', 'active', 'ended');

-- CreateTable
CREATE TABLE "Coach" (
    "id" TEXT NOT NULL,
    "issuer" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Coach_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoachSession" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoachSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthAttempt" (
    "stateHash" TEXT NOT NULL,
    "browserHash" TEXT NOT NULL,
    "encryptedChecks" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),

    CONSTRAINT "AuthAttempt_pkey" PRIMARY KEY ("stateHash")
);

-- CreateTable
CREATE TABLE "Athlete" (
    "id" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Athlete_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoachAthleteRelationship" (
    "id" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "status" "RelationshipStatus" NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "CoachAthleteRelationship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimitBucket" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "Coach_issuer_subject_key" ON "Coach"("issuer", "subject");

-- CreateIndex
CREATE UNIQUE INDEX "CoachSession_tokenHash_key" ON "CoachSession"("tokenHash");

-- CreateIndex
CREATE INDEX "CoachSession_expiresAt_idx" ON "CoachSession"("expiresAt");

-- CreateIndex
CREATE INDEX "AuthAttempt_expiresAt_idx" ON "AuthAttempt"("expiresAt");

-- CreateIndex
CREATE INDEX "Athlete_coachId_createdAt_idx" ON "Athlete"("coachId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Athlete_coachId_id_key" ON "Athlete"("coachId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Athlete_coachId_email_key" ON "Athlete"("coachId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "CoachAthleteRelationship_athleteId_key" ON "CoachAthleteRelationship"("athleteId");

-- CreateIndex
CREATE INDEX "CoachAthleteRelationship_coachId_status_idx" ON "CoachAthleteRelationship"("coachId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CoachAthleteRelationship_coachId_athleteId_key" ON "CoachAthleteRelationship"("coachId", "athleteId");

-- CreateIndex
CREATE INDEX "AuditLog_coachId_createdAt_idx" ON "AuditLog"("coachId", "createdAt");

-- CreateIndex
CREATE INDEX "RateLimitBucket_expiresAt_idx" ON "RateLimitBucket"("expiresAt");

-- AddForeignKey
ALTER TABLE "CoachSession" ADD CONSTRAINT "CoachSession_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "Coach"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Athlete" ADD CONSTRAINT "Athlete_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "Coach"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachAthleteRelationship" ADD CONSTRAINT "CoachAthleteRelationship_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "Coach"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachAthleteRelationship" ADD CONSTRAINT "CoachAthleteRelationship_coachId_athleteId_fkey" FOREIGN KEY ("coachId", "athleteId") REFERENCES "Athlete"("coachId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "Coach"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Valores canônicos garantidos também em escritas fora da aplicação.
ALTER TABLE "Athlete" ADD CONSTRAINT "Athlete_email_normalized" CHECK ("email" = lower(trim("email")));
ALTER TABLE "Athlete" ADD CONSTRAINT "Athlete_version_positive" CHECK ("version" > 0);
