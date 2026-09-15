import test from 'node:test';
import assert from 'node:assert/strict';
import {apiError,apiErrorGuidance} from '../lib/api-result.ts';

test('a signed-out user is told to sign in, not to check the API',()=>{
 const g=apiErrorGuidance({_error:'Not signed in (/api/overview)',_status:401});
 assert.equal(g.kind,'signed-out');
 assert.match(g.body,/sign in/i);
 assert.doesNotMatch(g.body,/running|reachable|8001/);
});

test('a missing role names the roles that grant access',()=>{
 const g=apiErrorGuidance({_error:'Your role does not grant access to this view (/api/rca)',_status:403});
 assert.equal(g.kind,'forbidden');
 assert.match(g.body,/trading_ops|auditor/);
});

test('a 403 with the API detail names the permission, the granting roles and the client',()=>{
 const g=apiErrorGuidance({_error:'Your role does not grant access to this view (/api/orders)',_status:403,
  _forbidden:{permission:'orders:read',granted_by:['auditor','super_admin','trading_ops'],app_roles:[],client_id:'tradeops-web'}});
 assert.equal(g.kind,'forbidden');
 assert.match(g.body,/orders:read/);
 assert.match(g.body,/no TradeOps role/);
 assert.match(g.body,/tradeops-web/);
 assert.match(g.body,/auditor, super_admin or trading_ops/);
 assert.match(g.body,/sign in again/i);
});

test('a 403 for a user who holds a narrower role says which one',()=>{
 const g=apiErrorGuidance({_error:'x',_status:403,
  _forbidden:{permission:'orders:read',granted_by:['auditor','trading_ops'],app_roles:['risk'],client_id:'tradeops-web'}});
 assert.match(g.body,/Your token has risk/);
 assert.doesNotMatch(g.body,/no TradeOps role/);
});

test('forbiddenDetail keeps only a well-formed API detail',async()=>{
 const {forbiddenDetail}=await import('../lib/api-result.ts');
 assert.equal(forbiddenDetail({detail:'Insufficient permission'}),undefined,'an older API sends a bare string');
 assert.equal(forbiddenDetail(null),undefined);
 const d=forbiddenDetail({detail:{permission:'orders:read',granted_by:['auditor'],app_roles:['risk'],client_id:'tradeops-web',extra:1}});
 assert.deepEqual(d,{permission:'orders:read',granted_by:['auditor'],app_roles:['risk'],client_id:'tradeops-web'});
});

test('a genuine failure keeps the reason and never names a developer port',()=>{
 const g=apiErrorGuidance({_error:'API 502 (/api/overview)',_status:502});
 assert.equal(g.kind,'failed');
 assert.match(g.body,/API 502/);
 assert.doesNotMatch(g.body,/8001/);
 assert.equal(apiErrorGuidance({_error:'fetch failed'}).kind,'failed','network errors carry no status');
});

test('no error means no guidance',()=>{
 assert.equal(apiErrorGuidance({}),null);
 assert.equal(apiErrorGuidance(null),null);
 assert.equal(apiError({_error:'x'}),'x');
});
