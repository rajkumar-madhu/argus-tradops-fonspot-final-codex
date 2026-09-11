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
