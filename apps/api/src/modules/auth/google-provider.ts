import * as oidc from 'openid-client';
import type { Config } from '../../config.js';
export const GOOGLE_ISSUER = 'https://accounts.google.com';
export interface LoginChecks {
  verifier: string;
  nonce: string;
  state: string;
}
export interface Identity {
  issuer: string;
  subject: string;
  email: string;
  name: string;
  verified: boolean;
  hostedDomain?: string;
}
export interface IdentityProvider {
  start(checks: LoginChecks): Promise<string>;
  finish(url: URL, checks: LoginChecks): Promise<Identity>;
}
export class GoogleProvider implements IdentityProvider {
  private configuration?: Promise<oidc.Configuration>;
  constructor(
    private readonly config: Config,
    private readonly testingConfiguration?: oidc.Configuration,
  ) {}
  private getConfiguration() {
    if (this.testingConfiguration)
      return Promise.resolve(this.testingConfiguration);
    if (!this.configuration) {
      this.configuration = oidc
        .discovery(
          new URL(GOOGLE_ISSUER),
          this.config.GOOGLE_CLIENT_ID,
          this.config.GOOGLE_CLIENT_SECRET,
          oidc.ClientSecretPost(this.config.GOOGLE_CLIENT_SECRET),
          { timeout: 10, execute: [oidc.enableNonRepudiationChecks] },
        )
        .catch((error: unknown) => {
          this.configuration = undefined;
          throw error;
        });
    }
    return this.configuration;
  }
  async start(checks: LoginChecks) {
    const client = await this.getConfiguration();
    return oidc.buildAuthorizationUrl(client, {
      redirect_uri: `${this.config.APP_ORIGIN}/api/auth/google/callback`,
      scope: 'openid email profile',
      code_challenge: await oidc.calculatePKCECodeChallenge(checks.verifier),
      code_challenge_method: 'S256',
      state: checks.state,
      nonce: checks.nonce,
      prompt: 'select_account',
    }).href;
  }
  async finish(url: URL, checks: LoginChecks): Promise<Identity> {
    const tokens = await oidc.authorizationCodeGrant(
      await this.getConfiguration(),
      url,
      {
        pkceCodeVerifier: checks.verifier,
        expectedState: checks.state,
        expectedNonce: checks.nonce,
        idTokenExpected: true,
      },
    );
    const claims = tokens.claims();
    if (
      !claims ||
      typeof claims.email !== 'string' ||
      typeof claims.sub !== 'string'
    )
      throw new Error('Invalid identity');
    return {
      issuer: claims.iss,
      subject: claims.sub,
      email: claims.email.toLowerCase(),
      name:
        typeof claims.name === 'string'
          ? claims.name.slice(0, 120)
          : 'Treinador',
      verified: claims.email_verified === true,
      hostedDomain: typeof claims.hd === 'string' ? claims.hd : undefined,
    };
  }
}
