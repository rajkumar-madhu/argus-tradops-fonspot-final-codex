import test from 'node:test';
import assert from 'node:assert/strict';
import { loginTrendFromBuckets, tradeVolumeTrend } from '../lib/chart-data.ts';
test('empty login data does not invent a history', () => {
 assert.deepEqual(loginTrendFromBuckets([]).series[0].points, []);
});
test('sparse trades retain actual turnover rather than generated series', () => {
 const result = tradeVolumeTrend([{time:'2026-06-30T03:45:00Z', value:125}]);
 assert.deepEqual(result.series[0].points, [125]);
 assert.equal(result.labels.length, 1);
 assert.deepEqual(tradeVolumeTrend([]).series[0].points, []);
});
