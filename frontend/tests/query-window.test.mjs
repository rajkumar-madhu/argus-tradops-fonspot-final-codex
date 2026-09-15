import test from 'node:test';
import assert from 'node:assert/strict';
import {
  apiWindowQuery,
  istToday,
  queryDay,
  queryWindow,
  windowLabel,
  windowSelectValue,
} from '../lib/query-window.ts';

test('default live window is IST today, not 7d', () => {
  assert.equal(queryWindow(), 'today');
  assert.equal(queryWindow('nope'), 'today');
  assert.equal(apiWindowQuery(), `day=${istToday()}`);
  assert.equal(windowLabel(), 'Today');
});

test('rolling windows are passed through as lookback', () => {
  assert.equal(apiWindowQuery('7d', '2026-01-01'), 'lookback=7d');
  assert.equal(windowSelectValue('7d', '2026-01-01'), '7d');
  assert.equal(windowLabel('7d'), '7d');
});

test('Today ignores a leftover date on the form', () => {
  assert.equal(apiWindowQuery('today', '2026-01-01'), `day=${istToday()}`);
});

test('custom date is an IST calendar day', () => {
  assert.equal(queryDay('2026-09-10'), '2026-09-10');
  assert.equal(queryDay('10/09/2026'), null);
  assert.equal(apiWindowQuery('custom', '2026-09-10'), 'day=2026-09-10');
  assert.equal(windowSelectValue('custom', '2026-09-10'), 'custom');
  assert.equal(windowLabel('custom', '2026-09-10'), '2026-09-10');
});

test('istToday follows Kolkata, not UTC', () => {
  // 15 Sep 2026 19:00 UTC is already 16 Sep 00:30 IST.
  const utcEvening = Date.UTC(2026, 8, 15, 19, 0, 0);
  assert.equal(istToday(utcEvening), '2026-09-16');
});
