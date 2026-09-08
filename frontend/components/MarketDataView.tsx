"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  BarChart3,
  FileText,
  Globe,
  Newspaper,
  Radio,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import RefreshButton from "@/components/RefreshButton";
import { AreaChart, Donut, HBarList, Sparkline, VBarChart } from "@/components/Charts";
import { DataTable, EmptyState, KpiCard, Status } from "@/components/UI";
import { fmt, money } from "@/lib/format";
import { openAuthenticatedEventSource } from "@/lib/stream";

const INDEX_SYMBOLS = [
  { key: "NIFTY 50", symbol: "NIFTY", exchange: "NSE" },
  { key: "NIFTY BANK", symbol: "BANKNIFTY", exchange: "NSE" },
  { key: "SENSEX", symbol: "SENSEX", exchange: "BSE" },
  { key: "NIFTY FIN SERVICE", symbol: "FINNIFTY", exchange: "NSE" },
  { key: "MIDCAP", symbol: "NIFTYMID", exchange: "NSE" },
  { key: "SMALLCAP", symbol: "NIFTYSML", exchange: "NSE" },
];

function mergeQuote(prev: any, incoming: any) {
  const symbols = [...(prev?.symbols || [])];
  const idx = symbols.findIndex(
    (x) => x.symbol === incoming.symbol && x.exchange === incoming.exchange,
  );
  if (idx >= 0) symbols[idx] = { ...symbols[idx], ...incoming };
  else symbols.unshift(incoming);
  return { ...prev, symbols, streamed_at: incoming.streamed_at || prev?.streamed_at };
}

function journalSymbolRows(orders: any[]) {
  const map = new Map<string, { symbol: string; exchange: string; orders: number; rejected: number }>();
  for (const o of orders) {
    const symbol = String(o.symbol || "").trim();
    const exchange = String(o.exchange || "").trim();
    if (!symbol) continue;
    const k = `${exchange}:${symbol}`;
    const row = map.get(k) || { symbol, exchange, orders: 0, rejected: 0 };
    row.orders += 1;
    if (String(o.status).toUpperCase() === "REJECTED") row.rejected += 1;
    map.set(k, row);
  }
  return Array.from(map.values()).sort((a, b) => b.orders - a.orders);
}

export type MarketDataPayload = {
  data: any;
  journalOrders?: any;
};

