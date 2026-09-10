import test from 'node:test';
import assert from 'node:assert/strict';
import { flowByExchange, sessionAt, venueCards } from '../lib/exchange-health.ts';

test('venue cards join exchange stats, segment latency and the last observed order', () => {
  const cards = venueCards(
    [{ name: 'NSE', status: 'Historical events', reject_rate: 14.07, events: 4017 }, { name: 'CDS', reject_rate: 0, events: 6 }],
    [{ segment: 'NSE', p50: 149.75 }],
    [{ exchange: 'NSE', time: '2026-06-30T03:53:38Z' }, { exchange: 'NSE', time: '2026-06-30T03:50:00Z' }],
  );
  assert.equal(cards[0].omsP50, 149.75);
  assert.equal(cards[0].orders, 2);
  assert.equal(cards[0].lastEvent, '09:23:38');
  assert.equal(cards[1].omsP50, null, 'no latency segment means no latency, not zero');
  assert.equal(cards[1].lastEvent, null);
});

test('session phase follows the NSE timetable in IST', () => {
  assert.equal(sessionAt('2026-06-30T03:44:00Z').phase, 'Pre-open');
  const s = sessionAt('2026-06-30T03:53:38Z');
  assert.equal(s.phase, 'Normal market');
  assert.equal(s.open, true);
  assert.equal(s.toClose, '6h 7m');
  assert.equal(s.clock, '09:23:38');
  assert.equal(sessionAt('2026-06-30T10:20:00Z').phase, 'Post-close');
  assert.equal(sessionAt('2026-06-30T11:00:00Z').phase, 'Market closed');
  assert.equal(sessionAt(null), null);
});

test('order flow splits the busiest venues and folds the rest into Other', () => {
  const orders = [
    ...Array(5).fill({ exchange: 'NSE', time: '2026-06-30T03:44:00Z' }),
    ...Array(3).fill({ exchange: 'NFO', time: '2026-06-30T03:44:10Z' }),
    { exchange: 'BSE', time: '2026-06-30T03:44:20Z' },
  ];
  const flow = flowByExchange(orders, 2);
  assert.deepEqual(flow.series, ['NSE', 'NFO', 'Other']);
  const totals = flow.bins.reduce((acc, b) => acc.map((v, i) => v + b.values[i]), [0, 0, 0]);
  assert.deepEqual(totals, [5, 3, 1]);
  assert.equal(flowByExchange([{ exchange: 'NSE' }]), null);
});
