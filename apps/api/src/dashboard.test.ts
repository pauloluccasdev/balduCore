import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dashboardQuery } from './modules/dashboard/dashboard.service.js';
test('dashboard: períodos fechados em dias UTC, sem relógio do navegador, e filtros estritos', () => {
  const now = new Date('2026-11-19T23:59:59-03:00');
  const query = dashboardQuery({ period: '7' }, now);
  assert.equal(query.from, '2026-11-14');
  assert.equal(query.to, '2026-11-20');
  assert.equal(query.end.toISOString(), '2026-11-21T00:00:00.000Z');
  assert.equal(dashboardQuery({}, now).period, 30);
  for (const input of [
    { period: 0 },
    { period: 31 },
    { period: 7.1 },
    { sport: 'football' },
    { coachId: 'other' },
    { period: ['7', '90'] },
  ])
    assert.throws(() => dashboardQuery(input, now));
});
