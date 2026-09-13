// Derivations for the Positions screen (reference mockup 01_18_45).
// The journal records fills, not account positions: account ids are masked
// (so per-account netting would merge different clients) and there is no LTP,
// so neither positions nor P&L are derived. What fills do establish is shown:
// filled flow per instrument across all accounts, as counts and quantities.
// No rupee figures: the operator UI does not show money on Positions/Trades
// (see tests/no-money-on-flow-pages.test.mjs).
// Self-contained so node --test can load it directly.

type Fill = { time?: string | null; exchange?: string | null; symbol?: string | null; side?: string | null; qty?: number | null; price?: number | null };

const isBuy = (f: Fill) => String(f.side || "").toUpperCase() === "BUY";
const qty = (f: Fill) => { const q = Number(f.qty); return Number.isFinite(q) && q > 0 ? q : 0; };

export function flowKpis(fills: Fill[]) {
  let buyFills = 0;
  let sellFills = 0;
  let buyQty = 0;
  let sellQty = 0;
  const instruments = new Set<string>();
  for (const f of fills) {
    if (isBuy(f)) { buyFills += 1; buyQty += qty(f); } else { sellFills += 1; sellQty += qty(f); }
    if (f.symbol) instruments.add(`${f.exchange}:${f.symbol}`);
  }
  return { fills: fills.length, buyFills, sellFills, buyQty, sellQty, instruments: instruments.size };
}

/** Per instrument: filled buy/sell quantity, VWAPs (per-unit prices), net quantity and fill count. */
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
    }))
    .sort((a, b) => b.fills - a.fills || (b.buyQty + b.sellQty) - (a.buyQty + a.sellQty));
}

/** Fills by segment, largest first. */
export function segmentFlow(fills: Fill[]) {
  const map = new Map<string, number>();
  for (const f of fills) {
    const name = String(f.exchange || "—");
    map.set(name, (map.get(name) || 0) + 1);
  }
  const total = fills.length;
  return Array.from(map.entries())
    .map(([name, count]) => ({ name, fills: count, share: total ? (count / total) * 100 : 0 }))
    .sort((a, b) => b.fills - a.fills);
}

/** Buy and sell fills per minute. */
export function flowTrend(fills: Fill[]) {
  const bins = new Map<number, { buy: number; sell: number }>();
  for (const f of fills) {
    const t = Date.parse(String(f.time ?? ""));
    if (Number.isNaN(t)) continue;
    const k = Math.floor(t / 60_000) * 60_000;
    const b = bins.get(k) || { buy: 0, sell: 0 };
    if (isBuy(f)) b.buy += 1; else b.sell += 1;
    bins.set(k, b);
  }
  return Array.from(bins.keys()).sort((a, b) => a - b).map((k) => ({ start: k, ...bins.get(k)! }));
}
