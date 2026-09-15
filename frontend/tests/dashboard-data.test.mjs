import test from 'node:test';
import assert from 'node:assert/strict';
import { deskBriefing } from '../lib/desk-briefing.ts';

test('desk briefing ranks rejection evidence before queue and connectivity observations', () => {
  const items = deskBriefing({
    total: 10,
    rejected: 2,
    open: 1,
    pending: 0,
    yelConnected: false,
    hasYelObservation: true,
  });
  assert.equal(items[0].href, '/rejections');
  assert.equal(items[0].tone, 'critical');
  assert.equal(items[2].href, '/exchange');
});

test('desk briefing does not claim health when the source has no exception signal', () => {
  const items = deskBriefing({
    total: 5,
    rejected: 0,
    open: 0,
    pending: 0,
    yelConnected: false,
    hasYelObservation: false,
  });
  assert.match(items[0].title, /No exception signal/);
  assert.match(items[0].detail, /not a live-health assertion/);
});

test('ops coach adds the largest RMS category as a risk finding', () => {
  const items = deskBriefing({
    total: 100,
    rejected: 12,
    open: 0,
    pending: 0,
    yelConnected: true,
    hasYelObservation: true,
    categories: [
      { name: 'RMS / Margin', count: 9 },
      { name: 'Exchange', count: 3 },
    ],
  });
  const rms = items.find((i) => i.href === '/risk');
  assert.ok(rms);
  assert.match(rms.title, /RMS \/ Margin/);
  assert.match(rms.detail, /9/);
  assert.doesNotMatch(rms.detail, /₹|P&L|pnl|rupee/i);
});

test('ops coach flags a broker whose reject rate is above the desk', () => {
  const items = deskBriefing({
    total: 50,
    rejected: 10,
    open: 0,
    pending: 0,
    yelConnected: true,
    hasYelObservation: true,
    brokers: [{ broker: 'BRK1', rejected: 8, rejectPct: 40, aboveAvg: true }],
  });
  const broker = items.find((i) => /BRK1/.test(i.title));
  assert.ok(broker);
  assert.equal(broker.href, '/rejections');
  assert.doesNotMatch(broker.detail, /₹|P&L|pnl/i);
});

test('ops coach reports a measured empty session window, never a guessed outage', () => {
  const items = deskBriefing({
    total: 20,
    rejected: 0,
    open: 0,
    pending: 0,
    yelConnected: true,
    hasYelObservation: true,
    activeSessions: 0,
  });
  const sessions = items.find((i) => i.href === '/sessions');
  assert.ok(sessions);
  assert.equal(sessions.tone, 'watch');
  assert.match(sessions.detail, /No active sessions/);
});

test('ops coach keeps at most eight findings and never invents rupees', () => {
  const items = deskBriefing({
    total: 1000,
    rejected: 80,
    open: 12,
    pending: 3,
    yelConnected: false,
    hasYelObservation: true,
    categories: [
      { name: 'RMS / Margin', count: 40 },
      { name: 'RMS / Holdings', count: 20 },
      { name: 'Exchange', count: 15 },
      { name: 'Freeze', count: 5 },
    ],
    groups: [{ code: '16387', reason: 'Price freeze', category: 'Freeze', count: 5 }],
    brokers: [
      { broker: 'A', rejected: 30, rejectPct: 20, aboveAvg: true },
      { broker: 'B', rejected: 20, rejectPct: 18, aboveAvg: true },
    ],
    activeSessions: 0,
  });
  assert.ok(items.length <= 8);
  assert.equal(items[0].href, '/rejections');
  for (const item of items) {
    assert.doesNotMatch(`${item.title} ${item.detail}`, /₹|P&L|\bpnl\b|rupee/i);
  }
});
