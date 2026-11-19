import { cancelAnalyses } from '../sports-analysis/processing.js';
import { cancelFitImports } from '../activities/fit-processing.js';
import type { IntegrationQueue } from '../activity-processing/queue.js';
import {
  disconnectInTransaction,
  requireEligible,
} from '../garmin-connections/lifecycle.js';
import { createHmac, randomInt } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  GoneException,
  NotFoundException,
} from '@nestjs/common';
import { z } from 'zod';
import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';
import type { Config } from '../../config.js';
import { input } from '../athletes/athletes.service.js';
import {
  decrypt,
  digest,
  encrypt,
  equal,
  randomToken,
} from '../auth/security.js';
import {
  ConsentsService,
  DEMO_DOCUMENTS,
} from '../consents/consents.service.js';

const tokenSchema = z
  .object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) })
  .strict();
const emailSchema = z
  .string()
  .trim()
  .email()
  .max(254)
  .transform((s) => s.toLowerCase());
const verifySchema = z
  .object({ code: z.string().regex(/^\d{6}$/), email: emailSchema })
  .strict();
const acceptSchema = z
  .object({
    name: z.string().trim().min(3).max(120),
    email: emailSchema,
    accompaniment: z.literal(true),
    dataSharing: z.literal(true),
    documents: z
      .array(z.object({ id: z.string(), contentHash: z.string() }).strict())
      .length(2),
  })
  .strict();
const INVITE_MS = 48 * 3600_000;
const JOURNEY_MS = 30 * 60_000;
const CODE_MS = 10 * 60_000;
const WITHDRAWAL_MS = 7 * 24 * 3600_000;
const unavailable = () =>
  new GoneException(
    'Link indisponível: expirado, revogado ou já utilizado. Solicite outro ao treinador.',
  );
type Tx = Prisma.TransactionClient;

