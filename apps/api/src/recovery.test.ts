import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recoveryAdmin, recoveryName } from './scripts/recovery-safety.js';
test('ensaio de recuperação recusa produção, destinos externos, query override e remoção alheia', () => {
  const local = 'postgresql://local:secret@127.0.0.1:5432/postgres';
  assert.equal(recoveryAdmin(local).pathname, '/postgres');
  for (const value of [
    undefined,
    local.replace('127.0.0.1', 'db.example.test'),
    local.replace('/postgres', '/balducore'),
    `${local}?host=db.example.test`,
    `${local}#fragment`,
    local.replace('postgresql:', 'https:'),
  ])
    assert.throws(() => recoveryAdmin(value));
  assert.throws(() => recoveryAdmin(local, 'production'));
  const own = `balducore_drill_${'a'.repeat(32)}_source`;
  assert.equal(recoveryName(own, new Set([own])), `"${own}"`);
  assert.throws(() => recoveryName(own, new Set()));
  assert.throws(() => recoveryName('balducore', new Set(['balducore'])));
});
