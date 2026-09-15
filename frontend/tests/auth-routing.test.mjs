import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server.js';
import { browserModules } from './helpers/browser-modules.mjs';

function fixture(status = 200, roles = ['trading_ops']) {
  const calls = [];
  const f = browserModules({ fetch: async (url, init) => {
    calls.push({ url, init });
    return Response.json({ sub: 'synthetic-user', roles, permissions: [] }, { status });
  } });
  return { ...f, calls, middleware: f.load('@/middleware').middleware };
}
const request = (path = '/dashboard', cookie) => new NextRequest(`https://ui.example.test${path}`, { headers: cookie ? { cookie: `tradeops_token=${cookie}` } : {} });

test('unauthenticated direct dashboard request redirects to signin before rendering', async () => {
  const f = fixture(401);
  const r = await f.middleware(request());
  assert.equal(r.status, 307);
  assert.equal(new URL(r.headers.get('location')).pathname, '/signin');
  assert.equal(new URL(r.headers.get('location')).searchParams.get('returnTo'), '/dashboard');
});
test('a restored session is verified with the API and permits dashboard refresh', async () => {
  const f = fixture();
  const r = await f.middleware(request('/dashboard', 'synthetic-token'));
  assert.equal(r.headers.get('x-middleware-next'), '1');
  assert.equal(f.calls[0].init.headers.Authorization, 'Bearer synthetic-token');
  assert.equal(f.calls[0].url, 'https://api.example.test/api/auth/me');
});
test('expired session redirects safely and clears the stale cookie', async () => {
  const f = fixture(401);
  const r = await f.middleware(request('/orders?lookback=4h', 'expired-fixture'));
  const url = new URL(r.headers.get('location'));
  assert.equal(url.searchParams.get('reason'), 'expired');
  assert.equal(url.searchParams.get('returnTo'), '/orders?lookback=4h');
  assert.match(r.headers.get('set-cookie'), /Max-Age=0/);
});
test('an authenticated user without the route role receives forbidden, never a login loop', async () => {
  const f = fixture(200, ['risk']);
  const r = await f.middleware(request('/orders/fixture-order', 'synthetic-token'));
  assert.equal(r.status, 403);
  assert.ok((await r.text()).includes('Permission required'));
  assert.equal(r.headers.get('location'), null);
});
test('API 403 and 503 remain distinct and neither clears the session', async () => {
  for (const status of [403, 503]) {
    const f = fixture(status);
    const r = await f.middleware(request('/dashboard', 'synthetic-token'));
    assert.equal(r.status, status);
    assert.equal(r.headers.get('set-cookie'), null);
  }
});
test('public pages, callback, APIs, assets and unknown routes never recurse through session verification', async () => {
  const f = fixture(401);
  for (const path of ['/', '/signin', '/signup', '/auth/callback', '/api/auth/me', '/healthz', '/_next/static/test.js', '/does-not-exist']) {
    assert.equal((await f.middleware(request(path))).headers.get('x-middleware-next'), '1');
  }
  assert.equal(f.calls.length, 0);
});
test('every application route and nested resource resolves to the expected guard', () => {
  const f = fixture();
  const { ROLE_ROUTES } = f.load('@/lib/auth');
  const { protectedRoute, safeReturnTo } = f.load('@/lib/auth-routing');
  for (const route of [...Object.values(ROLE_ROUTES).flat(), '/configuration']) {
    if (route !== '*') assert.equal(protectedRoute(route), route);
  }
  assert.equal(protectedRoute('/infra/fixture'), '/infra');
  for (const unsafe of ['//evil.test', '/\\evil.test', 'https://evil.test', '/signin', '/auth/callback', '/dashboard\n']) assert.equal(safeReturnTo(unsafe), '/dashboard');
});
