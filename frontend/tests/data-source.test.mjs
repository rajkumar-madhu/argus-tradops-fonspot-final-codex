import test from "node:test";
import assert from "node:assert/strict";
import {
  hasLiveMarketFeed,
  isSnapshotSource,
  sourceBadgeText,
  sourceBadgeTone,
  sourceDisplayName,
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
