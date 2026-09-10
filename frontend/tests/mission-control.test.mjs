import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MISSION_KPI_DEFS,
  MISSION_TABS,
  applyMissionFacets,
  facetOptions,
  fileSourceStripMeta,
  filterOrdersByTab,
  isLiveSource,
  rejectRatePct,
  thirdChartPanel,
} from '../lib/mission-control.ts';

test('KPI defs cover the six reference dashboard metrics with plain-language definitions', () => {
  assert.equal(MISSION_KPI_DEFS.length, 6);
  assert.deepEqual(
    MISSION_KPI_DEFS.map((k) => k.key),
    ['total', 'complete', 'rejected', 'pending', 'active_users', 'brokers'],
  );
  for (const kpi of MISSION_KPI_DEFS) {
    assert.ok(kpi.definition.length > 10, kpi.key);
  }
});

test('mission tabs are Live Open Rejected Complete', () => {
  assert.deepEqual(
    MISSION_TABS.map((t) => t.id),
    ['live', 'open', 'rejected', 'complete'],
  );
});

test('only elasticsearch is a live source for SSE', () => {
  assert.equal(isLiveSource('elasticsearch'), true);
  assert.equal(isLiveSource('journal snapshot'), false);
  assert.equal(isLiveSource('demo'), false);
  assert.equal(isLiveSource(null), false);
});

test('filterOrdersByTab keeps live unfiltered and splits status tabs', () => {
  const rows = [
    { order_id: '1', status: 'OPEN' },
    { order_id: '2', status: 'PENDING' },
    { order_id: '3', status: 'REJECTED' },
    { order_id: '4', status: 'COMPLETE' },
    { order_id: '5', status: 'TRIGGER_PENDING' },
  ];
  assert.equal(filterOrdersByTab(rows, 'live').length, 5);
  assert.deepEqual(
    filterOrdersByTab(rows, 'open').map((r) => r.order_id),
    ['1', '2', '5'],
  );
  assert.deepEqual(
    filterOrdersByTab(rows, 'rejected').map((r) => r.order_id),
    ['3'],
  );
  assert.deepEqual(
    filterOrdersByTab(rows, 'complete').map((r) => r.order_id),
    ['4'],
  );
});

test('third chart panel prefers rejects when any exist', () => {
  assert.equal(thirdChartPanel(3), 'rejects');
  assert.equal(thirdChartPanel(0), 'exchange');
});

test('reject rate is zero when total is zero', () => {
  assert.equal(rejectRatePct(0, 5), 0);
  assert.equal(rejectRatePct(100, 5), 5);
});

test('facetOptions sorts distinct values for dropdowns', () => {
  const rows = [
    { exchange: 'NSE', product: 'CNC' },
    { exchange: 'NFO', product: 'NRML' },
    { exchange: 'NSE', product: 'CNC' },
  ];
  assert.deepEqual(facetOptions(rows, 'exchange'), ['NFO', 'NSE']);
});

test('applyMissionFacets filters dropdown and search fields together', () => {
  const rows = [
    { exchange: 'NSE', product: 'CNC', status: 'OPEN', side: 'BUY', symbol: 'RELIANCE-EQ', user: 'u1', account: 'a1' },
    { exchange: 'BSE', product: 'MIS', status: 'REJECTED', side: 'SELL', symbol: 'TCS-EQ', user: 'u2', account: 'a2' },
  ];
  assert.equal(applyMissionFacets(rows, { exchange: 'NSE' }).length, 1);
  assert.equal(applyMissionFacets(rows, { symbol: 'tcs' })[0].exchange, 'BSE');
  assert.equal(applyMissionFacets(rows, { side: 'BUY', status: 'OPEN' }).length, 1);
});

test('fileSourceStripMeta hides errors and empty lists', () => {
  assert.equal(fileSourceStripMeta(null), null);
  assert.equal(fileSourceStripMeta({ _error: 'unreachable' }), null);
  assert.equal(fileSourceStripMeta({ count: 0, items: [] }), null);
  assert.deepEqual(
    fileSourceStripMeta({
      count: 3,
      items: [{ state: 'Ready' }, { state: 'No data received' }, { state: 'No data received' }],
    }),
    { count: 3, awaiting: 2 },
  );
});
