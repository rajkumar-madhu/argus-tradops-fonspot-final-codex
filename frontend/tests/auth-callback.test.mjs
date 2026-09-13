import test from 'node:test';
import assert from 'node:assert/strict';
import { browserModules } from './helpers/browser-modules.mjs';

const cfg = { auth_disabled: false, client_id: 'tradeops-web', token_endpoint: 'https://idp.example.test/token' };
const claims = { sub: 'synthetic-user', exp: Math.floor(Date.now() / 1000) + 300, azp: 'tradeops-web', realm_access: { roles: ['trading_ops'] } };
const token = `e30.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.fixture-signature`;
function fixture(options = {}) {
  const calls = [];
  const browser = browserModules({ rejectCookies: options.rejectCookies, fetch: async (url, init) => {
    calls.push({ url, init });
    if (url.endsWith('/api/auth/config')) return Response.json(cfg);
    if (url === cfg.token_endpoint) return Response.json(options.tokenResponse ?? { access_token: token, expires_in: 300, token_type: 'Bearer' });
    if (url.endsWith('/api/auth/me')) return Response.json(options.meStatus === 401 ? { detail: 'Invalid or expired token' } : { sub: 'synthetic-user', roles: ['trading_ops'], permissions: ['dashboard:read'] }, { status: options.meStatus ?? 200 });
    throw new Error('Unexpected fixture request');
  } });
  browser.storage.set('tradeops.pkce.verifier', 'synthetic-verifier');
  browser.storage.set('tradeops.pkce.verifier.state', 'synthetic-state');
  browser.storage.set('tradeops.pkce.return', options.returnTo ?? '/dashboard');
  return { ...browser, calls, oidc: browser.load('@/lib/oidc'), session: browser.load('@/lib/session') };
}
const search = () => new URLSearchParams({ code: 'synthetic-code', state: 'synthetic-state' });

test('callback verifies the authenticated user before persisting the session and redirecting', async () => {
  const f = fixture();
  assert.equal(await f.oidc.completeLogin(search()), '/dashboard');
  assert.ok(f.calls.some(c => c.url.endsWith('/api/auth/me') && c.init.headers.Authorization === `Bearer ${token}`));
  assert.equal(f.session.getToken(), token);
  assert.equal(f.storage.size, 0);
});
test('a token endpoint 200 is not login success when the backend refuses the token', async () => {
  const f = fixture({ meStatus: 401 });
  await assert.rejects(f.oidc.completeLogin(search()), /session|token|sign.in/i);
  assert.equal(f.session.getToken(), null);
});
test('a rejected cookie produces an actionable error instead of a signed-out dashboard', async () => {
  const f = fixture({ rejectCookies: true });
  await assert.rejects(f.oidc.completeLogin(search()), /cookie|session.*sav|session.*stor/i);
});
test('callback fails closed when stored state is missing', async () => {
  const f = fixture();
  f.storage.delete('tradeops.pkce.verifier.state');
  await assert.rejects(f.oidc.completeLogin(search()), /state|restart/i);
  assert.equal(f.calls.length, 0);
});
test('post-login return destination cannot leave the application', async () => {
  const f = fixture({ returnTo: '//outside.example.test' });
  assert.equal(await f.oidc.completeLogin(search()), '/dashboard');
});
test('malformed token response fails without persisting a cookie', async () => {
  const f = fixture({ tokenResponse: { access_token: { invalid: true }, expires_in: 300 } });
  await assert.rejects(f.oidc.completeLogin(search()), /token|session/i);
  assert.equal(f.session.getToken(), null);
});
test('session survives a new page module instance and logout clears it', async () => {
  const f = fixture();
  await f.oidc.completeLogin(search());
  assert.equal(f.session.isExpired(f.session.decodeSession(f.session.getToken())), false);
  f.session.clearToken();
  assert.equal(f.session.getToken(), null);
});
