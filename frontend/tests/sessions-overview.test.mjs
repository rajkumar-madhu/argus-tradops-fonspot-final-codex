import test from 'node:test';
import assert from 'node:assert/strict';
import {
  activeBy, durationText, loginTrend, pairedDurations, repeatLogins, sessionKpis, userType,
} from '../lib/sessions-overview.ts';

const login = (user, t, extra = {}) => ({ event: 'login', result: 'Success', active: true, user_id: user, time: `2026-06-30T03:${t}Z`, ...extra });
const logout = (user, t) => ({ event: 'logout', result: 'Success', active: false, user_id: user, time: `2026-06-30T03:${t}Z` });

test('KPIs count logins, failures, repeat users and only real paired durations', () => {
  const events = [
    login('A***', '44:00'), login('A***', '46:00'), login('B***', '45:00', { result: 'Failed', active: false }),
    login('C***', '45:00'), logout('C***', '50:30'),
  ];
  const k = sessionKpis(events);
  assert.equal(k.loginSuccess, 3);
  assert.equal(k.loginFailures, 1);
  assert.equal(k.uniqueUsers, 3);
  assert.equal(k.repeatLoginUsers, 1);
  assert.equal(k.pairedSessions, 1);
  assert.equal(k.avgDurationMs, 330_000);
  assert.equal(sessionKpis([login('A***', '44:00')]).avgDurationMs, null, 'no logout means no duration, not zero');
});

test('a logout without an earlier login is not paired', () => {
  assert.deepEqual(pairedDurations([logout('X***', '44:00'), login('X***', '45:00')]), []);
});

test('login trend splits success and failure per minute', () => {
  const trend = loginTrend([login('A***', '44:10'), login('B***', '44:50', { result: 'Failed' }), login('C***', '45:00')]);
  assert.deepEqual(trend.map((b) => [b.ok, b.failed]), [[1, 1], [1, 0]]);
});

test('active sessions group by user type and by segment, with shares', () => {
  const events = [
    login('A***', '44:00', { access_group: 'DEALER-CSB', segments: ['NSE', 'BSE'] }),
    login('B***', '45:00', { access_group: 'INVESTOR-CSB', segments: ['NSE'] }),
    logout('C***', '46:00'),
  ];
  assert.deepEqual(activeBy(events, userType).map((r) => r.name), ['DEALER', 'INVESTOR']);
  const bySeg = activeBy(events, (e) => e.segments || []);
  assert.deepEqual(bySeg[0], { name: 'NSE', count: 2, share: (2 / 3) * 100 });
});

test('repeat logins rank users by login count', () => {
  const rows = repeatLogins([login('A***', '44:00'), login('A***', '46:00'), login('A***', '47:00'), login('B***', '45:00')]);
  assert.deepEqual(rows.map((r) => [r.user, r.logins]), [['A***', 3]]);
});

test('duration text', () => {
  assert.equal(durationText(42_000), '42s');
  assert.equal(durationText(845_000), '14m 05s');
  assert.equal(durationText(8_040_000), '2h 14m');
  assert.equal(durationText(null), '—');
});
