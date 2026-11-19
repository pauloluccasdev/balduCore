import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { monitoringQuery } from './modules/monitoring/monitoring.service.js';
import { reconciliationArguments } from './modules/monitoring/reconcile.js';
test('monitoramento: dias UTC inclusivos, 90 dias exatos, calendário inválido e padrão independente do fuso', () => {
  const day = monitoringQuery({ from: '2026-11-19', to: '2026-11-19' });
  assert.equal(day.start.toISOString(), '2026-11-19T00:00:00.000Z');
  assert.equal(day.end.toISOString(), '2026-11-20T00:00:00.000Z');
  assert.doesNotThrow(() =>
    monitoringQuery({ from: '2026-01-01', to: '2026-03-31' }),
  );
  assert.throws(() =>
    monitoringQuery({ from: '2026-01-01', to: '2026-04-01' }),
  );
  assert.throws(() => monitoringQuery({ from: '2026-02-30' }));
  assert.throws(() =>
    monitoringQuery({ from: '2026-11-20', to: '2026-11-19' }),
  );
  const defaults = monitoringQuery({}, new Date('2026-11-19T23:59:59-03:00'));
  assert.equal(defaults.to, '2026-11-20');
  assert.equal(defaults.from, '2026-10-22');
});
test('conciliação: exige coach/tipo/limite explícitos, cursor válido e rejeita flags repetidas ou varredura ilimitada', () => {
  const coach = randomUUID(),
    cursor = randomUUID();
  assert.deepEqual(
    reconciliationArguments([
      '--coach',
      coach,
      '--type',
      'fit',
      '--limit',
      '100',
      '--cursor',
      cursor,
    ]),
    { coachId: coach, type: 'fit', limit: 100, cursor },
  );
  for (const args of [
    [],
    ['--coach', coach],
    ['--coach', coach, '--type', 'activity', '--limit', '0'],
    ['--coach', coach, '--type', 'activity', '--limit', '10001'],
    ['--coach', coach, '--type', 'activity', '--limit', '1', '--all', 'true'],
    ['--coach', coach, '--coach', coach, '--type', 'activity', '--limit', '1'],
  ])
    assert.throws(() => reconciliationArguments(args));
});
