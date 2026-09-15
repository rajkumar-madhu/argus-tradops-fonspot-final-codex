import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// Positions and Trades show quantities, fill counts and per-unit prices only —
// no turnover, traded value, MTM or P&L (product decision, 2026-09-13).
const FILES=['app/positions/page.tsx','app/trades/page.tsx','components/PositionsFlow.tsx'];
const MONEY=/\b(money|inr)\(|\b(turnover|tradedValue|buyValue|sellValue|netMtm|day_pnl)\b|Total MTM|Traded Value|Turnover/;

test('positions and trades render no rupee figures',()=>{
 const hits=[];
 for(const f of FILES){
  const src=readFileSync(new URL(`../${f}`,import.meta.url),'utf8');
  src.split('\n').forEach((line,i)=>{ if(MONEY.test(line)) hits.push(`${f}:${i+1}: ${line.trim().slice(0,90)}`); });
 }
 assert.deepEqual(hits,[],'money rendering found');
});
