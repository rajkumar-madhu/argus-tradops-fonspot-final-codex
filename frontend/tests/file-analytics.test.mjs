import test from 'node:test';
import assert from 'node:assert/strict';
import {metric,fileQuery} from '../lib/file-analytics.ts';
import {sourceBadgeText,hasLiveMarketFeed} from '../lib/data-source.ts';
test('file measurements retain zero, hide missing and nonfinite values',()=>{
 assert.equal(metric(0,'ms'),'0 ms');assert.equal(metric(null),'—');assert.equal(metric(NaN),'—');
});
test('export and page query preserve server filters and discard unsafe parameters',()=>{
 const p=new URLSearchParams(fileQuery({segment:'NSE',q:'A&B',path:'/etc/passwd',offset:'50'},{offset:''}));
 assert.equal(p.get('segment'),'NSE');assert.equal(p.get('q'),'A&B');assert.equal(p.has('path'),false);assert.equal(p.has('offset'),false);
});
test('CSV snapshot cannot advertise a live feed',()=>{
 assert.equal(sourceBadgeText('csv snapshot'),'FILE-BASED');assert.equal(hasLiveMarketFeed('csv snapshot',10),false);
});
