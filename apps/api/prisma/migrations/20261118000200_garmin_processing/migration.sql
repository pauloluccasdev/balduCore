-- CreateEnum
CREATE TYPE "GarminStatus" AS ENUM ('not_connected', 'awaiting_authorization', 'connected', 'error', 'disconnected');

-- CreateEnum
CREATE TYPE "IntegrationEventStatus" AS ENUM ('queued', 'processing', 'retry', 'processed', 'ignored', 'failed', 'cancelled');

-- AlterTable
ALTER TABLE "Invitation" ADD COLUMN     "purpose" TEXT NOT NULL DEFAULT 'accompaniment';

-- CreateTable
CREATE TABLE "GarminConnection" (
    "id" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'garmin_mock',
    "isSynthetic" BOOLEAN NOT NULL DEFAULT true,
    "status" "GarminStatus" NOT NULL DEFAULT 'not_connected',
    "generation" INTEGER NOT NULL DEFAULT 0,
    "externalAccountHash" TEXT,
    "encryptedCredentials" TEXT,
    "keyVersion" TEXT NOT NULL DEFAULT 'local-v1',
    "tokenExpiresAt" TIMESTAMP(3),
    "credentialVersion" INTEGER NOT NULL DEFAULT 0,
    "refreshLease" TEXT,
    "refreshLeaseUntil" TIMESTAMP(3),
    "revocationStatus" TEXT NOT NULL DEFAULT 'none',
    "lastReceivedAt" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GarminConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GarminAuthorizationAttempt" (
    "id" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "stateHash" TEXT NOT NULL,
    "browserHash" TEXT NOT NULL,
    "generation" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "outcome" TEXT,

    CONSTRAINT "GarminAuthorizationAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationEvent" (
    "id" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "generation" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "encryptedPayload" TEXT,
    "namespace" TEXT NOT NULL,
    "jobId" TEXT,
    "runToken" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "status" "IntegrationEventStatus" NOT NULL DEFAULT 'queued',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "IntegrationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "generation" INTEGER NOT NULL,
    "externalId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'garmin_mock',
    "isSynthetic" BOOLEAN NOT NULL DEFAULT true,
    "sport" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "durationSeconds" DOUBLE PRECISION,
    "distanceMeters" DOUBLE PRECISION,
    "dataHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkerHeartbeat" (
    "name" TEXT NOT NULL,
    "seenAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkerHeartbeat_pkey" PRIMARY KEY ("name")
);

-- CreateIndex
CREATE UNIQUE INDEX "GarminConnection_externalAccountHash_key" ON "GarminConnection"("externalAccountHash");

-- CreateIndex
CREATE UNIQUE INDEX "GarminConnection_coachId_athleteId_key" ON "GarminConnection"("coachId", "athleteId");

-- CreateIndex
CREATE UNIQUE INDEX "GarminConnection_coachId_athleteId_id_key" ON "GarminConnection"("coachId", "athleteId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "GarminAuthorizationAttempt_stateHash_key" ON "GarminAuthorizationAttempt"("stateHash");

-- CreateIndex
CREATE INDEX "GarminAuthorizationAttempt_expiresAt_idx" ON "GarminAuthorizationAttempt"("expiresAt");

-- CreateIndex
CREATE INDEX "IntegrationEvent_coachId_athleteId_createdAt_idx" ON "IntegrationEvent"("coachId", "athleteId", "createdAt");

-- CreateIndex
CREATE INDEX "IntegrationEvent_namespace_status_idx" ON "IntegrationEvent"("namespace", "status");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationEvent_connectionId_generation_kind_deliveryId_key" ON "IntegrationEvent"("connectionId", "generation", "kind", "deliveryId");

-- CreateIndex
CREATE INDEX "Activity_coachId_athleteId_startedAt_idx" ON "Activity"("coachId", "athleteId", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Activity_connectionId_generation_externalId_key" ON "Activity"("connectionId", "generation", "externalId");

-- AddForeignKey
ALTER TABLE "GarminConnection" ADD CONSTRAINT "GarminConnection_coachId_athleteId_fkey" FOREIGN KEY ("coachId", "athleteId") REFERENCES "CoachAthleteRelationship"("coachId", "athleteId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GarminAuthorizationAttempt" ADD CONSTRAINT "GarminAuthorizationAttempt_coachId_athleteId_connectionId_fkey" FOREIGN KEY ("coachId", "athleteId", "connectionId") REFERENCES "GarminConnection"("coachId", "athleteId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GarminAuthorizationAttempt" ADD CONSTRAINT "GarminAuthorizationAttempt_coachId_athleteId_enrollmentId_fkey" FOREIGN KEY ("coachId", "athleteId", "enrollmentId") REFERENCES "EnrollmentSession"("coachId", "athleteId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationEvent" ADD CONSTRAINT "IntegrationEvent_coachId_athleteId_connectionId_fkey" FOREIGN KEY ("coachId", "athleteId", "connectionId") REFERENCES "GarminConnection"("coachId", "athleteId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_coachId_athleteId_connectionId_fkey" FOREIGN KEY ("coachId", "athleteId", "connectionId") REFERENCES "GarminConnection"("coachId", "athleteId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
