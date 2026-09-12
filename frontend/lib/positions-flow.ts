// Derivations for the Positions screen (reference mockup 01_18_45).
// The journal records fills, not account positions: account ids are masked
// (so per-account netting would merge different clients) and there is no LTP,
// so neither positions nor P&L are derived. What fills do establish is shown:
// filled flow per instrument across all accounts. Rupee values cover equity
// and F&O segments only, matching lib/risk-overview (CDS/MCX price scale).
// Self-contained so node --test can load it directly.

type Fill = { time?: string | null; exchange?: string | null; symbol?: string | null; side?: string | null; qty?: number | null; price?: number | null };

const RUPEE_SEGMENTS = new Set(["NSE", "BSE", "NFO", "BFO"]);

function value(f: Fill): number {
  if (!RUPEE_SEGMENTS.has(String(f.exchange || ""))) return 0;
  const q = Number(f.qty);
  const p = Number(f.price);
  return Number.isFinite(q) && Number.isFinite(p) && q > 0 && p > 0 ? q * p : 0;
}

const isBuy = (f: Fill) => String(f.side || "").toUpperCase() === "BUY";

export function flowKpis(fills: Fill[]) {
  let buyValue = 0;
  let sellValue = 0;
  const instruments = new Set<string>();
  for (const f of fills) {
    const v = value(f);
    if (isBuy(f)) buyValue += v; else sellValue += v;
    if (f.symbol) instruments.add(`${f.exchange}:${f.symbol}`);
  }
  return { fills: fills.length, buyValue, sellValue, tradedValue: buyValue + sellValue, instruments: instruments.size };
}

/** Per instrument: filled buy/sell quantity, VWAPs, net quantity and traded value. */
export function instrumentFlow(fills: Fill[]) {
  const map = new Map<string, { exchange: string; symbol: string; buyQty: number; sellQty: number; buyVal: number; sellVal: number; fills: number }>();
  for (const f of fills) {
    if (!f.symbol) continue;
    const key = `${f.exchange}:${f.symbol}`;
    const m = map.get(key) || { exchange: String(f.exchange || "—"), symbol: String(f.symbol), buyQty: 0, sellQty: 0, buyVal: 0, sellVal: 0, fills: 0 };
    const q = Number(f.qty) || 0;
    const p = Number(f.price) || 0;
    m.fills += 1;
    if (isBuy(f)) { m.buyQty += q; m.buyVal += q * p; } else { m.sellQty += q; m.sellVal += q * p; }
    map.set(key, m);
  }
  return Array.from(map.values())
    .map((m) => ({
      exchange: m.exchange,
      symbol: m.symbol,
      fills: m.fills,
      buyQty: m.buyQty,
      sellQty: m.sellQty,
      netQty: m.buyQty - m.sellQty,
      buyAvg: m.buyQty ? m.buyVal / m.buyQty : null,
      sellAvg: m.sellQty ? m.sellVal / m.sellQty : null,
      tradedValue: RUPEE_SEGMENTS.has(m.exchange) ? m.buyVal + m.sellVal : null,
    }))
    .sort((a, b) => (b.tradedValue ?? -1) - (a.tradedValue ?? -1) || b.fills - a.fills);
}

/** Traded value by segment (equity and F&O), largest first. */
export function segmentFlow(fills: Fill[]) {
  const map = new Map<string, number>();
  let total = 0;
  for (const f of fills) {
    const v = value(f);
    if (!v) continue;
    total += v;
    map.set(String(f.exchange), (map.get(String(f.exchange)) || 0) + v);
  }
  return Array.from(map.entries())
    .map(([name, v]) => ({ name, value: v, share: total ? (v / total) * 100 : 0 }))
    .sort((a, b) => b.value - a.value);
}

/** Buy and sell traded value per minute. */
export function flowTrend(fills: Fill[]) {
  const bins = new Map<number, { buy: number; sell: number }>();
  for (const f of fills) {
    const t = Date.parse(String(f.time ?? ""));
    const v = value(f);
    if (Number.isNaN(t) || !v) continue;
    const k = Math.floor(t / 60_000) * 60_000;
    const b = bins.get(k) || { buy: 0, sell: 0 };
    if (isBuy(f)) b.buy += v; else b.sell += v;
    bins.set(k, b);
  }
  return Array.from(bins.keys()).sort((a, b) => a - b).map((k) => ({ start: k, ...bins.get(k)! }));
}
