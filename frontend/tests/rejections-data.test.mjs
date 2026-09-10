import test from 'node:test';
import assert from 'node:assert/strict';
import {
  categorySlices, recentRejections, rejectionKpis, rejectionTrend, rejectionsBy, topCodes,
} from '../lib/rejections-data.ts';

const rej = (i, extra = {}) => ({ order_id: `R${i}`, status: 'REJECTED', time: `2026-06-30T03:4${i}:00Z`, ...extra });
const ok = (i, extra = {}) => ({ order_id: `O${i}`, status: 'OPEN', time: `2026-06-30T03:4${i}:30Z`, ...extra });

test('KPIs count codes, pick the top code with its commonest reason, and use the order universe for the rate', () => {
  const rejected = [
    rej(1, { code: 'RED', reason: 'a', rejection_category: 'RMS / Margin' }),
    rej(2, { code: 'RED', reason: 'a', rejection_category: 'RMS / Margin' }),
    rej(3, { code: '16387', reason: 'b', rejection_category: 'Exchange' }),
  ];
  const k = rejectionKpis(rejected, 30);
  assert.equal(k.rejected, 3);
  assert.equal(k.rate, 10);
  assert.equal(k.uniqueCodes, 2);
  assert.deepEqual(k.topCode, { code: 'RED', count: 2, reason: 'a' });
  assert.equal(k.topCategory.name, 'RMS / Margin');
});

test('trend bins carry rejected counts and the per-bin rate', () => {
  const t = rejectionTrend([rej(1), ok(1), rej(2), ok(2), ok(3)]);
  const withOrders = t.bins.filter((b) => b.total);
  assert.equal(withOrders.reduce((a, b) => a + b.total, 0), 5);
  assert.equal(withOrders.reduce((a, b) => a + b.rejected, 0), 2);
  assert.ok(t.bins.every((b) => b.rate >= 0 && b.rate <= 100));
  assert.equal(rejectionTrend([{ status: 'OPEN' }]), null);
});

test('rejections by dimension use the dimension total, and skip dimensions with no rejections', () => {
  const rows = rejectionsBy([rej(1, { type: 'MKT' }), ok(1, { type: 'MKT' }), ok(2, { type: 'LMT' })], 'type');
  assert.deepEqual(rows, [{ name: 'MKT', total: 2, rejected: 1, rate: 50 }]);
});

test('top codes rank by count with shares; categories fold the tail into Others', () => {
  const rejected = [rej(1, { code: 'A' }), rej(2, { code: 'A' }), rej(3, { code: 'B' })];
  const codes = topCodes(rejected);
  assert.equal(codes[0].code, 'A');
  assert.ok(Math.abs(codes[0].share - 200 / 3) < 1e-9);
  const cats = categorySlices([1, 2, 3, 4, 5, 6, 7].map((i) => rej(i, { rejection_category: `C${i}` })), 5);
  assert.equal(cats.length, 6);
  assert.equal(cats[5].name, 'Others');
  assert.equal(cats[5].count, 2);
  assert.ok(Math.abs(cats[5].share - 200 / 7) < 1e-9);
});

test('recent rejections are newest first', () => {
  assert.deepEqual(recentRejections([rej(1), rej(3), rej(2)], 2).map((r) => r.order_id), ['R3', 'R2']);
});

test('RCA lifecycle steps come only from recorded events', async () => {
  const { buildLifecycleSteps } = await import('../lib/lifecycle-steps.ts');
  const steps = buildLifecycleSteps([
    { time: '2026-06-30T03:53:38Z', status: 'REJECTED', status_code: 56 },
    { time: '2026-06-30T03:53:35Z', status: 'PENDING', status_code: 110 },
  ]);
  assert.deepEqual(steps.map((s) => [s.label, s.state]), [['Pending (110)', 'done'], ['Rejected (56)', 'failed']]);
  const fills = buildLifecycleSteps([
    { time: '2026-06-30T03:51:13.029Z', status: 'PENDING', status_code: 110 },
    { time: '2026-06-30T03:51:13.035Z', status: 'OPEN', status_code: 48 },
    { time: '2026-06-30T03:51:13.100Z', status: 'OPEN', status_code: 48 },
    { time: '2026-06-30T03:51:13.246Z', status: 'COMPLETE', status_code: 50 },
  ]);
  assert.deepEqual(fills.map((s) => s.label), ['Pending (110)', 'Open (48) ×2', 'Complete (50)']);
  assert.deepEqual(buildLifecycleSteps([]), []);
});
