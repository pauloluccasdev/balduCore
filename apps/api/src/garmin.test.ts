import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import {
  GarminMockProvider,
  ProviderFailure,
} from './modules/garmin-connections/provider.js';
import { readConfig } from './config.js';
test('mock: assinatura de corpo bruto e prazo; nenhuma métrica ausente é inventada', async () => {
  const provider = new GarminMockProvider(randomBytes(32).toString('base64'));
  const timestamp = String(Math.floor(Date.now() / 1000));
  const raw = Buffer.from(
    JSON.stringify({
      deliveryId: 'delivery',
      accountId: 'mock-account',
      kind: 'activity',
      activity: {
        externalId: 'activity',
        revision: 1,
        sport: 'running',
        startedAt: '2026-11-18T12:00:00Z',
        durationSeconds: null,
        distanceMeters: null,
      },
    }),
  );
  const signature = provider.signature(raw, timestamp);
  const parsed = provider.verifyDelivery(raw, timestamp, signature);
  const normalized = await provider.normalize(parsed, 1);
  assert.equal(normalized.distanceMeters, null);
  assert.equal(normalized.durationSeconds, null);
  assert.equal(normalized.isSynthetic, true);
  assert.throws(() =>
    provider.verifyDelivery(
      Buffer.from(raw.toString() + ' '),
      timestamp,
      signature,
    ),
  );
  assert.throws(() =>
    provider.verifyDelivery(raw, timestamp, signature, Date.now() + 600_000),
  );
  assert.throws(() => provider.verifyDelivery(raw, timestamp, 'invalid'));
  await assert.rejects(
    provider.normalize({ ...parsed, activity: {} }, 1),
    (error) => error instanceof ProviderFailure && !error.retryable,
  );
  await assert.rejects(
    provider.normalize({ ...parsed, failure: 'transient' }, 1),
    (error) => error instanceof ProviderFailure && error.retryable,
  );
  assert.equal(
    (await provider.normalize({ ...parsed, failure: 'transient' }, 3))
      .externalId,
    'activity',
  );
});
test('mock exige demo local, chaves estáveis e namespace válido, sem habilitar provider oficial', () => {
  const base = {
    DATABASE_URL: 'postgres://localhost/test',
    AUTH_MODE: 'demo',
    GARMIN_PROVIDER: 'mock',
    GARMIN_TOKEN_KEY: randomBytes(32).toString('base64'),
    GARMIN_MOCK_SIGNING_KEY: randomBytes(32).toString('base64'),
  };
  assert.equal(readConfig(base).GARMIN_PROVIDER, 'mock');
  for (const invalid of [
    { AUTH_MODE: 'google' },
    { NODE_ENV: 'production' },
    { GARMIN_TOKEN_KEY: '' },
    { GARMIN_MOCK_SIGNING_KEY: '' },
    { GARMIN_QUEUE_NAMESPACE: 'invalid.name' },
    { GARMIN_PROVIDER: 'official' },
  ])
    assert.throws(() => readConfig({ ...base, ...invalid }));
});
