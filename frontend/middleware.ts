import { NextRequest, NextResponse } from 'next/server';
import { protectedRoute, safeReturnTo } from '@/lib/auth-routing';
import { canSee } from '@/lib/auth';
import { TOKEN_COOKIE } from '@/lib/session-shared';
import { serverRuntimeConfig } from '@/lib/runtime';
import { authResponseHtml } from '@/lib/auth-response';

/** Authenticate at request time, before protected pages fetch or render data. */
export async function middleware(request: NextRequest) {
  const route = protectedRoute(request.nextUrl.pathname);
  if (!route) return NextResponse.next();
  const returnTo = safeReturnTo(`${request.nextUrl.pathname}${request.nextUrl.search}`);
  const token = request.cookies.get(TOKEN_COOKIE)?.value;
  const denied = (status: 403 | 503) => new NextResponse(authResponseHtml(status, route), {
    status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer',
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains' },
  });
  const unavailable = () => denied(503);
  try {
    const base = process.env.INTERNAL_API_URL || serverRuntimeConfig().apiUrl;
    const result = await fetch(`${base}/api/auth/me`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      cache: 'no-store', signal: AbortSignal.timeout(10000),
    });
    if (result.status === 401) {
      const url = new URL('/signin', request.url);
      url.searchParams.set('returnTo', returnTo);
      if (token) url.searchParams.set('reason', 'expired');
      const response = NextResponse.redirect(url);
      response.cookies.set(TOKEN_COOKIE, '', { path: '/', maxAge: 0, secure: request.nextUrl.protocol === 'https:', sameSite: 'lax' });
      return response;
    }
    if (!result.ok && result.status !== 403) return unavailable();
    const user = result.ok ? await result.json() : null;
    if (result.ok && (!user || typeof user.sub !== 'string' || !Array.isArray(user.roles))) return unavailable();
    if (result.status === 403 || !canSee(route, user.roles)) {
      return denied(403);
    }
    return NextResponse.next();
  } catch {
    return unavailable();
  }
}

// Public authentication, backend/proxy API routes and static assets must never
// recurse through the guard. protectedRoute also leaves unknown pages to 404.
export const config = {
  matcher: ['/((?!api/|auth/|_next/|favicon.ico|icon.svg|healthz).*)'],
};
