import test from "node:test";
import assert from "node:assert/strict";
import {
  STATUS_LABELS, cellText, clearFacets, displayValue, fieldLabel, histogramHeights, isUntranslated,
  pageBounds, selectedFacets, shortTime, statusTone, summaryColumns, toggleFacet,
  valueLabel, withOffset,
} from "../lib/journal-explore.ts";

test("toggleFacet adds, removes and resets paging", () => {
  const base = new URLSearchParams("msg_type=ordupd&offset=100");
  const added = toggleFacet(base, "ExchSeg", "NSE");
  assert.deepEqual(added.getAll("facet"), ["ExchSeg:NSE"]);
  assert.equal(added.get("offset"), null, "changing a filter must reset paging");
  assert.equal(added.get("msg_type"), "ordupd");

  const two = toggleFacet(added, "Product", "C");
  assert.deepEqual(two.getAll("facet"), ["ExchSeg:NSE", "Product:C"]);

  const removed = toggleFacet(two, "ExchSeg", "NSE");
  assert.deepEqual(removed.getAll("facet"), ["Product:C"]);
});

test("toggleFacet keeps values of the same field independent", () => {
  let params = new URLSearchParams();
  params = toggleFacet(params, "ExchSeg", "NSE");
  params = toggleFacet(params, "ExchSeg", "BSE");
  assert.deepEqual(params.getAll("facet"), ["ExchSeg:NSE", "ExchSeg:BSE"]);
  params = toggleFacet(params, "ExchSeg", "NSE");
  assert.deepEqual(params.getAll("facet"), ["ExchSeg:BSE"]);
});

test("selectedFacets parses pairs and ignores malformed tokens", () => {
  const params = new URLSearchParams("facet=ExchSeg:NSE&facet=broken&facet=:novalue&facet=Product:C");
  assert.deepEqual(selectedFacets(params), [
    { field: "ExchSeg", value: "NSE" },
    { field: "Product", value: "C" },
  ]);
});

test("clearFacets drops every facet and paging but keeps the query", () => {
  const params = new URLSearchParams("msg_type=ordupd&q=RELIANCE&facet=ExchSeg:NSE&offset=50");
  const cleared = clearFacets(params);
  assert.deepEqual(cleared.getAll("facet"), []);
  assert.equal(cleared.get("offset"), null);
  assert.equal(cleared.get("q"), "RELIANCE");
});

test("only documented codes get a label; others are marked untranslated", () => {
  assert.equal(valueLabel("TransType", "B"), "BUY");
  assert.equal(valueLabel("TransType", "S"), "SELL");
  assert.equal(valueLabel("OrdStatus", "48"), "Open");
  assert.equal(valueLabel("OrdStatus", "65"), "Rejected");
  // 98 is present in real journal data but has no documented meaning.
  assert.equal(valueLabel("OrdStatus", "98"), null);
  assert.equal(isUntranslated("OrdStatus", "98"), true);
  assert.equal(isUntranslated("OrdStatus", "48"), false);
  // Product codes are undocumented, so we never invent one.
  assert.equal(valueLabel("Product", "C"), null);
});

test("status label map covers exactly the documented codes", () => {
  assert.deepEqual(
    Object.keys(STATUS_LABELS).sort(),
    ["109", "110", "115", "48", "50", "52", "54", "56", "65"].sort(),
  );
});

test("statusTone maps documented codes and stays neutral otherwise", () => {
  assert.equal(statusTone(56), "rejected");
  assert.equal(statusTone("65"), "rejected");
  assert.equal(statusTone(50), "complete");
  assert.equal(statusTone(48), "open");
  assert.equal(statusTone(110), "pending");
  assert.equal(statusTone(98), "");
  assert.equal(statusTone(null), "");
});

test("histogram heights scale to the tallest bucket", () => {
  assert.deepEqual(
    histogramHeights([{ start: "a", count: 5 }, { start: "b", count: 10 }, { start: "c", count: 0 }]),
    [50, 100, 0],
  );
  assert.deepEqual(histogramHeights([{ start: "a", count: 0 }]), [0], "an empty set is flat, not full");
  assert.deepEqual(histogramHeights([]), []);
});

test("pageBounds clamps to the real result count", () => {
  const first = pageBounds(57018, 50, 0);
  assert.equal(first.first, 1);
  assert.equal(first.end, 50);
  assert.equal(first.hasPrev, false);
  assert.equal(first.hasNext, true);
  assert.equal(first.nextOffset, 50);

  const last = pageBounds(120, 50, 100);
  assert.equal(last.end, 120);
  assert.equal(last.hasNext, false);
  assert.equal(last.prevOffset, 50);

  const empty = pageBounds(0, 50, 0);
  assert.equal(empty.first, 0);
  assert.equal(empty.hasNext, false);
  assert.equal(empty.hasPrev, false);
});

test("withOffset omits a zero offset instead of writing offset=0", () => {
  const params = new URLSearchParams("msg_type=ordupd&offset=50");
  assert.equal(withOffset(params, 0).get("offset"), null);
  assert.equal(withOffset(params, 100).get("offset"), "100");
});

