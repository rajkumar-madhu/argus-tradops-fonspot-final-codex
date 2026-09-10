/**
 * Pure helpers for the journal explorer at /logs.
 *
 * Labels are only applied where the code's meaning is established in
 * NOREN_FIELD_MAP.md or CLAUDE.md. Anything else keeps its raw code and is
 * marked untranslated — an invented label would read as fact to an operator.
 */

export type FacetValue = { value: string; count: number; selected: boolean; label: string | null };
export type Facet = { field: string; values: FacetValue[]; truncated: boolean };
export type HistogramBucket = { start: string; count: number };

/** Human names for the facet dimensions. These name the field, not the code. */
const FIELD_LABELS: Record<string, string> = {
  ExchSeg: "Exchange segment",
  TransType: "Side",
  PriceType: "Price type",
  Product: "Product",
  OrdStatus: "Order status",
  ReportType: "Report type",
  RejBy: "Rejected by",
  OrdSrc: "Order source",
  OrdDuration: "Duration",
  AccessType: "Access type",
  ReqStatus: "Request status",
  UserPrivilege: "User privilege",
  "Userdetails.BrokerId": "Broker",
};

export function fieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? field;
}

/** Documented in NOREN_FIELD_MAP.md; the only value translation we assert. */
const SIDE_LABELS: Record<string, string> = { B: "BUY", S: "SELL" };

/**
 * Order status codes with a documented meaning, per CLAUDE.md.
 *
 * Mirrors STATUS_LABELS in backend/app/journal_explore.py — a code added on one
 * side must be added on the other, or the row and the facet will disagree about
 * the same value. Codes absent here render as untranslated rather than guessed.
 */
export const STATUS_LABELS: Record<string, string> = {
  "48": "Open", "50": "Complete", "52": "Cancelled", "54": "Trigger pending",
  "56": "Rejected", "65": "Rejected", "109": "Pending", "110": "Pending",
  "115": "Pending",
};

export function valueLabel(field: string, value: string, backendLabel?: string | null): string | null {
  if (field === "TransType") return SIDE_LABELS[value] ?? null;
  if (field === "OrdStatus") return STATUS_LABELS[value] ?? backendLabel ?? null;
  return backendLabel ?? null;
}

/** Fields whose values are numeric codes rather than readable text. */
const CODED_FIELDS = new Set(["OrdStatus", "ReportType"]);

/** True when a coded value has no established meaning we can show. */
export function isUntranslated(field: string, value: string, backendLabel?: string | null): boolean {
  return CODED_FIELDS.has(field) && !valueLabel(field, value, backendLabel);
}

/**
 * Display text for a facet or cell value.
 *
 * A coded field keeps its code next to the label: several distinct order-status
 * codes share one label ("Pending" is 109, 110 and 115), so a label alone would
 * render three different filters as three identical rows.
 */
export function displayValue(field: string, value: string, backendLabel?: string | null): string {
  const label = valueLabel(field, value, backendLabel);
  if (!label) return value;
  return CODED_FIELDS.has(field) ? `${label} (${value})` : label;
}

/** Row tone from the documented order-status codes. Unknown codes stay neutral. */
export function statusTone(status: unknown): "rejected" | "complete" | "open" | "pending" | "cancelled" | "" {
  const code = String(status ?? "");
  if (code === "56" || code === "65") return "rejected";
  if (code === "50") return "complete";
  if (code === "52") return "cancelled";
  if (code === "48") return "open";
  if (code === "109" || code === "110" || code === "115") return "pending";
  return "";
}

const FACET_PARAM = "facet";

/** Encoded `field:value` pair as the backend expects it. */
export function facetToken(field: string, value: string): string {
  return `${field}:${value}`;
}

/**
 * Toggle one facet value on or off, returning fresh search params.
 *
 * Changing a filter resets paging: leaving `offset` behind would land the
 * operator on a page that no longer exists in the narrowed result set.
 */
