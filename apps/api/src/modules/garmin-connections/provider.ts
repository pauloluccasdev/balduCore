import { detailFields } from '../activities/activity-data.js';
import type { ActivityData } from '../activities/activity-data.js';
import { createHmac } from 'node:crypto';
import { UnauthorizedException } from '@nestjs/common';
import { z } from 'zod';
import { equal, randomToken } from '../auth/security.js';

export class ProviderFailure extends Error {
  constructor(
    readonly code: string,
    readonly retryable: boolean,
  ) {
    super(code);
  }
}
export interface ProviderCredentials {
  accountId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  refreshRejected: boolean;
  revokeFailures: number;
}
export interface ActivityEnvelope extends Omit<
  ActivityData,
  'durationSeconds' | 'distanceMeters'
> {
  externalId: string;
  revision: number;
  startedAt: string;
  durationSeconds: number | null;
  distanceMeters: number | null;
  source: 'garmin_mock';
  isSynthetic: true;
}
export interface ProviderDelivery {
  deliveryId: string;
  accountId: string;
  kind: 'activity' | 'connection_revoked';
  activity?: unknown;
  failure?: 'transient' | 'permanent';
}
export interface ActivityProvider {
  readonly kind: 'garmin_mock';
  authorize(
    connectionId: string,
    generation: number,
  ): Promise<ProviderCredentials>;
  verifyDelivery(
    raw: Buffer,
    timestamp: string,
    signature: string,
    now?: number,
  ): ProviderDelivery;
  normalize(
    delivery: ProviderDelivery,
    attempt: number,
  ): Promise<ActivityEnvelope>;
  refresh(credentials: ProviderCredentials): Promise<ProviderCredentials>;
  revoke(credentials: ProviderCredentials, attempt: number): Promise<void>;
}
const deliverySchema = z
  .object({
    deliveryId: z.string().min(1).max(128),
    accountId: z.string().min(1).max(180),
    kind: z.enum(['activity', 'connection_revoked']),
    activity: z.unknown().optional(),
    failure: z.enum(['transient', 'permanent']).optional(),
  })
  .strict();
const activitySchema = z
  .object({
    ...detailFields,
    externalId: z.string().min(1).max(128),
    revision: z.number().int().min(1).max(1_000_000),
    sport: z.enum(['running', 'cycling', 'walking', 'swimming', 'other']),
    startedAt: z.iso.datetime({ offset: true }),
    durationSeconds: z.number().finite().positive().max(604800).nullable(),
    distanceMeters: z.number().finite().nonnegative().max(2_000_000).nullable(),
  })
  .strict();

// Contrato de teste BalduCore, nunca atribuído à API oficial da Garmin.
export class GarminMockProvider implements ActivityProvider {
  readonly kind = 'garmin_mock';
  constructor(private readonly signingKey: string) {}
  async authorize(
    connectionId: string,
    generation: number,
  ): Promise<ProviderCredentials> {
    return {
      accountId: `mock-account:${connectionId}:${generation}`,
      accessToken: `mock-access:${randomToken()}`,
      refreshToken: `mock-refresh:${randomToken()}`,
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      refreshRejected: false,
      revokeFailures: 0,
    };
  }
  signature(raw: Buffer, timestamp: string) {
    return createHmac('sha256', this.signingKey)
      .update(timestamp)
      .update('.')
      .update(raw)
      .digest('hex');
  }
  verifyDelivery(
    raw: Buffer,
    timestamp: string,
    signature: string,
    now = Date.now(),
  ): ProviderDelivery {
    if (
      !/^\d{10}$/.test(timestamp) ||
      Math.abs(now - Number(timestamp) * 1000) > 300_000 ||
      !/^[a-f0-9]{64}$/.test(signature) ||
      !equal(signature, this.signature(raw, timestamp))
    )
      throw new UnauthorizedException('Entrega mock não autenticada.');
    try {
      return deliverySchema.parse(JSON.parse(raw.toString('utf8')));
    } catch {
      throw new ProviderFailure('invalid_delivery', false);
    }
  }
  async normalize(
    delivery: ProviderDelivery,
    attempt: number,
  ): Promise<ActivityEnvelope> {
    if (delivery.failure === 'permanent')
      throw new ProviderFailure('mock_permanent_failure', false);
    if (delivery.failure === 'transient' && attempt <= 2)
      throw new ProviderFailure('mock_temporary_failure', true);
    const parsed = activitySchema.safeParse(delivery.activity);
    if (!parsed.success) throw new ProviderFailure('invalid_activity', false);
    return {
      ...parsed.data,
      startedAt: new Date(parsed.data.startedAt).toISOString(),
      source: 'garmin_mock',
      isSynthetic: true,
    };
  }
  async refresh(credentials: ProviderCredentials) {
    if (credentials.refreshRejected)
      throw new ProviderFailure('authorization_expired', false);
    return {
      ...credentials,
      accessToken: `mock-access:${randomToken()}`,
      refreshToken: `mock-refresh:${randomToken()}`,
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    };
  }
  async revoke(credentials: ProviderCredentials, attempt: number) {
    if (attempt <= credentials.revokeFailures)
      throw new ProviderFailure('mock_revocation_unavailable', true);
  }
}
