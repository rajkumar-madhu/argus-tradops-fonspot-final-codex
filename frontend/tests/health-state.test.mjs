import test from 'node:test';
import assert from 'node:assert/strict';
import {healthTone} from '../lib/health-state.ts';
test('negative health states never classify as success',()=>{
 for(const state of ['Disconnected','Unhealthy','Unavailable','failed'])assert.equal(healthTone(state),'bad');
 for(const state of ['Connected','Healthy','Ready'])assert.equal(healthTone(state),'good');
 assert.equal(healthTone('unknown'),'neutral');
});
