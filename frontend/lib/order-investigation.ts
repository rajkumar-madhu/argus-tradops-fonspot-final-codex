/**
 * Derivations for the single-order investigation view.
 *
 * Everything here is read off recorded journal/ES events. Where a figure cannot
 * be derived the helper returns null and the view renders an explicit gap —
 * an investigation screen that guesses is worse than one that says "unknown".
 * Self-contained so `node --test` can load it directly.
 */

export type OrderEvent = {
  time?: string | null;
  status?: string | null;
  status_code?: number | string | null;
  report_type?: number | string | null;
  qty?: number | null;
  filled_qty?: number | null;
  cancelled_qty?: number | null;
  price?: number | null;
  fill_price?: number | null;
  price_raw?: number | null;
  price_scale?: string | null;
  value_multiplier?: number | null;
  latency_ms?: number | null;
  reason?: string | null;
  code?: string | null;
  rejection_category?: string | null;
  price_band?: PriceBand | null;
  freeze_qty?: { allowed?: number | null; requested?: number | null } | null;
  exchange?: string | null;
  symbol?: string | null;
  side?: string | null;
  product?: string | null;
  type?: string | null;
  broker?: string | null;
  account?: string | null;
  user?: string | null;
  order_id?: string | null;
  eref?: string | null;
  exchange_order_id?: string | null;
  exchange_time?: string | null;
  source_row?: number | null;
};

export type PriceBand = {
  current?: number | null;
  lower?: number | null;
  upper?: number | null;
  breach?: "above" | "below" | null;
  unit?: string | null;
};

const ms = (v: unknown): number | null => {
  const t = Date.parse(String(v ?? ""));
  return Number.isFinite(t) ? t : null;
};

/** Events oldest first. Ties keep their arrival order, so a same-millisecond pair stays stable. */
export function ordered(events: OrderEvent[]): OrderEvent[] {
  return [...events]
    .map((e, i) => ({ e, i, t: ms(e.time) }))
    .sort((a, b) => (a.t ?? Infinity) - (b.t ?? Infinity) || a.i - b.i)
    .map((x) => x.e);
}

/** The state an operator reads first: latest event, plus the one that rejected it. */
export function summarise(events: OrderEvent[]) {
  const rows = ordered(events);
  const latest = rows[rows.length - 1] || null;
  const first = rows[0] || null;
  const rejected = [...rows].reverse().find((e) => String(e.status || "").toUpperCase() === "REJECTED") || null;
  const withBand = [...rows].reverse().find((e) => e.price_band) || null;
  const from = ms(first?.time);
  const to = ms(latest?.time);
  return {
    latest,
    first,
    rejected,
    band: (withBand?.price_band as PriceBand | undefined) || null,
    freeze: withBand?.freeze_qty || rejected?.freeze_qty || null,
    events: rows,
    /** Wall-clock span of the recorded events, not a measured processing time. */
    spanMs: from !== null && to !== null ? to - from : null,
  };
}

/**
 * Rupee value of the order, or null when the segment's notional is not
 * established (CDS) or the price scale is unverified. Mirrors the backend rule.
 */
export function orderValue(event: OrderEvent | null): number | null {
  if (!event) return null;
  const m = Number(event.value_multiplier);
  const price = Number(event.price);
  const qty = Number(event.qty);
  if (!Number.isFinite(m) || m <= 0 || !Number.isFinite(price) || !Number.isFinite(qty) || price <= 0 || qty <= 0) return null;
  return price * qty * m;
}

/**
 * Reference lines for the lifecycle chart. Only levels the RMS actually
 * recorded: the circuit band it quoted, and the order's own price.
 */
