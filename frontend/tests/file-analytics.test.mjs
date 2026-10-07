import test from 'node:test';
import assert from 'node:assert/strict';
import {activeSession,earlyWindowSpike,fileQuery,instancePrefix,istDate,metric,queuePrefixes,sessionRange,spansOrdersOfMagnitude,suggestedSessionDate,utcDateTimeLocal} from '../lib/file-analytics.ts';
import {sourceBadgeText,hasLiveMarketFeed} from '../lib/data-source.ts';
test('file measurements retain zero, hide missing and nonfinite values',()=>{
 assert.equal(metric(0,'ms'),'0 ms');assert.equal(metric(null),'—');assert.equal(metric(NaN),'—');
});
test('export and page query preserve server filters and discard unsafe parameters',()=>{
 const p=new URLSearchParams(fileQuery({segment:'NSE',q:'A&B',path:'/etc/passwd',offset:'50'},{offset:''}));
 assert.equal(p.get('segment'),'NSE');assert.equal(p.get('q'),'A&B');assert.equal(p.has('path'),false);assert.equal(p.has('offset'),false);
});
test('IST session windows are offset instants and round-trip through UTC',()=>{
 const range=sessionRange('2026-02-16','pre-open');
 assert.deepEqual(range,{start:'2026-02-16T08:45:00+05:30',end:'2026-02-16T09:15:00+05:30'});
 assert.equal(sessionRange('16-02-2026','pre-open'),null);
 assert.equal(sessionRange('2026-02-16','nope'),null);
 assert.equal(new URLSearchParams(fileQuery({start:range.start})).get('start'),'2026-02-16T08:45:00+05:30');
 assert.equal(utcDateTimeLocal(range.start),'2026-02-16T03:15');
 assert.equal(istDate('2026-02-16T03:15:00Z'),'2026-02-16');
 assert.equal(activeSession('2026-02-16T03:15:00Z','2026-02-16T03:45:00Z'),'pre-open');
 assert.equal(suggestedSessionDate(['2026-02-16T10:00:00Z','2026-02-15T20:00:00Z','']), '2026-02-16');
 assert.equal(suggestedSessionDate([null,'not-a-time']),'');
});
test('queue prefixes keep the four exchanges and add any other leading token',()=>{
 assert.equal(instancePrefix('NSE-5864'),'NSE');
 assert.equal(instancePrefix('BSE'),'BSE');
 assert.deepEqual(queuePrefixes(['NSE-5864','MCX-1','BSE']),['NSE','NFO','BSE','BFO','MCX']);
});
test('log scale and early-window spikes follow the samples',()=>{
  assert.equal(spansOrdersOfMagnitude([100,900]),false);
  assert.equal(spansOrdersOfMagnitude([100,1000]),true);
  const calm=Array.from({length:8},(_,i)=>({time:new Date(Date.parse('2026-09-07T03:30:00Z')+i*300000).toISOString(),value:[4000,4500,5000,6000,5500,4800,4200,4100][i]}));
  assert.equal(earlyWindowSpike(calm),null);
  const spiked=calm.map((point,i)=>i<2?{...point,value:200000}:point);
  const spike=earlyWindowSpike(spiked);
  assert.equal(spike?.earlyMax,200000);
  assert.ok(spike && spike.laterMedian>0 && spike.earlyMax>=spike.laterMedian*10);
});
test('CSV snapshot cannot advertise a live feed',()=>{
 assert.equal(sourceBadgeText('csv snapshot'),'FILE-BASED');assert.equal(hasLiveMarketFeed('csv snapshot',10),false);
});
