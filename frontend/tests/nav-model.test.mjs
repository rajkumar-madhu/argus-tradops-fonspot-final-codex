import test from 'node:test';
import assert from 'node:assert/strict';
import { buildNav, togglePinned, NAV_GROUPS, MAX_PINNED } from '../lib/nav-model.ts';

const labels = (r, group) => r.groups.find(g => g.label === group)?.items.map(i => i.label) ?? [];
const names = r => r.groups.map(g => g.label);

test('every route carries an icon and a unique href', () => {
  const hrefs = NAV_GROUPS.flatMap(g => g.items.map(i => i.href));
  assert.equal(new Set(hrefs).size, hrefs.length);
  assert.ok(NAV_GROUPS.flatMap(g => g.items).every(i => i.icon && i.label));
});

test('role filtering hides routes the token cannot see', () => {
  const r = buildNav({ visible: href => href === '/dashboard' || href === '/rejections' });
  assert.deepEqual(names(r), ['Desk', 'Investigate']);
  assert.deepEqual(labels(r, 'Desk'), ['Overview']);
});

test('filtering matches case-insensitively and reports per-group hit counts', () => {
  const r = buildNav({ query: '  ORDER  ' });
  assert.deepEqual(labels(r, 'Desk'), ['Live Orders', 'Order Book']);
  assert.equal(r.groups.find(g => g.label === 'Desk').matchCount, 2);
  assert.equal(r.noMatches, false);
});

test('an unmatched filter yields no groups and flags the empty state', () => {
  const r = buildNav({ query: 'zzz' });
  assert.deepEqual(r.groups, []);
  assert.equal(r.noMatches, true);
});

test('filtering reopens a collapsed group so a hit is never hidden', () => {
  const r = buildNav({ query: 'holdings', closed: { Desk: true } });
  assert.deepEqual(labels(r, 'Desk'), ['Holdings']);
  assert.equal(r.groups[0].open, true);
});

test('a collapsed group hides its rows but reports how many', () => {
  const r = buildNav({ closed: { Desk: true } });
  const desk = r.groups.find(g => g.label === 'Desk');
  assert.deepEqual(desk.items, []);
  assert.equal(desk.hiddenCount, 6);
  assert.equal(desk.open, false);
});

test('pinned leads the rail and marks its rows in place', () => {
  const r = buildNav({ pinned: ['/rejections', '/dashboard'] });
  assert.equal(r.groups[0].label, 'Pinned');
  assert.equal(r.groups[0].isPinned, true);
  // Pinned follows NAV_GROUPS order, not the order routes were pinned in.
  assert.deepEqual(r.groups[0].items.map(i => i.label), ['Overview', 'Rejections']);
  assert.equal(labels(r, 'Desk').includes('Overview'), true);
  assert.equal(r.groups.find(g => g.label === 'Desk').items[0].pinned, true);
});

test('pinned never duplicates a route the role cannot see', () => {
  const r = buildNav({ pinned: ['/incidents'], visible: href => href !== '/incidents' });
  assert.equal(names(r).includes('Pinned'), false);
});

test('pinned is suppressed while filtering and while collapsed', () => {
  assert.equal(names(buildNav({ pinned: ['/dashboard'], query: 'over' })).includes('Pinned'), false);
  assert.equal(names(buildNav({ pinned: ['/dashboard'], collapsed: true })).includes('Pinned'), false);
});

test('the collapsed rail still lists every visible route exactly once', () => {
  const r = buildNav({ pinned: ['/dashboard', '/orders'], collapsed: true });
  const hrefs = r.groups.flatMap(g => g.items.map(i => i.href));
  assert.equal(new Set(hrefs).size, hrefs.length);
  assert.equal(hrefs.length, NAV_GROUPS.flatMap(g => g.items).length);
});

test('pinning toggles, preserves order and caps at MAX_PINNED', () => {
  assert.deepEqual(togglePinned(['/a'], '/b'), ['/a', '/b']);
  assert.deepEqual(togglePinned(['/a', '/b'], '/a'), ['/b']);
  const full = Array.from({ length: MAX_PINNED }, (_, i) => `/r${i}`);
  const next = togglePinned(full, '/new');
  assert.equal(next.length, MAX_PINNED);
  assert.equal(next.at(-1), '/new');
  assert.equal(next.includes('/r0'), false);
});

// The rail is filtered by ROLE_ROUTES at runtime, so a route listed here but
// absent from every role is invisible to everyone except super_admin — which
// looks like a broken link rather than a permissions decision.
import { ROLE_ROUTES } from '../lib/auth.ts';

// Routes only super_admin reaches, via the '*' wildcard. Listed explicitly so
// adding a route to the rail and forgetting to grant it fails loudly instead of
// rendering a link that 403s for every role but one.
const ADMIN_ONLY = ['/configuration'];

test('every rail route is granted to a role, or is deliberately admin-only', () => {
  const granted = new Set(Object.values(ROLE_ROUTES).flat().filter(r => r !== '*'));
  const orphans = NAV_GROUPS
    .flatMap(g => g.items.map(i => i.href))
    .filter(href => !granted.has(href) && !ADMIN_ONLY.includes(href));
  assert.deepEqual(orphans, [], `routes no role can see: ${orphans.join(', ')}`);
});

test('the admin-only list stays honest — none of them is granted to a named role', () => {
  const granted = new Set(Object.values(ROLE_ROUTES).flat().filter(r => r !== '*'));
  for (const href of ADMIN_ONLY) {
    assert.equal(granted.has(href), false, `${href} is granted to a role; drop it from ADMIN_ONLY`);
  }
});
