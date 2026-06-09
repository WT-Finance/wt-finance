import type { NextConfig } from "next";

// Headers de segurança (F10, v4.12). Sóbrios e compatíveis com Next/Recharts:
// HSTS, anti-clickjacking, nosniff e referrer-policy. NÃO incluímos CSP estrita
// nesta versão — o App Router usa estilos/scripts inline (e Recharts gera SVG
// inline), e uma CSP rígida exigiria nonce/refactor amplo; fica como follow-up.
const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
]

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Alinhado ao uso real: o upload via API Route tem limite próprio (50MB
      // vendas / 10MB gerencial); Server Actions só carregam o JSON de linhas
      // parseadas. 200mb era folga excessiva. (F10, v4.12.)
      bodySizeLimit: '25mb',
    },
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
}

export default nextConfig;
