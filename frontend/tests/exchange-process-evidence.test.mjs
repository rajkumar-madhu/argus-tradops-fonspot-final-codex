import test from 'node:test';
import assert from 'node:assert/strict';
import {infraAsProcesses, buildExecutionLogs} from '../lib/exchange-matrix.ts';

test('dependency reachability does not establish worker process status or exit code', () => {
  for (const dependencyStatus of ['Connected', 'Disconnected', 'Healthy']) {
    const rows = infraAsProcesses({redis: {status: dependencyStatus}});
    assert.equal(rows[0].status, 'UNAVAILABLE');
    assert.equal(rows[0].exit_code, '—');
    assert.match(rows[0].remarks, /Process telemetry unavailable/);
  }
});

test('derived infrastructure notices do not invent event timestamps', () => {
  const rows = buildExecutionLogs([], {redis: {status: 'Disconnected'}});
  assert.equal(rows[0].time, '—');
});
