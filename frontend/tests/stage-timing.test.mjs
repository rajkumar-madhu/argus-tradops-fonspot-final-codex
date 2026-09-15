import test from 'node:test';
import assert from 'node:assert/strict';
import {formatMicros,logWidth,traceBars,hopQuery} from '../lib/stage-timing.ts';

test('durations read as µs under a millisecond and ms above, missing stays a dash',()=>{
 assert.equal(formatMicros(824.5),'824.5 µs');
 assert.equal(formatMicros(94062.5),'94.06 ms');
 assert.equal(formatMicros(0),'0 µs');
 assert.equal(formatMicros(null),'—');
 assert.equal(formatMicros(Number.NaN),'—');
});

test('log-scale bars keep sub-millisecond stages visible next to a 94 ms stage',()=>{
 const max=96046.4;
 assert.equal(logWidth(max,max),100);
 const small=logWidth(239.6,max);
 assert.ok(small>40&&small<60,`expected a visible mid-width bar, got ${small}`);
 assert.equal(logWidth(null,max),0);
 assert.equal(logWidth(0,max),0);
});

test('trace bars sit at their true offsets and flag a stage covering half the span',()=>{
 const stages=[
  {stage:'46',position:4,duration_us:94062.5,start_us:0,end_us:94062.5},
  {stage:'79',position:1,duration_us:644.2,start_us:94062.5,end_us:94706.7},
 ];
 const [a,b]=traceBars(stages,96046.4);
 assert.equal(a.left,0);
 assert.ok(Math.abs(a.width-97.93)<0.01);
 assert.equal(a.dominant,true);
 assert.ok(Math.abs(b.left-97.93)<0.01);
 assert.equal(b.dominant,false);
 assert.ok(b.width>=0.6,'tiny stages keep a minimum visible width');
});

test('stage links keep the page filters and only change hop parameters',()=>{
 const q=hopQuery({segment:'NSE',limit:'50',hop_instance:'QKBT1'},{hop_order:'26071700000017'});
 const params=new URLSearchParams(q);
 assert.equal(params.get('segment'),'NSE');
 assert.equal(params.get('hop_instance'),'QKBT1');
 assert.equal(params.get('hop_order'),'26071700000017');
 assert.equal(new URLSearchParams(hopQuery({hop_order:'1'},{hop_order:''})).has('hop_order'),false);
});
