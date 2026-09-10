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
