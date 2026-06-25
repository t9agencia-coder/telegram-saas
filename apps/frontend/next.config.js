/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  images: {
    domains: ['localhost', 'api.firebot.shop'],
  },
  env: {
    API_URL_INTERNAL: process.env.API_URL_INTERNAL || 'http://localhost:3001',
  },

  // Proxy /api/* → backend (funciona tanto em dev quanto em produção)
  // Em produção na VPS, API_URL_INTERNAL = http://backend:3001 (rede Docker interna)
  async rewrites() {
    const backendUrl = process.env.API_URL_INTERNAL || 'http://localhost:3001';
    return [
      {
        source: '/api/:path*',
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },
}

module.exports = nextConfig
