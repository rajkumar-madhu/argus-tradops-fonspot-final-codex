/**
 * Pure helpers for the order-latency stage timings (ORDERLATENCYSORTED files).
 *
 * Stages are named intervals with their own start and end, not a chain, so an order
 * is drawn as a timeline at true offsets. Stage codes are shown as recorded — their
 * names are not documented yet, and an invented label would read as fact.
 */
export type StageStat = {
  stage: string; orders: number; samples: number;
  p50: number | null; p90: number | null; p95: number | null; p99: number | null; max: number | null;
};
export type SlowOrder = {
  order_id: string; segment: string; instance: string; stages: number; span_us: number; first_start: string | null;
};
export type TraceStage = { stage: string; position: number; duration_us: number; start_us: number; end_us: number };

/** "824.5 µs" below a millisecond, "94.06 ms" above; missing or non-finite is "—". */
export function formatMicros(us: number | null | undefined): string {
  if (us == null || !Number.isFinite(us)) return '—';
  if (us < 1000) return `${us.toLocaleString('en-US', {maximumFractionDigits: 1})} µs`;
  return `${(us / 1000).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})} ms`;
}

/**
 * Bar width on a log scale, as a percentage of `max`. Stage timings span three orders
 * of magnitude (0.2 ms to 94 ms in one file); a linear bar would hide the small ones.
 */
export function logWidth(value: number | null | undefined, max: number): number {
  if (value == null || !Number.isFinite(value) || value <= 0 || max <= 0) return 0;
  return Math.min(100, (Math.log10(value + 1) / Math.log10(max + 1)) * 100);
}

/** A stage covering at least this share of the order's span is where the time went. */
const DOMINANT_SHARE = 0.5;

/** Timeline geometry: offsets and widths in percent of the order's observed span. */
export function traceBars(stages: TraceStage[], span: number) {
  const safe = span > 0 ? span : 1;
  return stages.map((s) => ({
    ...s,
    left: (s.start_us / safe) * 100,
    // Keep sub-percent stages visible as a sliver rather than vanishing.
    width: Math.max(((s.end_us - s.start_us) / safe) * 100, 0.6),
    dominant: s.duration_us >= DOMINANT_SHARE * safe,
  }));
}

/** Link query for this section: keeps every page filter, changes only the given keys. */
export function hopQuery(input: Record<string, string | string[] | undefined>, changes: Record<string, string>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) if (typeof value === 'string' && value) params.set(key, value);
  for (const [key, value] of Object.entries(changes)) value ? params.set(key, value) : params.delete(key);
  return params.toString();
}
