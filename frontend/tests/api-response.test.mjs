import test from 'node:test';
import assert from 'node:assert/strict';
import { browserModules } from './helpers/browser-modules.mjs';

test('invalid JSON and null API bodies become widget errors instead of route exceptions', async () => {
  for (const response of [new Response('<html>proxy</html>'), Response.json(null)]) {
    const f = browserModules({ fetch: async () => response, mocks: { 'next/headers': { cookies: async () => ({ get: () => undefined }) } } });
    const result = await f.load('@/lib/api').getJSON('/api/overview');
    assert.equal(typeof result._error, 'string');
  }
});
test('a zero count and empty list remain successful API data', async () => {
  const f = browserModules({ fetch: async () => Response.json({ count: 0, items: [] }), mocks: { 'next/headers': { cookies: async () => ({ get: () => undefined }) } } });
  const result = await f.load('@/lib/api').getJSON('/api/orders');
  assert.equal(result.count, 0);
  assert.equal(result._error, undefined);
});