test("summaryColumns falls back when the schema lacks the preferred fields", () => {
  const ordupd = summaryColumns("ordupd", ["Event Time (UTC)", "OrdStatus", "TradingSymbol", "Zzz"]);
  assert.deepEqual(ordupd, ["Event Time (UTC)", "OrdStatus", "TradingSymbol"]);
  const unknown = summaryColumns("unknown_type", ["a", "b", "c", "d", "e", "f", "g", "h"]);
  assert.deepEqual(unknown, ["a", "b", "c", "d", "e", "f"]);
});

test("cellText renders blanks as an em dash, never null", () => {
  assert.equal(cellText(null), "—");
  assert.equal(cellText(undefined), "—");
  assert.equal(cellText(""), "—");
  assert.equal(cellText(0), "0");
  assert.equal(cellText(false), "false");
});

test("shortTime takes the UTC clock time from an ISO stamp", () => {
  assert.equal(shortTime("2026-09-08T02:19:08.741402+00:00"), "02:19:08");
  assert.equal(shortTime(""), "—");
  assert.equal(shortTime(null), "—");
});

test("field labels name the dimension, not the code", () => {
  assert.equal(fieldLabel("ExchSeg"), "Exchange segment");
  assert.equal(fieldLabel("RejBy"), "Rejected by");
  assert.equal(fieldLabel("Unmapped"), "Unmapped");
});

test("coded values keep their code beside the label", () => {
  // 109, 110 and 115 all mean Pending; a label alone would render three
  // different filters as three identical rows.
  assert.equal(displayValue("OrdStatus", "110"), "Pending (110)");
  assert.equal(displayValue("OrdStatus", "109"), "Pending (109)");
  assert.equal(displayValue("OrdStatus", "56"), "Rejected (56)");
  assert.equal(displayValue("OrdStatus", "65"), "Rejected (65)");
  assert.notEqual(displayValue("OrdStatus", "110"), displayValue("OrdStatus", "109"));
});

test("uncoded fields show the label alone, undocumented codes show the raw code", () => {
  assert.equal(displayValue("TransType", "B"), "BUY");
  assert.equal(displayValue("OrdStatus", "98"), "98");
  assert.equal(displayValue("Product", "C"), "C");
  assert.equal(displayValue("ExchSeg", "NSE"), "NSE");
});

test("IST helpers read ISO strings and UNIX seconds the same way", async () => {
  const { istTime, istStamp, timeHint, toEpochMs } = await import("../lib/journal-explore.ts");
  assert.equal(istTime("2026-06-30T03:44:01.263279+00:00"), "09:14:01");
  assert.equal(istTime(1782791041), istTime("2026-06-30T03:44:01Z"));
  assert.equal(istStamp("2026-06-30T03:44:01Z"), "30 Jun 2026, 09:14:01 IST");
  assert.equal(toEpochMs("5055"), null, "a price is not a timestamp");
  assert.equal(timeHint("PriceToFill", 1782791041), null, "only time-named fields get a hint");
  assert.equal(timeHint("NorenNsecs", 263279286), null);
  assert.equal(timeHint("NorenTimeStamp", "1782791041"), "30 Jun 2026, 09:14:01 IST");
});

test("lifecycle steps are ordered oldest first with gaps and never carry reasons", async () => {
  const { lifecycleSteps, formatGap } = await import("../lib/journal-explore.ts");
  const steps = lifecycleSteps([
    { time: "2026-06-30T03:44:02.500Z", status_code: 56, qty: 700, filled_qty: 0, price: 50.55, reason: "for C-X1-VFS" },
    { time: "2026-06-30T03:44:01Z", status_code: 110, qty: 700, filled_qty: 0, price: 50.55 },
  ]);
  assert.deepEqual(steps.map((s) => s.status), ["Pending (110)", "Rejected (56)"]);
  assert.deepEqual(steps.map((s) => s.gap), ["", "+1.5 s"]);
  assert.equal(steps[1].tone, "rejected");
  assert.ok(!JSON.stringify(steps).includes("C-X1"));
  assert.equal(formatGap(58361724.7), "+16h 12m");
  assert.equal(formatGap(90061000), "+1d 01h");
  assert.equal(formatGap(0), "+<1 ms", "same-timestamp events are not a measured zero");
});

test("lifecycle steps keep the raw price of a segment whose scale is unverified", async () => {
  const { lifecycleSteps } = await import("../lib/journal-explore.ts");
  const [verified, unverified] = lifecycleSteps([
    { time: "2026-06-30T03:44:01Z", status_code: 48, price: 94.92, price_raw: 949200000, price_scale: "verified" },
    { time: "2026-06-30T03:44:02Z", status_code: 48, price: null, price_raw: 554500, price_scale: "unverified" },
  ]);
  assert.equal(verified.price, 94.92);
  assert.equal(verified.unverifiedScale, false);
  assert.equal(unverified.price, null);
  assert.equal(unverified.unverifiedScale, true);
  assert.equal(unverified.priceRaw, 554500);
});