export class InvitationsService {
  private readonly consents = new ConsentsService();
  constructor(
    private readonly db: PrismaClient,
    private readonly config: Config,
    private readonly queue?: IntegrationQueue,
  ) {}
  private async lock(tx: Tx, coachId: string, athleteId: string) {
    const rows = await tx.$queryRaw<
      { status: string }[]
    >`SELECT "status" FROM "CoachAthleteRelationship" WHERE "coachId" = ${coachId} AND "athleteId" = ${athleteId} FOR UPDATE`;
    if (!rows.length) throw new NotFoundException('Aluno não encontrado.');
    return rows[0].status;
  }
  private codeDigest(id: string, code: string) {
    return createHmac('sha256', this.config.AUTH_SECRET)
      .update(`enrollment-code:${id}:${code}`)
      .digest('hex');
  }
  private readableDemoCode(encryptedCode: string) {
    try {
      return decrypt(encryptedCode, this.config.AUTH_SECRET);
    } catch {
      return null;
    } // Reinício com chave efêmera exige outro convite, sem quebrar o perfil.
  }
  async list(coachId: string, athleteId: string) {
    const athlete = await this.db.athlete.findUnique({
      where: { coachId_id: { coachId, id: athleteId } },
    });
    if (!athlete) throw new NotFoundException('Aluno não encontrado.');
    const items = await this.db.invitation.findMany({
      where: { coachId, athleteId },
      include: { enrollment: true },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    const now = new Date();
    return {
      isSynthetic: true,
      items: items.map((item) => {
        const enrollment = item.enrollment;
        const current =
          !item.revokedAt &&
          item.expiresAt > now &&
          item.recipientEmail === athlete.email;
        const demoCode =
          current &&
          enrollment &&
          enrollment.expiresAt > now &&
          enrollment.codeExpiresAt > now &&
          !enrollment.verifiedAt &&
          enrollment.codeAttempts < 5 &&
          enrollment.encryptedCode
            ? this.readableDemoCode(enrollment.encryptedCode)
            : null;
        return {
          id: item.id,
          purpose: item.purpose,
          expiresAt: item.expiresAt,
          createdAt: item.createdAt,
          status:
            item.revokedAt || item.recipientEmail !== athlete.email
              ? 'revoked'
              : item.consumedAt
                ? 'used'
                : item.expiresAt <= now
                  ? 'expired'
                  : 'pending',
          acceptedAt: enrollment?.acceptedAt ?? null,
          demoCode,
          codeUnavailable: Boolean(
            current &&
            enrollment?.encryptedCode &&
            !demoCode &&
            enrollment.codeExpiresAt > now &&
            enrollment.expiresAt > now,
          ),
          codeExpiresAt: demoCode ? enrollment?.codeExpiresAt : null,
        };
      }),
    };
  }
  async create(
    coachId: string,
    athleteId: string,
    purpose: 'accompaniment' | 'garmin' = 'accompaniment',
  ) {
    const token = randomToken();
    return this.db.$transaction(async (tx) => {
      if (
        (await this.lock(tx, coachId, athleteId)) !==
        (purpose === 'garmin' ? 'active' : 'pending')
      )
        throw new ConflictException(
          'O estado do vínculo não permite este tipo de convite.',
        );
      if (purpose === 'garmin')
        await requireEligible(tx, { coachId, athleteId });
      const athlete = await tx.athlete.findUniqueOrThrow({
        where: { coachId_id: { coachId, id: athleteId } },
      });
      await tx.invitation.updateMany({
        where: { coachId, athleteId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.consents.ensureDocuments(tx);
      const invitation = await tx.invitation.create({
        data: {
          coachId,
          athleteId,
          recipientEmail: athlete.email,
          purpose,
          tokenHash: digest(token),
          expiresAt: new Date(Date.now() + INVITE_MS),
        },
      });
      await tx.auditLog.create({
        data: {
          coachId,
          resourceId: invitation.id,
          action: 'invitation.created.demo',
        },
      });
      return {
        id: invitation.id,
        expiresAt: invitation.expiresAt,
        url: `${this.config.APP_ORIGIN}/convite#${token}`,
        isSynthetic: true,
      };
    });
  }
  async revoke(coachId: string, athleteId: string, invitationId: string) {
    return this.db.$transaction(async (tx) => {
      await this.lock(tx, coachId, athleteId);
      const changed = await tx.invitation.updateMany({
        where: { id: invitationId, coachId, athleteId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (!changed.count) {
        const owned = await tx.invitation.findFirst({
          where: { id: invitationId, coachId, athleteId },
        });
        if (!owned) throw new NotFoundException('Convite não encontrado.');
      } else
        await tx.auditLog.create({
          data: {
            coachId,
            action: 'invitation.revoked.demo',
            resourceId: invitationId,
          },
        });
      return { revoked: true, isSynthetic: true };
    });
  }
  async preview(body: unknown) {
    const { token } = input(tokenSchema, body);
    const invite = await this.db.invitation.findUnique({
      where: { tokenHash: digest(token) },
      include: { relationship: { include: { athlete: true, coach: true } } },
    });
    if (
      !invite ||
      invite.revokedAt ||
      invite.consumedAt ||
      invite.expiresAt <= new Date() ||
      invite.relationship.status !==
        (invite.purpose === 'garmin' ? 'active' : 'pending') ||
      !invite.relationship.coach.enabled ||
      invite.recipientEmail !== invite.relationship.athlete.email
    )
      throw unavailable();
    return { available: true, isSynthetic: true };
  }
  async redeem(body: unknown) {
    const { token } = input(tokenSchema, body);
    const seed = await this.db.invitation.findUnique({
      where: { tokenHash: digest(token) },
    });
    if (!seed) throw unavailable();
    const sessionToken = randomToken();
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    await this.db.$transaction(async (tx) => {
      const status = await this.lock(tx, seed.coachId, seed.athleteId);
      const invite = await tx.invitation.findUniqueOrThrow({
        where: { id: seed.id },
        include: { relationship: { include: { athlete: true, coach: true } } },
      });
      const now = new Date();
      if (
        status !== (invite.purpose === 'garmin' ? 'active' : 'pending') ||
        invite.revokedAt ||
        invite.consumedAt ||
        invite.expiresAt <= now ||
        !invite.relationship.coach.enabled ||
        invite.recipientEmail !== invite.relationship.athlete.email
      )
        throw unavailable();
      await tx.invitation.update({
        where: { id: invite.id },
        data: { consumedAt: now },
      });
      const enrollment = await tx.enrollmentSession.create({
        data: {
          coachId: invite.coachId,
          athleteId: invite.athleteId,
          invitationId: invite.id,
          tokenHash: digest(sessionToken),
          expiresAt: new Date(now.getTime() + JOURNEY_MS),
          codeExpiresAt: new Date(now.getTime() + CODE_MS),
        },
      });
      await tx.enrollmentSession.update({
        where: { id: enrollment.id },
        data: {
          codeHash: this.codeDigest(enrollment.id, code),
          encryptedCode: encrypt(code, this.config.AUTH_SECRET),
        },
      });
      await tx.auditLog.create({
        data: {
          coachId: invite.coachId,
          resourceId: invite.id,
          action: 'invitation.redeemed.demo',
        },
      });
    });
    return sessionToken;
  }
  private async journey(tx: Tx, sessionToken: string) {
    if (!sessionToken) throw unavailable();
    const seed = await tx.enrollmentSession.findUnique({
      where: { tokenHash: digest(sessionToken) },
      include: { invitation: true },
    });
    if (!seed) throw unavailable();
    await this.lock(tx, seed.coachId, seed.invitation.athleteId);
    const enrollment = await tx.enrollmentSession.findUniqueOrThrow({
      where: { id: seed.id },
      include: {
        invitation: {
          include: {
            relationship: { include: { athlete: true, coach: true } },
          },
        },
      },
    });
    const invite = enrollment.invitation;
    if (
      enrollment.expiresAt <= new Date() ||
      invite.revokedAt ||
      invite.expiresAt <= new Date() ||
      invite.recipientEmail !== invite.relationship.athlete.email ||
      !invite.relationship.coach.enabled ||
      invite.relationship.status === 'ended'
    )
      throw unavailable();
    return enrollment;
  }
  async session(sessionToken: string) {
    return this.db.$transaction(async (tx) => {
      const enrollment = await this.journey(tx, sessionToken);
      const garmin = await tx.garminConnection.findUnique({
        where: {
          coachId_athleteId: {
            coachId: enrollment.coachId,
            athleteId: enrollment.invitation.athleteId,
          },
        },
      });
      return {
        isSynthetic: true,
        verificationMode: 'demo',
        coachName: enrollment.invitation.relationship.coach.name,
        expiresAt: enrollment.expiresAt,
        codeExpiresAt: enrollment.codeExpiresAt,
        verified: Boolean(enrollment.verifiedAt),
        accepted: Boolean(
          enrollment.acceptedAt ||
          (enrollment.invitation.purpose === 'garmin' && enrollment.verifiedAt),
        ),
        purpose: enrollment.invitation.purpose,
        documents: DEMO_DOCUMENTS,
        garminStatus: garmin?.status ?? 'not_connected',
      };
    });
  }
  async verify(sessionToken: string, body: unknown) {
    const { code, email } = input(verifySchema, body);
    const valid = await this.db.$transaction(async (tx) => {
      const enrollment = await this.journey(tx, sessionToken);
      if (enrollment.acceptedAt)
        throw new ConflictException('Aceite já registrado.');
      if (enrollment.verifiedAt) return true;
      if (
        enrollment.codeAttempts >= 5 ||
        enrollment.codeExpiresAt <= new Date()
      )
        throw new GoneException(
          'Código expirado ou bloqueado. Solicite novo convite ao treinador.',
        );
      const matched =
        email === enrollment.invitation.recipientEmail &&
        Boolean(
          enrollment.codeHash &&
          equal(enrollment.codeHash, this.codeDigest(enrollment.id, code)),
        );
      await tx.enrollmentSession.update({
        where: { id: enrollment.id },
        data: {
          codeAttempts: { increment: 1 },
          ...(matched
            ? { verifiedAt: new Date(), codeHash: null, encryptedCode: null }
            : {}),
        },
      });
      return matched;
    });
    if (!valid)
      throw new BadRequestException(
        'E-mail ou código inválido. Você tem até cinco tentativas.',
      );
    return { verified: true, verificationMode: 'demo', isSynthetic: true };
  }
  async accept(sessionToken: string, body: unknown) {
    const data = input(acceptSchema, body);
    if (
      new Set(data.documents.map((doc) => doc.id)).size !==
        DEMO_DOCUMENTS.length ||
      DEMO_DOCUMENTS.some(
        (doc) =>
          !data.documents.some(
            (sent) =>
              sent.id === doc.id && sent.contentHash === doc.contentHash,
          ),
      )
    )
      throw new ConflictException(
        'Documentos alterados. Recarregue e confira os aceites.',
      );
    return this.db.$transaction(async (tx) => {
      const enrollment = await this.journey(tx, sessionToken);
      if (enrollment.invitation.purpose !== 'accompaniment')
        throw new ConflictException(
          'Convite de conexão não registra novo aceite de acompanhamento.',
        );
      const garmin = await tx.garminConnection.findUnique({
        where: {
          coachId_athleteId: {
            coachId: enrollment.coachId,
            athleteId: enrollment.invitation.athleteId,
          },
        },
      });
      if (enrollment.acceptedAt)
        return {
          accepted: true,
          isSynthetic: true,
          garminStatus: garmin?.status ?? 'not_connected',
          withdrawalUrl: null,
        };
      if (
        !enrollment.verifiedAt ||
        data.email !== enrollment.invitation.recipientEmail
      )
        throw new BadRequestException(
          'Confirme o e-mail e o código demonstrativo antes de aceitar.',
        );
      const { coachId } = enrollment;
      const { athleteId } = enrollment.invitation;
      if (enrollment.invitation.relationship.status !== 'pending')
        throw new ConflictException('Vínculo indisponível para aceite.');
      await this.consents.accept(tx, {
        coachId,
        athleteId,
        enrollmentId: enrollment.id,
      });
      await tx.athlete.update({
        where: { coachId_id: { coachId, id: athleteId } },
        data: { name: data.name, version: { increment: 1 } },
      });
      await tx.coachAthleteRelationship.update({
        where: { coachId_athleteId: { coachId, athleteId } },
        data: { status: 'active' },
      });
      await tx.enrollmentSession.update({
        where: { id: enrollment.id },
        data: { acceptedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          coachId,
          action: 'public.relationship.accepted.demo',
          resourceId: athleteId,
        },
      });
      const withdrawalUrl = await this.newWithdrawal(tx, coachId, athleteId);
      return {
        accepted: true,
        isSynthetic: true,
        garminStatus: garmin?.status ?? 'not_connected',
        withdrawalUrl,
      };
    });
  }
  private async newWithdrawal(tx: Tx, coachId: string, athleteId: string) {
    await tx.withdrawalAccess.updateMany({
      where: { coachId, athleteId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    const token = randomToken();
    await tx.withdrawalAccess.create({
      data: {
        coachId,
        athleteId,
        tokenHash: digest(token),
        expiresAt: new Date(Date.now() + WITHDRAWAL_MS),
      },
    });
    return `${this.config.APP_ORIGIN}/encerrar#${token}`;
  }
  async issueWithdrawal(coachId: string, athleteId: string) {
    return this.db.$transaction(async (tx) => {
      if ((await this.lock(tx, coachId, athleteId)) !== 'active')
        throw new ConflictException(
          'Somente vínculos ativos podem ser encerrados por este fluxo.',
        );
      const url = await this.newWithdrawal(tx, coachId, athleteId);
      await tx.auditLog.create({
        data: {
          coachId,
          resourceId: athleteId,
          action: 'withdrawal.issued.demo',
        },
      });
      return { url, isSynthetic: true };
    });
  }
  async redeemWithdrawal(body: unknown) {
    const { token } = input(tokenSchema, body);
    const seed = await this.db.withdrawalAccess.findUnique({
      where: { tokenHash: digest(token) },
    });
    if (!seed) throw unavailable();
    const sessionToken = randomToken();
    await this.db.$transaction(async (tx) => {
      const status = await this.lock(tx, seed.coachId, seed.athleteId);
      const access = await tx.withdrawalAccess.findUniqueOrThrow({
        where: { id: seed.id },
      });
      if (
        status !== 'active' ||
        access.revokedAt ||
        access.redeemedAt ||
        access.consumedAt ||
        access.expiresAt <= new Date()
      )
        throw unavailable();
      await tx.withdrawalAccess.update({
        where: { id: access.id },
        data: {
          sessionHash: digest(sessionToken),
          redeemedAt: new Date(),
          sessionExpiresAt: new Date(Date.now() + JOURNEY_MS),
        },
      });
    });
    return sessionToken;
  }
  private async withdrawal(
    tx: Tx,
    sessionToken: string,
    allowConsumed = false,
  ) {
    if (!sessionToken) throw unavailable();
    const seed = await tx.withdrawalAccess.findUnique({
      where: { sessionHash: digest(sessionToken) },
    });
    if (!seed) throw unavailable();
    await this.lock(tx, seed.coachId, seed.athleteId);
    const access = await tx.withdrawalAccess.findUniqueOrThrow({
      where: { id: seed.id },
      include: { relationship: { include: { coach: true } } },
    });
    if (
      access.revokedAt ||
      access.expiresAt <= new Date() ||
      !access.sessionExpiresAt ||
      access.sessionExpiresAt <= new Date() ||
      (!allowConsumed && access.consumedAt)
    )
      throw unavailable();
    return access;
  }
  async withdrawalSession(token: string) {
    return this.db.$transaction(async (tx) => {
      const access = await this.withdrawal(tx, token, true);
      return {
        coachName: access.relationship.coach.name,
        ended: Boolean(access.consumedAt),
        isSynthetic: true,
      };
    });
  }
  async withdraw(token: string, body: unknown) {
    input(z.object({ confirm: z.literal(true) }).strict(), body);
    return this.db.$transaction(async (tx) => {
      const access = await this.withdrawal(tx, token, true);
      if (access.consumedAt) return { ended: true, isSynthetic: true };
      if (access.relationship.status !== 'active') throw unavailable();
      await this.consents.withdraw(tx, access.coachId, access.athleteId);
      await cancelAnalyses(tx, {
        coachId: access.coachId,
        athleteId: access.athleteId,
      });
      await cancelFitImports(tx, {
        coachId: access.coachId,
        athleteId: access.athleteId,
      });
      await disconnectInTransaction(
        tx,
        access,
        this.config.GARMIN_QUEUE_NAMESPACE,
        this.queue,
      );
      await tx.coachAthleteRelationship.update({
        where: {
          coachId_athleteId: {
            coachId: access.coachId,
            athleteId: access.athleteId,
          },
        },
        data: { status: 'ended', endedAt: new Date() },
      });
      await tx.withdrawalAccess.update({
        where: { id: access.id },
        data: { consumedAt: new Date() },
      });
      await tx.invitation.updateMany({
        where: {
          coachId: access.coachId,
          athleteId: access.athleteId,
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          coachId: access.coachId,
          resourceId: access.athleteId,
          action: 'public.relationship.ended.demo',
        },
      });
      return { ended: true, isSynthetic: true };
    });
  }
}