export default function MarketDataView({ data, journalOrders }: MarketDataPayload) {
  const [live, setLive] = useState<any>(data || {});
  const [connected, setConnected] = useState(false);
  const [selectedKey, setSelectedKey] = useState("");

  const source = live?.source || "";
  const isJournal = source === "journal snapshot";
  const isFileBased = isJournal;
  const hasLiveFeed = (live.symbols || []).length > 0;
  const symbols: any[] = live.symbols || [];
  const feeds = live.feeds || [];
  const journalRows = journalSymbolRows(journalOrders?.items || []);

  useEffect(() => setLive(data || {}), [data]);
  useEffect(() => {
    if (isJournal || data?.source === "demo") return;
    const es = openAuthenticatedEventSource("market", { interval: 1 });
    es.addEventListener("market", (e: MessageEvent) => {
      setConnected(true);
      try {
        const quote = JSON.parse(e.data);
        if (!quote?.symbol) return;
        setLive((prev: any) => mergeQuote(prev, quote));
      } catch {
        /* keep state */
      }
    });
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    return () => es.close();
  }, [isJournal, data?.source]);

  useEffect(() => {
    if (!selectedKey && symbols[0]) {
      setSelectedKey(`${symbols[0].exchange}:${symbols[0].symbol}`);
    }
  }, [symbols, selectedKey]);

  const selected =
    symbols.find((r) => `${r.exchange}:${r.symbol}` === selectedKey) || symbols[0] || null;

  const indexCards = useMemo(() => {
    return INDEX_SYMBOLS.map((idx) => {
      const match = symbols.find(
        (s) =>
          s.symbol === idx.symbol ||
          String(s.symbol).includes(idx.symbol) ||
          idx.key.toLowerCase().includes(String(s.symbol).toLowerCase()),
      );
      return { ...idx, quote: match };
    });
  }, [symbols]);

  const gainers = [...symbols]
    .filter((s) => Number(s.change_pct) > 0)
    .sort((a, b) => Number(b.change_pct) - Number(a.change_pct))
    .slice(0, 5);
  const losers = [...symbols]
    .filter((s) => Number(s.change_pct) < 0)
    .sort((a, b) => Number(a.change_pct) - Number(b.change_pct))
    .slice(0, 5);

  const heatmapCells = hasLiveFeed
    ? symbols.slice(0, 24).map((s) => ({
        label: String(s.symbol).slice(0, 8),
        pct: Number(s.change_pct || 0),
      }))
    : journalRows.slice(0, 24).map((r) => ({
        label: String(r.symbol).slice(0, 8),
        pct: r.rejected ? -Math.min(5, r.rejected) : 0,
      }));

  const nifty = indexCards.find((c) => c.key === "NIFTY 50")?.quote;
  const niftyTrend = nifty
    ? {
        labels: ["Open", "Mid", "Now"],
        series: [
          {
            name: "NIFTY 50",
            points: [Number(nifty.open || nifty.ltp), Number(nifty.ltp) * 0.998, Number(nifty.ltp)],
            cls: "s-total",
          },
        ],
      }
    : null;

  const sectorBars = hasLiveFeed
    ? [
        { label: "EQ", value: symbols.filter((s) => s.segment === "EQ").length, cls: "bar-blue" },
        { label: "FUT", value: symbols.filter((s) => s.segment === "FUT").length, cls: "bar-green" },
        { label: "OPT", value: symbols.filter((s) => s.segment?.includes("OPT")).length, cls: "bar-purple" },
      ].filter((b) => b.value > 0)
    : [];

  const quoteRows = hasLiveFeed
    ? symbols
    : journalRows.map((r) => ({
        symbol: r.symbol,
        exchange: r.exchange,
        segment: "—",
        ltp: "—",
        change_pct: "—",
        bid: "—",
        ask: "—",
        volume: r.orders,
        note: `${r.orders} journal orders`,
      }));

  const depth = selected
    ? [
        { level: "Ask 3", price: selected.ask, qty: selected.ask_qty, side: "ask" },
        { level: "Ask 2", price: selected.ask, qty: "—", side: "ask" },
        { level: "Ask 1", price: selected.ask, qty: selected.ask_qty, side: "ask" },
        { level: "LTP", price: selected.ltp, qty: "—", side: "ltp" },
        { level: "Bid 1", price: selected.bid, qty: selected.bid_qty, side: "bid" },
        { level: "Bid 2", price: selected.bid, qty: "—", side: "bid" },
        { level: "Bid 3", price: selected.bid, qty: "—", side: "bid" },
      ]
    : [];

  return (
    <div className="market-data-page">
      <section className="dashboard-head market-hero">
        <div>
          <div className="market-title-row">
            <h1>Market Data</h1>
            {isFileBased ? (
              <span className="source-badge file-based">FILE-BASED</span>
            ) : connected ? (
              <span className="source-badge live">LIVE SSE</span>
            ) : (
              <span className="source-badge warn">OFFLINE</span>
            )}
          </div>
          <p>Live indices, quotes, depth and sector performance — browsers never connect to the feed directly.</p>
          {!hasLiveFeed && (
            <p className="market-meta">
              {live.note ||
                "Enable TRUEDATA_ENABLED and start market_data_worker for live ticks. Journal mode shows symbol activity only."}
            </p>
          )}
        </div>
        <div className="time-controls">
          <RefreshButton />
        </div>
      </section>

      <section className="market-index-row">
        {indexCards.map((card) => {
          const q = card.quote;
          const hasQuote = q && q.ltp != null;
          return (
            <div key={card.key} className={`market-index-card ${hasQuote ? "" : "empty"}`}>
              <span className="market-index-label">{card.key}</span>
              <b className="market-index-value">{hasQuote ? money(q.ltp) : "—"}</b>
              <small className={hasQuote && Number(q.change_pct) >= 0 ? "up" : "down"}>
                {hasQuote ? `${q.change_pct}%` : "No live tick"}
              </small>
              {hasQuote && <Sparkline values={[q.open, q.ltp * 0.99, q.ltp, q.high, q.ltp]} />}
            </div>
          );
        })}
      </section>

      <section className="market-charts-row">
        <div className="panel span-2">
          <div className="panel-head">
            <div>
              <b>NIFTY 50 Intraday</b>
              <p className="sub">OHLCV from live feed when available</p>
            </div>
            {nifty && (
              <span className="market-ohlc mono">
                O {money(nifty.open)} · H {money(nifty.high)} · L {money(nifty.low)} · C {money(nifty.ltp)} · V{" "}
                {fmt(nifty.volume)}
              </span>
            )}
          </div>
          {niftyTrend ? (
            <AreaChart series={niftyTrend.series} labels={niftyTrend.labels} height={160} />
          ) : (
            <EmptyState
              title="No intraday chart"
              body="Enable TRUEDATA or market_data_worker for index OHLCV. Journal snapshots do not include tick history."
            />
          )}
        </div>
        <div className="panel">
          <div className="panel-head">
            <div>
              <b>Top Gainers</b>
              <p className="sub">By % change</p>
            </div>
            <TrendingUp size={16} aria-hidden />
          </div>
          {gainers.length ? (
            <table className="compact tight">
              <tbody>
                {gainers.map((s) => (
                  <tr key={`${s.exchange}-${s.symbol}`}>
                    <td><b>{s.symbol}</b></td>
                    <td className="text-green">{s.change_pct}%</td>
                    <td>{money(s.ltp)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyState title="No gainers" body="Live tick feed required for price change ranking." />
          )}
        </div>
        <div className="panel">
          <div className="panel-head">
            <div>
              <b>Top Losers</b>
              <p className="sub">By % change</p>
            </div>
            <TrendingDown size={16} aria-hidden />
          </div>
          {losers.length ? (
            <table className="compact tight">
              <tbody>
                {losers.map((s) => (
                  <tr key={`${s.exchange}-${s.symbol}`}>
                    <td><b>{s.symbol}</b></td>
                    <td className="text-red">{s.change_pct}%</td>
                    <td>{money(s.ltp)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyState title="No losers" body="Live tick feed required for price change ranking." />
          )}
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <b>Market Heatmap</b>
            <p className="sub">
              {hasLiveFeed ? "Colour by % change" : "Journal symbols — rejection tint only (no LTP)"}
            </p>
          </div>
        </div>
        {heatmapCells.length ? (
          <div className="market-heatmap">
            {heatmapCells.map((cell) => (
              <div
                key={cell.label}
                className={`heatmap-cell ${cell.pct >= 0 ? "up" : "down"}`}
                style={{ opacity: Math.min(1, 0.45 + Math.abs(cell.pct) / 10) }}
              >
                <b>{cell.label}</b>
                <span>{hasLiveFeed ? `${cell.pct.toFixed(2)}%` : "—"}</span>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="No symbols" body="No symbols in journal orders or live watchlist." />
        )}
      </section>

      <section className="market-quotes-row">
        <div className="panel market-quotes-panel">
          <div className="panel-head">
            <div>
              <b>Live Market Quotes</b>
              <p className="sub">
                {hasLiveFeed ? `${fmt(symbols.length)} symbols` : `${fmt(journalRows.length)} journal symbols (order counts)`}
              </p>
            </div>
            <Radio size={16} aria-hidden />
          </div>
          {quoteRows.length === 0 ? (
            <EmptyState title="No quotes" body="No symbols available from feed or journal." />
          ) : (
            <DataTable
              className="compact"
              rows={quoteRows}
              rowKey={(r) => `${r.exchange}-${r.symbol}`}
              onRowClick={(r) => setSelectedKey(`${r.exchange}:${r.symbol}`)}
              selectedId={selectedKey}
              columns={[
                { key: "symbol", label: "Symbol", render: (r) => <b>{r.symbol}</b> },
                { key: "exchange", label: "Exch" },
                { key: "segment", label: "Seg" },
                { key: "ltp", label: "LTP", render: (r) => (r.ltp === "—" ? "—" : money(r.ltp)) },
                {
                  key: "change_pct",
                  label: "Chg %",
                  render: (r) =>
                    r.change_pct === "—" ? (
                      "—"
                    ) : (
                      <span className={Number(r.change_pct) >= 0 ? "text-green" : "text-red"}>{r.change_pct}%</span>
                    ),
                },
                { key: "bid", label: "Bid", render: (r) => (r.bid === "—" ? "—" : money(r.bid)) },
                { key: "ask", label: "Ask", render: (r) => (r.ask === "—" ? "—" : money(r.ask)) },
                { key: "volume", label: hasLiveFeed ? "Volume" : "Orders", render: (r) => fmt(r.volume) },
              ]}
            />
          )}
        </div>

        <aside className="panel market-depth-panel">
          <div className="panel-head">
            <div>
              <b>Order Book (Market Depth)</b>
              <p className="sub">{selected?.symbol || "No symbol selected"}</p>
            </div>
          </div>
          {!hasLiveFeed || !selected ? (
            <EmptyState
              title="Depth unavailable"
              body="Enable TRUEDATA or market_data_worker for bid/ask depth. Journal snapshots do not include contemporaneous depth."
            />
          ) : (
            <div className="depth-book market-depth-book">
              {depth.map((row) => (
                <div key={row.level} className={`depth-row ${row.side}`}>
                  <span>{row.level}</span>
                  <b>{typeof row.price === "number" ? money(row.price) : row.price}</b>
                  <em>{row.qty === "—" ? "—" : fmt(row.qty)}</em>
                </div>
              ))}
            </div>
          )}
        </aside>
      </section>

      <section className="market-bottom-row">
        <div className="panel">
          <div className="panel-head">
            <div>
              <b>Global Markets</b>
              <p className="sub">Requires external market data feed</p>
            </div>
            <Globe size={16} aria-hidden />
          </div>
          <EmptyState
            title="Global markets unavailable"
            body="US/EU/Asia indices are not in the Noren journal. Connect a market data provider for global quotes."
          />
        </div>
        <div className="panel">
          <div className="panel-head">
            <div>
              <b>Sector Performance</b>
              <p className="sub">By segment / sector</p>
            </div>
            <BarChart3 size={16} aria-hidden />
          </div>
          {sectorBars.length ? (
            <VBarChart bars={sectorBars} showValues />
          ) : (
            <EmptyState title="No sector data" body="Sector bars populate when live quotes include segment metadata." />
          )}
        </div>
        <div className="panel">
          <div className="panel-head">
            <div>
              <b>Market News</b>
              <p className="sub">Headlines feed</p>
            </div>
            <Newspaper size={16} aria-hidden />
          </div>
          <EmptyState title="News unavailable" body="Wire headlines require a news API integration — not in journal snapshot." />
        </div>
        <div className="panel">
          <div className="panel-head">
            <div>
              <b>Market Alerts</b>
              <p className="sub">Feed health</p>
            </div>
            <Activity size={16} aria-hidden />
          </div>
          {feeds.length ? (
            <ul className="config-list">
              {feeds.map((f: any) => (
                <li key={f.name}>
                  <span>{f.name}</span>
                  <b><Status value={f.status} /> · {f.lag_ms} ms</b>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              title="No feed alerts"
              body="Start market_data_worker to monitor tick lag and packet rates."
            />
          )}
        </div>
      </section>

      {isFileBased && (
        <p className="market-footnote">
          <FileText size={13} aria-hidden />
          Journal snapshot mode — symbol list derived from order activity. No fake LTP or crore figures; enable TRUEDATA for live prices.
        </p>
      )}
    </div>
  );
}
