// Derivations for the Risk & Limits screen (reference mockup 01_19_28).
// There is no RMS limit, margin, VaR or stress feed. What the journal does
// establish: order value (qty × normalised price × value multiplier) by venue and broker for
// orders still working, and rejections raised by RMS rules. Panels built from
// those say so; limit, VaR and stress panels render empty states.
// Self-contained so node --test can load it directly.

type Order = {
  status?: string | null; exchange?: string | null; broker?: string | null; time?: string | null;
  qty?: number | null; price?: number | null; rejection_category?: string | null; code?: string | null;
  order_id?: string; symbol?: string | null; value_multiplier?: number | null;
};

const WORKING = new Set(["OPEN", "PENDING", "TRIGGER_PENDING", "PARTIAL"]);

/**
 * The factor turning qty × price into rupees, set per order by the backend
 * normalizer from evidence in the journal: 1 on NSE, BSE, NFO and BFO, where
 * quantity counts units; Scripupdate.PriceMultiplier on MCX (a GOLDM lot is
 * 100 g against a price per 10 g). It is null for CDS — the price scale is
 * established, but no RMS figure shows how quantity and Scripupdate.Multiplier
 * combine into a notional — and for any segment whose price scale is
 * unverified. Those orders are excluded rather than summed.
 */
export function valueMultiplier(o: Order): number | null {
  const m = o.value_multiplier;
  if (m === null || m === undefined) return null;
  const n = Number(m);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function orderValue(o: Order): number {
  const m = valueMultiplier(o);
  const q = Number(o.qty);
  const p = Number(o.price);
  return m !== null && Number.isFinite(q) && Number.isFinite(p) && q > 0 && p > 0 ? q * p * m : 0;
}

/** "₹ 12.43 Cr", "₹ 32.60 L", "₹ 9,120" (Indian units). */
export function inr(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const a = Math.abs(value);
  if (a >= 1e7) return `₹ ${(value / 1e7).toFixed(2)} Cr`;
  if (a >= 1e5) return `₹ ${(value / 1e5).toFixed(2)} L`;
  return `₹ ${Math.round(value).toLocaleString("en-IN")}`;
}

/** Value of orders still working, in total and by venue, largest first. */
export function workingExposure(orders: Order[]) {
  const byVenue = new Map<string, number>();
  let total = 0;
  let count = 0;
  for (const o of orders) {
    if (!WORKING.has(String(o.status || "").toUpperCase())) continue;
    const v = orderValue(o);
    if (!v) continue;
    total += v;
    count += 1;
    const x = String(o.exchange || "—");
    byVenue.set(x, (byVenue.get(x) || 0) + v);
  }
  const venues = Array.from(byVenue.entries())
    .map(([name, value]) => ({ name, value, share: total ? (value / total) * 100 : 0 }))
    .sort((a, b) => b.value - a.value);
  const unvalued = orders.filter((o) => WORKING.has(String(o.status || "").toUpperCase()) && valueMultiplier(o) === null);
  const excludedVenues = Array.from(new Set(unvalued.map((o) => String(o.exchange || "—")))).sort();
  return { total, count, venues, excluded: unvalued.length, excludedVenues };
}

/** Brokers by working order value, with their order count and reject rate. */
export function brokerExposure(orders: Order[], limit = 10) {
  const map = new Map<string, { value: number; orders: number; rejected: number }>();
  for (const o of orders) {
    const b = String(o.broker || "").trim();
    if (!b) continue;
    const m = map.get(b) || { value: 0, orders: 0, rejected: 0 };
    m.orders += 1;
    if (String(o.status || "").toUpperCase() === "REJECTED") m.rejected += 1;
    if (WORKING.has(String(o.status || "").toUpperCase())) m.value += orderValue(o);
    map.set(b, m);
  }
  return Array.from(map.entries())
    .map(([broker, m]) => ({ broker, ...m, rejectPct: m.orders ? (m.rejected / m.orders) * 100 : 0 }))
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

/** Rejections raised by RMS rules — the journal's record of a limit being hit. */
export function rmsBreaches(rejected: Order[]) {
  return rejected
    .filter((o) => String(o.rejection_category || "").startsWith("RMS /"))
    .map((o) => ({
      time: o.time || "",
      orderId: o.order_id || "",
      broker: o.broker || "—",
      segment: o.exchange || "—",
      rule: String(o.rejection_category).replace(/^RMS \/\s*/, ""),
      value: orderValue(o),
    }))
    .sort((a, b) => Date.parse(b.time) - Date.parse(a.time));
}

/** Breach counts per RMS rule, largest first. */
export function breachesByRule(rejected: Order[]) {
  const counts = new Map<string, number>();
  for (const b of rmsBreaches(rejected)) counts.set(b.rule, (counts.get(b.rule) || 0) + 1);
  return Array.from(counts.entries()).map(([rule, count]) => ({ rule, count })).sort((a, b) => b.count - a.count);
}

/** Working order value per time bin for the busiest venues (value placed, not a position). */
export function valueTrend(orders: Order[], top = 3, target = 30) {
  const venues = workingExposure(orders).venues.slice(0, top).map((v) => v.name);
  const times = orders.map((o) => Date.parse(String(o.time ?? ""))).filter((t) => !Number.isNaN(t));
  if (!times.length || !venues.length) return null;
  const min = Math.min(...times);
  const max = Math.max(...times);
  const steps = [15_000, 30_000, 60_000, 120_000, 300_000, 600_000, 1_800_000, 3_600_000];
  const width = steps.find((s) => (max - min) / s <= target) ?? 3_600_000;
  const start = Math.floor(min / width) * width;
  const n = Math.floor((max - start) / width) + 1;
  const series = venues.map((name) => ({ name, points: Array<number>(n).fill(0) }));
  for (const o of orders) {
    if (!WORKING.has(String(o.status || "").toUpperCase())) continue;
    const t = Date.parse(String(o.time ?? ""));
    const idx = venues.indexOf(String(o.exchange || ""));
    if (Number.isNaN(t) || idx < 0) continue;
    series[idx].points[Math.min(n - 1, Math.floor((t - start) / width))] += orderValue(o);
  }
  return { width, start, n, series };
}
