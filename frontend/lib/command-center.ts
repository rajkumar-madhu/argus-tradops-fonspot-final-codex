// Derivations behind the dashboard's Command Center section. Every value comes
// from an API payload; where a source cannot back a panel the helpers return
// null/empty and the panel renders an empty state instead of a stand-in number.
// Self-contained (no `@/` imports) so node --test can load it directly.

export type Tone = "ok" | "warn" | "bad" | "idle";

type OrderRow = { time?: string | null; status?: string | null; broker?: string | null };
export type Percentiles = { samples?: number; p50?: number; p90?: number; p95?: number; p99?: number; max?: number };

const IST_OFFSET_MS = 330 * 60_000;

function parse(iso: unknown): number | null {
  const t = Date.parse(String(iso ?? ""));
  return Number.isNaN(t) ? null : t;
}

/** "HH:MM" in IST, independent of the server's time zone. */
export function istClock(iso: unknown): string {
  const t = parse(iso);
  if (t === null) return "—";
  const d = new Date(t + IST_OFFSET_MS);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function istDate(iso: unknown): string {
  const t = parse(iso);
  if (t === null) return "—";
  const d = new Date(t + IST_OFFSET_MS);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function istMinuteOfDay(t: number): number {
  const d = new Date(t + IST_OFFSET_MS);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

/** NSE equity session timetable, minutes after midnight IST. */
export const NSE_PHASES = [
  { name: "Pre-open", start: 9 * 60, end: 9 * 60 + 15 },
  { name: "Normal market", start: 9 * 60 + 15, end: 15 * 60 + 30 },
  { name: "Closing session", start: 15 * 60 + 30, end: 15 * 60 + 40 },
  { name: "Post-close", start: 15 * 60 + 40, end: 16 * 60 },
];

export type ObservedWindow = { label: string; from?: string | null; to?: string | null };

/**
 * Mark which session phases each data window covers. A file snapshot is
 * history, so the rail shows the observed windows rather than "now".
 */
export function sessionRail(windows: ObservedWindow[]) {
  const spans = windows
    .map((w) => ({ label: w.label, from: parse(w.from), to: parse(w.to) }))
    .filter((w): w is { label: string; from: number; to: number } => w.from !== null && w.to !== null && w.to >= w.from)
    .map((w) => ({
      label: w.label,
      date: istDate(new Date(w.from).toISOString()),
      range: `${istClock(new Date(w.from).toISOString())}–${istClock(new Date(w.to).toISOString())}`,
      startMin: istMinuteOfDay(w.from),
      endMin: w.to - w.from >= 86_400_000 ? 24 * 60 : istMinuteOfDay(w.to),
    }));
  const phases = NSE_PHASES.map((p) => ({
    ...p,
    window: `${hhmm(p.start)}–${hhmm(p.end)}`,
    observedBy: spans.filter((s) => s.startMin < p.end && s.endMin >= p.start).map((s) => s.label),
  }));
  return { phases, windows: spans };
}

export type VenueState = { name: string; events: number; lastEvent: string; ageSeconds: number | null; state: "live" | "delayed" | "stale" | "closed" | "unknown" };

/**
 * Per-venue liveness from the newest event each venue produced, judged with the
 * same thresholds and trading window as /api/freshness. "closed" is a quiet
 * venue outside the session; "stale" is a quiet venue inside it. A venue with no
 * timestamped event is "unknown", never green.
 */
export function venueStates(exchanges: any, fresh: any): VenueState[] {
  const rows: any[] = Array.isArray(exchanges) ? exchanges : [];
  const now = parse(fresh?.generated_at) ?? Date.now();
  const live = Number(fresh?.thresholds?.live_seconds ?? 60);
  const delayed = Number(fresh?.thresholds?.delayed_seconds ?? 300);
  const open = fresh?.trading_open === true;
  return rows
    .map((x) => {
      const last = parse(x.last_event);
      const age = last === null ? null : Math.max(0, (now - last) / 1000);
      const state: VenueState["state"] =
        age === null ? "unknown" : age <= live ? "live" : age <= delayed ? "delayed" : open ? "stale" : "closed";
      return { name: String(x.name || "—"), events: Number(x.events || 0), lastEvent: last === null ? "—" : istClock(new Date(last).toISOString()), ageSeconds: age === null ? null : Math.round(age), state };
    })
    .sort((a, b) => b.events - a.events);
}

function hhmm(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

function minuteBins(orders: OrderRow[]) {
  const bins = new Map<number, { total: number; rejected: number }>();
  for (const o of orders) {
    const t = parse(o.time);
    if (t === null) continue;
    const key = Math.floor(t / 60_000) * 60_000;
    const b = bins.get(key) || { total: 0, rejected: 0 };
    b.total += 1;
    if (String(o.status || "").toUpperCase() === "REJECTED") b.rejected += 1;
    bins.set(key, b);
  }
  const keys = Array.from(bins.keys()).sort((a, b) => a - b);
  if (!keys.length) return [];
  // Include empty minutes so gaps read as zero, not as a compressed axis.
  const out: { minute: number; total: number; rejected: number }[] = [];
  for (let k = keys[0]; k <= keys[keys.length - 1]; k += 60_000) {
    const b = bins.get(k) || { total: 0, rejected: 0 };
    out.push({ minute: k, ...b });
  }
  return out;
}

/** Orders per minute from order event times. Null when no row carries a time. */
export function orderBurst(orders: OrderRow[]) {
  const bins = minuteBins(orders);
  if (!bins.length) return null;
  const totals = bins.map((b) => b.total);
  const peakIdx = totals.indexOf(Math.max(...totals));
  return {
    bars: totals,
    peak: totals[peakIdx],
    peakAt: istClock(new Date(bins[peakIdx].minute).toISOString()),
    avg: totals.reduce((a, b) => a + b, 0) / totals.length,
    last: totals[totals.length - 1],
    minutes: bins.length,
    from: istClock(new Date(bins[0].minute).toISOString()),
    to: istClock(new Date(bins[bins.length - 1].minute).toISOString()),
  };
}

/** Per-minute reject rate (%) over the same bins as `orderBurst`. */
export function rejectRateTrend(orders: OrderRow[]) {
  const bins = minuteBins(orders);
  if (!bins.length) return null;
  const total = bins.reduce((a, b) => a + b.total, 0);
  const rejected = bins.reduce((a, b) => a + b.rejected, 0);
  const points = bins.map((b) => (b.total ? (b.rejected / b.total) * 100 : 0));
  const peakIdx = points.indexOf(Math.max(...points));
  return {
    points,
    overall: total ? (rejected / total) * 100 : 0,
    rejected,
    total,
    peak: points[peakIdx],
    peakAt: istClock(new Date(bins[peakIdx].minute).toISOString()),
  };
}

/**
 * Brokers ranked by rejected orders. "Above desk average" compares a broker's
 * reject rate with the reject rate across all loaded orders; it is a relative
 * marker, not a configured alert threshold.
 */
export function clientImpact(orders: OrderRow[], limit = 6) {
  const byBroker = new Map<string, { orders: number; rejected: number }>();
  let total = 0;
  let rejected = 0;
  for (const o of orders) {
    const broker = String(o.broker || "").trim();
    if (!broker) continue;
    const b = byBroker.get(broker) || { orders: 0, rejected: 0 };
    b.orders += 1;
    total += 1;
    if (String(o.status || "").toUpperCase() === "REJECTED") {
      b.rejected += 1;
      rejected += 1;
    }
    byBroker.set(broker, b);
  }
  const deskRate = total ? (rejected / total) * 100 : 0;
  const rows = Array.from(byBroker.entries()).map(([broker, b]) => {
    const rejectPct = b.orders ? (b.rejected / b.orders) * 100 : 0;
    return { broker, orders: b.orders, rejected: b.rejected, rejectPct, aboveAvg: b.rejected > 0 && rejectPct > deskRate };
  });
  rows.sort((a, b) => b.rejected - a.rejected || b.rejectPct - a.rejectPct || a.broker.localeCompare(b.broker));
  return {
    rows: rows.filter((r) => r.rejected > 0).slice(0, limit),
    brokers: rows.length,
    impacted: rows.filter((r) => r.rejected > 0).length,
    deskRate,
  };
}

/** The hop with the larger p99 among the latency file's two measured spans. */
export function slowestHop(summary: { oms?: Percentiles; confirmation?: Percentiles } | null | undefined) {
  const hops = [
    { name: "OMS", p99: summary?.oms?.p99 },
    { name: "Exchange confirmation", p99: summary?.confirmation?.p99 },
  ].filter((h): h is { name: string; p99: number } => typeof h.p99 === "number" && Number.isFinite(h.p99));
  if (!hops.length) return null;
  return hops.reduce((a, b) => (b.p99 > a.p99 ? b : a));
}

/** True when the API refused the request for this user's role (not an outage). */
export function isDenied(payload: any): boolean {
  return payload?._status === 401 || payload?._status === 403;
}

/** Finite numbers only: a null bucket mean is a missing measurement, not zero. */
export function measured(values: unknown[]): number[] {
  return values.filter((v) => v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v))).map(Number);
}

/** Tone for a dependency state string reported by the API. */
export function stateTone(state: unknown): Tone {
  const s = String(state ?? "").toLowerCase();
  if (!s || s === "—") return "idle";
  if (["ready", "connected", "loaded", "ok", "healthy", "green"].includes(s)) return "ok";
  if (s.includes("not configured") || s.includes("no data")) return "idle";
  if (s.includes("yellow") || s.includes("degraded") || s.includes("partial")) return "warn";
  return "bad";
}

export function platformHealth(infra: any, ready: any) {
  const readyState = ready?._error ? "Unavailable" : ready?.status === "ready" ? "Ready" : ready?.status || "Unavailable";
  return [
    { name: "API", state: readyState },
    { name: "Elasticsearch", state: infra?.elasticsearch?.status || "Unavailable" },
    { name: "Redis", state: infra?.redis?.status || "Unavailable" },
    { name: "PostgreSQL", state: infra?.postgres?.status || "Unavailable" },
    { name: "Journal", state: infra?.journal?.status || "Not configured" },
    { name: "Prometheus", state: infra?.prometheus?.status || "Not configured" },
  ].map((row) => ({ ...row, tone: stateTone(row.state) }));
}

/** Readiness from /health/ready: count of dependencies reporting ready. */
export function readiness(ready: any) {
  const deps: Record<string, string> = ready?.dependencies || {};
  const names = Object.keys(deps);
  const up = names.filter((n) => deps[n] === "ready").length;
  const ok = !ready?._error && ready?.status === "ready";
  // /health/ready answers 503 when a dependency is down: reachable, but not ready.
  const label = ok ? "READY" : ready?._status === 503 ? "NOT READY" : ready?._error ? "UNREACHABLE" : "DEGRADED";
  return {
    ok,
    label,
    up,
    total: names.length,
    mode: String(ready?.mode || ""),
    down: names.filter((n) => deps[n] !== "ready"),
  };
}

type SourceFile = {
  name?: string;
  kind?: string;
  state?: string;
  rows?: number;
  rejected?: number;
  duplicates?: number;
  invalid_values?: number;
  missing_values?: number;
  timestamp_mismatches?: number;
  identical_content_to?: string | null;
};

export function dataQuality(sources: any) {
  const files: SourceFile[] = Array.isArray(sources?.items) ? sources.items : Array.isArray(sources?.files) ? sources.files : [];
  if (!files.length) return null;
  const sum = (k: keyof SourceFile) => files.reduce((a, f) => a + Number(f[k] || 0), 0);
  return {
    files: files.length,
    rows: sum("rows"),
    rejected: sum("rejected"),
    duplicates: sum("duplicates"),
    invalid: sum("invalid_values"),
    missing: sum("missing_values"),
    mismatches: sum("timestamp_mismatches"),
    identical: files.filter((f) => f.identical_content_to).length,
  };
}

/**
 * One chip per source the API actually reports: the live Elasticsearch read
 * path when that is the data source, the journal only when /api/infra reports
 * one, and each ingested CSV file. Nothing is added for sources that are absent.
 */
export function sourceChips(sources: any, infra: any, dataSource?: string) {
  const files: SourceFile[] = Array.isArray(sources?.items) ? sources.items : [];
  const chips: { name: string; state: string; tone: Tone }[] = [];
  if (infra && !infra._error) {
    if (dataSource === "elasticsearch" && infra.elasticsearch) {
      const es = String(infra.elasticsearch.status || "Unavailable");
      chips.push({ name: "Elasticsearch", state: es, tone: stateTone(es) });
    }
    if (infra.journal) {
      const j = String(infra.journal.status || "Unknown");
      chips.push({ name: "Journal.log", state: j, tone: stateTone(j) });
    }
  }
  for (const f of files) {
    const state = String(f.state || "Unknown");
    chips.push({ name: String(f.name || f.kind || "CSV"), state, tone: stateTone(state) });
  }
  return chips;
}

type QueueSource = {
  instance?: string;
  latest?: number | null;
  peak?: number | null;
  max_depth?: number | null;
  episodes?: number | null;
  rows_per_second?: number | null;
  longest_episode_seconds?: number | null;
  state?: string;
  last_observed?: string | null;
  identical_content_to?: string | null;
};

/** Queue instances with data, largest peak first. Aliases are kept separate: never summed. */
export function queueInstances(queues: any) {
  const items: QueueSource[] = Array.isArray(queues?.sources) ? queues.sources : Array.isArray(queues?.items) ? queues.items : [];
  const withData = items.filter((q) => typeof q.peak === "number");
  withData.sort((a, b) => Number(b.peak) - Number(a.peak));
  return {
    rows: withData.map((q) => ({
      instance: String(q.instance || "—"),
      latest: q.latest ?? null,
      peak: q.peak ?? null,
      // Peak of the deepest backlog episode; a QueSize file is one row per
      // processed message, so the mean of the column is meaningless and is not carried.
      maxDepth: q.max_depth ?? q.peak ?? null,
      episodes: q.episodes ?? null,
      rowsPerSecond: q.rows_per_second ?? null,
      longestEpisodeSeconds: q.longest_episode_seconds ?? null,
      lastObserved: q.last_observed ? istClock(q.last_observed) : "—",
    })),
    total: items.length,
    empty: items.length - withData.length,
  };
}

/** Evenly sample a series down to `n` points for a sparkline. */
export function sample(points: number[], n = 48): number[] {
  if (points.length <= n) return points;
  const step = points.length / n;
  return Array.from({ length: n }, (_, i) => points[Math.floor(i * step)]);
}
