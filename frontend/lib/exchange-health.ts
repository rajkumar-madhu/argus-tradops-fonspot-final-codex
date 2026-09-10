// Derivations for the Exchange Health screen (reference mockup 01_19_13).
// Venue figures come from /api/exchanges and journal orders; latency comes from
// the ORDERLATENCY CSV by segment and stays in source units. There is no uptime,
// adapter-latency or announcement source, so none is derived.
// Self-contained so node --test can load it directly.

type Exchange = { name?: string; status?: string; reject_rate?: number | null; events?: number | null };
type Segment = { segment?: string; count?: number; p50?: number; p95?: number; p99?: number; max?: number };
type Order = { exchange?: string | null; time?: string | null; status?: string | null };

const IST_OFFSET_MS = 330 * 60_000;

function parse(t: unknown): number | null {
  const ms = Date.parse(String(t ?? ""));
  return Number.isNaN(ms) ? null : ms;
}

function istClock(ms: number, seconds = false): string {
  const d = new Date(ms + IST_OFFSET_MS);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}${seconds ? `:${p(d.getUTCSeconds())}` : ""}`;
}

/** One card per venue: observed events, reject rate and the segment's OMS p50. */
export function venueCards(exchanges: Exchange[], segments: Segment[], orders: Order[]) {
  const bySegment = new Map(segments.map((s) => [String(s.segment || ""), s]));
  const last = new Map<string, number>();
  const counts = new Map<string, number>();
  for (const o of orders) {
    const x = String(o.exchange || "");
    const t = parse(o.time);
    if (!x) continue;
    counts.set(x, (counts.get(x) || 0) + 1);
    if (t !== null && t > (last.get(x) ?? -Infinity)) last.set(x, t);
  }
  return exchanges
    .filter((x) => x.name)
    .map((x) => {
      const name = String(x.name);
      const seg = bySegment.get(name);
      const lastMs = last.get(name);
      return {
        name,
        status: String(x.status || ""),
        events: Number(x.events ?? 0),
        orders: counts.get(name) ?? 0,
        rejectRate: x.reject_rate == null ? null : Number(x.reject_rate),
        omsP50: typeof seg?.p50 === "number" ? seg.p50 : null,
        lastEvent: lastMs === undefined ? null : istClock(lastMs, true),
      };
    });
}

/** NSE equity timetable phase for an instant (IST), with the session bounds. */
export function sessionAt(iso: unknown) {
  const ms = parse(iso);
  if (ms === null) return null;
  const d = new Date(ms + IST_OFFSET_MS);
  const minute = d.getUTCHours() * 60 + d.getUTCMinutes();
  const phase =
    minute < 9 * 60 ? "Before market"
      : minute < 9 * 60 + 15 ? "Pre-open"
        : minute < 15 * 60 + 30 ? "Normal market"
          : minute < 15 * 60 + 40 ? "Closing session"
            : minute < 16 * 60 ? "Post-close"
              : "Market closed";
  const toClose = 15 * 60 + 30 - minute;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return {
    phase,
    open: phase === "Normal market",
    start: "09:15:00",
    end: "15:30:00",
    toClose: phase === "Normal market" ? `${Math.floor(toClose / 60)}h ${toClose % 60}m` : "—",
    clock: istClock(ms, true),
    date: `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`,
  };
}

/**
 * Orders per time bin, split by the `top` busiest exchanges, for the stacked
 * "Order Flow Health" bars. Smaller venues fold into "Other".
 */
export function flowByExchange(orders: Order[], top = 4, target = 30) {
  const times = orders.map((o) => parse(o.time)).filter((t): t is number => t !== null);
  if (!times.length) return null;
  const totals = new Map<string, number>();
  for (const o of orders) {
    const x = String(o.exchange || "");
    if (x) totals.set(x, (totals.get(x) || 0) + 1);
  }
  const names = Array.from(totals.entries()).sort((a, b) => b[1] - a[1]).slice(0, top).map(([n]) => n);
  const hasOther = totals.size > names.length;
  const series = hasOther ? [...names, "Other"] : names;
  const min = Math.min(...times);
  const max = Math.max(...times);
  const steps = [5_000, 10_000, 15_000, 30_000, 60_000, 120_000, 300_000, 600_000, 900_000, 1_800_000, 3_600_000];
  const width = steps.find((s) => (max - min) / s <= target) ?? 3_600_000;
  const start = Math.floor(min / width) * width;
  const n = Math.floor((max - start) / width) + 1;
  const bins = Array.from({ length: n }, (_, i) => ({ start: start + i * width, values: series.map(() => 0) }));
  for (const o of orders) {
    const t = parse(o.time);
    if (t === null) continue;
    const x = String(o.exchange || "");
    const idx = names.includes(x) ? names.indexOf(x) : hasOther ? series.length - 1 : -1;
    if (idx < 0) continue;
    bins[Math.min(n - 1, Math.floor((t - start) / width))].values[idx] += 1;
  }
  return { series, width, bins: bins.map((b) => ({ label: istClock(b.start), values: b.values })) };
}
