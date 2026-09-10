// Derivations for the Order Rejections screen (reference mockup 01_18_56).
// Everything is computed from the rejected orders /api/rejections returns and
// the order universe /api/orders returns; reasons arrive already masked.
// Self-contained so node --test can load it directly.

export type Row = {
  order_id?: string; time?: string | null; status?: string | null; exchange?: string | null;
  type?: string | null; product?: string | null; code?: string | null; reason?: string | null;
  rejection_category?: string | null; symbol?: string | null; price?: number | null; qty?: number | null;
};

const isRejected = (r: Row) => String(r.status || "").toUpperCase() === "REJECTED";
const pct = (n: number, d: number) => (d ? (n / d) * 100 : 0);

function parse(t: unknown): number | null {
  const ms = Date.parse(String(t ?? ""));
  return Number.isNaN(ms) ? null : ms;
}

/** Most frequent value of `key` in rows, with its count. */
function top<T extends Row>(rows: T[], key: (r: T) => string) {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const k = key(r);
    if (k) counts.set(k, (counts.get(k) || 0) + 1);
  }
  let best = "";
  let n = 0;
  for (const [k, c] of counts) if (c > n) { best = k; n = c; }
  return best ? { value: best, count: n } : null;
}

export function rejectionKpis(rejected: Row[], totalOrders: number) {
  const codes = new Set(rejected.map((r) => String(r.code || "")).filter(Boolean));
  const code = top(rejected, (r) => String(r.code || ""));
  const reasonForCode = code ? top(rejected.filter((r) => String(r.code || "") === code.value), (r) => String(r.reason || "")) : null;
  const category = top(rejected, (r) => String(r.rejection_category || ""));
  return {
    totalOrders,
    rejected: rejected.length,
    rate: pct(rejected.length, totalOrders),
    uniqueCodes: codes.size,
    topCode: code ? { code: code.value, count: code.count, reason: reasonForCode?.value || "" } : null,
    topCategory: category ? { name: category.value, count: category.count, share: pct(category.count, rejected.length) } : null,
  };
}

/**
 * Rejected orders per time bin and the rejection rate within each bin. The bin
 * width adapts so the window yields about `target` bars.
 */
export function rejectionTrend(orders: Row[], target = 12) {
  const times = orders.map((o) => parse(o.time)).filter((t): t is number => t !== null);
  if (!times.length) return null;
  const min = Math.min(...times);
  const max = Math.max(...times);
  const steps = [15_000, 30_000, 60_000, 120_000, 300_000, 600_000, 900_000, 1_800_000, 3_600_000];
  const width = steps.find((s) => (max - min) / s <= target) ?? 3_600_000;
  const start = Math.floor(min / width) * width;
  const n = Math.max(1, Math.floor((max - start) / width) + 1);
  const bins = Array.from({ length: n }, (_, i) => ({ start: start + i * width, total: 0, rejected: 0 }));
  for (const o of orders) {
    const t = parse(o.time);
    if (t === null) continue;
    const b = bins[Math.min(n - 1, Math.floor((t - start) / width))];
    b.total += 1;
    if (isRejected(o)) b.rejected += 1;
  }
  return { width, bins: bins.map((b) => ({ ...b, rate: pct(b.rejected, b.total) })) };
}

/** Rejections by a dimension with the dimension's total orders and rate. */
export function rejectionsBy(orders: Row[], key: keyof Row) {
  const map = new Map<string, { total: number; rejected: number }>();
  for (const o of orders) {
    const k = String(o[key] ?? "").trim() || "—";
    const m = map.get(k) || { total: 0, rejected: 0 };
    m.total += 1;
    if (isRejected(o)) m.rejected += 1;
    map.set(k, m);
  }
  return Array.from(map.entries())
    .map(([name, m]) => ({ name, total: m.total, rejected: m.rejected, rate: pct(m.rejected, m.total) }))
    .filter((r) => r.rejected > 0)
    .sort((a, b) => b.rejected - a.rejected || a.name.localeCompare(b.name));
}

/** Rejection codes ranked by count, each with its most common (masked) reason. */
export function topCodes(rejected: Row[], limit = 10) {
  const map = new Map<string, Row[]>();
  for (const r of rejected) {
    const code = String(r.code || "").trim() || "—";
    map.set(code, [...(map.get(code) || []), r]);
  }
  return Array.from(map.entries())
    .map(([code, rows]) => ({
      code,
      count: rows.length,
      share: pct(rows.length, rejected.length),
      reason: top(rows, (r) => String(r.reason || "").trim())?.value || "No recorded reason",
      category: top(rows, (r) => String(r.rejection_category || ""))?.value || "",
    }))
    .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code))
    .slice(0, limit);
}

/** Categories as donut slices, largest first; the tail beyond `limit` folds into "Others". */
export function categorySlices(rejected: Row[], limit = 5) {
  const counts = new Map<string, number>();
  for (const r of rejected) {
    const c = String(r.rejection_category || "").trim() || "Uncategorized";
    counts.set(c, (counts.get(c) || 0) + 1);
  }
  const ranked = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  const head = ranked.slice(0, limit);
  const rest = ranked.slice(limit).reduce((a, [, c]) => a + c, 0);
  const rows = rest ? [...head, ["Others", rest] as [string, number]] : head;
  return rows.map(([name, count]) => ({ name, count, share: pct(count, rejected.length) }));
}

export function recentRejections(rejected: Row[], limit = 8) {
  return [...rejected]
    .sort((a, b) => (parse(b.time) ?? 0) - (parse(a.time) ?? 0))
    .slice(0, limit);
}
