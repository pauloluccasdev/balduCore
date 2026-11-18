import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import {
  encrypt,
  decrypt,
  csrfFor,
  equal,
  randomToken,
  cookie,
} from './modules/auth/security.js';
test('material OAuth cifrado detecta adulteração e CSRF não aceita outra sessão', () => {
  const secret = randomBytes(32).toString('base64');
  const encrypted = encrypt('verifier-private', secret);
  assert.ok(!encrypted.includes('verifier-private'));
  assert.equal(decrypt(encrypted, secret), 'verifier-private');
  const bytes = Buffer.from(encrypted, 'base64');
  bytes[15] ^= 255;
  assert.throws(() => decrypt(bytes.toString('base64'), secret));
  const token = randomToken();
  assert.ok(equal(csrfFor(token, secret), csrfFor(token, secret)));
  assert.ok(!equal(csrfFor(token, secret), csrfFor(randomToken(), secret)));
});

test('cookie produtivo usa prefixo host, Secure e nenhum Domain', () => {
  const header = cookie('balducore_session', randomToken(), 3600, true);
  assert.match(header, /^__Host-balducore_session=/);
  assert.match(header, /Secure/);
  assert.match(header, /HttpOnly/);
  assert.match(header, /Path=\//);
  assert.ok(!header.includes('Domain='));
});
