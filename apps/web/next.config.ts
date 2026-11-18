import type { NextConfig } from 'next';
const config: NextConfig = {
  poweredByHeader: false,
  // Callbacks OAuth carregam código/state na URL; não registrar requests do dev server.
  logging: false,
  // Regras permanentes do projeto são mantidas no AGENTS.md da raiz.
  agentRules: false,
  async rewrites() {
    return [
      { source: '/api/:path*', destination: 'http://127.0.0.1:3001/:path*' },
    ];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
    ];
  },
};
export default config;
