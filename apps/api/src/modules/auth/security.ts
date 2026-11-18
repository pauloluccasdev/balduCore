import {
  createHash,
  createHmac,
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { parseCookie, stringifySetCookie } from 'cookie';
import type { Request } from 'express';
export const SESSION_COOKIE = 'balducore_session';
export const ATTEMPT_COOKIE = 'balducore_login';
export const randomToken = () => randomBytes(32).toString('base64url');
export const digest = (value: string) =>
  createHash('sha256').update(value).digest('hex');
export function readCookie(request: Request, name: string, secure = false) {
  return (
    parseCookie(request.headers.cookie ?? '')[
      secure ? `__Host-${name}` : name
    ] ?? ''
  );
}
export function cookie(
  name: string,
  value: string,
  seconds: number,
  secure: boolean,
) {
  return stringifySetCookie({
    name: secure ? `__Host-${name}` : name,
    value,
    maxAge: seconds,
    path: '/',
    httpOnly: true,
    secure,
    sameSite: 'lax',
  });
}
export function csrfFor(token: string, secret: string) {
  return createHmac('sha256', secret)
    .update(`csrf:${token}`)
    .digest('base64url');
}
export function equal(a: string, b: string) {
  const aa = Buffer.from(a);
  const bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}
export function encrypt(value: string, secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(
    'aes-256-gcm',
    Buffer.from(secret, 'base64'),
    iv,
  );
  const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64');
}
export function decrypt(value: string, secret: string) {
  const data = Buffer.from(value, 'base64');
  const decipher = createDecipheriv(
    'aes-256-gcm',
    Buffer.from(secret, 'base64'),
    data.subarray(0, 12),
  );
  decipher.setAuthTag(data.subarray(12, 28));
  return Buffer.concat([
    decipher.update(data.subarray(28)),
    decipher.final(),
  ]).toString('utf8');
}
