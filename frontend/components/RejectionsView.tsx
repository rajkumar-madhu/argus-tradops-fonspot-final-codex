"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Code2, FileText, Info, Layers, Percent, Search, XCircle } from "lucide-react";
import RefreshButton from "@/components/RefreshButton";
import { BarLineChart, Donut, VBarChart } from "@/components/Charts";
import { EmptyState, KpiCard } from "@/components/UI";
import { fmt, journalWindowLabel, orderPriceText } from "@/lib/format";
import { istTime, lifecycleSteps } from "@/lib/journal-explore";
import {
  type Row, categorySlices, recentRejections, rejectionKpis, rejectionTrend, rejectionsBy, topCodes,
} from "@/lib/rejections-data";
import { apiUrl } from "@/lib/runtime";
import { authHeaders } from "@/lib/session";
import { openAuthenticatedEventSource } from "@/lib/stream";
import { filterRows } from "@/lib/table-filters";

const MAX_ORDERS = 2000;
const SLICE_CLASSES = ["seg-red", "seg-amber", "seg-blue", "seg-green", "seg-purple", "seg-muted"];
const BAR_CLASSES = ["bar-red", "bar-blue", "bar-amber", "bar-green", "bar-purple", "bar-teal"];

function mergeRejection(prev: any, incoming: any) {
  const orders = [...(prev?.orders || [])];
  const idx = orders.findIndex((x: any) => x.order_id === incoming.order_id);
  if (idx >= 0) orders[idx] = { ...orders[idx], ...incoming };
  else orders.unshift(incoming);
  const previousTotal = Number(prev?.rejected_unique_orders ?? orders.length);
  return {
    ...prev,
    orders: orders.slice(0, MAX_ORDERS),
    rejected_unique_orders: idx >= 0 ? previousTotal : previousTotal + 1,
  };
}

const dayStart = (v: string) => (v ? `${v}T00:00:00.000Z` : "");
const dayEnd = (v: string) => (v ? `${v}T23:59:59.999Z` : "");
const pctText = (n: number) => `${n.toFixed(n >= 10 ? 1 : 2)}%`;

