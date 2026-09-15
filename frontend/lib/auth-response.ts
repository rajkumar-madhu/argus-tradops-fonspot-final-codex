import { ROLE_ROUTES } from './auth';

/** Small standalone guard response: Next App Router rewrites can lose a 403/503. */
export function authResponseHtml(status: 403 | 503, route: string): string {
  const roles = Object.entries(ROLE_ROUTES).filter(([, paths]) => paths.includes('*') || paths.includes(route)).map(([role]) => role).join(', ');
  const title = status === 403 ? 'Access to this view is restricted' : 'Session verification is unavailable';
  const heading = status === 403 ? 'Permission required' : 'Please try again';
  // Only fixed copy and role names from the source allowlist enter this document.
  const message = status === 403
    ? `Your session is signed in, but does not grant access to this view. Ask your administrator for an appropriate Argus TradeOps role: ${roles}. Signing in again does not add permissions.`
    : 'The API could not verify access to this view. Your session has not been cleared. Refresh this page to retry, or contact your administrator if the problem continues.';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · Argus TradeOps</title>
    <style>:root{--ink:#20262d;--muted:#53606d;--paper:#f5f5f3;--brand-ink:#765015}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:1rem/1.65 system-ui,sans-serif}main{max-width:44rem;margin:10vh auto;padding:2rem}h1{font-family:Georgia,serif;line-height:1.2}p{color:var(--muted)}a{color:var(--brand-ink);font-weight:600;display:inline-block;margin:0 1rem 1rem 0}section{background:white;padding:2rem;border:1px solid #d9dddf;border-radius:.5rem}</style></head>
    <body><main><a href="/">Argus TradeOps</a><h1>${title}</h1><section role="alert"><h2>${heading}</h2><p>${message}</p><a href="/dashboard">${status === 503 ? 'Retry operations overview' : 'Operations overview'}</a><a href="/signin">Sign in with another account</a></section></main></body></html>`;
}
