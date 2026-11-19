import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeFit } from './modules/activities/fit-decoder.js';
import {
  derivedMetrics,
  FIT_LIMITS,
} from './modules/activities/activity-data.js';
import { sampleActivity } from './test-support/fit-fixture.js';
test('FIT isolado: unidades, zero, ausências, separação cronômetro/decorrido e descarte de campos externos', async () => {
  const data = await decodeFit(sampleActivity());
  assert.equal(data.durationSeconds, 20);
  assert.equal(data.elapsedSeconds, 22);
  assert.equal(data.durationBasis, 'timer');
  assert.equal(data.samples?.length, 3);
  assert.equal(data.samples?.[0].speedMetersPerSecond, 0);
  assert.equal(data.samples?.[1].heartRateBpm, 150);
  assert.equal(data.samples?.[2].heartRateBpm, null);
  assert.equal(data.avgCadenceRpm, null);
  assert.equal(data.splits?.length, 1);
  assert.equal(data.splits?.[0].distanceMeters, 90);
  assert.ok(!JSON.stringify(data).includes('manufacturer'));
  assert.ok(!JSON.stringify(data).includes('positionLat'));
});
test('FIT isolado rejeita bytes inválidos, CRC, truncamento e limite de tamanho', async () => {
  await assert.rejects(decodeFit(Buffer.from('not fit')), {
    code: 'fit_invalid_integrity',
  });
  const corrupt = sampleActivity();
  corrupt[corrupt.length - 1] ^= 0xff;
  await assert.rejects(decodeFit(corrupt), { code: 'fit_invalid_integrity' });
  await assert.rejects(decodeFit(sampleActivity().subarray(0, 40)), {
    code: 'fit_invalid_integrity',
  });
  await assert.rejects(decodeFit(Buffer.alloc(FIT_LIMITS.bytes + 1)), {
    code: 'fit_limits_exceeded',
  });
});
test('Métricas derivadas não fabricam ritmo/velocidade com dados ausentes ou zero', () => {
  assert.deepEqual(derivedMetrics(1000, 300), {
    paceSecondsPerKm: 300,
    speedKmh: 12,
  });
  for (const [distance, time] of [
    [null, 300],
    [1000, null],
    [0, 300],
    [1000, 0],
  ] as const)
    assert.deepEqual(derivedMetrics(distance, time), {
      paceSecondsPerKm: null,
      speedKmh: null,
    });
});

test('FIT isolado rejeita multissessão e excesso de amostras sem publicar recorte silencioso', async () => {
  await assert.rejects(
    decodeFit(sampleActivity(undefined, { sessionCount: 2 })),
    { code: 'fit_session_unsupported' },
  );
  await assert.rejects(
    decodeFit(
      sampleActivity(undefined, { recordCount: FIT_LIMITS.samples + 1 }),
    ),
    { code: 'fit_limits_exceeded' },
  );
});
test('FIT normaliza ordem com aviso e remove amostra sem horário, sem inventar timestamp', async () => {
  const reversed = await decodeFit(
    sampleActivity(undefined, { order: 'reversed' }),
  );
  assert.deepEqual(reversed.qualityWarnings, ['samples_reordered']);
  assert.equal(reversed.samples?.[0].distanceMeters, 0);
  const untimed = await decodeFit(
    sampleActivity(undefined, { order: 'untimed' }),
  );
  assert.deepEqual(untimed.qualityWarnings, ['untimed_samples_removed']);
  assert.equal(untimed.samples?.length, 2);
});
