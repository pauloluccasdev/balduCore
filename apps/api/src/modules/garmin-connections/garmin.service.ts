import { InvitationsService } from '../invitations/invitations.service.js';
import {
  BadRequestException,
  ConflictException,
  GoneException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';
import type { Config } from '../../config.js';
import { input } from '../athletes/athletes.service.js';
import { decrypt, digest, encrypt, randomToken } from '../auth/security.js';
import { IntegrationQueue } from '../activity-processing/queue.js';
import {
  disconnectInTransaction,
  eligible,
  lockRelationship,
  requireEligible,
  type Scope,
} from './lifecycle.js';
import {
  GarminMockProvider,
  ProviderFailure,
  type ActivityProvider,
  type ProviderCredentials,
  type ProviderDelivery,
} from './provider.js';

const stateSchema = z
  .object({
    state: z.string().regex(/^[\w-]{43}$/),
    decision: z.enum(['approve', 'deny']),
  })
  .strict();
export const SCENARIOS = [
  'sample',
  'duplicate',
  'updated',
  'out_of_order',
  'temporary_failure',
  'permanent_failure',
  'invalid_payload',
  'expired_token',
  'invalid_refresh',
  'provider_revocation',
  'revocation_failure',
] as const;
export class GarminService {
  constructor(
    readonly db: PrismaClient,
    readonly config: Config,
    readonly provider?: ActivityProvider,
    readonly queue?: IntegrationQueue,
  ) {}
  private configured() {
    if (!this.provider || !this.queue || this.config.GARMIN_PROVIDER !== 'mock')
      throw new ServiceUnavailableException(
        'Integração oficial indisponível. Configure o mock local para testar.',
      );
    return this.provider;
  }
  private async enrollment(tx: Prisma.TransactionClient, token: string) {
    if (!token) throw new GoneException('Jornada pública indisponível.');
    const seed = await tx.enrollmentSession.findUnique({
      where: { tokenHash: digest(token) },
    });
    if (!seed) throw new GoneException('Jornada pública indisponível.');
    await lockRelationship(tx, seed);
    const session = await tx.enrollmentSession.findUniqueOrThrow({
      where: { id: seed.id },
      include: { invitation: true },
    });
    if (
      (!session.acceptedAt && session.invitation.purpose !== 'garmin') ||
      !session.verifiedAt ||
      session.expiresAt <= new Date() ||
      session.invitation.revokedAt ||
      session.invitation.expiresAt <= new Date()
    )
      throw new GoneException(
        'Jornada expirada ou sem aceite. Solicite novo acesso ao treinador.',
      );
    await requireEligible(tx, session);
    return session;
  }
  async authorizationLink(scope: Scope) {
    this.configured();
    return new InvitationsService(this.db, this.config, this.queue).create(
      scope.coachId,
      scope.athleteId,
      'garmin',
    );
  }
  async start(token: string) {
    this.configured();
    const state = randomToken();
    await this.db.$transaction(async (tx) => {
      const session = await this.enrollment(tx, token);
      const scope = { coachId: session.coachId, athleteId: session.athleteId };
      const current = await tx.garminConnection.findUnique({
        where: { coachId_athleteId: scope },
      });
      if (
        current?.encryptedCredentials ||
        ['pending', 'failed'].includes(current?.revocationStatus ?? '')
      )
        throw new ConflictException(
          'Desconecte e conclua a revogação anterior antes de autorizar novamente.',
        );
      const connection = await tx.garminConnection.upsert({
        where: { coachId_athleteId: scope },
        create: { ...scope, status: 'awaiting_authorization', generation: 1 },
        update: {
          status: 'awaiting_authorization',
          generation: { increment: 1 },
          lastError: null,
        },
      });
      await tx.garminAuthorizationAttempt.updateMany({
        where: { connectionId: connection.id, consumedAt: null },
        data: { consumedAt: new Date(), outcome: 'superseded' },
      });
      await tx.garminAuthorizationAttempt.create({
        data: {
          ...scope,
          connectionId: connection.id,
          enrollmentId: session.id,
          stateHash: digest(state),
          browserHash: digest(token),
          generation: connection.generation,
          expiresAt: new Date(Date.now() + 600_000),
        },
      });
      await tx.auditLog.create({
        data: {
          coachId: scope.coachId,
          resourceId: connection.id,
          action: 'garmin.mock.authorization_started',
        },
      });
    });
    return {
      url: `${this.config.APP_ORIGIN}/garmin/mock#${state}`,
      isSynthetic: true,
    };
  }
  async finish(token: string, body: unknown) {
    const provider = this.configured();
    const { state, decision } = input(stateSchema, body);
    const attempt = await this.db.$transaction(async (tx) => {
      const session = await this.enrollment(tx, token);
      const found = await tx.garminAuthorizationAttempt.findUnique({
        where: { stateHash: digest(state) },
        include: { connection: true },
      });
      if (
        !found ||
        found.enrollmentId !== session.id ||
        found.browserHash !== digest(token) ||
        found.consumedAt ||
        found.expiresAt <= new Date() ||
        found.connection.generation !== found.generation ||
        found.connection.status !== 'awaiting_authorization'
      )
        throw new GoneException(
          'Autorização inválida, expirada ou já utilizada.',
        );
      await tx.garminAuthorizationAttempt.update({
        where: { id: found.id },
        data: {
          consumedAt: new Date(),
          outcome: decision === 'approve' ? 'processing' : 'denied',
        },
      });
      if (decision === 'deny')
        await tx.garminConnection.update({
          where: { id: found.connectionId },
          data: { status: 'not_connected', lastError: 'authorization_denied' },
        });
      return found;
    });
    if (decision === 'deny')
      return { status: 'not_connected', denied: true, isSynthetic: true };
    let credentials: ProviderCredentials;
    try {
      credentials = await provider.authorize(
        attempt.connectionId,
        attempt.generation,
      );
    } catch {
      await this.db.$transaction(async (tx) => {
        await lockRelationship(tx, attempt);
        await tx.garminConnection.updateMany({
          where: {
            id: attempt.connectionId,
            generation: attempt.generation,
            status: 'awaiting_authorization',
          },
          data: { status: 'error', lastError: 'authorization_failed' },
        });
        await tx.garminAuthorizationAttempt.update({
          where: { id: attempt.id },
          data: { outcome: 'failed' },
        });
      });
      throw new ServiceUnavailableException(
        'Autorização de teste indisponível. Inicie nova tentativa.',
      );
    }
    try {
      await this.db.$transaction(async (tx) => {
        const session = await this.enrollment(tx, token);
        const connection = await tx.garminConnection.findUniqueOrThrow({
          where: { id: attempt.connectionId },
        });
        if (
          connection.generation !== attempt.generation ||
          connection.status !== 'awaiting_authorization'
        )
          throw new GoneException('Autorização cancelada.');
        await tx.garminConnection.update({
          where: { id: connection.id },
          data: {
            status: 'connected',
            externalAccountHash: digest(credentials.accountId),
            encryptedCredentials: encrypt(
              JSON.stringify(credentials),
              this.config.GARMIN_TOKEN_KEY,
            ),
            tokenExpiresAt: new Date(credentials.expiresAt),
            credentialVersion: { increment: 1 },
            revocationStatus: 'none',
            lastError: null,
          },
        });
        await tx.garminAuthorizationAttempt.update({
          where: { id: attempt.id },
          data: { outcome: 'approved' },
        });
        await tx.auditLog.create({
          data: {
            coachId: session.coachId,
            resourceId: connection.id,
            action: 'garmin.mock.connected',
          },
        });
      });
    } catch (error) {
      // Se o vínculo for encerrado durante a chamada ao provider, o resultado não pode manter autorização órfã.
      try {
        await provider.revoke(credentials, 1);
      } catch {
        await this.db.$transaction(async (tx) => {
          await lockRelationship(tx, attempt);
          const ciphertext = encrypt(
            JSON.stringify(credentials),
            this.config.GARMIN_TOKEN_KEY,
          );
          const event = await tx.integrationEvent.create({
            data: {
              coachId: attempt.coachId,
              athleteId: attempt.athleteId,
              connectionId: attempt.connectionId,
              generation: attempt.generation,
              kind: 'revoke',
              deliveryId: `orphan-${attempt.id}`,
              payloadHash: digest(ciphertext),
              encryptedPayload: ciphertext,
              namespace: this.config.GARMIN_QUEUE_NAMESPACE,
            },
          });
          const jobId = await this.queue!.send(tx, event.id);
          await tx.integrationEvent.update({
            where: { id: event.id },
            data: { jobId },
          });
          await tx.garminConnection.updateMany({
            where: {
              id: attempt.connectionId,
              status: 'disconnected',
              generation: attempt.generation + 1,
            },
            data: { revocationStatus: 'pending' },
          });
        });
      }
      throw error;
    }
    return { status: 'connected', isSynthetic: true };
  }
  async publicStatus(token: string) {
    return this.db.$transaction(async (tx) => {
      const session = await this.enrollment(tx, token);
      const connection = await tx.garminConnection.findUnique({
        where: {
          coachId_athleteId: {
            coachId: session.coachId,
            athleteId: session.athleteId,
          },
        },
      });
      return {
        status: connection?.status ?? 'not_connected',
        isSynthetic: true,
        enabled: this.config.GARMIN_PROVIDER === 'mock',
      };
    });
  }
  private async owned(coachId: string, athleteId: string) {
    if (
      !(await this.db.athlete.findUnique({
        where: { coachId_id: { coachId, id: athleteId } },
      }))
    )
      throw new NotFoundException('Aluno não encontrado.');
  }
  async status(coachId: string, athleteId: string) {
    await this.owned(coachId, athleteId);
    const connection = await this.db.garminConnection.findUnique({
      where: { coachId_athleteId: { coachId, athleteId } },
    });
    const [activityCount, events, heartbeat] = await Promise.all([
      this.db.activity.count({
        where: {
          coachId,
          athleteId,
          connection: { relationship: { status: 'active' } },
        },
      }),
      this.db.integrationEvent.findMany({
        where: { coachId, athleteId },
        select: {
          id: true,
          kind: true,
          status: true,
          attempts: true,
          errorCode: true,
          createdAt: true,
          processedAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 15,
      }),
      this.db.workerHeartbeat.findUnique({
        where: { name: this.config.GARMIN_QUEUE_NAMESPACE },
      }),
    ]);
    return {
      enabled: this.config.GARMIN_PROVIDER === 'mock',
      provider: connection?.provider ?? null,
      isSynthetic: true,
      status: connection?.status ?? 'not_connected',
      revocationStatus: connection?.revocationStatus ?? 'none',
      lastReceivedAt: connection?.lastReceivedAt ?? null,
      lastSyncedAt: connection?.lastSyncedAt ?? null,
      lastError: connection?.lastError ?? null,
      activityCount,
      events,
      workerOnline: Boolean(
        heartbeat && heartbeat.seenAt.getTime() > Date.now() - 15_000,
      ),
      officialAvailable: false,
    };
  }
  async overview(coachId: string) {
    const connections = await this.db.garminConnection.findMany({
      where: { coachId },
      select: {
        athleteId: true,
        status: true,
        isSynthetic: true,
        lastSyncedAt: true,
        lastError: true,
        revocationStatus: true,
        relationship: { select: { athlete: { select: { name: true } } } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });
    const heartbeat = await this.db.workerHeartbeat.findUnique({
      where: { name: this.config.GARMIN_QUEUE_NAMESPACE },
    });
    return {
      enabled: this.config.GARMIN_PROVIDER === 'mock',
      officialAvailable: false,
      isSynthetic: true,
      workerOnline: Boolean(
        heartbeat && heartbeat.seenAt.getTime() > Date.now() - 15_000,
      ),
      connections: connections.map(({ relationship, ...connection }) => ({
        ...connection,
        athleteName: relationship.athlete.name,
      })),
    };
  }
  async disconnect(scope: Scope) {
    await this.db.$transaction(async (tx) => {
      await lockRelationship(tx, scope);
      await disconnectInTransaction(
        tx,
        scope,
        this.config.GARMIN_QUEUE_NAMESPACE,
        this.queue,
      );
    });
    return { status: 'disconnected', isSynthetic: true };
  }
  async ingest(raw: Buffer, timestamp: string, signature: string) {
    const provider = this.configured();
    let delivery: ProviderDelivery;
    try {
      delivery = provider.verifyDelivery(raw, timestamp, signature);
    } catch (error) {
      if (error instanceof ProviderFailure)
        throw new BadRequestException('Envelope mock inválido.');
      throw error;
    }
    const seed = await this.db.garminConnection.findUnique({
      where: { externalAccountHash: digest(delivery.accountId) },
    });
    if (!seed) return { accepted: false, isSynthetic: true };
    return this.db.$transaction(async (tx) => {
      await lockRelationship(tx, seed);
      const connection = await tx.garminConnection.findUniqueOrThrow({
        where: { id: seed.id },
      });
      if (
        connection.externalAccountHash !== digest(delivery.accountId) ||
        connection.status !== 'connected' ||
        !(await eligible(tx, connection))
      )
        return { accepted: false, isSynthetic: true };
      const identity = {
        connectionId: connection.id,
        generation: connection.generation,
        kind: delivery.kind,
        deliveryId: delivery.deliveryId,
      };
      const existing = await tx.integrationEvent.findUnique({
        where: { connectionId_generation_kind_deliveryId: identity },
      });
      const payloadHash = digest(raw.toString('utf8'));
      if (existing) {
        if (existing.payloadHash !== payloadHash)
          throw new ConflictException(
            'Identificador de entrega reutilizado com conteúdo diferente.',
          );
        return {
          accepted: true,
          duplicate: true,
          eventId: existing.id,
          isSynthetic: true,
        };
      }
      if (delivery.kind === 'connection_revoked') {
        await disconnectInTransaction(
          tx,
          connection,
          this.config.GARMIN_QUEUE_NAMESPACE,
          this.queue,
          true,
        );
        const event = await tx.integrationEvent.create({
          data: {
            coachId: connection.coachId,
            athleteId: connection.athleteId,
            ...identity,
            payloadHash,
            namespace: this.config.GARMIN_QUEUE_NAMESPACE,
            status: 'processed',
            processedAt: new Date(),
          },
        });
        return { accepted: true, eventId: event.id, isSynthetic: true };
      }
      const event = await tx.integrationEvent.create({
        data: {
          coachId: connection.coachId,
          athleteId: connection.athleteId,
          ...identity,
          payloadHash,
          encryptedPayload: encrypt(
            JSON.stringify(delivery),
            this.config.GARMIN_TOKEN_KEY,
          ),
          namespace: this.config.GARMIN_QUEUE_NAMESPACE,
        },
      });
      const jobId = await this.queue!.send(tx, event.id);
      if (!jobId)
        throw new ServiceUnavailableException(
          'Não foi possível agendar processamento.',
        );
      await tx.integrationEvent.update({
        where: { id: event.id },
        data: { jobId },
      });
      await tx.garminConnection.update({
        where: { id: connection.id },
        data: { lastReceivedAt: new Date() },
      });
      return {
        accepted: true,
        eventId: event.id,
        duplicate: false,
        isSynthetic: true,
      };
    });
  }
  async simulate(scope: Scope, body: unknown) {
    this.configured();
    const { scenario } = input(
      z.object({ scenario: z.enum(SCENARIOS) }).strict(),
      body,
    );
    const credentials = await this.db.$transaction(async (tx) => {
      await lockRelationship(tx, scope);
      await requireEligible(tx, scope);
      const connection = await tx.garminConnection.findUnique({
        where: { coachId_athleteId: scope },
      });
      if (
        !connection ||
        connection.status !== 'connected' ||
        !connection.encryptedCredentials
      )
        throw new ConflictException(
          'Autorize a conexão mock pela jornada do aluno antes de simular.',
        );
      const credentials = this.decodeCredentials(
        connection.encryptedCredentials,
      );
      if (
        scenario === 'expired_token' ||
        scenario === 'invalid_refresh' ||
        scenario === 'revocation_failure'
      ) {
        credentials.refreshRejected = scenario === 'invalid_refresh';
        credentials.revokeFailures = scenario === 'revocation_failure' ? 2 : 0;
        await tx.garminConnection.update({
          where: { id: connection.id },
          data: {
            encryptedCredentials: encrypt(
              JSON.stringify(credentials),
              this.config.GARMIN_TOKEN_KEY,
            ),
            ...(scenario !== 'revocation_failure'
              ? { tokenExpiresAt: new Date(0) }
              : {}),
          },
        });
      }
      return credentials;
    });
    if (scenario === 'revocation_failure')
      return { configured: true, isSynthetic: true };
    const delivery: ProviderDelivery = {
      accountId: credentials.accountId,
      deliveryId:
        scenario === 'duplicate' ? 'mock-repeatable-delivery' : randomUUID(),
      kind:
        scenario === 'provider_revocation' ? 'connection_revoked' : 'activity',
      ...(scenario !== 'provider_revocation'
        ? {
            activity:
              scenario === 'invalid_payload'
                ? { invalid: true }
                : {
                    externalId: 'mock-run-1',
                    revision: scenario === 'updated' ? 2 : 1,
                    sport: 'running',
                    startedAt: '2026-11-18T12:00:00.000Z',
                    durationSeconds: scenario === 'updated' ? 1700 : 1800,
                    distanceMeters: 5000,
                  },
          }
        : {}),
      ...(scenario === 'temporary_failure'
        ? { failure: 'transient' as const }
        : {}),
      ...(scenario === 'permanent_failure'
        ? { failure: 'permanent' as const }
        : {}),
    };
    const raw = Buffer.from(JSON.stringify(delivery));
    const timestamp = String(Math.floor(Date.now() / 1000));
    const mock = new GarminMockProvider(this.config.GARMIN_MOCK_SIGNING_KEY);
    return this.ingest(raw, timestamp, mock.signature(raw, timestamp));
  }
  decodeCredentials(ciphertext: string): ProviderCredentials {
    try {
      return JSON.parse(
        decrypt(ciphertext, this.config.GARMIN_TOKEN_KEY),
      ) as ProviderCredentials;
    } catch {
      throw new ProviderFailure('credentials_unreadable', false);
    }
  }
  async credentials(connectionId: string, generation: number) {
    const provider = this.configured();
    const seed = await this.db.garminConnection.findUniqueOrThrow({
      where: { id: connectionId },
    });
    const lease = randomToken();
    const current = await this.db.$transaction(async (tx) => {
      await lockRelationship(tx, seed);
      await requireEligible(tx, seed);
      const connection = await tx.garminConnection.findUniqueOrThrow({
        where: { id: connectionId },
      });
      if (
        connection.generation !== generation ||
        connection.status !== 'connected' ||
        !connection.encryptedCredentials
      )
        throw new ProviderFailure('connection_revoked', false);
      if (
        connection.tokenExpiresAt &&
        connection.tokenExpiresAt.getTime() > Date.now() + 30_000
      )
        return {
          credentials: this.decodeCredentials(connection.encryptedCredentials),
          refresh: false,
        };
      if (
        connection.refreshLeaseUntil &&
        connection.refreshLeaseUntil > new Date()
      )
        throw new ProviderFailure('refresh_in_progress', true);
      await tx.garminConnection.update({
        where: { id: connectionId },
        data: {
          refreshLease: lease,
          refreshLeaseUntil: new Date(Date.now() + 10_000),
        },
      });
      return {
        credentials: this.decodeCredentials(connection.encryptedCredentials),
        refresh: true,
      };
    });
    if (!current.refresh) return current.credentials;
    try {
      const updated = await provider.refresh(current.credentials);
      await this.db.$transaction(async (tx) => {
        await lockRelationship(tx, seed);
        await requireEligible(tx, seed);
        const connection = await tx.garminConnection.findUniqueOrThrow({
          where: { id: connectionId },
        });
        if (
          connection.generation !== generation ||
          connection.status !== 'connected' ||
          connection.refreshLease !== lease ||
          !connection.refreshLeaseUntil ||
          connection.refreshLeaseUntil <= new Date()
        )
          throw new ProviderFailure('connection_revoked', false);
        await tx.garminConnection.update({
          where: { id: connectionId },
          data: {
            encryptedCredentials: encrypt(
              JSON.stringify(updated),
              this.config.GARMIN_TOKEN_KEY,
            ),
            tokenExpiresAt: new Date(updated.expiresAt),
            credentialVersion: { increment: 1 },
            refreshLease: null,
            refreshLeaseUntil: null,
          },
        });
      });
      return updated;
    } catch (error) {
      await this.db.garminConnection.updateMany({
        where: { id: connectionId, refreshLease: lease },
        data: { refreshLease: null, refreshLeaseUntil: null },
      });
      throw error;
    }
  }
  async retry(scope: Scope, eventId: string) {
    this.configured();
    return this.db.$transaction(async (tx) => {
      await lockRelationship(tx, scope);
      const event = await tx.integrationEvent.findFirst({
        where: { ...scope, id: eventId },
        include: { connection: true },
      });
      if (!event) throw new NotFoundException('Processamento não encontrado.');
      if (event.status !== 'failed' || !event.encryptedPayload)
        throw new ConflictException(
          'Somente falhas persistidas podem ser reprocessadas.',
        );
      if (
        event.kind === 'activity' &&
        (event.connection.generation !== event.generation ||
          event.connection.status !== 'connected' ||
          !(await eligible(tx, scope)))
      )
        throw new ConflictException('Conexão ou acompanhamento indisponível.');
      const jobId = await this.queue!.send(tx, event.id);
      await tx.integrationEvent.update({
        where: { id: event.id },
        data: {
          status: 'queued',
          attempts: 0,
          errorCode: null,
          jobId,
          runToken: null,
          leaseUntil: null,
        },
      });
      if (event.kind === 'revoke')
        await tx.garminConnection.update({
          where: { id: event.connectionId },
          data: { revocationStatus: 'pending' },
        });
      await tx.auditLog.create({
        data: {
          coachId: scope.coachId,
          resourceId: event.id,
          action: 'garmin.mock.redriven',
        },
      });
      return { queued: true, isSynthetic: true };
    });
  }
}
