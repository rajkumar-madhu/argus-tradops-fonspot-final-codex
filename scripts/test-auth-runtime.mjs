// Real HTTP/JWT integration for scripts/auth-fixture.py and a running frontend.
// Synthetic tokens stay in memory and are never included in reported output.
import assert from 'node:assert/strict';
import { browserModules } from '../frontend/tests/helpers/browser-modules.mjs';

const apiUrl = process.env.AUTH_FIXTURE_API || 'http://127.0.0.1:18103';
const ui = process.env.AUTH_FIXTURE_UI || 'http://localhost:13103';
if (![apiUrl, ui].every(s => ['localhost', '127.0.0.1'].includes(new URL(s).hostname))) throw new Error('Only loopback fixtures are allowed');
const f = browserModules({ fetch, origin: ui, apiUrl });
const oidc = f.load('@/lib/oidc');
const session = f.load('@/lib/session');
const results = [];
async function check(name, run) {
  try { await run(); results.push({ name, passed: true }); console.log('PASS', name); }
  catch { results.push({ name, passed: false }); console.log('FAIL', name); }
}
async function signIn(identity) {
  await oidc.login('/dashboard');
  const authorization = new URL(f.location.href);
  authorization.pathname = '/fixture/authorize';
  authorization.searchParams.set('identity', identity);
  const result = await fetch(authorization, { redirect: 'manual' });
  assert.equal(result.status, 307);
  return oidc.completeLogin(new URL(result.headers.get('location')).searchParams);
}
function authenticatedFetch(path) {
  return fetch(`${ui}${path}`, { headers: { cookie: f.document.cookie }, redirect: 'manual', signal: AbortSignal.timeout(45000) });
}
await check('unauthenticated direct dashboard redirects to sign-in', async () => {
  const r = await fetch(`${ui}/dashboard`, { redirect: 'manual' });
  assert.equal(r.status, 307);
  assert.equal(new URL(r.headers.get('location')).pathname, '/signin');
});
await check('OIDC PKCE exchange verifies a signed token and returns dashboard', async () => {
  assert.equal(await signIn('super_admin'), '/dashboard');
  assert.ok(session.getToken());
});
await check('authenticated dashboard and refresh render with real API authentication', async () => {
  for (let i = 0; i < 2; i++) {
    const r = await authenticatedFetch('/dashboard');
    assert.equal(r.status, 200);
    const body = await r.text();
    assert.ok(body.includes('Trading Operations Dashboard'));
    assert.ok(!body.includes('Sign in to view this'));
  }
});
const paths = ['/orders', '/order-book', '/trades', '/positions', '/holdings', '/rejections', '/rca', '/market-data', '/exchange', '/sessions', '/risk', '/infra', '/logs', '/incidents', '/reports', '/order-latency', '/queue-monitor', '/data-quality', '/configuration', '/orders/fixture-order', '/infra/fixture-device'];
for (const path of paths) await check(`authenticated route ${path}`, async () => {
  const r = await authenticatedFetch(path);
  assert.equal(r.status, 200);
  const body = await r.text();
  assert.ok(body.length > 1000);
  assert.ok(!body.includes('This view is temporarily unavailable'));
  assert.ok(!body.includes('NEXT_HTTP_ERROR_FALLBACK;500'));
});
async function scenario(mode, run) {
  const setMode = value => fetch(`${apiUrl}/fixture/state`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: value }) });
  assert.equal((await setMode(mode)).status, 200);
  try { await run(); } finally { await setMode('normal'); }
}
await check('dashboard streams a loading state before delayed overview resolves', async () => {
  await scenario('slow-overview', async () => {
    const r = await authenticatedFetch('/dashboard');
    const reader = r.body.getReader();
    const first = await reader.read();
    const initial = new TextDecoder().decode(first.value);
    assert.ok(initial.includes('Loading observations'));
    while (!(await reader.read()).done) { /* Drain the resolved render. */ }
  });
});
await check('empty dashboard keeps zero counts and explicit no-data messages', async () => {
  await scenario('empty', async () => {
    const r = await authenticatedFetch('/dashboard');
    const body = await r.text();
    assert.equal(r.status, 200);
    assert.ok(body.includes('No trend data'));
    assert.ok(body.includes('No rejections'));
    assert.ok(!body.includes('Unable to load overview'));
  });
});
await check('overview failure renders an error instead of false zero data', async () => {
  await scenario('overview-error', async () => {
    const body = await (await authenticatedFetch('/dashboard')).text();
    assert.ok(body.includes('Unable to load overview'));
    assert.ok(body.includes('overview unavailable'));
    assert.ok(!body.includes('TOTAL ORDERS'));
  });
});
await check('auth service outage preserves the session and recovers on refresh', async () => {
  await scenario('auth-unavailable', async () => {
    const r = await authenticatedFetch('/dashboard');
    assert.equal(r.status, 503);
    assert.equal(r.headers.get('set-cookie'), null);
    assert.ok((await r.text()).includes('Your session has not been cleared'));
  });
  assert.equal((await authenticatedFetch('/dashboard')).status, 200);
});
await check('a narrower role sees forbidden rather than a login redirect', async () => {
  await signIn('risk');
  const r = await authenticatedFetch('/orders');
  assert.equal(r.status, 403);
  assert.ok((await r.text()).includes('Permission required'));
});
await check('unassigned authenticated user sees the missing dashboard role', async () => {
  await signIn('unassigned');
  const r = await authenticatedFetch('/dashboard');
  assert.equal(r.status, 403);
  assert.ok((await r.text()).includes('trading_ops'));
});
await check('token for a different audience is rejected before session persistence', async () => {
  session.clearToken();
  await assert.rejects(signIn('wrong-audience'));
  assert.equal(session.getToken(), null);
});
await check('invalid credentials callback produces a safe error', async () => {
  await assert.rejects(signIn('invalid'), /Sign-in was not completed/);
});
await check('logout clears the session and points to the configured public destination', async () => {
  await signIn('trading_ops');
  await oidc.logout();
  assert.equal(session.getToken(), null);
  const url = new URL(f.location.href);
  assert.equal(url.searchParams.get('post_logout_redirect_uri'), `${ui}/signin`);
  assert.equal((await authenticatedFetch('/dashboard')).status, 307);
});
await check('an expired signed token cannot reopen the protected dashboard', async () => {
  await signIn('short');
  await new Promise(resolve => setTimeout(resolve, 9000));
  const r = await authenticatedFetch('/dashboard');
  assert.equal(r.status, 307);
  const url = new URL(r.headers.get('location'));
  assert.equal(url.pathname, '/signin');
  assert.equal(url.searchParams.get('reason'), 'expired');
  session.clearToken();
});
console.log(JSON.stringify({ scope: 'loopback fixture, HTTP and JWT; not browser or UAT login proof', passed: results.filter(x => x.passed).length, failed: results.filter(x => !x.passed).map(x => x.name) }));
process.exitCode = results.some(x => !x.passed) ? 1 : 0;
