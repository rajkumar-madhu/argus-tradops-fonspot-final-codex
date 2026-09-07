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

/** 24-hour clock, locale-independent, so server and client render the same text. */
export function time24(v: string): string {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v || "—";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
