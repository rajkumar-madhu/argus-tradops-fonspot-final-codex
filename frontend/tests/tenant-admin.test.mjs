import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server.js';
import {adminErrorText, draftPayload} from '../lib/tenant-admin.ts';
import { browserModules } from './helpers/browser-modules.mjs';

test('draft payload trims and omits empty optional fields', () => {
  assert.deepEqual(
    draftPayload({id: ' Acme ', name: ' Acme Broking ', es_url: ' https://es.acme ', credentials_ref: 'ACME', journal_path: '  ', es_verify_certs: true}),
    {id: 'acme', name: 'Acme Broking', es_verify_certs: true, es_url: 'https://es.acme', credentials_ref: 'acme'},
  );
});

test('admin errors are operator-readable', () => {
  assert.match(adminErrorText(403, {}), /super_admin/);
  assert.equal(adminErrorText(422, {detail: {errors: ['a', 'b']}}), 'a; b');
  assert.match(adminErrorText(409, {detail: 'Multi-tenancy is not enabled.'}), /not enabled/);
  assert.equal(adminErrorText(500, null), 'The API returned 500.');
});

function middlewareAs(roles, status = 200) {
  const f = browserModules({ fetch: async () => Response.json({ sub: 'synthetic-user', roles, permissions: [] }, { status }) });
  return f.load('@/middleware').middleware;
}
const request = (cookie) => new NextRequest('https://ui.example.test/admin/tenants', { headers: cookie ? { cookie: `tradeops_token=${cookie}` } : {} });

test('the Clients page is authenticated by the middleware before it renders', async () => {
  const r = await middlewareAs([], 401)(request());
  assert.equal(r.status, 307);
  assert.equal(new URL(r.headers.get('location')).searchParams.get('returnTo'), '/admin/tenants');
});

test('only super_admin passes the middleware for the Clients page', async () => {
  assert.equal((await middlewareAs(['super_admin'])(request('t'))).headers.get('x-middleware-next'), '1');
  for (const role of ['trading_ops', 'risk', 'infra_sre', 'auditor']) {
    assert.equal((await middlewareAs([role])(request('t'))).status, 403, role);
  }
});
