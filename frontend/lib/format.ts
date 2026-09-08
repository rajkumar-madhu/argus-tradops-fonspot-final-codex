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
