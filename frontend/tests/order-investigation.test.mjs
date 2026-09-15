import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bandsFor, duration, explain, intervals, markersFor, ordered, orderValue, priceSeries, summarise,
} from '../lib/order-investigation.ts';

const at = (s, extra = {}) => ({ time: `2026-06-30T03:44:${String(s).padStart(2, '0')}.000Z`, ...extra });

test('events are ordered oldest first and ties keep arrival order', () => {
  const rows = ordered([at(3, { status: 'OPEN' }), at(1, { status: 'PENDING' }), at(1, { status: 'FIRST' })]);
  assert.deepEqual(rows.map((r) => r.status), ['PENDING', 'FIRST', 'OPEN']);
  assert.deepEqual(ordered([]), []);
});

test('summary picks the latest state and the event that carries the band', () => {
  const band = { current: 3999, lower: 3215.8, upper: 3930.4, breach: 'above' };
  const s = summarise([
    at(1, { status: 'PENDING', price: 3999 }),
    at(4, { status: 'REJECTED', price: 3999, price_band: band, rejection_category: 'RMS / Circuit Limit' }),
  ]);
  assert.equal(s.latest.status, 'REJECTED');
  assert.equal(s.first.status, 'PENDING');
  assert.equal(s.band.upper, 3930.4);
  assert.equal(s.spanMs, 3000);
  assert.equal(summarise([]).spanMs, null);
});

test('order value follows the backend rule and is null where the notional is not established', () => {
  assert.equal(orderValue({ price: 100, qty: 25, value_multiplier: 1 }), 2500);
  assert.equal(orderValue({ price: 372, qty: 200, value_multiplier: 0.1 }), 7440, 'MCX applies the price multiplier');
  assert.equal(orderValue({ price: 94.92, qty: 1000, value_multiplier: null }), null, 'CDS has no established notional');
  assert.equal(orderValue({ price: null, qty: 10, value_multiplier: 1 }), null);
  assert.equal(orderValue(null), null);
});

test('reference lines are only levels the RMS actually recorded', () => {
  const bands = bandsFor({ upper: 3930.4, lower: 3215.8 }, 3999);
  assert.deepEqual(bands.map((b) => [b.label, b.value, b.tone]), [
    ['Upper circuit', 3930.4, 'limit'],
    ['Lower circuit', 3215.8, 'limit'],
    ['Order price', 3999, 'price'],
  ]);
  assert.deepEqual(bandsFor(null, 100), [{ value: 100, label: 'Order price', tone: 'price' }]);
  assert.deepEqual(bandsFor(null, null), [], 'a market order with no price draws no lines');
  assert.deepEqual(bandsFor({ upper: null, lower: undefined }, 0), []);
});

test('markers mark status changes only, once each', () => {
  const rows = [at(1, { status: 'PENDING' }), at(2, { status: 'PENDING' }), at(3, { status: 'OPEN' }), at(4, { status: 'REJECTED' })];
  assert.deepEqual(markersFor(rows).map((m) => [m.index, m.label, m.tone]), [
    [0, 'PENDING', 'neutral'], [2, 'OPEN', 'neutral'], [3, 'REJECTED', 'bad'],
  ]);
  assert.deepEqual(markersFor([at(1, { status: 'COMPLETE' })])[0].tone, 'ok');
});

test('price series keeps nulls so unpriced events break the line instead of dropping to zero', () => {
  assert.deepEqual(priceSeries([at(1, { price: 10 }), at(2, { price: null }), at(3, { price: 0 }), at(4, { price: 12 })]),
    [10, null, null, 12]);
});

test('intervals are gaps between consecutive events, first is null', () => {
  assert.deepEqual(intervals([at(1), at(3), at(8)]), [null, 2000, 5000]);
});

test('durations read in the unit that suits them', () => {
  assert.equal(duration(340), '340 ms');
  assert.equal(duration(1234), '1.23 s');
  assert.equal(duration(45_000), '45.0 s');
  assert.equal(duration(125_000), '2 m 05 s');
  assert.equal(duration(null), '—');
  assert.equal(duration(undefined), '—');
});

test('explanation separates observed fact from inference and never guesses', () => {
  const above = explain(summarise([at(1, {
    status: 'REJECTED', rejection_category: 'RMS / Circuit Limit',
    price_band: { current: 3999, lower: 3215.8, upper: 3930.4, breach: 'above' },
  })]));
  assert.match(above.inference, /above the upper circuit 3930.4/);
  assert.ok(above.observed.some((o) => /RMS classified/.test(o)));

  const inside = explain(summarise([at(1, {
    status: 'REJECTED', price_band: { current: 100, lower: 90, upper: 110, breach: null },
  })]));
  assert.equal(inside.inference, null, 'inside the band, no cause is claimed');
  assert.ok(inside.observed.some((o) => /does not explain/.test(o)));

  const plain = explain(summarise([at(1, { status: 'COMPLETE' })]));
  assert.equal(plain.inference, null);
  assert.deepEqual(plain.observed, ['Latest recorded state is COMPLETE.']);
});

test('reference-line labels are nudged apart while their lines stay put', async () => {
  const { placeBands } = await import('../lib/chart-data.ts');
  // The real case: an order at 1,465.00 against an upper circuit of 1,464.70.
  const y = (v) => 300 - v / 10;
  const out = placeBands([{ value: 1465 }, { value: 1464.7 }, { value: 900 }], y);
  assert.deepEqual(out.map((p) => p.band.value), [1465, 1464.7, 900], 'sorted by position, topmost first');
  assert.equal(out[0].lineY, y(1465), 'lines keep their true value');
  assert.equal(out[1].lineY, y(1464.7));
  assert.equal(out[0].labelY, y(1465), 'the first label never moves');
  assert.ok(out[1].labelY - out[0].labelY >= 17, 'a colliding label is pushed one row down');
  assert.equal(out[2].labelY, y(900), 'a label with room keeps its own position');
  assert.deepEqual(placeBands([], y), []);
});

test('crowded reference labels cascade instead of stacking on one row', async () => {
  const { placeBands } = await import('../lib/chart-data.ts');
  const y = (v) => v;
  const out = placeBands([{ value: 100 }, { value: 101 }, { value: 102 }], y);
  assert.deepEqual(out.map((p) => p.labelY), [100, 117, 134]);
  assert.deepEqual(out.map((p) => p.lineY), [100, 101, 102], 'every line still points at its own value');
});
