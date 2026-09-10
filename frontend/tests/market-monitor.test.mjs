import test from 'node:test';
import assert from 'node:assert/strict';
import {appendObservation, bestQuoteSpread, finiteQuote, quoteFreshness, quoteTime} from '../lib/market-monitor.ts';

test('missing market values are never converted to zero quotes', () => {
  for (const value of [null, undefined, '', true, 'bad', Infinity]) assert.equal(finiteQuote(value), null);
  assert.equal(finiteQuote(0), 0);
  assert.equal(bestQuoteSpread(null, 100), null);
  assert.equal(bestQuoteSpread(101, 100), null);
  assert.equal(bestQuoteSpread(100, 100), 0);
});
test('freshness requires a timezone and rejects future clocks', () => {
  const now = Date.parse('2026-09-09T10:00:30Z');
  assert.equal(quoteTime('2026-09-09T10:00:00'), null);
  assert.equal(quoteFreshness('2026-09-09T10:00:00Z', now).fresh, true);
  assert.equal(quoteFreshness('2026-09-09T09:59:59Z', now).label, 'Stale');
  assert.equal(quoteFreshness('2026-09-09T11:00:00Z', now).fresh, false);
});
test('chart stays bounded and ignores replayed, out of order and invalid observations', () => {
  let points = [];
  const start = Date.parse('2026-09-09T10:00:00Z');
  for (let i = 0; i < 300; i++) points = appendObservation(points, 100 + i, new Date(start + i * 1000).toISOString());
  assert.equal(points.length, 240);
  assert.equal(points[0].value, 160);
  assert.equal(appendObservation(points, 200, points.at(-1).time), points);
  assert.equal(appendObservation(points, 200, '2026-09-09T09:00:00Z'), points);
  assert.equal(appendObservation(points, null, '2026-09-09T12:00:00Z'), points);
});