export function bandsFor(band: PriceBand | null, price: number | null): { value: number; label: string; tone: "limit" | "price" }[] {
  const out: { value: number; label: string; tone: "limit" | "price" }[] = [];
  if (band?.upper !== null && band?.upper !== undefined && Number.isFinite(band.upper)) {
    out.push({ value: Number(band.upper), label: "Upper circuit", tone: "limit" });
  }
  if (band?.lower !== null && band?.lower !== undefined && Number.isFinite(band.lower)) {
    out.push({ value: Number(band.lower), label: "Lower circuit", tone: "limit" });
  }
  if (price !== null && Number.isFinite(price) && price > 0) {
    out.push({ value: price, label: "Order price", tone: "price" });
  }
  return out;
}

/** One marker per status change, so the chart shows where the order moved state. */
export function markersFor(events: OrderEvent[]): { index: number; label: string; tone: "ok" | "bad" | "neutral" }[] {
  const rows = ordered(events);
  const out: { index: number; label: string; tone: "ok" | "bad" | "neutral" }[] = [];
  let previous: string | null = null;
  rows.forEach((e, i) => {
    const status = String(e.status || "").toUpperCase();
    if (!status || status === previous) return;
    previous = status;
    out.push({
      index: i,
      label: status.replace("TRIGGER_PENDING", "TRIGGER"),
      tone: status === "REJECTED" ? "bad" : status === "COMPLETE" ? "ok" : "neutral",
    });
  });
  return out;
}

/** The price series the chart plots: one point per event, null where unpriced. */
export function priceSeries(events: OrderEvent[]): (number | null)[] {
  return ordered(events).map((e) => {
    const v = Number(e.price);
    return Number.isFinite(v) && v > 0 ? v : null;
  });
}

/**
 * Gaps between consecutive events. This is journal event spacing, never a
 * measured OMS or network latency — the label must say so wherever it is shown.
 */
export function intervals(events: OrderEvent[]): (number | null)[] {
  const rows = ordered(events);
  return rows.map((e, i) => {
    if (i === 0) return null;
    const a = ms(rows[i - 1].time);
    const b = ms(e.time);
    return a !== null && b !== null ? b - a : null;
  });
}

/** "1.2 s", "340 ms", "2 m 05 s" — durations in the unit that reads cleanly. */
export function duration(millis: number | null | undefined): string {
  if (millis === null || millis === undefined || !Number.isFinite(Number(millis))) return "—";
  const n = Math.max(0, Number(millis));
  if (n < 1000) return `${Math.round(n)} ms`;
  if (n < 60_000) return `${(n / 1000).toFixed(n < 10_000 ? 2 : 1)} s`;
  const m = Math.floor(n / 60_000);
  return `${m} m ${String(Math.round((n % 60_000) / 1000)).padStart(2, "0")} s`;
}

/**
 * What the recorded evidence supports about why the order ended where it did.
 * Returns `observed` facts and, separately, an `inference` only when the band
 * arithmetic alone explains it. Never a guessed root cause.
 */
export function explain(summary: ReturnType<typeof summarise>) {
  const observed: string[] = [];
  const { latest, rejected, band, freeze } = summary;
  const status = String(latest?.status || "").toUpperCase();
  if (status) observed.push(`Latest recorded state is ${status}.`);
  if (rejected?.rejection_category) observed.push(`The RMS classified the rejection as ${rejected.rejection_category}.`);
  if (freeze?.allowed) {
    observed.push(`The exchange freeze quantity quoted is ${freeze.allowed.toLocaleString("en-IN")}${
      freeze.requested ? `, against ${freeze.requested.toLocaleString("en-IN")} requested` : ""}.`);
  }
  let inference: string | null = null;
  if (band?.breach === "above" && band.current != null && band.upper != null) {
    inference = `Quoted price ${band.current} is above the upper circuit ${band.upper}, which the rule cites as the cause.`;
  } else if (band?.breach === "below" && band.current != null && band.lower != null) {
    inference = `Quoted price ${band.current} is below the lower circuit ${band.lower}, which the rule cites as the cause.`;
  } else if (band && band.breach === null) {
    inference = null;
    observed.push("The quoted price sits inside the circuit band, so the band alone does not explain this rejection.");
  }
  return { observed, inference };
}
