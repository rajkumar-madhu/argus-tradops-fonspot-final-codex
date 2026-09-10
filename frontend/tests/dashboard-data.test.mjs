import test from 'node:test';
import assert from 'node:assert/strict';
import { deskBriefing } from '../lib/desk-briefing.ts';

test('desk briefing ranks rejection evidence before queue and connectivity observations', () => {
  const items = deskBriefing({ total: 10, rejected: 2, open: 1, pending: 0, yelConnected: false, hasYelObservation: true });
  assert.equal(items[0].href, '/rejections');
  assert.equal(items[0].tone, 'critical');
  assert.equal(items[2].href, '/exchange');
});

test('desk briefing does not claim health when the source has no exception signal', () => {
  const items = deskBriefing({ total: 5, rejected: 0, open: 0, pending: 0, yelConnected: false, hasYelObservation: false });
  assert.match(items[0].title, /No exception signal/);
  assert.match(items[0].detail, /not a live-health assertion/);
});
