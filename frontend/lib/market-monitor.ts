export type MarketObservation = { time: string; value: number };

export function finiteQuote(value: unknown): number | null {
  if (value === null || value === undefined || value === "" || typeof value === "boolean") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/** Require a timezone: a provider's naive timestamp must not use the browser timezone. */
export function quoteTime(value: unknown): number | null {
  if (typeof value !== "string" || !/(Z|[+-]\d{2}:\d{2})$/i.test(value)) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

export function quoteFreshness(value: unknown, now: number) {
  const time = quoteTime(value);
  if (time === null || time > now + 5000) return { label: "Time unavailable", age: null, fresh: false };
  const age = Math.max(0, Math.floor((now - time) / 1000));
  return { label: age <= 30 ? "Fresh" : "Stale", age, fresh: age <= 30 };
}

/** Bounded, ordered samples; replayed SSE events cannot grow the chart. */
export function appendObservation(points: MarketObservation[], value: unknown, timestamp: unknown): MarketObservation[] {
  const price = finiteQuote(value);
  const time = quoteTime(timestamp);
  if (price === null || price <= 0 || time === null) return points;
  if (points.length && time <= Date.parse(points[points.length - 1].time)) return points;
  return [...points, { time: new Date(time).toISOString(), value: price }].slice(-240);
}

export function bestQuoteSpread(bid: unknown, ask: unknown): number | null {
  const b = finiteQuote(bid), a = finiteQuote(ask);
  if (b === null || a === null || b <= 0 || a < b) return null;
  return (a - b) / ((a + b) / 2) * 10000;
}
