import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clientImpact,
  dataQuality,
  isDenied,
  istClock,
  measured,
  orderBurst,
  platformHealth,
  queueInstances,
  readiness,
  rejectRateTrend,
  sessionRail,
  slowestHop,
  sourceChips,
  stateTone,
} from '../lib/command-center.ts';

const at = (hhmmss) => `2026-06-30T${hhmmss}+05:30`;

test('IST clock is independent of the host time zone', () => {
  assert.equal(istClock('2026-06-30T03:44:02Z'), '09:14');
  assert.equal(istClock('not a date'), '—');
});

test('order burst counts per minute and keeps empty minutes as zero', () => {
  const burst = orderBurst([
    { time: at('09:15:05'), status: 'OPEN' },
    { time: at('09:15:40'), status: 'OPEN' },
    { time: at('09:17:10'), status: 'REJECTED' },
    { time: null, status: 'OPEN' },
  ]);
  assert.deepEqual(burst.bars, [2, 0, 1]);
  assert.equal(burst.peak, 2);
  assert.equal(burst.peakAt, '09:15');
  assert.equal(burst.minutes, 3);
  assert.equal(orderBurst([{ status: 'OPEN' }]), null, 'no timestamps means no chart, not zeros');
});

test('reject rate trend is per-minute and the overall rate matches the rows', () => {
  const trend = rejectRateTrend([
    { time: at('09:15:00'), status: 'REJECTED' },
    { time: at('09:15:30'), status: 'OPEN' },
    { time: at('09:16:00'), status: 'OPEN' },
  ]);
  assert.deepEqual(trend.points, [50, 0]);
  assert.equal(trend.rejected, 1);
  assert.ok(Math.abs(trend.overall - 100 / 3) < 1e-9);
});

test('client impact ranks brokers by rejections and flags only above-desk rates', () => {
  const rows = [
    ...Array(4).fill({ broker: 'KBC', status: 'REJECTED' }),
    ...Array(6).fill({ broker: 'KBC', status: 'OPEN' }),
    { broker: 'ISB', status: 'REJECTED' },
    ...Array(9).fill({ broker: 'ISB', status: 'COMPLETE' }),
    ...Array(5).fill({ broker: 'ZZZ', status: 'OPEN' }),
    { broker: '', status: 'REJECTED' },
  ];
  const impact = clientImpact(rows);
  assert.deepEqual(impact.rows.map((r) => r.broker), ['KBC', 'ISB']);
  assert.equal(impact.brokers, 3);
  assert.equal(impact.impacted, 2);
  // desk rate is 5 / 25 = 20%: KBC (40%) is above it, ISB (10%) is not.
  assert.equal(impact.rows[0].aboveAvg, true);
  assert.equal(impact.rows[1].aboveAvg, false);
});

test('slowest hop compares p99 and ignores missing summaries', () => {
  assert.deepEqual(slowestHop({ oms: { p99: 328 }, confirmation: { p99: 5939.25 } }), { name: 'Exchange confirmation', p99: 5939.25 });
  assert.equal(slowestHop({}), null);
  assert.equal(slowestHop(undefined), null);
});

test('session rail marks the phases a window overlaps, by IST time of day', () => {
  const rail = sessionRail([{ label: 'Journal', from: '2026-06-30T03:44:00Z', to: '2026-06-30T03:53:00Z' }]);
  const covered = rail.phases.filter((p) => p.observedBy.length).map((p) => p.name);
  assert.deepEqual(covered, ['Pre-open', 'Normal market']);
  assert.equal(rail.windows[0].range, '09:14–09:23');
  assert.equal(sessionRail([{ label: 'x', from: null, to: null }]).windows.length, 0);
});

test('dependency tones never call an unconfigured or unreachable source healthy', () => {
  assert.equal(stateTone('Ready'), 'ok');
  assert.equal(stateTone('Not configured'), 'idle');
  assert.equal(stateTone('No data received'), 'idle');
  assert.equal(stateTone('Disconnected'), 'bad');
  const health = platformHealth({ elasticsearch: { status: 'Disconnected' } }, { _error: 'down' });
  assert.equal(health.find((h) => h.name === 'API').state, 'Unavailable');
  assert.equal(health.find((h) => h.name === 'Redis').tone, 'bad');
});

test('readiness counts ready dependencies and reports an unreachable API', () => {
  assert.deepEqual(
    (({ ok, up, total, down }) => ({ ok, up, total, down }))(readiness({ status: 'ready', dependencies: { journal_file: 'ready', csv_cache: 'ready' } })),
    { ok: true, up: 2, total: 2, down: [] },
  );
  assert.equal(readiness({ _error: 'x' }).label, 'UNREACHABLE');
});

test('data quality sums per-file counters and returns null without files', () => {
  const q = dataQuality({ items: [{ rows: 10, duplicates: 1 }, { rows: 5, rejected: 2, identical_content_to: 'a.csv' }] });
  assert.equal(q.rows, 15);
  assert.equal(q.duplicates, 1);
  assert.equal(q.rejected, 2);
  assert.equal(q.identical, 1);
  assert.equal(dataQuality({ items: [] }), null);
});

test('queue instances keep aliases separate and skip instances without data', () => {
  const q = queueInstances({ sources: [
    { instance: 'NSE2', peak: 4470, latest: 1 },
    { instance: 'NSE', peak: 341, latest: 36 },
    { instance: 'BFO', peak: null, state: 'No data received' },
  ] });
  assert.deepEqual(q.rows.map((r) => r.instance), ['NSE2', 'NSE']);
  assert.equal(q.empty, 1);
});

test('a permission refusal is distinguished from an outage', () => {
  assert.equal(isDenied({ _error: 'x', _status: 403 }), true);
  assert.equal(isDenied({ _error: 'x', _status: 401 }), true);
  assert.equal(isDenied({ _error: 'API 503', _status: 503 }), false);
  assert.equal(isDenied({ items: [] }), false);
});

test('null latency buckets are dropped, never plotted as zero', () => {
  assert.deepEqual(measured([170.5, null, undefined, '', 0, 2969.7]), [170.5, 0, 2969.7]);
});

test('source chips list only sources the API reports', () => {
  const live = sourceChips({ items: [] }, { elasticsearch: { status: 'Connected' } }, 'elasticsearch');
  assert.deepEqual(live.map((c) => [c.name, c.tone]), [['Elasticsearch', 'ok']]);
  const file = sourceChips({ items: [{ name: 'a.csv', state: 'Ready' }] }, { journal: { status: 'Loaded' } }, 'journal snapshot');
  assert.deepEqual(file.map((c) => c.name), ['Journal.log', 'a.csv']);
});
