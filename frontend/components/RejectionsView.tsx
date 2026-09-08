"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { FileText, Layers, Search, Tag, X, XCircle } from "lucide-react";
import RefreshButton from "@/components/RefreshButton";
import { EmptyState, KpiCard } from "@/components/UI";
import { fmt, journalWindowLabel, time24 } from "@/lib/format";
import { filterRows } from "@/lib/table-filters";
import { openAuthenticatedEventSource } from "@/lib/stream";

const MAX_ORDERS = 500;

function recomputeSummary(orders: any[]) {
  const groupMap: Record<string, { code: string; reason: string; category: string; count: number; trend: string }> = {};
  const catMap: Record<string, number> = {};
  for (const o of orders) {
    const reason = String(o.reason || "").trim() || "No recorded reason";
    const code = o.code || "—";
    const category = o.rejection_category || "Uncategorized";
    if (!groupMap[reason]) {
      groupMap[reason] = { code, reason, category, count: 0, trend: "—" };
    }
    groupMap[reason].count += 1;
    catMap[category] = (catMap[category] || 0) + 1;
  }
  const groups = Object.values(groupMap).sort((a, b) => b.count - a.count);
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

function fromUtcDateInput(v: string): string {
  if (!v) return "";
  return `${v}T00:00:00.000Z`;
}

function toUtcDateEnd(v: string): string {
  if (!v) return "";
  return `${v}T23:59:59.999Z`;
}

export default function RejectionsView({ data }: { data: any }) {
  const [live, setLive] = useState<any>(data || {});
  const [connected, setConnected] = useState(false);
  const [query, setQuery] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [selectedReason, setSelectedReason] = useState<string | null>(null);

  const isJournal = live?.source === "journal snapshot";
  const isDemo = live?.source === "demo";
  const isFileBased = isJournal;

  useEffect(() => setLive(data || {}), [data]);

  useEffect(() => {
    if (isJournal || isDemo) return;
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
  }, [isJournal, isDemo]);

  const groups = live.groups || [];
  const orders = live.orders || [];
  const journalEvents = Number(live.journal_events || 0);
  const rejectedCount = Number(live.rejected_unique_orders || orders.length || 0);

  const filteredOrders = useMemo(() => {
    const base = filterRows(orders, {
      query,
      from: fromDate ? fromUtcDateInput(fromDate) : "",
      to: toDate ? toUtcDateEnd(toDate) : "",
      timeKey: "time",
    });
    if (!selectedReason) return base;
    return base.filter((row) => {
      const reason = String(row.reason || "").trim() || "No recorded reason";
      return reason === selectedReason;
    });
  }, [orders, query, fromDate, toDate, selectedReason]);

  const activeFilters = Number(Boolean(query)) + Number(Boolean(fromDate || toDate)) + Number(Boolean(selectedReason));

  function resetFilters() {
    setQuery("");
    setFromDate("");
    setToDate("");
    setSelectedReason(null);
  }

  const metaLine = isFileBased
    ? `${fmt(journalEvents || live.records || 0)} journal events. ${journalWindowLabel(live.from, live.to)} · Uploaded history, not a live feed.`
    : isDemo
      ? `${fmt(rejectedCount)} rejected orders in the demo snapshot.`
      : connected
        ? `Streaming rejections from the event bus. ${fmt(rejectedCount)} unique rejected orders.`
        : `Event bus disconnected. Showing last loaded rejection snapshot.`;

  return (
    <div className="rejections-page">
      <section className="dashboard-head rejections-head">
        <div>
          <div className="rejections-title-row">
            <h1>Rejections</h1>
            {isFileBased ? (
              <span className="source-badge file-based">FILE-BASED</span>
            ) : (
              <span className={`source-badge ${connected ? "live" : "warn"}`}>
                {isDemo ? "DEMO" : connected ? "LIVE SSE" : "OFFLINE"}
              </span>
            )}
          </div>
          <p>Traceable data. Connected investigations. Clear decisions.</p>
          <p className="rejections-meta">{metaLine}</p>
        </div>
        <div className="time-controls">
          <RefreshButton />
        </div>
      </section>

      <section className="kpi-grid four rejections-kpis">
        <KpiCard
          label="Rejected orders"
          value={fmt(rejectedCount)}
          delta={isFileBased ? "Unique orders in journal" : "Noren status 56 / 65"}
          deltaTone="down"
          tone="red"
          icon={<XCircle size={18} />}
        />
        <KpiCard
          label="Recorded reasons"
          value={fmt(groups.length)}
          delta="Distinct journal rejection messages"
          tone="amber"
          icon={<Layers size={18} />}
        />
        <KpiCard
          label="Journal events"
          value={fmt(journalEvents || "—")}
          delta={isFileBased ? "ordupd rows in upload" : "Not applicable"}
          tone="purple"
          icon={<Tag size={18} />}
        />
        <KpiCard
          label="Source"
          value={live.source || "—"}
          delta={isFileBased ? "Uploaded journal snapshot" : "Operational feed"}
          tone="blue"
          icon={<FileText size={18} />}
        />
      </section>

      <section className="panel rejections-toolbar-panel">
        <div className="rejections-toolbar">
          <label className="rejections-search" htmlFor="rejections-search">
            <Search size={15} aria-hidden />
            <input
              id="rejections-search"
              type="search"
              value={query}
              placeholder="Search orders, instruments, traders…"
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <label htmlFor="rejections-from">
            From (UTC)
            <input
              id="rejections-from"
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </label>
          <label htmlFor="rejections-to">
            To (UTC)
            <input
              id="rejections-to"
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
            />
          </label>
          {activeFilters > 0 && (
            <button type="button" className="link-btn rejections-reset" onClick={resetFilters}>
              <X size={14} aria-hidden />
              Reset filters
            </button>
          )}
        </div>
      </section>

      <section className="panel rejections-evidence">
        <div className="panel-head">
          <div>
            <b>Rejection evidence by reason</b>
            <p className="sub">Recorded reasons from the journal; select a reason to filter the events</p>
          </div>
          {selectedReason && (
            <button type="button" className="link-btn" onClick={() => setSelectedReason(null)}>
              Clear reason filter
            </button>
          )}
        </div>
        {groups.length === 0 ? (
          <EmptyState title="No rejection reasons" body="No rejected orders were returned for this source." />
        ) : (
          <div className="reason-evidence-grid">
            {groups.map((group: any) => {
              const reason = String(group.reason || "").trim() || "No recorded reason";
              const active = selectedReason === reason;
              return (
                <button
                  key={reason}
                  type="button"
                  className={`reason-evidence-card${active ? " selected" : ""}`}
                  onClick={() => setSelectedReason(active ? null : reason)}
                >
                  <span className="reason-evidence-text">{reason}</span>
                  <span className="reason-evidence-count">{fmt(group.count)} orders</span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <section className="panel rejections-table-panel">
        <div className="panel-head">
          <div>
            <b>Rejections</b>
            <p className="sub">Every row retains its original import and source-row reference.</p>
          </div>
          <span className="source-tag">
            {fmt(filteredOrders.length)} of {fmt(orders.length)} rows
          </span>
        </div>
        {orders.length === 0 ? (
          <EmptyState title="No rejections" body="No rejected orders were returned for this source." />
        ) : (
          <div className="table-scroll" tabIndex={0} aria-label="Rejections table">
            <table className="orders-table rejections-table">
              <thead>
                <tr>
                  <th>Order ID</th>
                  <th>Instrument</th>
                  <th>Exchange</th>
                  <th>Raw status</th>
                  <th>Event time · IST</th>
                  <th>Recorded reason</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map((row: any) => {
                  const reason = String(row.reason || "").trim() || "No recorded reason";
                  return (
                    <tr key={row.order_id}>
                      <td>
                        <Link className="link-btn text-red" href={`/rca?order_id=${encodeURIComponent(row.order_id)}`}>
                          {row.order_id}
                        </Link>
                      </td>
                      <td>{row.symbol || "—"}</td>
                      <td>{row.exchange || "—"}</td>
                      <td className="mono">{row.status_code ?? "—"}</td>
                      <td className="mono">{time24(row.time)} IST</td>
                      <td className="reason-cell">{reason}</td>
                    </tr>
                  );
                })}
                {!filteredOrders.length && (
                  <tr>
                    <td colSpan={6}>
                      <EmptyState
                        title="No matching rejections"
                        body="Try clearing the reason filter or widening the UTC date range."
                      />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        {isFileBased && (
          <p className="rejections-footnote">
            <FileText size={13} aria-hidden />
            Journal snapshot mode — rejection text is shown in full for investigation. General order lists still withhold free-text reasons.
          </p>
        )}
      </section>
    </div>
  );
}