export function toggleFacet(params: URLSearchParams, field: string, value: string): URLSearchParams {
  const next = new URLSearchParams(params);
  const token = facetToken(field, value);
  const existing = next.getAll(FACET_PARAM);
  next.delete(FACET_PARAM);
  let removed = false;
  for (const item of existing) {
    if (item === token) {
      removed = true;
      continue;
    }
    next.append(FACET_PARAM, item);
  }
  if (!removed) next.append(FACET_PARAM, token);
  next.delete("offset");
  return next;
}

export function clearFacets(params: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(params);
  next.delete(FACET_PARAM);
  next.delete("offset");
  return next;
}

export function selectedFacets(params: URLSearchParams): { field: string; value: string }[] {
  return params.getAll(FACET_PARAM).flatMap((item) => {
    const at = item.indexOf(":");
    if (at <= 0) return [];
    return [{ field: item.slice(0, at), value: item.slice(at + 1) }];
  });
}

/** Bar heights as percentages of the tallest bucket, so an empty set is flat. */
export function histogramHeights(buckets: HistogramBucket[]): number[] {
  const peak = buckets.reduce((max, bucket) => Math.max(max, bucket.count), 0);
  if (peak <= 0) return buckets.map(() => 0);
  return buckets.map((bucket) => Math.round((bucket.count / peak) * 100));
}

/** Page window for the pager, clamped to the real result count. */
export function pageBounds(count: number, limit: number, offset: number) {
  const safeLimit = Math.max(1, limit);
  const start = count === 0 ? 0 : Math.min(offset, Math.max(0, count - 1));
  const end = Math.min(count, start + safeLimit);
  return {
    start,
    end,
    first: count === 0 ? 0 : start + 1,
    hasPrev: start > 0,
    hasNext: end < count,
    prevOffset: Math.max(0, start - safeLimit),
    nextOffset: start + safeLimit,
  };
}

export function withOffset(params: URLSearchParams, offset: number): URLSearchParams {
  const next = new URLSearchParams(params);
  if (offset <= 0) next.delete("offset");
  else next.set("offset", String(offset));
  return next;
}

/** Short UTC time for a histogram axis or row column. */
export function shortTime(iso: unknown): string {
  const text = String(iso ?? "");
  if (!text) return "—";
  const at = text.indexOf("T");
  if (at < 0) return text;
  return text.slice(at + 1, at + 9);
}

/**
 * Columns shown on the collapsed row, per message type. The expanded panel
 * always shows every column the backend returned, so this is a reading order
 * for the summary line and not a restriction on what is available.
 */
const SUMMARY_COLUMNS: Record<string, string[]> = {
  ordupd: ["Event Time (UTC)", "OrdStatus", "TradingSymbol", "ExchSeg", "TransType",
           "QtyToFill", "PriceToFill", "NorenOrdNum"],
  login: ["Event Time (UTC)", "UserId", "AccessType", "ReqStatus", "UserPrivilege"],
  logout: ["Event Time (UTC)", "UserId", "AccessType", "ReqStatus", "UserPrivilege"],
  yel_connected: ["Event Time (UTC)", "Seqno", "msg_seq"],
};

export function summaryColumns(msgType: string, available: string[]): string[] {
  const wanted = SUMMARY_COLUMNS[msgType] ?? [];
  const present = new Set(available);
  const chosen = wanted.filter((column) => present.has(column));
  return chosen.length ? chosen : available.slice(0, 6);
}

/** Cell text for the summary line; blanks render as an em dash, not "null". */
export function cellText(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

/* ── IST presentation ────────────────────────────────────────────────────
   The desk works in IST; the journal stores UTC ISO strings and UNIX seconds.
   Raw values stay visible in the field grid; these helpers add the reading. */

const IST_OFFSET_MS = 330 * 60_000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Epoch ms from an ISO string or UNIX seconds/milliseconds; null otherwise. */
export function toEpochMs(value: unknown): number | null {
  if (value === null || value === undefined || value === "" || typeof value === "boolean") return null;
  const text = String(value).trim();
  if (/^\d{9,10}(\.\d+)?$/.test(text)) return Number(text) * 1000;
  if (/^\d{13}$/.test(text)) return Number(text);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(text)) return null;
  const ms = Date.parse(text);
  return Number.isNaN(ms) ? null : ms;
}

