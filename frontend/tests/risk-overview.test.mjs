import test from 'node:test';
import assert from 'node:assert/strict';
import { breachesByRule, brokerExposure, inr, orderValue, rmsBreaches, valueTrend, workingExposure } from '../lib/risk-overview.ts';

const o = (extra) => ({ status: 'OPEN', exchange: 'NSE', broker: 'KBC', qty: 10, price: 100, value_multiplier: 1, time: '2026-06-30T03:44:00Z', ...extra });

test('order value needs a positive quantity and price', () => {
  assert.equal(orderValue(o({})), 1000);
  assert.equal(orderValue(o({ price: null })), 0);
  assert.equal(orderValue(o({ qty: 0 })), 0);
});

test('working exposure counts only open, pending and partial orders', () => {
  const x = workingExposure([o({}), o({ status: 'COMPLETE' }), o({ status: 'REJECTED' }), o({ exchange: 'NFO', price: 300, status: 'PENDING' })]);
  assert.equal(x.total, 4000);
  assert.equal(x.count, 2);
  assert.deepEqual(x.venues.map((v) => v.name), ['NFO', 'NSE']);
});

test('broker exposure keeps reject rate over all orders and drops brokers with no working value', () => {
  const rows = brokerExposure([o({}), o({ status: 'REJECTED' }), o({ broker: 'ISB', status: 'COMPLETE' })]);
  assert.deepEqual(rows, [{ broker: 'KBC', value: 1000, orders: 2, rejected: 1, rejectPct: 50 }]);
});

test('RMS breaches are rejections in RMS rule categories only', () => {
  const rej = [
    o({ status: 'REJECTED', rejection_category: 'RMS / Circuit Limit', order_id: 'A' }),
    o({ status: 'REJECTED', rejection_category: 'RMS / Margin', order_id: 'B', time: '2026-06-30T03:45:00Z' }),
    o({ status: 'REJECTED', rejection_category: 'Exchange', order_id: 'C' }),
  ];
  assert.deepEqual(rmsBreaches(rej).map((b) => [b.orderId, b.rule]), [['B', 'Margin'], ['A', 'Circuit Limit']]);
  assert.deepEqual(breachesByRule(rej).map((r) => r.rule).sort(), ['Circuit Limit', 'Margin']);
});

test('Indian currency units', () => {
  assert.equal(inr(124_300_000), '₹ 12.43 Cr');
  assert.equal(inr(3_260_000), '₹ 32.60 L');
  assert.equal(inr(9120), '₹ 9,120');
  assert.equal(inr(null), '—');
});

test('value trend sums working value per bin for the busiest venues', () => {
  const t = valueTrend([o({}), o({ time: '2026-06-30T03:46:00Z' }), o({ exchange: 'NFO', price: 50 })]);
  assert.deepEqual(t.series.map((s) => s.name), ['NSE', 'NFO']);
  assert.equal(t.series[0].points.reduce((a, b) => a + b, 0), 2000);
  assert.equal(valueTrend([]), null);
});

test('commodity value applies the contract price multiplier', () => {
  // GOLDM: 200 g at Rs 372 per 10 g, multiplier 0.1. The RMS required Rs 7,440.
  assert.equal(orderValue(o({ exchange: 'MCX', qty: 200, price: 372, value_multiplier: 0.1 })), 7440);
  const x = workingExposure([o({}), o({ exchange: 'MCX', qty: 1, price: 153800, value_multiplier: 100 })]);
  assert.equal(x.total, 1000 + 15_380_000);
  assert.equal(x.excluded, 0);
  assert.deepEqual(x.venues.map((v) => v.name), ['MCX', 'NSE']);
});

test('orders without an established rupee notional are excluded, not summed', () => {
  // CDS: price scale established (USDINR 94.92), notional convention not.
  const cds = o({ exchange: 'CDS', qty: 1000, price: 94.92, value_multiplier: null });
  const unverified = o({ exchange: 'NCDEX', price: null, value_multiplier: null });
  const legacy = o({ value_multiplier: undefined });
  const x = workingExposure([o({}), cds, unverified, legacy, o({ exchange: 'CDS', status: 'COMPLETE', value_multiplier: null })]);
  assert.equal(x.total, 1000);
  assert.equal(x.excluded, 3);
  assert.deepEqual(x.excludedVenues, ['CDS', 'NCDEX', 'NSE']);
  assert.equal(orderValue(cds), 0);
  assert.equal(orderValue(o({ value_multiplier: 0 })), 0);
  assert.equal(orderValue(o({ value_multiplier: 'x' })), 0);
});
