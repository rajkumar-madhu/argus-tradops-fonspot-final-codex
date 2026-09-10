import test from 'node:test';
import assert from 'node:assert/strict';
import { flowKpis, flowTrend, instrumentFlow, segmentFlow } from '../lib/positions-flow.ts';

const f = (extra) => ({ exchange: 'NSE', symbol: 'ITC-EQ', side: 'BUY', qty: 10, price: 100, time: '2026-06-30T03:44:10Z', ...extra });

test('flow KPIs split buy and sell value and count instruments', () => {
  const k = flowKpis([f({}), f({ side: 'SELL', qty: 5, price: 110 }), f({ symbol: 'SBIN-EQ' })]);
  assert.equal(k.fills, 3);
  assert.equal(k.buyValue, 2000);
  assert.equal(k.sellValue, 550);
  assert.equal(k.instruments, 2);
});

test('instrument flow nets filled quantity and computes VWAPs', () => {
  const [row] = instrumentFlow([f({}), f({ qty: 10, price: 120 }), f({ side: 'SELL', qty: 5, price: 130 })]);
  assert.equal(row.buyQty, 20);
  assert.equal(row.sellQty, 5);
  assert.equal(row.netQty, 15);
  assert.equal(row.buyAvg, 110);
  assert.equal(row.sellAvg, 130);
  assert.equal(row.tradedValue, 2850);
});

test('currency fills carry no rupee value', () => {
  const rows = instrumentFlow([f({ exchange: 'CDS', symbol: 'USDINR', price: 9492000 })]);
  assert.equal(rows[0].tradedValue, null);
  assert.deepEqual(segmentFlow([f({ exchange: 'CDS' })]), []);
  assert.equal(flowKpis([f({ exchange: 'CDS' })]).tradedValue, 0);
});

test('flow trend bins buy and sell value per minute', () => {
  const t = flowTrend([f({}), f({ side: 'SELL', time: '2026-06-30T03:44:50Z' }), f({ time: '2026-06-30T03:45:05Z' })]);
  assert.deepEqual(t.map((b) => [b.buy, b.sell]), [[1000, 1000], [1000, 0]]);
});
