// Identidades sintéticas fixas. Nunca são associadas ao issuer Google.
export const DEMO_ISSUER = 'urn:balducore:demo';
export const DEMO_ACCOUNTS = {
  '1': {
    issuer: DEMO_ISSUER,
    subject: 'trainer-1',
    name: 'Treinador Demo 1',
    email: 'demo1@balducore.test',
    verified: false,
  },
  '2': {
    issuer: DEMO_ISSUER,
    subject: 'trainer-2',
    name: 'Treinador Demo 2',
    email: 'demo2@balducore.test',
    verified: false,
  },
} as const;
