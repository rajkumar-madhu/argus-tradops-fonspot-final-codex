import test from 'node:test';
import assert from 'node:assert/strict';
import { flowKpis, flowTrend, instrumentFlow, segmentFlow } from '../lib/positions-flow.ts';

const f = (extra) => ({ exchange: 'NSE', symbol: 'ITC-EQ', side: 'BUY', qty: 10, price: 100, time: '2026-06-30T03:44:10Z', ...extra });

test('flow KPIs count buy and sell fills and quantities, never rupees', () => {
  const k = flowKpis([f({}), f({ side: 'SELL', qty: 5, price: 110 }), f({ symbol: 'SBIN-EQ' })]);
  assert.deepEqual(k, { fills: 3, buyFills: 2, sellFills: 1, buyQty: 20, sellQty: 5, instruments: 2 });
  assert.ok(!('tradedValue' in k) && !('buyValue' in k), 'no money fields');
});

test('instrument flow nets filled quantity and keeps VWAPs as per-unit prices', () => {
  const [row] = instrumentFlow([f({}), f({ qty: 10, price: 120 }), f({ side: 'SELL', qty: 5, price: 130 })]);
  assert.equal(row.buyQty, 20);
  assert.equal(row.sellQty, 5);
  assert.equal(row.netQty, 15);
  assert.equal(row.buyAvg, 110);
  assert.equal(row.sellAvg, 130);
  assert.equal(row.fills, 3);
  assert.ok(!('tradedValue' in row), 'no traded value column');
});

test('instruments rank by fills, and every segment counts (no rupee-only filter)', () => {
  const rows = instrumentFlow([f({ exchange: 'CDS', symbol: 'USDINR' }), f({ exchange: 'CDS', symbol: 'USDINR' }), f({})]);
  assert.deepEqual(rows.map((r) => r.symbol), ['USDINR', 'ITC-EQ']);
  assert.deepEqual(segmentFlow([f({ exchange: 'CDS' }), f({}), f({})]).map((s) => [s.name, s.fills, Math.round(s.share)]), [['NSE', 2, 67], ['CDS', 1, 33]]);
});

test('flow trend bins buy and sell fill counts per minute', () => {
  const t = flowTrend([f({}), f({ side: 'SELL', time: '2026-06-30T03:44:50Z' }), f({ time: '2026-06-30T03:45:05Z' })]);
  assert.deepEqual(t.map((b) => [b.buy, b.sell]), [[1, 1], [1, 0]]);
});
