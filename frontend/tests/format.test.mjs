import test from 'node:test';
import assert from 'node:assert/strict';
import {time24} from '../lib/format.ts';
test('journal time is explicitly IST regardless of host time zone',()=>{
 const previous=process.env.TZ;
 try {
  for(const zone of ['UTC','America/New_York','Asia/Kolkata']) {
   process.env.TZ=zone;
   assert.equal(time24('2026-06-30T03:44:01Z'),'09:14:01');
  }
 } finally { if(previous === undefined) delete process.env.TZ; else process.env.TZ=previous; }
});
