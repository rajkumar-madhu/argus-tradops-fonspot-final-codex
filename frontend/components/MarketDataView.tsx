"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, DataTable, EmptyState, KPI, PageHead, Status } from "@/components/UI";
import { fmt, money } from "@/lib/format";
import { openAuthenticatedEventSource } from "@/lib/stream";

function mergeQuote(prev: any, incoming: any) {
  const symbols = [...(prev?.symbols || [])];
  const idx = symbols.findIndex(
    (x) => x.symbol === incoming.symbol && x.exchange === incoming.exchange
  );
  if (idx >= 0) symbols[idx] = { ...symbols[idx], ...incoming };
  else symbols.unshift(incoming);
  return {
    ...prev,
    symbols,
    streamed_at: incoming.streamed_at || prev?.streamed_at,
  };
}

export default function MarketDataView({ data }: { data: any }) {
  const [live, setLive] = useState<any>(data || {});
  const [connected, setConnected] = useState(false);
  const symbols = live.symbols || [];
  const feeds = live.feeds || [];
  const segments = live.segments || [];
  const [selected, setSelected] = useState<any>(symbols[0] || {});

  useEffect(() => {
    const es = openAuthenticatedEventSource("market", { interval: 1 });
    es.addEventListener("market", (e: MessageEvent) => {
      setConnected(true);
      try {
        const quote = JSON.parse(e.data);
        if (!quote?.symbol) return;
        setLive((prev: any) => mergeQuote(prev, quote));
      } catch {
        /* keep last good state */
      }
    });
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    return () => es.close();
  }, []);

  useEffect(() => {
    if (!selected?.symbol && symbols[0]) setSelected(symbols[0]);
  }, [symbols, selected]);

  const liveFeeds = feeds.filter((f: any) => f.status === "Live").length;
  const avgLag = Math.round(feeds.reduce((s: number, f: any) => s + Number(f.lag_ms || 0), 0) / Math.max(feeds.length, 1));

  const depth = useMemo(() => {
    if (!selected?.symbol) return [];
    const mid = Number(selected.ltp || 0);
    const tick = selected.segment === "FUT" ? 0.5 : 0.05;
    return [
      { level: "Ask 3", price: mid + tick * 3, qty: Math.round((selected.ask_qty || 0) * 0.4), side: "ask" },
      { level: "Ask 2", price: mid + tick * 2, qty: Math.round((selected.ask_qty || 0) * 0.35), side: "ask" },
      { level: "Ask 1", price: selected.ask, qty: selected.ask_qty, side: "ask" },
      { level: "LTP", price: selected.ltp, qty: "—", side: "ltp" },
      { level: "Bid 1", price: selected.bid, qty: selected.bid_qty, side: "bid" },
      { level: "Bid 2", price: mid - tick * 2, qty: Math.round((selected.bid_qty || 0) * 0.35), side: "bid" },
      { level: "Bid 3", price: mid - tick * 3, qty: Math.round((selected.bid_qty || 0) * 0.4), side: "bid" },
    ];
  }, [selected]);

  if (!symbols.length) {
    return (
      <EmptyState
        title="No market data"
        body={
          live.note ||
          "Enable TRUEDATA_ENABLED, set credentials in backend/.env, and start the market_data_worker."
        }
      />
    );
  }

  return (
    <>
      <PageHead
        title="Market Data"
        subtitle="Live quotes, bid/ask depth, segment feed health and tick latency"
        badge={`${connected ? "● LIVE SSE" : "○ reconnecting"} · ${symbols.length} symbols · ${live.source || "—"}`}
        badgeTone="ok"
      />
      <section className="kpi-grid four">
        <KPI label="Watchlist" value={fmt(symbols.length)} sub="Symbols monitored" />
        <KPI label="Live Feeds" value={`${liveFeeds}/${feeds.length}`} sub="Tick distribution" tone="up" />
        <KPI label="Avg Feed Lag" value={`${avgLag} ms`} sub="Tick-to-UI latency" />
        <KPI label="Segments" value={fmt(segments.length)} sub="NSE / BSE / NFO" />
      </section>

      <div className="grid-3">
        {segments.map((s: any) => (
          <Card key={s.name}>
            <div className="exchange-head">
              <h3>{s.name}</h3>
              <Status value={s.status} />
            </div>
            <div className="metric-row"><span>Symbols</span><b>{s.symbols}</b></div>
            <div className="metric-row"><span>Feed lag</span><b>{s.lag_ms} ms</b></div>
          </Card>
        ))}
      </div>

      <section className="orders-layout market-layout">
        <div className="panel orders-main">
          <div className="panel-head"><b>Quote watchlist</b><span className="source-tag">Select symbol for depth</span></div>
          <DataTable
            className="data-table"
            rows={symbols}
            rowKey={(r) => `${r.symbol}-${r.exchange}`}
            onRowClick={setSelected}
            columns={[
              { key: "symbol", label: "Symbol", render: (r) => <b>{r.symbol}</b> },
              { key: "exchange", label: "Exch" },
              { key: "segment", label: "Seg" },
              { key: "ltp", label: "LTP", render: (r) => money(r.ltp) },
              { key: "change_pct", label: "Change", render: (r) => <span className={Number(r.change_pct) >= 0 ? "text-green" : "text-red"}>{r.change_pct}%</span> },
              { key: "bid", label: "Bid", render: (r) => money(r.bid) },
              { key: "ask", label: "Ask", render: (r) => money(r.ask) },
              { key: "spread_bps", label: "Spread", render: (r) => `${r.spread_bps} bps` },
              { key: "volume", label: "Volume", render: (r) => fmt(r.volume) },
            ]}
          />
        </div>
        <aside className="panel order-detail">
          <div className="panel-head"><b>{selected.symbol || "—"}</b><Status value="Live" /></div>
          <ul className="config-list">
            <li><span>Exchange</span><b>{selected.exchange}</b></li>
            <li><span>Segment</span><b>{selected.segment}</b></li>
            <li><span>Open / High / Low</span><b>{money(selected.open)} / {money(selected.high)} / {money(selected.low)}</b></li>
            <li><span>Bid qty / Ask qty</span><b>{fmt(selected.bid_qty)} / {fmt(selected.ask_qty)}</b></li>
          </ul>
          <div className="depth-book">
            {depth.map((row) => (
              <div key={row.level} className={`depth-row ${row.side}`}>
                <span>{row.level}</span>
                <b>{typeof row.price === "number" ? money(row.price) : row.price}</b>
                <em>{row.qty === "—" ? "—" : fmt(row.qty)}</em>
              </div>
            ))}
          </div>
        </aside>
      </section>

      <Card title="Feed health">
        <DataTable
          className="data-table"
          rows={feeds}
          rowKey={(f) => f.name}
          columns={[
            { key: "name", label: "Feed", render: (f) => <b>{f.name}</b> },
            { key: "status", label: "Status", render: (f) => <Status value={f.status} /> },
            { key: "lag_ms", label: "Lag (ms)" },
            { key: "packets_per_sec", label: "Packets/s", render: (f) => fmt(f.packets_per_sec) },
            { key: "last_tick", label: "Last tick" },
          ]}
        />
      </Card>
    </>
  );
}
