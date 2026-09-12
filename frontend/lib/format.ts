/** Integer/count formatter. A missing value renders "—": 0 means measured zero. */
export function fmt(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString() : "—";
}

export function money(v: unknown): string {
  const n = Number(v || 0);
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export const UNVERIFIED_PRICE_SCALE = "unverified scale";

/** A normalised price: 2–4 decimals, since currency and bond futures tick at ₹0.0025. */
export function priceText(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

/**
 * `/api/config` price divisors grouped by value, e.g.
 * "NSE, BSE, NFO, BFO, MCX ÷100 · CDS ÷10,000,000". Segments absent are
 * shown unnormalised as unverified.
 */
export function priceDivisorsText(config: { price_divisor?: unknown; price_divisors?: Record<string, unknown> } | null | undefined): string {
  const map = config?.price_divisors;
  if (!map || typeof map !== "object" || !Object.keys(map).length) {
    return config?.price_divisor === null || config?.price_divisor === undefined ? "—" : `÷${fmtDivisor(config.price_divisor)}`;
  }
  const groups = new Map<string, string[]>();
  for (const [segment, divisor] of Object.entries(map)) {
    const key = fmtDivisor(divisor);
    groups.set(key, [...(groups.get(key) || []), segment]);
  }
  return Array.from(groups.entries()).map(([divisor, segments]) => `${segments.join(", ")} ÷${divisor}`).join(" · ");
}

function fmtDivisor(v: unknown): string {
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString("en-US") : String(v);
}

type PricedRow = {
  price?: unknown; fill_price?: unknown; price_raw?: unknown; fill_price_raw?: unknown; price_scale?: unknown;
};

/**
 * An order's price. Where the backend could not establish the segment's Noren
 * price scale (`price_scale: "unverified"`), `price` is null and the recorded
 * integer is shown as-is, labelled, never passed off as rupees.
 */
export function orderPriceText(row: PricedRow | null | undefined, which: "price" | "fill_price" = "price"): string {
  if (row?.price_scale === "unverified") {
    const raw = which === "price" ? row.price_raw : row.fill_price_raw;
    return raw === null || raw === undefined || raw === "" ? "—" : `${raw} raw · ${UNVERIFIED_PRICE_SCALE}`;
  }
  return priceText(row?.[which]);
}

/** Short 24h clock — same output on server and client (avoids hydration mismatch). */
export function timeShort(v: string): string {
  return time24(v);
}

/** Calendar date for trade, position and holding snapshots. */
export function dateShort(v: unknown): string {
  if (!v) return "—";
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return String(v);
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric",
  }).format(d);
}

export function timeFull(v: string): string {
  try {
    return new Date(v).toLocaleString();
  } catch {
    return v || "—";
  }
}

/** Explicit IST clock so server and browser time zones cannot cause hydration drift. */
export function time24(v: string): string {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v || "—";
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(d);
}

/** Journal metadata stamp, e.g. "30 Jun, 09:14:01". */
export function timeIstStamp(v: string): string {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v || "—";
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const pick = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value || "";
  return `${pick("day")} ${pick("month")}, ${pick("hour")}:${pick("minute")}:${pick("second")}`;
}

export function journalWindowLabel(from?: string, to?: string): string {
  if (!from || !to) return "—";
  return `${timeIstStamp(from)} – ${timeIstStamp(to)} · IST`;
}

/** Journal row clock — e.g. "30 Jun, 09:23:37" in IST. */
export function timeIstDetail(v: string): string {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v || "—";
  const day = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", day: "2-digit" }).format(d);
  const mon = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", month: "short" }).format(d);
  const clock = time24(v);
  return `${day} ${mon}, ${clock}`;
}

export function journalWindow(from: string, to: string): string {
  if (!from || !to) return "—";
  return `${timeIstDetail(from)} – ${timeIstDetail(to)}`;
}
