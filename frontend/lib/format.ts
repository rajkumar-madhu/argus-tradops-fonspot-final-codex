export function fmt(v: unknown): string {
  return Number(v || 0).toLocaleString();
}

export function money(v: unknown): string {
  const n = Number(v || 0);
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Short 24h clock — same output on server and client (avoids hydration mismatch). */
export function timeShort(v: string): string {
  return time24(v);
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