function istParts(ms: number) {
  const d = new Date(ms + IST_OFFSET_MS);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    time: `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`,
    date: `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`,
  };
}

/** "09:14:01" in IST, or "—". */
export function istTime(value: unknown): string {
  const ms = toEpochMs(value);
  return ms === null ? "—" : istParts(ms).time;
}

/** "30 Jun 2026, 09:14:01 IST", or "—". */
export function istStamp(value: unknown): string {
  const ms = toEpochMs(value);
  if (ms === null) return "—";
  const p = istParts(ms);
  return `${p.date}, ${p.time} IST`;
}

/** IST reading for a timestamp-shaped field, shown beside the raw value; null for anything else. */
export function timeHint(field: string, value: unknown): string | null {
  if (!/time|stamp/i.test(field) || /nsecs/i.test(field)) return null;
  const ms = toEpochMs(value);
  if (ms === null) return null;
  const year = new Date(ms).getUTCFullYear();
  return year >= 2000 && year <= 2100 ? istStamp(ms) : null;
}

/**
 * Collapsed-row header. The event time column is presented in IST; a few order
 * fields get short names (the raw field name stays in the header's tooltip).
 * Prices keep raw source units in this view, and the header says so.
 */
const COLUMN_HEADERS: Record<string, string> = {
  "Event Time (UTC)": "Time (IST)",
  OrdStatus: "Status",
  TradingSymbol: "Symbol",
  ExchSeg: "Exch",
  TransType: "Side",
  QtyToFill: "Qty",
  PriceToFill: "Price (raw)",
  NorenOrdNum: "Order no.",
};

export function columnHeader(column: string): string {
  return COLUMN_HEADERS[column] ?? column;
}

/** "+<1 ms", "+850 ms", "+12.3 s", "+4m 05s", "+2h 03m", "+1d 04h". */
export function formatGap(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "";
  if (ms < 1) return "+<1 ms";
  if (ms < 1000) return `+${Math.round(ms)} ms`;
  const s = ms / 1000;
  if (s < 60) return `+${s.toFixed(1)} s`;
  const pad = (n: number) => String(Math.floor(n)).padStart(2, "0");
  if (s < 3600) return `+${Math.floor(s / 60)}m ${pad(s % 60)}s`;
  if (s < 86400) return `+${Math.floor(s / 3600)}h ${pad((s % 3600) / 60)}m`;
  return `+${Math.floor(s / 86400)}d ${pad((s % 86400) / 3600)}h`;
}

type LifecycleEvent = {
  time?: string | null; status_code?: number | string | null; qty?: number | null;
  filled_qty?: number | null; price?: number | null; fill_price?: number | null; exchange_order_id?: string | null;
};

/**
 * Journal events for one order, oldest first, with the gap from the previous
 * event. Reasons are deliberately not carried: the lifecycle route returns them
 * unmasked, and the explorer shows only the masked RejReason from its own row.
 */
export function lifecycleSteps(events: LifecycleEvent[]) {
  const sorted = [...events]
    .map((e) => ({ e, ms: toEpochMs(e.time) }))
    .sort((a, b) => (a.ms ?? Infinity) - (b.ms ?? Infinity));
  return sorted.map(({ e, ms }, i) => {
    const prev = i > 0 ? sorted[i - 1].ms : null;
    const code = e.status_code === null || e.status_code === undefined ? "" : String(e.status_code);
    return {
      time: istTime(e.time),
      status: code ? displayValue("OrdStatus", code) : "—",
      tone: statusTone(code),
      gap: ms !== null && prev !== null ? formatGap(ms - prev) : "",
      qty: e.qty ?? null,
      filled: e.filled_qty ?? null,
      price: e.price ?? null,
      fillPrice: e.fill_price ?? null,
      exchangeOrderId: e.exchange_order_id || "",
    };
  });
}

/* ── Outcome breakdown ("logs by level") ─────────────────────────────────
   The journal has no log level. The nearest honest analogue is each record's
   outcome: order status for ordupd, request status for logins and logouts.
   Groups collect documented codes only; anything else is "Undocumented". */

export type LevelGroup = { key: string; label: string; color: string; cls: string; codes: string };

