// Emissor OIDC exclusivo dos testes. Não é importado pelo main de produção.
import { createServer, type Server } from 'node:http';
import {
  generateKeyPairSync,
  createSign,
  randomUUID,
  createHash,
} from 'node:crypto';
import * as oidc from 'openid-client';
import { GOOGLE_ISSUER } from '../modules/auth/google-provider.js';
export async function oidcFixture() {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  const jwk = {
    ...publicKey.export({ format: 'jwk' }),
    kid: 'test-key',
    alg: 'RS256',
    use: 'sig',
  };
  const codes = new Map<
    string,
    {
      challenge: string;
      nonce: string;
      sub: string;
      email: string;
      mode: string;
    }
  >();
  let base = '';
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', base);
    if (url.pathname === '/jwks') {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ keys: [jwk] }));
      return;
    }
    if (url.pathname === '/authorize') {
      const mode = url.searchParams.get('mode') ?? 'valid';
      const code = randomUUID();
      const sub = url.searchParams.get('sub') ?? 'test-coach-a';
      const email = url.searchParams.get('email') ?? 'coach.a@gmail.com';
      codes.set(code, {
        challenge: url.searchParams.get('code_challenge') ?? '',
        nonce: url.searchParams.get('nonce') ?? '',
        sub,
        email,
        mode,
      });
      const destination = new URL(url.searchParams.get('redirect_uri')!);
      destination.searchParams.set(
        'state',
        url.searchParams.get('state') ?? '',
      );
      destination.searchParams.set('code', code);
      res.writeHead(302, { location: destination.href });
      res.end();
      return;
    }
    if (url.pathname === '/token') {
      let body = '';
      for await (const part of req) body += part.toString();
      const params = new URLSearchParams(body);
      const item = codes.get(params.get('code') ?? '');
      codes.delete(params.get('code') ?? '');
      if (
        !item ||
        createHash('sha256')
          .update(params.get('code_verifier') ?? '')
          .digest('base64url') !== item.challenge ||
        params.get('client_secret') !== 'test-secret'
      ) {
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid_grant' }));
        return;
      }
      const now = Math.floor(Date.now() / 1000);
      const claims = {
        iss: GOOGLE_ISSUER,
        sub: item.sub,
        aud: item.mode === 'audience' ? 'wrong-client' : 'test-client',
        iat: now,
        exp: item.mode === 'expired' ? now - 3600 : now + 300,
        nonce: item.mode === 'nonce' ? 'wrong-nonce' : item.nonce,
        email: item.email,
        email_verified: true,
        name: 'Treinador de teste',
      };
      const header = Buffer.from(
        JSON.stringify({ alg: 'RS256', kid: 'test-key' }),
      ).toString('base64url');
      const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
      const signer = createSign('RSA-SHA256');
      signer.update(`${header}.${payload}`);
      const signature = signer.sign(privateKey).toString('base64url');
      const id_token = `${header}.${payload}.${item.mode === 'signature' ? signature.slice(0, -5) + 'abcde' : signature}`;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          access_token: 'test-access-token',
          token_type: 'Bearer',
          expires_in: 300,
          id_token,
        }),
      );
      return;
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const configuration = new oidc.Configuration(
    {
      issuer: GOOGLE_ISSUER,
      authorization_endpoint: `${base}/authorize`,
      token_endpoint: `${base}/token`,
      jwks_uri: `${base}/jwks`,
      id_token_signing_alg_values_supported: ['RS256'],
    },
    'test-client',
    'test-secret',
    oidc.ClientSecretPost('test-secret'),
  );
  oidc.allowInsecureRequests(configuration);
  oidc.enableNonRepudiationChecks(configuration);
  return { configuration, server, close: () => closeServer(server) };
}
function closeServer(server: Server) {
  return new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}
