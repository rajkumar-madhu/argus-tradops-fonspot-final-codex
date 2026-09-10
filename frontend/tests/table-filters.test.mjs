import test from 'node:test';
import assert from 'node:assert/strict';
import { filterRows, sortRows, csvCell } from '../lib/table-filters.ts';
const rows = [
 {id:'a',exchange:'NSE',side:'BUY',user:'USER***',qty:0,active:false,time:'2026-09-07T09:00:00Z'},
 {id:'b',exchange:'BSE',side:'SELL',user:'OTHER***',qty:10,active:true,time:'2026-09-07T10:00:00Z'},
 {id:'c',exchange:'NSE',side:'SELL',user:'USER***',qty:2,time:null},
];
test('combines exact facets and case-insensitive search',()=>assert.deepEqual(filterRows(rows,{query:'user',facets:{exchange:'NSE',side:'BUY'}}).map(r=>r.id),['a']));
test('does not discard zero or false searchable values',()=>{assert.equal(filterRows(rows,{query:'false'}).length,1);assert.equal(filterRows(rows,{facets:{qty:'0'}}).length,1)});
test('trims whitespace and matches array facets',()=>assert.equal(filterRows([{segments:['NSE','NFO']}],{query:' nfo ',facets:{segments:'NFO'}}).length,1));
test('unknown query returns no rows, reset restores all rows',()=>{assert.equal(filterRows(rows,{query:'no-match'}).length,0);assert.equal(filterRows(rows,{}).length,3)});
test('date bounds are inclusive and missing dates excluded only during date filter',()=>{assert.deepEqual(filterRows(rows,{timeKey:'time',from:'2026-09-07T09:00:00Z',to:'2026-09-07T09:00:00Z'}).map(r=>r.id),['a']);assert.equal(filterRows(rows,{timeKey:'time'}).length,3)});
test('invalid and inverted date ranges match no rows',()=>{assert.equal(filterRows(rows,{timeKey:'time',from:'bad'}).length,0);assert.equal(filterRows(rows,{timeKey:'time',from:'2026-09-08',to:'2026-09-07'}).length,0)});
test('numeric sort does not mutate source and missing values stay last',()=>{const r=[{q:10},{q:null},{q:2},{q:0}];assert.deepEqual(sortRows(r,'q','asc').map(x=>x.q),[0,2,10,null]);assert.deepEqual(sortRows(r,'q','desc').map(x=>x.q),[10,2,0,null]);assert.equal(r[0].q,10)});
test('CSV escapes quotes and formula text while preserving numeric values',()=>{assert.equal(csvCell('a,"b"'),'"a,""b"""');assert.equal(csvCell('=1+1'),'"\'=1+1"');assert.equal(csvCell(' \t@SUM(A1)'),'"\' \t@SUM(A1)"');assert.equal(csvCell(-12),'"-12"')});
