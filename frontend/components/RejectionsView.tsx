"use client";
import RefreshButton from "@/components/RefreshButton";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Layers, RefreshCw, Tag, XCircle } from "lucide-react";
import { Donut, HBarList, AreaChart } from "@/components/Charts";
import { demoSeries, demoTimeLabels } from "@/lib/chart-data";
import { DataTable, EmptyState, KpiCard, OrderDetailPanel, Severity, StatusBadge } from "@/components/UI";
import { fmt, timeShort } from "@/lib/format";
import { openAuthenticatedEventSource } from "@/lib/stream";

const MAX_ORDERS = 200;
const reasonCls = ["bar-red", "bar-amber", "bar-blue", "bar-purple", "bar-teal"];

function recomputeSummary(orders: any[]) {
  const groupMap: Record<string, { code: string; reason: string; category: string; count: number; trend: string }> = {};
  const catMap: Record<string, number> = {};
  for (const o of orders) {
    const reason = o.reason || "Unknown rejection";
    const code = o.code || "—";
    const category = o.rejection_category || "Uncategorized";
    const key = `${code}|${reason}|${category}`;
    if (!groupMap[key]) groupMap[key] = { code, reason, category, count: 0, trend: "—" };
    groupMap[key].count += 1;
    catMap[category] = (catMap[category] || 0) + 1;
  }
  const groups = Object.values(groupMap).sort((a, b) => b.count - a.count).slice(0, 30);
  const categories = Object.entries(catMap)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
  return { groups, categories };
}

function mergeRejection(prev: any, incoming: any) {
  const orders = [...(prev?.orders || [])];
  const idx = orders.findIndex((x) => x.order_id === incoming.order_id);
  if (idx >= 0) orders[idx] = { ...orders[idx], ...incoming };
  else orders.unshift(incoming);
  const trimmed = orders.slice(0, MAX_ORDERS);
  const summary = recomputeSummary(trimmed);
  const previousTotal = Number(prev?.rejected_unique_orders ?? orders.length);
  return {
    ...prev,
    ...summary,
    orders: trimmed,
    rejected_unique_orders: idx >= 0 ? previousTotal : previousTotal + 1,
    streamed_at: incoming.streamed_at || prev?.streamed_at,
  };
}

