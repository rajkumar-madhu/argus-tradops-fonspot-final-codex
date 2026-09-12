import {fileURLToPath} from 'node:url';

// Response headers for every page. No CSP here: Next.js dev/HMR and the
// inline runtime config script would need nonces; the API sets its own strict
// policy for JSON responses.
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'no-referrer' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
];

export default {
  outputFileTracingRoot: fileURLToPath(new URL('.', import.meta.url)),
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};
