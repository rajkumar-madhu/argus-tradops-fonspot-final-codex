import test from 'node:test';
import assert from 'node:assert/strict';
import {holding,holdingSegment,summary,allocation,movers,cash,signedCash,signedPct,tone} from '../lib/holdings.ts';

const ALPHA={symbol:'ALPHA-EQ',exchange:'NSE',qty:500,avg_price:118.2,ltp:126.2,value:63100,pnl_pct:6.8};
const GAMMA={symbol:'GAMMA-EQ',exchange:'NSE',qty:200,avg_price:412,ltp:405.5,value:81100,pnl_pct:-1.6};

test('segments come from the exchange code',()=>{
 assert.equal(holdingSegment('NSE'),'Equity');
 assert.equal(holdingSegment('nfo'),'F&O');
 assert.equal(holdingSegment('CDS'),'Currency');
 assert.equal(holdingSegment('MCX'),'Commodity');
 assert.equal(holdingSegment(undefined),'Equity');
});

test('derived figures exist only when every input exists',()=>{
 const a=holding(ALPHA);
 assert.equal(a.investment,59100);
 assert.equal(a.unrealized,4000);
 const bare=holding({symbol:'X',exchange:'NSE',qty:10});
 assert.equal(bare.value,null);
 assert.equal(bare.investment,null);
 assert.equal(bare.unrealized,null);
 assert.equal(bare.pnl_pct,null);
 assert.equal(holding({qty:10,ltp:5}).value,50,'value falls back to LTP × qty');
});

test('summary keeps missing figures null instead of zero',()=>{
 const s=summary([holding(ALPHA),holding(GAMMA)]);
 assert.equal(s.count,2);
 assert.equal(s.investment,141500);
 assert.equal(s.value,144200);
 assert.equal(s.unrealized,2700);
 assert.ok(Math.abs(s.unrealizedPct-1.908)<0.001);
 assert.equal(s.realized,null,'no row carries realized P&L');
 assert.equal(s.dayPnl,null,'no row carries day P&L');
 const empty=summary([]);
 for(const k of ['investment','value','unrealized','unrealizedPct','realized','dayPnl','exposure'])assert.equal(empty[k],null,k);
});

test('allocation groups current value and skips rows without one',()=>{
 const rows=[holding(ALPHA),holding(GAMMA),holding({symbol:'F',exchange:'NFO',qty:1,ltp:100}),holding({symbol:'N',exchange:'MCX',qty:1})];
 assert.deepEqual(allocation(rows,'segment').map(r=>r.label),['Equity','F&O']);
 assert.deepEqual(allocation(rows,'sector'),[],'no sector field means no sector bars');
});

test('movers split on P&L % and ignore unpriced rows',()=>{
 const {gainers,losers}=movers([holding(ALPHA),holding(GAMMA),holding({symbol:'Q',qty:1})]);
 assert.deepEqual(gainers.map(r=>r.symbol),['ALPHA-EQ']);
 assert.deepEqual(losers.map(r=>r.symbol),['GAMMA-EQ']);
});

test('formatters render a dash for missing figures, never 0.00',()=>{
 assert.equal(cash(null),'—');
 assert.equal(cash(124350),'1,24,350.00');
 assert.equal(signedCash(2700),'+2,700.00');
 assert.equal(signedCash(-320.5),'-320.50');
 assert.equal(signedCash(null),'—');
 assert.equal(signedPct(6.8),'+6.80%');
 assert.equal(signedPct(null),'—');
 assert.equal(tone(-1),'text-red');
 assert.equal(tone(null),'');
});
