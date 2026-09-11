/**
 * Pure helpers for the Holdings page.
 *
 * A figure the source does not supply stays `null` all the way to the render, where it
 * becomes "—". Never coerce it to 0: a zero P&L tile is a plausible number, a dash is not.
 */
export const SEGMENTS = ['Equity', 'F&O', 'Currency', 'Commodity'] as const;
export type Segment = (typeof SEGMENTS)[number];

const SEGMENT_BY_EXCHANGE: Record<string, Segment> = {
  NSE: 'Equity', BSE: 'Equity', NFO: 'F&O', BFO: 'F&O', CDS: 'Currency', BCD: 'Currency', MCX: 'Commodity', NCDEX: 'Commodity',
};

/** Segment tab for a holding, from its exchange code; unknown codes fall under Equity. */
export function holdingSegment(exchange: unknown): Segment {
  return SEGMENT_BY_EXCHANGE[String(exchange ?? '').trim().toUpperCase()] ?? 'Equity';
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export type Holding = {
  symbol: string; exchange: string; product: string; segment: Segment; qty: number | null;
  avg_price: number | null; ltp: number | null; value: number | null; investment: number | null;
  unrealized: number | null; pnl_pct: number | null; day_pnl: number | null; realized_pnl: number | null;
  sector: string; account: string; trader: string; broker: string;
};

/** Normalise one source row; derived figures exist only when every input exists. */
export function holding(r: Record<string, unknown>): Holding {
  const qty = num(r.qty), avg = num(r.avg_price), ltp = num(r.ltp);
  const value = num(r.value) ?? (ltp !== null && qty !== null ? ltp * qty : null);
  const investment = avg !== null && qty !== null ? avg * qty : null;
  const unrealized = value !== null && investment !== null ? value - investment : null;
  const pnl = num(r.pnl_pct) ?? (unrealized !== null && investment ? (unrealized / investment) * 100 : null);
  return {
    symbol: String(r.symbol ?? ''), exchange: String(r.exchange ?? ''), product: String(r.product ?? ''),
    segment: holdingSegment(r.exchange), qty, avg_price: avg, ltp, value, investment, unrealized, pnl_pct: pnl,
    day_pnl: num(r.day_pnl), realized_pnl: num(r.realized_pnl), sector: String(r.sector ?? '').trim(),
    account: String(r.account ?? ''), trader: String(r.user ?? r.trader ?? ''), broker: String(r.broker ?? ''),
  };
}

/** Sum of a field over rows that have it; null when no row does. */
export function sumOf(rows: Holding[], key: keyof Holding): number | null {
  let total: number | null = null;
  for (const r of rows) {
    const v = r[key];
    if (typeof v === 'number') total = (total ?? 0) + v;
  }
  return total;
}

export function summary(rows: Holding[]) {
  // Unrealized % is taken over the rows that carry both cost and value, not the whole book.
  const priced = rows.filter((r) => r.unrealized !== null);
  const unrealized = sumOf(priced, 'unrealized');
  const pricedCost = sumOf(priced, 'investment');
  const value = sumOf(rows, 'value');
  return {
    count: rows.length,
    investment: sumOf(rows, 'investment'),
    value,
    unrealized,
    unrealizedPct: unrealized !== null && pricedCost ? (unrealized / pricedCost) * 100 : null,
    realized: sumOf(rows, 'realized_pnl'),
    dayPnl: sumOf(rows, 'day_pnl'),
    exposure: rows.some((r) => r.value !== null) ? rows.reduce((s, r) => s + Math.abs(r.value ?? 0), 0) : null,
  };
}

/** Current value grouped by a label, largest first; rows without a value or label are left out. */
export function allocation(rows: Holding[], key: 'segment' | 'sector' | 'exchange') {
  const totals = new Map<string, number>();
  for (const r of rows) if (r.value !== null && r[key]) totals.set(r[key], (totals.get(r[key]) ?? 0) + r.value);
  const all = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  const grand = all.reduce((s, [, v]) => s + Math.abs(v), 0) || 1;
  return all.map(([label, value]) => ({ label, value, pct: (Math.abs(value) / grand) * 100 }));
}

/** Top gainers (P&L % ≥ 0, best first) and losers (< 0, worst first). */
export function movers(rows: Holding[], n = 5) {
  const priced = rows.filter((r) => r.pnl_pct !== null) as (Holding & { pnl_pct: number })[];
  return {
    gainers: priced.filter((r) => r.pnl_pct >= 0).sort((a, b) => b.pnl_pct - a.pnl_pct).slice(0, n),
    losers: priced.filter((r) => r.pnl_pct < 0).sort((a, b) => a.pnl_pct - b.pnl_pct).slice(0, n),
  };
}

/** Money with two decimals, or "—" when the source did not supply the figure. */
export function cash(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  return v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Signed P&L ("+1,255.00" / "-320.50"), or "—". */
export function signedCash(v: number | null | undefined): string {
  const s = cash(v);
  return s !== '—' && (v as number) > 0 ? `+${s}` : s;
}

/** Signed percentage ("+6.80%"), or "—". */
export function signedPct(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  return `${v > 0 ? '+' : ''}${v.toFixed(2)}%`;
}

/** Tone class for a signed figure; neutral when missing or zero. */
export function tone(v: number | null | undefined): string {
  return v === null || v === undefined || v === 0 ? '' : v > 0 ? 'text-green' : 'text-red';
}
