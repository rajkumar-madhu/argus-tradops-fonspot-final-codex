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
