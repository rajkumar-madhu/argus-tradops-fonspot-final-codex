import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { browserModules } from './helpers/browser-modules.mjs';

async function mount(roles) {
  const effects = [], calls = [];
  const f = browserModules({
    fetch: async (url, init) => { calls.push({ url, init }); return Response.json({ source: 'journal snapshot', orders: 0, records: 0 }); },
    mocks: { react: { useEffect: fn => effects.push(fn), useState: initial => [initial, () => {}] } },
  });
  if (roles) {
    const payload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now()/1000)+300, realm_access: { roles } })).toString('base64url');
    f.load('@/lib/session').setToken(`e30.${payload}.fixture`, 300);
  }
  f.load('@/components/MarketTicker').default({});
  for (const effect of effects) effect();
  await setImmediate();
  return { calls, session: f.load('@/lib/session') };
}
test('public sign-in ticker does not request authenticated data', async () => {
  assert.equal((await mount()).calls.length, 0);
});
test('cross-origin market and overview reads carry the saved bearer token', async () => {
  const { calls, session } = await mount(['trading_ops']);
  assert.equal(calls.length, 2);
  for (const { init } of calls) assert.equal(init.headers.Authorization, `Bearer ${session.getToken()}`);
});
test('an infrastructure role skips the market request it cannot authorize', async () => {
  const { calls } = await mount(['infra_sre']);
  assert.equal(calls.length, 1);
  assert.ok(calls[0].url.endsWith('/api/overview'));
});
