import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSignalCount, hasSignal, formatSignal } from '../lib/nav-signals.ts';

test('a count is read from count, falling back to items length', () => {
  assert.equal(parseSignalCount({ count: 7, items: [] }), 7);
  assert.equal(parseSignalCount({ items: [1, 2] }), 2);
});

test('an unusable payload yields null, never a number', () => {
  for (const bad of [null, undefined, 'x', 42, {}, { count: 'many' }, { count: NaN }, { count: -1 }, { _error: 'API 403' }]) {
    assert.equal(parseSignalCount(bad), null, JSON.stringify(bad));
  }
});

test('only a positive count is worth a badge — zero and null render nothing', () => {
  assert.equal(hasSignal(3), true);
  assert.equal(hasSignal(0), false);
  assert.equal(hasSignal(null), false);
  assert.equal(hasSignal(undefined), false);
});

test('counts cap rather than widen the rail', () => {
  assert.equal(formatSignal(9), '9');
  assert.equal(formatSignal(99), '99');
  assert.equal(formatSignal(1200), '99+');
});
