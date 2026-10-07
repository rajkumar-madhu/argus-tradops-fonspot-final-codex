import test from 'node:test';
import assert from 'node:assert/strict';
import { calendarQuery, shiftIsoDate, ordersDrilldown } from '../lib/calendar.ts';
import { sessionQuery, istParts } from '../lib/file-analytics.ts';
test('calendar drilldown keeps date, status and masked filters',()=>{
 const day={date:'2026-08-24',from_time:'2026-08-23T18:30:00Z',to_time:'2026-08-24T18:29:59.999999Z'};
 const p=new URL(ordersDrilldown(day,'open_pending',{account:'***12',exchange:'NSE',service:'Risk Management'}),'https://example.com').searchParams;
 assert.equal(p.get('calendar_date'),day.date);assert.equal(p.get('status'),'open_pending');assert.equal(p.get('account'),'***12');assert.equal(p.get('service'),'Risk Management');
});
test('calendar query safely encodes filters and actual Excel export',()=>{
 const p=new URLSearchParams(calendarQuery({account:'*** &12',exchange:'',service:'',start:'2026-08-24',end:'2026-08-24'},'2026-08-24','xlsx'));
 assert.equal(p.get('account'),'*** &12');assert.equal(p.get('format'),'xlsx');assert.equal(p.has('exchange'),false);
 assert.equal(shiftIsoDate('2026-03-01',-1),'2026-02-28');
});
test('IST presets convert midnight to previous UTC day and retain filters',()=>{
 const p=new URLSearchParams(sessionQuery({segment:'NSE',q:'ABC',offset:'50'},'2026-08-24','00:00','09:15'));
 assert.equal(p.get('start'),'2026-08-23T18:30:00.000Z');assert.equal(p.get('end'),'2026-08-24T03:45:59.999Z');assert.equal(p.get('segment'),'NSE');assert.equal(p.get('q'),'ABC');assert.equal(p.has('offset'),false);
 assert.deepEqual(istParts(p.get('start')),{date:'2026-08-24',time:'00:00'});
 assert.throws(()=>sessionQuery({},'2026-08-24','12:00','09:00'));
 assert.throws(()=>sessionQuery({},'2026-02-30','00:00','23:59'));
 assert.throws(()=>sessionQuery({},'2026-08-24','24:00','24:00'));
});

const { queueOverlay } = await import('../lib/queue-dashboard.ts');
test('queue overlay preserves gaps and uses a peak rather than summing repeated instances',()=>{
 const a='2026-08-24T03:45:00Z',b='2026-08-24T03:46:00Z';
 const out=queueOverlay([{instance:'NSE',trend:[{time:a,peak:7}]},{instance:'NSE',trend:[{time:a,peak:9}]},{instance:'NFO',trend:[{time:b,peak:0}]}]);
 assert.equal(out.series.length,2);assert.equal(out.points[0].series_0,9);assert.equal(out.points[0].series_1,null);assert.equal(out.points[1].series_1,0);
});

const {sourceBadgeText,hasLiveMarketFeed} = await import('../lib/data-source.ts');
test('database-imported daily observations never receive a live badge',()=>{
 assert.equal(sourceBadgeText('analytics database'),'FILE-BASED');assert.equal(hasLiveMarketFeed('analytics database',10),false);
});
