import test from "node:test";
import assert from "node:assert/strict";
import {
  hasLiveMarketFeed,
  isSnapshotSource,
  sourceBadgeText,
  sourceBadgeTone,
  sourceDisplayName,
  sourceChip,
} from "../lib/data-source.ts";

test("source badges never say demo", () => {
  assert.equal(sourceBadgeText("demo"), "OFFLINE");
  assert.equal(sourceBadgeText("journal snapshot"), "FILE-BASED");
  assert.equal(sourceBadgeText("live"), "LIVE");
  assert.equal(sourceBadgeTone("demo"), "warn");
});

test("market ticker only shows for live feeds", () => {
  assert.equal(hasLiveMarketFeed("demo", 5), false);
  assert.equal(hasLiveMarketFeed("journal snapshot", 5), false);
  assert.equal(hasLiveMarketFeed("truedata", 0), false);
  assert.equal(hasLiveMarketFeed("truedata", 3), true);
});

test("snapshot sources include demo and journal", () => {
  assert.equal(isSnapshotSource("demo"), true);
  assert.equal(isSnapshotSource("journal snapshot"), true);
  assert.equal(isSnapshotSource("live"), false);
});

test("source display name hides demo", () => {
  assert.equal(sourceDisplayName("journal snapshot"), "Journal file");
  assert.equal(sourceDisplayName("demo"), "Offline");
});

test('the rail source chip reuses the operator vocabulary and never says demo', () => {
  assert.deepEqual(sourceChip({ data_source: 'elasticsearch' }), { text: 'LIVE', tone: 'live' });
  assert.deepEqual(sourceChip({ data_source: 'journal snapshot' }), { text: 'FILE-BASED', tone: 'file-based' });
  const offline = sourceChip({ data_source: 'demo' });
  assert.equal(offline.text, 'OFFLINE');
  assert.equal(offline.text.toLowerCase().includes('demo'), false);
});

test('a missing or failed config yields no rail chip at all', () => {
  for (const bad of [null, undefined, {}, { data_source: '' }, { _error: 'Network error' }]) {
    assert.equal(sourceChip(bad), null);
  }
});

test('freshness badges: LIVE only while the newest event is inside the threshold', async () => {
  const { ageText, freshnessBadge } = await import('../lib/data-source.ts');
  assert.equal(freshnessBadge({ state: 'live', age_seconds: 4, ingest_lag_seconds: 1.2 }, 'elasticsearch').text, 'LIVE');
  assert.match(freshnessBadge({ state: 'live', age_seconds: 4, ingest_lag_seconds: 1.2 }, 'elasticsearch').detail, /4 s ago · ingest lag 1 s/);
  assert.deepEqual(freshnessBadge({ state: 'delayed', age_seconds: 200 }, 'elasticsearch').text, 'DELAYED');
  assert.equal(freshnessBadge({ state: 'stale', age_seconds: 2000 }, 'elasticsearch').text, 'STALE');
  assert.equal(freshnessBadge({ state: 'closed', age_seconds: 7200 }, 'elasticsearch').text, 'CLOSED');
  assert.equal(freshnessBadge({ state: 'live', age_seconds: 1 }, 'journal snapshot').text, 'FILE-BASED', 'a file is never LIVE');
  assert.equal(freshnessBadge({ state: 'live', age_seconds: 1 }, 'elasticsearch', { reason: 'elasticsearch unavailable' }).text, 'DELAYED', 'a fallback is never LIVE');
  assert.equal(freshnessBadge(null, 'elasticsearch').text, 'OFFLINE');
  assert.equal(freshnessBadge(null, 'demo').text, 'OFFLINE');
  assert.equal(ageText(4), '4 s'); assert.equal(ageText(200), '3 min'); assert.equal(ageText(7800), '2 h 10 min'); assert.equal(ageText(null), '');
  assert.deepEqual(sourceChip({ data_source: 'elasticsearch' }, { primary: { state: 'stale', age_seconds: 900 } }),
    { text: 'STALE', tone: 'stale', detail: 'No event for 15 min during trading hours' });
  assert.deepEqual(sourceChip({ data_source: 'elasticsearch' }, { _error: 'boom' }), { text: 'LIVE', tone: 'live' }, 'a failed freshness call falls back to the source badge');
});

test("an unreported source is never rendered as LIVE", () => {
  // A failed /api/overview leaves `source` empty. Defaulting that to LIVE told
  // operators a feed was healthy when the API had not answered at all.
  for (const unknown of ["", null, undefined]) {
    assert.equal(sourceBadgeText(unknown), "OFFLINE");
    assert.equal(sourceBadgeTone(unknown), "warn");
  }
  // A source the API did report still reads live.
  assert.equal(sourceBadgeText("elasticsearch"), "LIVE");
  assert.equal(sourceBadgeTone("elasticsearch"), "live");
});
