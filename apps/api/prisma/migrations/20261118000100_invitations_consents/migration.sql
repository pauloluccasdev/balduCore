-- CreateEnum
CREATE TYPE "ConsentDecision" AS ENUM ('accepted', 'withdrawn');

-- CreateTable
CREATE TABLE "Invitation" (
    "id" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnrollmentSession" (
    "id" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "invitationId" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "codeHash" TEXT,
    "encryptedCode" TEXT,
    "codeExpiresAt" TIMESTAMP(3) NOT NULL,
    "codeAttempts" INTEGER NOT NULL DEFAULT 0,
    "verifiedAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EnrollmentSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsentDocument" (
    "id" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "isSynthetic" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ConsentDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsentEvidence" (
    "id" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "decision" "ConsentDecision" NOT NULL,
    "verificationMode" TEXT NOT NULL DEFAULT 'demo',
    "isSynthetic" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsentEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WithdrawalAccess" (
    "id" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "sessionHash" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "sessionExpiresAt" TIMESTAMP(3),
    "redeemedAt" TIMESTAMP(3),
    "consumedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WithdrawalAccess_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_tokenHash_key" ON "Invitation"("tokenHash");

-- CreateIndex
CREATE INDEX "Invitation_coachId_athleteId_createdAt_idx" ON "Invitation"("coachId", "athleteId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_coachId_athleteId_id_key" ON "Invitation"("coachId", "athleteId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_coachId_id_key" ON "Invitation"("coachId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "EnrollmentSession_invitationId_key" ON "EnrollmentSession"("invitationId");

-- CreateIndex
CREATE UNIQUE INDEX "EnrollmentSession_tokenHash_key" ON "EnrollmentSession"("tokenHash");

-- CreateIndex
CREATE INDEX "EnrollmentSession_expiresAt_idx" ON "EnrollmentSession"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "EnrollmentSession_coachId_athleteId_invitationId_key" ON "EnrollmentSession"("coachId", "athleteId", "invitationId");

-- CreateIndex
CREATE UNIQUE INDEX "EnrollmentSession_coachId_athleteId_id_key" ON "EnrollmentSession"("coachId", "athleteId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "EnrollmentSession_coachId_id_key" ON "EnrollmentSession"("coachId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ConsentDocument_purpose_version_key" ON "ConsentDocument"("purpose", "version");

-- CreateIndex
CREATE INDEX "ConsentEvidence_coachId_athleteId_createdAt_idx" ON "ConsentEvidence"("coachId", "athleteId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ConsentEvidence_coachId_enrollmentId_documentId_decision_key" ON "ConsentEvidence"("coachId", "enrollmentId", "documentId", "decision");

-- CreateIndex
CREATE UNIQUE INDEX "WithdrawalAccess_tokenHash_key" ON "WithdrawalAccess"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "WithdrawalAccess_sessionHash_key" ON "WithdrawalAccess"("sessionHash");

-- CreateIndex
CREATE INDEX "WithdrawalAccess_coachId_athleteId_idx" ON "WithdrawalAccess"("coachId", "athleteId");

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_coachId_athleteId_fkey" FOREIGN KEY ("coachId", "athleteId") REFERENCES "CoachAthleteRelationship"("coachId", "athleteId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnrollmentSession" ADD CONSTRAINT "EnrollmentSession_coachId_athleteId_invitationId_fkey" FOREIGN KEY ("coachId", "athleteId", "invitationId") REFERENCES "Invitation"("coachId", "athleteId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentEvidence" ADD CONSTRAINT "ConsentEvidence_coachId_athleteId_fkey" FOREIGN KEY ("coachId", "athleteId") REFERENCES "CoachAthleteRelationship"("coachId", "athleteId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentEvidence" ADD CONSTRAINT "ConsentEvidence_coachId_athleteId_enrollmentId_fkey" FOREIGN KEY ("coachId", "athleteId", "enrollmentId") REFERENCES "EnrollmentSession"("coachId", "athleteId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentEvidence" ADD CONSTRAINT "ConsentEvidence_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "ConsentDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WithdrawalAccess" ADD CONSTRAINT "WithdrawalAccess_coachId_athleteId_fkey" FOREIGN KEY ("coachId", "athleteId") REFERENCES "CoachAthleteRelationship"("coachId", "athleteId") ON DELETE RESTRICT ON UPDATE CASCADE;