const ORDER_LEVELS: LevelGroup[] = [
  { key: "rejected", label: "Rejected", color: "#e5383b", cls: "seg-red", codes: "56, 65" },
  { key: "pending", label: "Pending", color: "#f59e0b", cls: "seg-amber", codes: "109, 110, 115 and trigger pending 54" },
  { key: "open", label: "Open", color: "#78716c", cls: "seg-neutral", codes: "48" },
  { key: "complete", label: "Complete", color: "#16a34a", cls: "seg-green", codes: "50" },
  { key: "cancelled", label: "Cancelled", color: "#a8a29e", cls: "seg-muted", codes: "52" },
  { key: "other", label: "Undocumented", color: "#8b5cf6", cls: "seg-purple", codes: "codes with no documented meaning" },
];

const REQUEST_LEVELS: LevelGroup[] = [
  { key: "ok", label: "Success", color: "#16a34a", cls: "seg-green", codes: "request status contains “success”" },
  { key: "other", label: "Other status", color: "#e5383b", cls: "seg-red", codes: "any other request status" },
];

export function levelGroups(field: string | null | undefined): LevelGroup[] {
  if (field === "OrdStatus") return ORDER_LEVELS;
  if (field === "ReqStatus") return REQUEST_LEVELS;
  return [];
}

/** The outcome group a level-field value falls in. */
export function levelKey(field: string, value: string): string {
  if (field === "OrdStatus") {
    if (value === "54") return "pending";
    return statusTone(value) || "other";
  }
  if (field === "ReqStatus") return /success/i.test(value) ? "ok" : "other";
  return "other";
}

export type LevelBucket = HistogramBucket & { by?: Record<string, number> };

/**
 * Stacked-bar series from histogram buckets that carry a per-value `by` split.
 * Only groups with at least one record are returned, in the fixed order above,
 * with totals over dated records. Null when the kind has no level field.
 */
export function levelBreakdown(buckets: LevelBucket[], field: string | null | undefined) {
  const groups = levelGroups(field);
  if (!field || !groups.length || !buckets.some((b) => b.by)) return null;
  const index = new Map(groups.map((g, i) => [g.key, i]));
  const rows = buckets.map((b) => {
    const values = groups.map(() => 0);
    for (const [value, count] of Object.entries(b.by ?? {})) values[index.get(levelKey(field, value)) ?? index.get("other")!] += count;
    return { start: b.start, values };
  });
  const totals = groups.map((_, i) => rows.reduce((sum, r) => sum + r.values[i], 0));
  const keep = groups.map((_, i) => i).filter((i) => totals[i] > 0);
  const total = totals.reduce((a, v) => a + v, 0);
  return {
    total,
    groups: keep.map((i) => ({ ...groups[i], total: totals[i], share: total ? (totals[i] / total) * 100 : 0 })),
    bins: rows.map((r) => ({ start: r.start, values: keep.map((i) => r.values[i]) })),
  };
}

/** Facet rows for the level field carry the group's colour dot. */
export function levelColor(field: string, value: string, levelField: string | null | undefined): string | null {
  if (field !== levelField) return null;
  const key = levelKey(field, value);
  return levelGroups(field).find((g) => g.key === key)?.color ?? null;
}

/**
 * Grid tracks for the collapsed row. Rows are separate grids, so widths must
 * come from the column, not the content, for columns to line up; fixed tracks
 * keep identifiers such as a 14-digit order number on one line.
 */
const COLUMN_TRACKS: Record<string, string> = {
  "Event Time (UTC)": "76px",
  OrdStatus: "minmax(118px, 1fr)",
  TradingSymbol: "minmax(130px, 1.4fr)",
  ExchSeg: "54px",
  TransType: "50px",
  QtyToFill: "minmax(64px, .7fr)",
  PriceToFill: "minmax(72px, .7fr)",
  NorenOrdNum: "128px",
  UserId: "minmax(110px, 1fr)",
};

export function columnTracks(columns: string[]): string {
  return ["22px", ...columns.map((c) => COLUMN_TRACKS[c] ?? "minmax(80px, 1fr)")].join(" ");
}
