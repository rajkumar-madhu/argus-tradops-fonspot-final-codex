import test from 'node:test';
import assert from 'node:assert/strict';
import {tokenRoles} from '../lib/session-shared.ts';

// The backend (auth._roles) counts realm roles plus roles on its own client only.
// The rail must agree, or it links to pages the API will refuse with 403.
test('roles on another client do not count, as on the backend',()=>{
 const claims={azp:'tradeops-web',realm_access:{roles:['offline_access']},
  resource_access:{'tradeops-web':{roles:['risk']},'grafana':{roles:['super_admin']},'account':{roles:['view-profile']}}};
 assert.deepEqual(tokenRoles(claims).sort(),['offline_access','risk']);
});

test('realm roles count even without client roles',()=>{
 assert.deepEqual(tokenRoles({azp:'tradeops-web',realm_access:{roles:['auditor']}}),['auditor']);
});

test('a token without azp contributes no client roles',()=>{
 assert.deepEqual(tokenRoles({resource_access:{'tradeops-web':{roles:['auditor']}}}),[]);
});

test('malformed claims yield no roles',()=>{
 assert.deepEqual(tokenRoles(null),[]);
 assert.deepEqual(tokenRoles({realm_access:{roles:'auditor'},azp:'x',resource_access:{x:{roles:null}}}),[]);
});
