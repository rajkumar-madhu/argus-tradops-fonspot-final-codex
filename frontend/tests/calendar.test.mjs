import test from 'node:test';
import assert from 'node:assert/strict';
import { calendarData, istDay, validDate } from '../lib/calendar.ts';

const now = new Date('2026-10-08T08:00:00Z');
const orders = items => ({ source: 'journal snapshot', count: items.length, items });
const incidents = { source: 'postgresql', count: 0, items: [] };

test('calendar uses IST midnight and rejects ambiguous timestamps', () => {
  assert.equal(istDay('2026-10-07T18:29:59Z'), '2026-10-07');
  assert.equal(istDay('2026-10-07T18:30:00Z'), '2026-10-08');
  assert.equal(istDay('2026-10-08T00:01:00'), null);
  assert.equal(validDate('2026-02-30'), false);
});
test('calendar counts unique orders at their latest observation and reports capped data', () => {
  const data = calendarData({ source: 'journal snapshot', count: 20, items: [
    { order_id: 'a', time: '2026-10-07T12:00:00Z', status: 'open' },
    { order_id: 'a', time: '2026-10-08T01:00:00Z', status: 'complete' },
    { order_id: 'b', time: '2026-10-08T02:00:00Z', status: 'rejected' },
  ] }, incidents, {}, now);
  assert.equal(data.loaded, 2);
  assert.equal(data.complete, false);
  assert.equal(data.days.at(-1).complete, 1);
  assert.equal(data.days.at(-1).rejected, 1);
  assert.equal(data.days.at(-2).orders.length, 0);
});
test('failed, forbidden and offline sources stay unavailable rather than becoming zero activity', () => {
  for (const source of [{ _status: 403, _error: 'Forbidden' }, { source: 'unavailable', items: [] }, { source: 'demo', count: 0, items: [] }]) {
    const data = calendarData(source, source, {}, now);
    assert.equal(data.ordersAvailable, false);
    assert.equal(data.incidentsAvailable, false);
    assert.equal(data.complete, false);
  }
});
test('calendar defaults to the latest source day and filters only the intended exchange', () => {
  const data = calendarData(orders([
    { order_id: 'a', time: '2026-06-30T04:00:00Z', status: 'open', exchange: 'NSE' },
    { order_id: 'b', time: '2026-06-30T05:00:00Z', status: 'rejected', exchange: 'BSE' },
  ]), incidents, { exchange: 'NSE' }, now);
  assert.equal(data.end, '2026-06-30');
  assert.equal(data.start, '2026-06-01');
  assert.equal(data.days.length, 30);
  assert.equal(data.days.at(-1).pending, 1);
  assert.equal(data.days.at(-1).rejected, 0);
  assert.deepEqual(data.exchanges, ['BSE', 'NSE']);
});
test('invalid, inverted, future and overlong ranges are rejected', () => {
  for (const query of [{ end: 'bad' }, { start: '2026-10-08', end: '2026-10-07' }, { end: '2026-10-09' }, { start: '2026-01-01', end: '2026-10-08' }]) {
    assert.throws(() => calendarData(orders([]), incidents, query, now));
  }
});
test('records without reliable dates reduce completeness and are excluded from days', () => {
  const data = calendarData(orders([{ order_id: 'a', time: 'unknown' }]), incidents, {}, now);
  assert.equal(data.undated, 1);
  assert.equal(data.complete, false);
  assert.equal(data.days.flatMap(day => day.orders).length, 0);
});
