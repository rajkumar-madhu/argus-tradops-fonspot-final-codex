"use client";

import { useMemo, useState } from "react";
import RefreshButton from "@/components/RefreshButton";
import { HBarList, MultiLineChart, SERIES_COLORS, StackedBars } from "@/components/Charts";
import { EmptyState } from "@/components/UI";
import { apiError } from "@/lib/api-result";
import { buildAdapterMatrix } from "@/lib/exchange-matrix";
import { flowByExchange, sessionAt, venueCards } from "@/lib/exchange-health";
import { fmt, journalWindowLabel } from "@/lib/format";
import { buildAlerts } from "@/lib/incidents-data";
import { istTime } from "@/lib/journal-explore";

export type ExchangePayload = {
  exchanges: any;
  yel: any;
  infra: any;
  orders: any;
  rejections: any;
  /** /api/files/latency summary (by_segment) — OMS latency in source units. */
  latency?: any;
  /** Per-segment /api/files/latency responses, for the latency trend lines. */
  segmentTrends?: { segment: string; data: any }[];
};

const num = (v: unknown, digits = 1) => {
  const n = Number(v);
  return v === null || v === undefined || !Number.isFinite(n) ? "—" : n.toLocaleString("en-IN", { maximumFractionDigits: digits });
};

export default function ExchangeView({ exchanges, yel, orders, rejections, latency, segmentTrends = [] }: ExchangePayload) {
  const [venue, setVenue] = useState("");
  const [matrixOpen, setMatrixOpen] = useState(false);

  const source = String(exchanges?.source || orders?.source || "");
  const isJournal = source === "journal snapshot";
  const orderItems: any[] = orders?.items || [];
  const exchangeRows: any[] = exchanges?.items || [];
  const latencyErr = apiError(latency);
  const segments: any[] = latencyErr ? [] : latency?.by_segment || [];
  const unit = latency?.unit && latency.unit !== "source units" ? latency.unit : "source units";

  const cards = venueCards(exchangeRows, segments, orderItems);
  const shownCards = venue ? cards.filter((c) => c.name === venue) : cards;
  const scopedOrders = venue ? orderItems.filter((o) => o.exchange === venue) : orderItems;
  const flow = flowByExchange(scopedOrders);
  const lastEvent = orderItems.reduce((l: string, o: any) => (o.time && (!l || Date.parse(o.time) > Date.parse(l)) ? o.time : l), "");
  const session = sessionAt(lastEvent || orders?.to);
  const alerts = buildAlerts({ persisted: null, derived: null, rejections: apiError(rejections) ? null : rejections, yel: apiError(yel) ? null : yel });
  const matrix = useMemo(() => buildAdapterMatrix(orderItems, yel?.keys || []), [orderItems, yel]);

  // Latency trend: align every segment on the first segment's bucket times.
  const trends = segmentTrends.filter((t) => !apiError(t.data) && Array.isArray(t.data?.trend) && t.data.trend.length);
  const baseTimes: string[] = trends[0]?.data.trend.map((b: any) => b.time) || [];
  const trendSeries = trends.map((t) => {
    const byTime = new Map<string, number | null>(t.data.trend.map((b: any) => [b.time, b.oms == null ? null : Number(b.oms)]));
    return { name: t.segment, points: baseTimes.map((time) => byTime.get(time) ?? null) };
  });
  const maxReject = Math.max(1, ...cards.map((c) => c.rejectRate ?? 0));

  return (
    <div className="exchange-page ref-page">
      <section className="ref-head">
        <div>
          <div className="ref-title-row">
            <h1>Exchange Health</h1>
            <span className={`source-badge ${isJournal ? "file-based" : "live"}`}>{isJournal ? "FILE-BASED" : "LIVE"}</span>
          </div>
          <p>Status, order flow, latency and trading session across exchanges{isJournal ? ` · ${journalWindowLabel(orders?.from, orders?.to)} · uploaded history` : ""}</p>
        </div>
        <div className="ref-controls">
          <select value={venue} onChange={(e) => setVenue(e.target.value)} aria-label="Exchange">
            <option value="">All Exchanges</option>
            {cards.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
          </select>
          <RefreshButton />
          <span className="ref-updated">Last observed: <b>{lastEvent ? istTime(lastEvent) : "—"}</b></span>
          <span className="ref-updated"><i className="ref-dot ok" />{isJournal ? "Historical observations" : "Live read path"}</span>
        </div>
      </section>

      {apiError(exchanges) ? (
        <EmptyState title="Unable to load exchange health" body={String(apiError(exchanges))} />
      ) : (
        <>
          <section className="ex-cards">
            {shownCards.map((c) => (
              <div key={c.name} className="panel ex-card">
                <div className="ex-card-head">
                  <b>{c.name}</b>
                  <span className="ex-status"><i className="ref-dot ok" />{isJournal ? "Observed" : c.status || "—"}</span>
                </div>
                <div className="ex-card-metrics">
                  <div><b className={c.rejectRate != null && c.rejectRate >= 10 ? "text-red" : "text-green"}>{c.rejectRate == null ? "—" : `${num(c.rejectRate, 2)}%`}</b><span>Reject rate</span></div>
                  <div><b>{c.omsP50 == null ? "—" : num(c.omsP50)}</b><span>OMS p50{c.omsP50 == null ? "" : ` (${unit})`}</span></div>
                </div>
                <span className="ex-card-foot">{fmt(c.orders)} orders · last {c.lastEvent || "—"}</span>
              </div>
            ))}
          </section>

          <section className="ref-grid ex-row">
            <div className="panel">
              <div className="panel-head">
                <b>OMS Latency by Segment</b>
                <span className="legend">
                  {trendSeries.map((s, i) => <span key={s.name}><i className="lg" style={{ background: SERIES_COLORS[i % SERIES_COLORS.length] }} /> {s.name}</span>)}
                </span>
              </div>
              {trendSeries.length ? (
                <div className="ref-chart">
                  <MultiLineChart series={trendSeries} labels={baseTimes.map((t) => istTime(t).slice(0, 5))} />
                  <p className="ref-note">Mean per bucket from the ORDERLATENCY file ({unit}); the file may cover a different date than the journal.</p>
                </div>
              ) : (
                <EmptyState title="No latency trend" body={latencyErr ? `${latencyErr}.` : "No ORDERLATENCY file with segment data is ingested."} />
              )}
            </div>
            <div className="panel">
              <div className="panel-head"><b>Rejection Rate by Exchange</b></div>
              {cards.length ? (
                <div className="ref-chart">
                  <HBarList
                    rows={cards.map((c) => ({
                      label: c.name,
                      value: c.rejectRate == null ? "—" : `${num(c.rejectRate, 2)}%`,
                      pct: ((c.rejectRate ?? 0) / maxReject) * 100,
                      cls: (c.rejectRate ?? 0) >= 10 ? "bar-red" : "bar-green",
                    }))}
                  />
                  <p className="ref-note">No uptime source is connected; rejected ÷ orders per venue stands in the reference's uptime slot.</p>
                </div>
              ) : (
                <EmptyState title="No exchanges" body="No venue observations in this source." />
              )}
            </div>
            <div className="panel">
              <div className="panel-head">
                <b>Current Trading Session</b>
                {session && <span className={`ref-pill ${session.open ? "ok" : "info"}`}>{session.open ? "MARKET OPEN" : session.phase.toUpperCase()}</span>}
              </div>
              {session ? (
                <dl className="ex-session">
                  <div><dt>Market Status</dt><dd className={session.open ? "text-green" : ""}>{session.open ? "Open" : session.phase}</dd></div>
                  <div><dt>Session</dt><dd>{session.phase}</dd></div>
                  <div><dt>Start Time</dt><dd>{session.start}</dd></div>
                  <div><dt>End Time</dt><dd>{session.end}</dd></div>
                  <div><dt>Time to Close</dt><dd>{session.toClose}</dd></div>
                  <div><dt>{isJournal ? "Last Event Time" : "Exchange Time"}</dt><dd>{session.clock}</dd></div>
                  <div><dt>Date</dt><dd>{session.date}</dd></div>
                </dl>
              ) : (
                <EmptyState title="No session time" body="No timestamped order event in scope." />
              )}
              {isJournal && session && <p className="ref-note">As of the last journal event, not the current clock.</p>}
            </div>
          </section>

          <section className="ref-grid ex-row2">
            <div className="panel">
              <div className="panel-head"><b>Exchange Connectivity</b></div>
              <div className="table-scroll">
                <table className="compact ref-table">
                  <thead><tr><th>#</th><th>Exchange</th><th>Status</th><th className="num">Orders</th><th className="num">Events</th><th className="num">Reject %</th><th className="num">OMS p50</th><th>Last Event</th></tr></thead>
                  <tbody>
                    {cards.map((c, i) => (
                      <tr key={c.name}>
                        <td>{i + 1}</td>
                        <td><b>{c.name}</b></td>
                        <td><i className="ref-dot ok" />{isJournal ? "Observed" : c.status || "—"}</td>
                        <td className="num">{fmt(c.orders)}</td>
                        <td className="num">{fmt(c.events)}</td>
                        <td className="num">{c.rejectRate == null ? "—" : `${num(c.rejectRate, 2)}%`}</td>
                        <td className="num">{c.omsP50 == null ? "—" : num(c.omsP50)}</td>
                        <td className="mono">{c.lastEvent || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="panel">
              <div className="panel-head"><b>Exchange Alerts</b><a href="/incidents">View all ›</a></div>
              {alerts.length ? (
                <table className="compact ref-table">
                  <thead><tr><th>Source</th><th>Severity</th><th>Alert</th><th>Status</th></tr></thead>
                  <tbody>
                    {alerts.slice(0, 5).map((a) => (
                      <tr key={a.id}>
                        <td>{a.source}</td>
                        <td><span className={`sev-dot sev-${a.severity.toLowerCase()}`} />{a.severity}</td>
                        <td className="ref-reason" title={a.name}>{a.name}</td>
                        <td><span className="ref-pill warn">{a.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <EmptyState title="No alerts" body="No rejection group or connectivity signal crosses an alert rule." />
              )}
            </div>
          </section>

          <section className="ref-grid ex-row3">
            <div className="panel">
              <div className="panel-head">
                <b>Order Flow by Exchange</b>
                {flow && (
                  <span className="legend">
                    {flow.series.map((s, i) => <span key={s}><i className="lg" style={{ background: SERIES_COLORS[i % SERIES_COLORS.length] }} /> {s}</span>)}
                  </span>
                )}
              </div>
              {flow ? (
                <div className="ref-chart"><StackedBars bins={flow.bins} series={flow.series} /></div>
              ) : (
                <EmptyState title="No order flow" body="No timestamped order in scope." />
              )}
            </div>
            <div className="panel">
              <div className="panel-head"><b>OMS Latency Percentiles</b><span className="sub">{unit}</span></div>
              {segments.length ? (
                <table className="compact ref-table">
                  <thead><tr><th>Segment</th><th className="num">p50</th><th className="num">p95</th><th className="num">p99</th><th className="num">Samples</th></tr></thead>
                  <tbody>
                    {segments.map((s: any) => (
                      <tr key={s.segment}>
                        <td><b>{s.segment}</b></td>
                        <td className="num">{num(s.p50)}</td>
                        <td className="num">{num(s.p95)}</td>
                        <td className="num">{num(s.p99)}</td>
                        <td className="num">{fmt(s.samples ?? s.count)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <EmptyState title="No latency file" body={latencyErr ? `${latencyErr}.` : "No ORDERLATENCY file is ingested."} />
              )}
            </div>
            <div className="panel">
              <div className="panel-head"><b>Exchange Announcements</b></div>
              <EmptyState title="No announcement feed" body="Exchange circulars are not connected to this console." />
            </div>
          </section>

          <details className="panel ex-matrix" open={matrixOpen} onToggle={(e) => setMatrixOpen((e.target as HTMLDetailsElement).open)}>
            <summary>Client × exchange matrix · derived from {fmt(orderItems.length)} orders</summary>
            {matrix.clients.length === 0 ? (
              <EmptyState title="No matrix" body="Orders need user/broker and exchange fields to populate the grid." />
            ) : (
              <div className="table-scroll">
                <table className="compact ref-table">
                  <thead><tr><th>Client</th>{matrix.exchanges.map((x) => <th key={x} className="num">{x}</th>)}</tr></thead>
                  <tbody>
                    {matrix.clients.slice(0, 40).map((client) => {
                      const row = matrix.cells.filter((c) => c.client === client);
                      return (
                        <tr key={client}>
                          <td><b>{client}</b></td>
                          {matrix.exchanges.map((x) => {
                            const cell = row.find((c) => c.exchange === x);
                            return (
                              <td key={x} className={`num ${cell?.status === "REJECTION_HEAVY" ? "text-red" : ""}`} title={cell?.orders ? `${cell.orders} orders · ${cell.rejected} rejected` : "No orders"}>
                                {cell?.orders ? fmt(cell.orders) : "—"}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <p className="ref-note">Order counts per client and venue. Red marks rejection-heavy cells (more than half rejected); this is order evidence, not adapter telemetry.</p>
              </div>
            )}
          </details>
        </>
      )}
    </div>
  );
}
