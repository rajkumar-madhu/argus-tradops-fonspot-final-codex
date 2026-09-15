import test from 'node:test';
import assert from 'node:assert/strict';
import { matchScore, paletteCommands, pushRecent, ROUTE_KEYWORDS, MAX_RECENT } from '../lib/command-palette.ts';
import { NAV_GROUPS } from '../lib/nav-model.ts';

const routes = NAV_GROUPS.flatMap((g) => g.items);
const hrefs = (cmds) => cmds.map((c) => c.href);

test('every route has palette keywords and every keyword names a real route', () => {
  const known = new Set(routes.map((r) => r.href));
  assert.deepEqual(Object.keys(ROUTE_KEYWORDS).filter((h) => !known.has(h)), []);
  assert.deepEqual(routes.filter((r) => !ROUTE_KEYWORDS[r.href]).map((r) => r.href), []);
});

test('match score prefers exact, prefix, word prefix, substring, subsequence', () => {
  assert.equal(matchScore('Live Orders', 'live orders'), 100);
  assert.equal(matchScore('Live Orders', 'liv'), 80);
  assert.equal(matchScore('Live Orders', 'ord'), 60);
  assert.equal(matchScore('Rejections', 'ject'), 40);
  assert.equal(matchScore('Exchange Health', 'exh'), 10);
  assert.equal(matchScore('Trades', 'zz'), 0);
});

test('empty query lists recents first, then every other visible route once', () => {
  const cmds = paletteCommands({ query: '', routes, recent: ['/risk', '/nope', '/logs'] });
  assert.deepEqual(hrefs(cmds).slice(0, 2), ['/risk', '/logs']);
  assert.equal(cmds[0].kind, 'recent');
  assert.equal(new Set(hrefs(cmds)).size, routes.length);
});

test('keywords find routes whose label does not contain the word', () => {
  assert.equal(paletteCommands({ query: 'yel', routes })[0].href, '/exchange');
  assert.equal(paletteCommands({ query: 'latency', routes })[0].href, '/order-latency');
  // A label hit outranks a keyword hit of the same strength.
  assert.equal(paletteCommands({ query: 'risk', routes })[0].href, '/risk');
});

test('an order number offers RCA and Live Orders lookups before routes', () => {
  const cmds = paletteCommands({ query: '26063000012345', routes });
  assert.deepEqual(hrefs(cmds).slice(0, 2), ['/rca?order_id=26063000012345', '/orders?order=26063000012345']);
  assert.equal(cmds.at(-1).href, '/logs?q=26063000012345');
});

test('commands respect the role allowlist, lookups included', () => {
  const visible = (h) => h === '/logs' || h === '/infra';
  const cmds = paletteCommands({ query: '26063000012345', routes, visible });
  assert.deepEqual(hrefs(cmds), ['/logs?q=26063000012345']);
  assert.deepEqual(hrefs(paletteCommands({ query: '', routes, visible, recent: ['/rca'] })), ['/infra', '/logs']);
});

test('free text ends with an encoded journal search', () => {
  const cmds = paletteCommands({ query: 'RMS & margin', routes });
  assert.equal(cmds.at(-1).href, '/logs?q=RMS%20%26%20margin');
});

test('recent list dedupes, drops the query string and caps its length', () => {
  let r = [];
  for (const h of ['/a', '/b', '/a?x=1', '/c', '/d', '/e', '/f']) r = pushRecent(r, h);
  assert.deepEqual(r, ['/f', '/e', '/d', '/c', '/a']);
  assert.equal(r.length, MAX_RECENT);
});
