import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {TENANT_COOKIE, TENANT_HEADER, liveTenantId, normalizeTenant, readTenantCookie, switcherModel, tenantCookie, tenantHeaders} from '../lib/tenant.ts';

test('tenant ids are slugs; anything else is dropped, never coerced', () => {
  assert.equal(normalizeTenant(' ACME '), 'acme');
  assert.equal(normalizeTenant('kbc-broking'), 'kbc-broking');
  for (const bad of ['../etc', 'acme;x', '', '-lead', 'a'.repeat(64), null, 42]) assert.equal(normalizeTenant(bad), null, String(bad));
});

test('headers forward only a valid selection', () => {
  assert.deepEqual(tenantHeaders('acme'), {[TENANT_HEADER]: 'acme'});
  assert.deepEqual(tenantHeaders('bad value'), {});
  assert.deepEqual(tenantHeaders(undefined), {});
});

test('cookie round trip', () => {
  assert.equal(readTenantCookie(`a=1; ${TENANT_COOKIE}=kbc; b=2`), 'kbc');
  assert.equal(readTenantCookie(`${TENANT_COOKIE}=..%2Fx`), null);
  assert.equal(readTenantCookie(''), null);
  assert.match(tenantCookie('acme', true), /^tradeops_tenant=acme; Path=\/; Max-Age=\d+; SameSite=Lax; Secure$/);
  assert.throws(() => tenantCookie('a b', false));
});

test('switcher: single-tenant deployments show nothing and never reload', () => {
  const m = switcherModel({multi_tenant: false, current: 'default', items: [{id: 'default', name: 'Default', is_default: true}]}, null);
  assert.deepEqual({show: m.show, adopt: m.adopt, noAccess: m.noAccess}, {show: false, adopt: null, noAccess: false});
});

test('switcher: a user granted one tenant adopts it once, then is stable', () => {
  const payload = {multi_tenant: true, current: 'acme', items: [{id: 'acme', name: 'Acme', is_default: false}]};
  assert.equal(switcherModel(payload, null).adopt, 'acme', 'no cookie yet: store and reload');
  assert.equal(switcherModel(payload, 'acme').adopt, null, 'cookie matches: no loop');
  assert.equal(switcherModel(payload, 'acme').show, false, 'one tenant needs no picker');
});

test('switcher: several tenants show the picker; a stale cookie is replaced', () => {
  const payload = {multi_tenant: true, current: 'default', items: [{id: 'default', name: 'Default', is_default: true}, {id: 'acme', name: 'Acme', is_default: false}]};
  const m = switcherModel(payload, 'gone');
  assert.equal(m.show, true);
  assert.equal(m.adopt, 'default');
});

test('switcher: first visit prefers a live ES client over a journal-primary default', () => {
  const payload = {
    multi_tenant: true,
    current: 'default',
    items: [
      {id: 'default', name: 'Lemonn', is_default: true, journal_primary: true, sources: {elasticsearch: true, journal: true}},
      {id: 'finspot-ind', name: 'Finspot-ind', is_default: false, journal_primary: false, sources: {elasticsearch: true, journal: false}},
    ],
  };
  assert.equal(liveTenantId(payload.items), 'finspot-ind');
  assert.equal(switcherModel(payload, null).adopt, 'finspot-ind', 'no cookie: land on live OMS');
  assert.equal(switcherModel(payload, 'gone').adopt, 'finspot-ind', 'stale cookie: recover to live OMS');
  assert.equal(switcherModel(payload, 'default').adopt, null, 'explicit journal client is kept');
  assert.equal(switcherModel(payload, 'finspot-ind').adopt, null, 'already on live: no loop');
});

test('switcher: no grants is reported, not silently defaulted', () => {
  const m = switcherModel({multi_tenant: true, current: null, items: []}, null);
  assert.equal(m.noAccess, true);
  assert.equal(m.adopt, null);
});

test('constants match the backend', () => {
  // Frontend-only Docker builds have no sibling backend/ tree; skip there.
  // Monorepo / CI checkouts still pin cookie and header names against tenancy.py.
  const path = new URL('../../backend/app/tenancy.py', import.meta.url);
  let py;
  try {
    py = readFileSync(path, 'utf8');
  } catch (err) {
    if (err && err.code === 'ENOENT') return;
    throw err;
  }
  assert.match(py, new RegExp(`TENANT_COOKIE = "${TENANT_COOKIE}"`));
  assert.match(py, new RegExp(`TENANT_HEADER = "${TENANT_HEADER.toLowerCase()}"`));
});

test('every server-side API call forwards the tenant', () => {
  for (const f of ['lib/api.ts', 'app/api/exports/journal/route.ts', 'app/api/exports/latency/route.ts', 'app/api/exports/queues/route.ts']) {
    const src = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
    assert.match(src, /serverApiHeaders\(\)|tenantHeaders\(/, `${f} must send the tenant`);
  }
  assert.match(readFileSync(new URL('../lib/session.ts', import.meta.url), 'utf8'), /tenantHeaders\(/, 'browser authHeaders must send the tenant');
  assert.match(readFileSync(new URL('../lib/stream.ts', import.meta.url), 'utf8'), /searchParams\.set\("tenant"/, 'EventSource must send the tenant');
});
