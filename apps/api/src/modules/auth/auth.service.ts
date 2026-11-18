import { randomUUID } from 'node:crypto';
import {
  ForbiddenException,
  NotFoundException,
  HttpException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import type { PrismaClient } from '../../generated/prisma/client.js';
import type { Config } from '../../config.js';
import type {
  Identity,
  IdentityProvider,
  LoginChecks,
} from './google-provider.js';
import { DEMO_ACCOUNTS, DEMO_ISSUER } from './demo-accounts.js';
import { GOOGLE_ISSUER } from './google-provider.js';
import {
  ATTEMPT_COOKIE,
  SESSION_COOKIE,
  csrfFor,
  decrypt,
  digest,
  encrypt,
  equal,
  randomToken,
  readCookie,
} from './security.js';
export interface Principal {
  coachId: string;
  name: string;
  email: string;
  sessionId: string;
  csrf: string;
}
export class AuthService {
  constructor(
    readonly db: PrismaClient,
    readonly config: Config,
    readonly provider: IdentityProvider,
  ) {}
  async rateLimit(request: Request, category: string, limit: number) {
    // Chaves derivadas, sem armazenar IP em claro. Forwarded headers não são confiados.
    const key = digest(
      `${this.config.AUTH_SECRET}:${this.config.APP_ORIGIN}:${category}:${request.ip ?? request.socket.remoteAddress ?? 'unknown'}`,
    );
    const rows = await this.db.$queryRaw<{ count: number }[]>`
      INSERT INTO "RateLimitBucket" ("key", "count", "expiresAt") VALUES (${key}, 1, NOW() + INTERVAL '1 minute')
      ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "RateLimitBucket"."expiresAt" <= NOW() THEN 1 ELSE "RateLimitBucket"."count" + 1 END,
      "expiresAt" = CASE WHEN "RateLimitBucket"."expiresAt" <= NOW() THEN NOW() + INTERVAL '1 minute' ELSE "RateLimitBucket"."expiresAt" END
      RETURNING "count"`;
    if (rows[0].count > limit)
      throw new HttpException(
        { message: 'Muitas tentativas. Aguarde um minuto.' },
        429,
      );
  }
  private configured() {
    if (
      this.config.AUTH_MODE !== 'google' ||
      !this.config.GOOGLE_CLIENT_ID ||
      !this.config.AUTH_SECRET
    )
      throw new ServiceUnavailableException(
        'Login Google ainda não configurado.',
      );
  }
  async start() {
    this.configured();
    const browser = randomToken();
    const checks: LoginChecks = {
      state: randomToken(),
      nonce: randomToken(),
      verifier: randomToken(),
    };
    const url = await this.provider.start(checks);
    await this.db.authAttempt.create({
      data: {
        stateHash: digest(checks.state),
        browserHash: digest(browser),
        encryptedChecks: encrypt(
          JSON.stringify(checks),
          this.config.AUTH_SECRET,
        ),
        expiresAt: new Date(Date.now() + 600_000),
      },
    });
    return { url, browser };
  }
  allowed(identity: Identity) {
    if (identity.issuer !== GOOGLE_ISSUER || !identity.verified) return false;
    const subjects = this.config.GOOGLE_ALLOWED_SUBJECTS.split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    if (subjects.includes(identity.subject)) return true;
    const emails = this.config.GOOGLE_ALLOWED_EMAILS.split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);
    const domain = identity.email.split('@')[1];
    const authoritative =
      domain === 'gmail.com' ||
      Boolean(
        identity.hostedDomain && identity.hostedDomain.toLowerCase() === domain,
      );
    return authoritative && emails.includes(identity.email.toLowerCase());
  }
  async finish(request: Request) {
    this.configured();
    const state =
      typeof request.query.state === 'string' ? request.query.state : '';
    const browser = readCookie(
      request,
      ATTEMPT_COOKIE,
      this.config.NODE_ENV === 'production',
    );
    if (!state || state.length > 256 || !browser || browser.length > 256)
      throw new UnauthorizedException();
    const stateHash = digest(state);
    const attempt = await this.db.authAttempt.findUnique({
      where: { stateHash },
    });
    if (!attempt || !equal(attempt.browserHash, digest(browser)))
      throw new UnauthorizedException();
    const used = await this.db.authAttempt.updateMany({
      where: { stateHash, consumedAt: null, expiresAt: { gt: new Date() } },
      data: { consumedAt: new Date() },
    });
    if (used.count !== 1) throw new UnauthorizedException();
    const checks = JSON.parse(
      decrypt(attempt.encryptedChecks, this.config.AUTH_SECRET),
    ) as LoginChecks;
    const url = new URL(
      request.originalUrl.replace(/^\/api/, ''),
      this.config.APP_ORIGIN,
    );
    url.pathname = '/api/auth/google/callback';
    const identity = await this.provider.finish(url, checks);
    if (!this.allowed(identity)) throw new ForbiddenException();
    return this.issueSession(identity, request);
  }
  async demoLogin(request: Request, account: '1' | '2') {
    if (
      this.config.AUTH_MODE !== 'demo' ||
      this.config.NODE_ENV === 'production'
    )
      throw new NotFoundException();
    if (request.headers.origin !== this.config.APP_ORIGIN)
      throw new ForbiddenException();
    await this.rateLimit(request, 'demo-login', 15);
    return this.issueSession(DEMO_ACCOUNTS[account], request);
  }
  private async issueSession(identity: Identity, request: Request) {
    const token = randomToken();
    const expiresAt = new Date(
      Date.now() + this.config.SESSION_HOURS * 3_600_000,
    );
    await this.db.$transaction(async (tx) => {
      await tx.$executeRaw`
        INSERT INTO "Coach" ("id", "issuer", "subject", "name", "email")
        VALUES (${randomUUID()}, ${identity.issuer}, ${identity.subject}, ${identity.name}, ${identity.email})
        ON CONFLICT ("issuer", "subject") DO NOTHING`;
      const coach = await tx.coach.findUniqueOrThrow({
        where: {
          issuer_subject: {
            issuer: identity.issuer,
            subject: identity.subject,
          },
        },
      });
      if (!coach.enabled) throw new ForbiddenException();
      await tx.coachSession.create({
        data: { coachId: coach.id, tokenHash: digest(token), expiresAt },
      });
      const prior = readCookie(
        request,
        SESSION_COOKIE,
        this.config.NODE_ENV === 'production',
      );
      if (prior)
        await tx.coachSession.updateMany({
          where: { tokenHash: digest(prior), revokedAt: null },
          data: { revokedAt: new Date() },
        });
      await tx.auditLog.create({
        data: {
          coachId: coach.id,
          action: 'session.created',
          resourceId: coach.id,
        },
      });
    });
    return token;
  }
  async authenticate(request: Request): Promise<Principal> {
    if (!this.config.AUTH_SECRET) throw new UnauthorizedException();
    const token = readCookie(
      request,
      SESSION_COOKIE,
      this.config.NODE_ENV === 'production',
    );
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new UnauthorizedException();
    const session = await this.db.coachSession.findUnique({
      where: { tokenHash: digest(token) },
      include: { coach: true },
    });
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      !session.coach.enabled ||
      session.coach.issuer !==
        (this.config.AUTH_MODE === 'demo' ? DEMO_ISSUER : GOOGLE_ISSUER)
    )
      throw new UnauthorizedException();
    return {
      coachId: session.coachId,
      name: session.coach.name,
      email: session.coach.email,
      sessionId: session.id,
      csrf: csrfFor(token, this.config.AUTH_SECRET),
    };
  }
  verifyMutation(request: Request, principal: Principal) {
    if (
      request.headers.origin !== this.config.APP_ORIGIN ||
      typeof request.headers['x-csrf-token'] !== 'string' ||
      !equal(principal.csrf, request.headers['x-csrf-token'])
    )
      throw new ForbiddenException('Requisição não autorizada.');
  }
  async logout(principal: Principal) {
    await this.db.$transaction([
      this.db.coachSession.update({
        where: { id: principal.sessionId },
        data: { revokedAt: new Date() },
      }),
      this.db.auditLog.create({
        data: {
          coachId: principal.coachId,
          action: 'session.revoked',
          resourceId: principal.sessionId,
        },
      }),
    ]);
  }
}