export default function RejectionsView({ data, universe }: { data: any; universe: any }) {
  const [live, setLive] = useState<any>(data || {});
  const [connected, setConnected] = useState(false);
  const [query, setQuery] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [exchange, setExchange] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const source = String(live?.source || "");
  const isJournal = source === "journal snapshot";
  const isDemo = source === "demo";

  useEffect(() => setLive(data || {}), [data]);

  useEffect(() => {
    if (isJournal || isDemo) return;
    const es = openAuthenticatedEventSource("rejections", { interval: 3 });
    es.addEventListener("rejections", (e: MessageEvent) => {
      setConnected(true);
      try {
        const order = JSON.parse(e.data);
        if (order?.order_id) setLive((prev: any) => mergeRejection(prev, order));
      } catch {
        /* keep last good state */
      }
    });
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    return () => es.close();
  }, [isJournal, isDemo]);

  const allRejected: Row[] = live.orders || [];
  const allOrders: Row[] = universe?.items || [];
  const exchanges = useMemo(
    () => Array.from(new Set(allOrders.map((o) => String(o.exchange || "")).filter(Boolean))).sort(),
    [allOrders],
  );

  const scope = useMemo(() => {
    const apply = (rows: Row[]) => {
      const base = filterRows(rows as any[], { query, from: dayStart(fromDate), to: dayEnd(toDate), timeKey: "time" }) as Row[];
      return exchange ? base.filter((r) => r.exchange === exchange) : base;
    };
    return { rejected: apply(allRejected), orders: apply(allOrders) };
  }, [allRejected, allOrders, query, fromDate, toDate, exchange]);

  // The order universe may be unavailable to this role; the rate then falls back
  // to the API's own figure rather than a number computed against nothing.
  const universeTotal = scope.orders.length;
  const kpis = rejectionKpis(scope.rejected, universeTotal);
  const rate = universeTotal ? kpis.rate : Number(live.reject_rate ?? 0);
  const trend = rejectionTrend(scope.orders.length ? scope.orders : scope.rejected);
  const slices = categorySlices(scope.rejected);
  const byExchange = rejectionsBy(scope.orders.length ? scope.orders : scope.rejected, "exchange").slice(0, 6);
  const codes = topCodes(scope.rejected);
  const byType = rejectionsBy(scope.orders, "type");
  const byProduct = rejectionsBy(scope.orders, "product");
  const recent = recentRejections(scope.rejected, 8);
  const selected = recent.find((r) => r.order_id === selectedId) || recent[0] || null;
  const filtersActive = Boolean(query || fromDate || toDate || exchange);

  const metaLine = isJournal
    ? `${journalWindowLabel(live.from, live.to)} · uploaded journal history, not a live feed`
    : isDemo
      ? "Elasticsearch not connected"
      : connected ? "Streaming rejections from the event bus" : "Event bus disconnected · last loaded snapshot";

  return (
    <div className="rejections-page ref-page">
      <section className="ref-head">
        <div>
          <div className="ref-title-row">
            <h1>Order Rejections</h1>
            <span className={`source-badge ${isJournal ? "file-based" : connected ? "live" : "warn"}`}>
              {isJournal ? "FILE-BASED" : isDemo ? "OFFLINE" : connected ? "LIVE" : "OFFLINE"}
            </span>
          </div>
          <p>Rejection analysis across exchanges, segments and order types · {metaLine}</p>
        </div>
        <div className="ref-controls">
          <label className="ref-date"><span>From</span><input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} aria-label="From date (UTC)" /></label>
          <span className="ref-arrow" aria-hidden="true">→</span>
          <label className="ref-date"><span>To</span><input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} aria-label="To date (UTC)" /></label>
          <select value={exchange} onChange={(e) => setExchange(e.target.value)} aria-label="Exchange">
            <option value="">All Exchanges</option>
            {exchanges.map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
          <label className="ref-search">
            <Search size={14} aria-hidden="true" />
            <input type="search" value={query} placeholder="Order, symbol, code…" onChange={(e) => setQuery(e.target.value)} aria-label="Search rejections" />
          </label>
          {filtersActive && (
            <button type="button" className="secondary" onClick={() => { setQuery(""); setFromDate(""); setToDate(""); setExchange(""); }}>Reset</button>
          )}
          <RefreshButton />
        </div>
      </section>

      <section className="kpi-grid ref-kpis six">
        <KpiCard label="Total Orders" value={universeTotal ? fmt(universeTotal) : "—"} delta={universeTotal ? "Unique orders in scope" : "Order list not available"} tone="blue" icon={<FileText size={18} />} />
        <KpiCard label="Rejected Orders" value={fmt(kpis.rejected)} delta={pctText(rate)} deltaTone="down" tone="red" icon={<XCircle size={18} />} />
        <KpiCard label="Rejection Rate" value={pctText(rate)} delta={`${fmt(kpis.rejected)} of ${universeTotal ? fmt(universeTotal) : "—"}`} deltaTone={rate > 5 ? "down" : ""} tone="green" icon={<Percent size={18} />} />
        <KpiCard label="Unique Rejection Codes" value={fmt(kpis.uniqueCodes)} delta="Distinct codes in scope" tone="purple" icon={<Code2 size={18} />} />
        <KpiCard
          label="Most Common Code"
          value={kpis.topCode?.code || "—"}
          delta={kpis.topCode ? `${fmt(kpis.topCode.count)} orders` : "No rejections"}
          sub={kpis.topCode?.reason ? <span className="ref-kpi-reason" title={kpis.topCode.reason}>{kpis.topCode.reason}</span> : undefined}
          tone="blue"
          icon={<Info size={18} />}
        />
        <KpiCard
          label="Top Category"
          value={kpis.topCategory?.name || "—"}
          delta={kpis.topCategory ? `${pctText(kpis.topCategory.share)} of rejections` : "No rejections"}
          tone="amber"
          icon={<Layers size={18} />}
        />
      </section>

      <section className="ref-grid three">
        <div className="panel">
          <div className="panel-head">
            <b>Rejections Trend</b>
            <span className="legend"><i className="lg s-rejected" /> Rejected orders <i className="lg s-line" /> Rejection rate (%)</span>
          </div>
          {trend ? (
            <div className="ref-chart">
              <BarLineChart
                bars={trend.bins.map((b) => b.rejected)}
                line={trend.bins.map((b) => b.rate)}
                labels={trend.bins.map((b) => istTime(new Date(b.start).toISOString()).slice(0, 5))}
                barLabel="Rejected orders"
                lineLabel="Rejection rate"
              />
            </div>
          ) : (
            <EmptyState title="No timeline" body="No order in scope carries an event time." />
          )}
        </div>
        <div className="panel">
          <div className="panel-head"><b>Rejection Reason Breakdown</b></div>
          {slices.length ? (
            <div className="ref-donut">
              <Donut
                centerLabel="Rejections"
                centerValue={fmt(kpis.rejected)}
                slices={slices.map((s, i) => ({ label: s.name, value: s.count, cls: SLICE_CLASSES[i % SLICE_CLASSES.length], pct: pctText(s.share) }))}
              />
            </div>
          ) : (
            <EmptyState title="No rejections" body="No rejected order in scope." />
          )}
        </div>
        <div className="panel">
          <div className="panel-head"><b>Rejections by Exchange</b></div>
          {byExchange.length ? (
            <div className="ref-chart">
              <VBarChart showValues bars={byExchange.map((x, i) => ({ label: x.name, value: x.rejected, cls: BAR_CLASSES[i % BAR_CLASSES.length] }))} />
            </div>
          ) : (
            <EmptyState title="No rejections" body="No rejected order in scope." />
          )}
        </div>
      </section>

      <section className="ref-grid three">
        <div className="panel">
          <div className="panel-head"><b>Top Rejection Codes</b></div>
          {codes.length ? (
            <div className="table-scroll">
              <table className="compact ref-table">
                <thead><tr><th>#</th><th>Code</th><th>Reason (masked)</th><th className="num">Count</th><th className="num">%</th></tr></thead>
                <tbody>
                  {codes.map((c, i) => (
                    <tr key={c.code}>
                      <td>{i + 1}</td>
                      <td><b>{c.code}</b></td>
                      <td className="ref-reason" title={c.reason}>{c.reason}</td>
                      <td className="num">{fmt(c.count)}</td>
                      <td className="num text-red">{pctText(c.share)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="No rejection codes" body="No rejected order in scope." />
          )}
        </div>
        <DimensionTable title="Rejections by Order Type" head="Order Type" rows={byType} denied={!universeTotal} />
        <DimensionTable title="Rejections by Product" head="Product" rows={byProduct} denied={!universeTotal} />
      </section>

      <section className="ref-grid recent">
        <div className="panel">
          <div className="panel-head">
            <b>Recent Rejections</b>
            <span className="sub">{fmt(scope.rejected.length)} in scope · select a row for its timeline</span>
          </div>
          {recent.length ? (
            <div className="table-scroll">
              <table className="compact ref-table">
                <thead>
                  <tr><th>#</th><th>Time (IST)</th><th>Order No</th><th>Symbol</th><th>Exchange</th><th>Product</th><th>Order Type</th><th className="num">Price</th><th className="num">Qty</th><th>Code</th><th>Reason (masked)</th></tr>
                </thead>
                <tbody>
                  {recent.map((r, i) => (
                    <tr key={r.order_id} className={selected?.order_id === r.order_id ? "row-selected" : undefined} onClick={() => setSelectedId(r.order_id || null)}>
                      <td>{i + 1}</td>
                      <td className="mono">{istTime(r.time)}</td>
                      <td className="mono text-red">{r.order_id}</td>
                      <td>{r.symbol || "—"}</td>
                      <td className="text-amber">{r.exchange || "—"}</td>
                      <td>{r.product || "—"}</td>
                      <td>{r.type || "—"}</td>
                      <td className="num">{orderPriceText(r)}</td>
                      <td className="num">{r.qty ?? "—"}</td>
                      <td className="text-red">{r.code || "—"}</td>
                      <td className="ref-reason" title={String(r.reason || "")}>{r.reason || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="No rejections" body="No rejected order in scope." />
          )}
        </div>
        <RejectionRca order={selected} journal={isJournal} />
      </section>

      <p className="ref-footnote">
        <AlertTriangle size={13} aria-hidden="true" /> Rejection reasons are masked: client codes, balances, shortfalls and holdings are hidden; circuit prices and freeze quantities stay readable.
      </p>
    </div>
  );
}

function DimensionTable({ title, head, rows, denied }: { title: string; head: string; rows: ReturnType<typeof rejectionsBy>; denied: boolean }) {
  return (
    <div className="panel">
      <div className="panel-head"><b>{title}</b></div>
      {denied ? (
        <EmptyState title="Order totals unavailable" body="Rates need the order list, which this role or source does not provide." />
      ) : rows.length ? (
        <div className="table-scroll">
          <table className="compact ref-table">
            <thead><tr><th>{head}</th><th className="num">Total Orders</th><th className="num">Rejected</th><th className="num">Rejection Rate</th></tr></thead>
            <tbody>
              {rows.slice(0, 8).map((r) => (
                <tr key={r.name}>
                  <td><b>{r.name}</b></td>
                  <td className="num">{fmt(r.total)}</td>
                  <td className="num">{fmt(r.rejected)}</td>
                  <td className={`num ${r.rate >= 10 ? "text-red" : r.rate >= 5 ? "text-amber" : "text-green"}`}>{pctText(r.rate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState title="No rejections" body="No rejected order in scope." />
      )}
    </div>
  );
}

type Lifecycle = { state: "idle" | "loading" } | { state: "error"; message: string } | { state: "ready"; events: any[] };

/** Timeline for the selected rejection from the order's lifecycle events. */
function RejectionRca({ order, journal }: { order: Row | null; journal: boolean }) {
  const [lifecycle, setLifecycle] = useState<Lifecycle>({ state: "idle" });
  const id = order?.order_id || "";

  useEffect(() => {
    if (!id) { setLifecycle({ state: "idle" }); return; }
    const controller = new AbortController();
    setLifecycle({ state: "loading" });
    const route = journal ? `/api/journal/orders/${encodeURIComponent(id)}/lifecycle` : `/api/orders/${encodeURIComponent(id)}/lifecycle`;
    fetch(`${apiUrl()}${route}`, { cache: "no-store", credentials: "include", headers: authHeaders(), signal: controller.signal })
      .then(async (res) => {
        if (res.status === 401 || res.status === 403) throw new Error("Your role does not include order lifecycles.");
        if (!res.ok) throw new Error(`Lifecycle unavailable (API ${res.status}).`);
        const body = await res.json();
        setLifecycle({ state: "ready", events: Array.isArray(body?.events) ? body.events : [] });
      })
      .catch((err) => {
        if (!controller.signal.aborted) setLifecycle({ state: "error", message: err instanceof Error ? err.message : "Lifecycle unavailable." });
      });
    return () => controller.abort();
  }, [id, journal]);

  const steps = lifecycle.state === "ready" ? lifecycleSteps(lifecycle.events) : [];

  return (
    <div className="panel ref-rca">
      <div className="panel-head"><b>Rejection RCA</b>{id && <a href={`/rca?order_id=${encodeURIComponent(id)}`}>Open RCA ›</a>}</div>
      {!order ? (
        <EmptyState title="No rejection selected" body="Select a recent rejection to see its timeline." />
      ) : (
        <div className="ref-rca-body">
          <p className="ref-rca-order">Order <b className="mono">{id}</b> · {order.symbol || "—"} · {order.exchange || "—"}</p>
          {lifecycle.state === "loading" && <p className="ref-rca-note">Loading journal events…</p>}
          {lifecycle.state === "error" && <p className="ref-rca-note">{lifecycle.message}</p>}
          {steps.length > 0 && (
            <ol className="ref-timeline">
              {steps.map((s, i) => (
                <li key={`${s.time}-${i}`} className={s.tone ? `tone-${s.tone}` : undefined}>
                  <i aria-hidden="true" />
                  <span className="mono">{s.time}</span>
                  <b>{s.status}</b>
                  <small>{s.gap}</small>
                </li>
              ))}
            </ol>
          )}
          <div className="ref-rca-reason">
            <div><span>Code:</span><b className="text-red">{order.code || "—"}</b></div>
            <div><span>Reason:</span><span>{order.reason || "No recorded reason"}</span></div>
          </div>
        </div>
      )}
    </div>
  );
}
