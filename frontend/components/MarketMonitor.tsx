"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Activity, Clock3, Radio, ShieldCheck } from "lucide-react";
import ObservedTrend from "@/components/ObservedTrend";
import { appendObservation, bestQuoteSpread, finiteQuote, quoteFreshness, type MarketObservation } from "@/lib/market-monitor";
import { sourceDisplayName } from "@/lib/data-source";

const number = (value: unknown, digits = 2) => {
  const n = finiteQuote(value);
  return n === null ? "—" : n.toLocaleString("en-IN", { maximumFractionDigits: digits });
};

export default function MarketMonitor({ symbols, selectedKey, onSelect, connected, source, journalRows }: {
  symbols: any[]; selectedKey: string; onSelect: (key: string) => void; connected: boolean;
  source: string; journalRows: { symbol: string; exchange: string; orders: number; rejected: number }[];
}) {
  const [now, setNow] = useState(0);
  const [windowMinutes, setWindowMinutes] = useState(5);
  const [history, setHistory] = useState<{ key: string; points: MarketObservation[] }>({ key: "", points: [] });
  const selected = symbols.find(row => `${row.exchange}:${row.symbol}` === selectedKey) || symbols[0];
  const key = selected ? `${selected.exchange}:${selected.symbol}` : "";
  const liveSource = source === "truedata" || source === "elasticsearch";
  useEffect(() => { setNow(Date.now()); const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
  useEffect(() => {
    setHistory(previous => ({ key, points: liveSource ? appendObservation(previous.key === key ? previous.points : [], selected?.ltp, selected?.streamed_at || selected?.tick_time) : [] }));
  }, [key, selected?.ltp, selected?.streamed_at, selected?.tick_time, liveSource]);
  const freshness = quoteFreshness(selected?.tick_time, now);
  const points = history.key === key ? history.points.filter(point => Date.parse(point.time) >= now - windowMinutes * 60000) : [];
  const spread = bestQuoteSpread(selected?.bid, selected?.ask);
  const topActivity = journalRows.slice(0, 8);
  const maxOrders = Math.max(1, ...topActivity.map(row => row.orders));

  return <section className="monitor-console" aria-label="Live monitoring console">
    <div className="monitor-banner">
      <div><span className="monitor-emblem"><Activity size={20}/></span><div><h2>Market Monitor</h2><p>Quotes, quote quality and the evidence behind each update.</p></div></div>
      <Link href="/configuration" className="btn">Connection details</Link>
    </div>
    <div className="monitor-health" aria-label="Monitoring status">
      <div><Radio size={17}/><span>Event connection<strong>{connected ? "Connected" : "Disconnected"}</strong></span></div>
      <div><Clock3 size={17}/><span>Selected quote age<strong>{freshness.age === null ? "Unavailable" : `${freshness.age.toLocaleString()} s`} <small>{freshness.age !== null ? freshness.label : ""}</small></strong></span></div>
      <div><ShieldCheck size={17}/><span>Data source<strong>{sourceDisplayName(source)}</strong></span></div>
      <div><Activity size={17}/><span>Price observations<strong>{points.length} <small>in selected window</small></strong></span></div>
    </div>
    <div className="monitor-workspace">
      <div className="monitor-plot">
        <div className="monitor-chart-head"><div><h3>{selected?.symbol || "Market activity"}</h3><p>{selected ? `${selected.exchange} / ${selected.segment || "Segment unavailable"}` : "Journal evidence while the market feed is unavailable"}</p></div>
          {symbols.length > 0 && <label>Instrument<select aria-label="Chart instrument" value={key} onChange={event => onSelect(event.target.value)}>{symbols.map(row => <option key={`${row.exchange}:${row.symbol}`} value={`${row.exchange}:${row.symbol}`}>{row.symbol} · {row.exchange}</option>)}</select></label>}
        </div>
        {selected ? <>
          <div className="monitor-price"><strong>₹{number(selected.ltp)}</strong><span>{number(selected.change_pct)}% change</span><div className="monitor-windows" aria-label="Chart time window">{[1, 5, 15].map(minutes => <button type="button" key={minutes} aria-pressed={windowMinutes === minutes} onClick={() => setWindowMinutes(minutes)}>{minutes} min</button>)}</div></div>
          {points.length ? <ObservedTrend points={points} unit="INR" label={`${selected.symbol} observed price`}/> : <div className="monitor-empty"><Activity size={32}/><h3>Waiting for timestamped prices</h3><p>The chart builds from observed updates while this page is open. Select an instrument to start a new observation window.</p></div>}
          <p className="monitor-caption">Up to 240 observations per selected instrument. Event receipt times are used when available; this view is not a historical candle series.</p>
        </> : topActivity.length ? <>
          <div className="monitor-activity" aria-label="Observed order counts by symbol">{topActivity.map(row => <div key={`${row.exchange}:${row.symbol}`}><span title={row.symbol}>{row.symbol}<small>{row.exchange}</small></span><div><i style={{ width: `${row.orders / maxOrders * 100}%` }}/></div><b>{number(row.orders, 0)}</b></div>)}</div>
          <p className="monitor-caption">Order counts from the loaded journal sample. These bars describe order activity; live prices require a market feed.</p>
        </> : <div className="monitor-empty"><Activity size={32}/><h3>Awaiting market observations</h3><p>Connect the market feed to receive prices. Feed availability and update age will appear here.</p><Link href="/configuration">View connection configuration</Link></div>}
      </div>
      <aside className="monitor-detail"><h3>Quote details</h3><p>Values reported for the selected instrument</p><dl>{[
        ["Day open", number(selected?.open)], ["Day high", number(selected?.high)], ["Day low", number(selected?.low)],
        ["Traded volume", number(selected?.volume, 0)], ["Open interest", number(selected?.oi, 0)],
        ["Best bid", number(selected?.bid)], ["Best ask", number(selected?.ask)],
        ["Spread", spread === null ? "—" : `${spread.toFixed(2)} bps`],
        ["Quote quality", !selected ? "Unavailable" : spread === null ? "Bid/ask incomplete" : freshness.fresh ? "Fresh quote" : freshness.label],
      ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      <p className="monitor-caption">Fresh means an explicit quote timestamp within 30 seconds. An open event connection alone does not establish a fresh market feed.</p></aside>
    </div>
    <nav className="monitor-links" aria-label="Investigate operational signals"><Link href="/order-latency">OMS latency graphs</Link><Link href="/exchange">Exchange health</Link><Link href="/infra">Infrastructure metrics</Link><Link href="/incidents">Alerts & incidents</Link><Link href="/data-quality">Data verification</Link></nav>
  </section>;
}