export default function RejectionsView({ data }: { data: any }) {
  const [live, setLive] = useState<any>(data || {});
  const [connected, setConnected] = useState(false);
  useEffect(() => setLive(data || {}), [data]);
  const groups = live.groups || [];
  const orders = live.orders || [];
  const categories = live.categories || [];
  const max = Math.max(...groups.map((x: any) => Number(x.count || 0)), 1);
  const [selectedId, setSelectedId] = useState(orders[0]?.order_id || '');
  const selected = orders.find((row:any)=>row.order_id===selectedId) || orders[0] || {};
  const setSelected = (row:any) => setSelectedId(row.order_id);

  useEffect(() => {
    if (data?.source === "demo") return;
    const es = openAuthenticatedEventSource("rejections", { interval: 3 });
    es.addEventListener("rejections", (e: MessageEvent) => {
      setConnected(true);
      try {
        const order = JSON.parse(e.data);
        if (!order?.order_id) return;
        setLive((prev: any) => mergeRejection(prev, order));
      } catch {
        /* keep last good state */
      }
    });
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    return () => es.close();
  }, [data?.source]);

  useEffect(() => {
    if (!selected?.order_id && orders[0]) setSelected(orders[0]);
  }, [orders, selected]);

  const byExchange = useMemo(() => {
    const map: Record<string, number> = {};
    orders.forEach((o: any) => {
      map[o.exchange] = (map[o.exchange] || 0) + 1;
    });
    return Object.entries(map).map(([name, count]) => ({ name, count }));
  }, [orders]);

  const catTotal = Math.max(1, categories.reduce((s: number, c: any) => s + Number(c.count || 0), 0));
  const rejLabels = demoTimeLabels(10, 9, 0, 15);
  const rejTrend = {
    labels: rejLabels,
    series: [
      { name: "Rejections", points: demoSeries(7, rejLabels.length, Math.max(orders.length, 3), 4), cls: "s-rejected" },
      { name: "Rate %", points: demoSeries(8, rejLabels.length, Number(live.reject_rate || 5), 2), cls: "s-total" },
    ],
  };

  return (
    <>
      <section className="dashboard-head overview-head">
        <div>
          <h1>Rejections & RCA</h1>
          <p>Rejected Noren order events grouped by code, reason and operational category</p>
        </div>
        <div className="time-controls">
          <RefreshButton/>
          <span className={`pill ${connected ? "ok" : "warn"}`}>
            {data?.source === "demo" ? "Demo snapshot" : connected ? "Stream connected" : "Stream disconnected"} · {live.rejected_unique_orders || 0} rejected · {live.reject_rate ?? "—"}%
          </span>
        </div>
      </section>

      <section className="kpi-grid four">
        <KpiCard label="Unique Rejected" value={fmt(live.rejected_unique_orders || 0)} delta="Noren status 56 / 65" deltaTone="down" tone="red" icon={<XCircle size={18} />} />
        <KpiCard label="Rejection Groups" value={fmt(groups.length)} delta="Code + reason clusters" tone="amber" icon={<Layers size={18} />} />
        <KpiCard label="Categories" value={fmt(categories.length)} delta="RMS / Exchange / OMS" tone="purple" icon={<Tag size={18} />} />
        <KpiCard label="Source" value={live.source || "—"} delta="noren-ordupd-intraday" tone="blue" icon={<AlertTriangle size={18} />} />
      </section>

      <section className="viz-row-3">
        <div className="panel">
          <div className="panel-head">
            <b>Illustrative Rejection Trend</b>
            <span className="legend"><i className="lg s-rejected" /> Count <i className="lg s-total" /> Rate</span>
          </div>
          <AreaChart series={rejTrend.series} labels={rejTrend.labels} height={150} />
        </div>
        <div className="panel">
          <div className="panel-head"><b>Top Rejection Groups</b></div>
          {groups.length === 0 ? (
            <EmptyState title="No rejections" body="No rejected orders in the current window." />
          ) : (
            <HBarList
              rows={groups.slice(0, 8).map((r: any, i: number) => ({
                label: `${r.code} · ${String(r.reason || "").replace(/^RED:/, "").slice(0, 36)}`,
                value: fmt(r.count),
                pct: (Number(r.count || 0) / max) * 100,
                cls: reasonCls[i % reasonCls.length],
              }))}
            />
          )}
        </div>
        <div className="panel">
          <div className="panel-head"><b>By Category</b></div>
          {categories.length === 0 ? (
            <EmptyState title="No categories" body="Rejection categories will appear once orders load." />
          ) : (
            <Donut
              centerLabel="Rejections"
              centerValue={fmt(live.rejected_unique_orders || 0)}
              slices={categories.slice(0, 4).map((c: any, i: number) => ({
                label: c.name,
                value: Number(c.count || 0),
                cls: ["seg-red", "seg-amber", "seg-blue", "seg-purple"][i % 4],
                pct: `${((Number(c.count || 0) / catTotal) * 100).toFixed(0)}%`,
              }))}
            />
          )}
        </div>
      </section>

      <section className="overview-row-4">
        <div className="panel span-2">
          <div className="panel-head"><b>RCA Correlation Keys</b><Link href="/rca">RCA module ›</Link></div>
          <div className="timeline">
            <div><b>1</b><span>NorenOrdNum</span><small>Primary order correlation</small></div>
            <div><b>2</b><span>Eref</span><small>Internal reference</small></div>
            <div><b>3</b><span>ExchOrdNum</span><small>Exchange acknowledgement</small></div>
            <div><b>4</b><span>Timestamps</span><small>Nanosecond event sequence</small></div>
            <div><b>5</b><span>RejReason</span><small>Evidence classification</small></div>
          </div>
          <ul className="config-list">
            {byExchange.map((x) => (
              <li key={x.name}><span>{x.name} segment</span><b>{x.count} rejections</b></li>
            ))}
          </ul>
        </div>
        <div className="panel span-2">
          <div className="panel-head"><b>Exchange Breakdown</b></div>
          <HBarList
            rows={byExchange.map((x, i) => ({
              label: x.name,
              value: `${x.count}`,
              pct: (x.count / Math.max(1, orders.length)) * 100,
              cls: ["bar-red", "bar-amber", "bar-blue", "bar-purple"][i % 4],
            }))}
          />
        </div>
      </section>

      <section className="orders-layout">
        <div className="panel orders-main">
          <div className="panel-head"><b>Affected orders</b><span className="source-tag">Click row for detail</span></div>
          <DataTable
            rows={orders}
            rowKey={(o) => o.order_id}
            onRowClick={setSelected}
            columns={[
              { key: "time", label: "Time", render: (o) => timeShort(o.time) },
              { key: "order_id", label: "Order", render: (o) => <b className="text-red">{o.order_id}</b> },
              { key: "exchange", label: "Exch" },
              { key: "symbol", label: "Symbol" },
              { key: "side", label: "Side", render: (o) => <span className={o.side === "BUY" ? "text-green" : "text-red"}>{o.side}</span> },
              { key: "code", label: "Code", render: (o) => <Severity value={o.code || "—"} /> },
              { key: "rejection_category", label: "Category", render: (o) => o.rejection_category || "—" },
              { key: "reason", label: "Reason" },
              { key: "rca", label: "RCA", render: (o) => <a className="link-btn" href={`/rca?order_id=${o.order_id}`}>Analyze</a> },
            ]}
          />
        </div>
        <aside className="panel order-detail">
          <div className="panel-head">
            <b>Rejection detail</b>
            {selected?.status && <StatusBadge value={selected.status} />}
          </div>
          <OrderDetailPanel order={selected} />
        </aside>
      </section>
    </>
  );
}
