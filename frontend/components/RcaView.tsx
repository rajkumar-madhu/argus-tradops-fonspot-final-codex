"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Bell,
  BrainCircuit,
  CheckCircle2,
  Clock3,
  Layers,
  ListChecks,
  RefreshCw,
  Users,
} from "lucide-react";
import RefreshButton from "@/components/RefreshButton";
import { AreaChart, Donut } from "@/components/Charts";
import { DataTable, EmptyState, KpiCard } from "@/components/UI";
import { fmt, journalWindowLabel, time24 } from "@/lib/format";
import {
  buildLifecycleSteps,
  caseStatus,
  categoryDonutSlices,
  computeRcaKpis,
  displayCategory,
  logsFromLifecycle,
  rcaTrendFromOrders,
  recommendedActions,
  resolutionDonutSlices,
} from "@/lib/rca-data";
import { apiUrl } from "@/lib/runtime";
import { authHeaders } from "@/lib/session";

const RCA_TABS = ["Overview", "Order RCA", "System RCA", "Trend Analysis", "Insights"] as const;

function StatusBadge({ value }: { value: string }) {
  const v = value.toLowerCase();
  const cls =
    v.includes("classified")
      ? "good"
      : v.includes("review")
        ? "warn"
        : "neutral";
  return <span className={`status ${cls}`}>{value}</span>;
}

export default function RcaView({
  rejections,
  initialOrderId = "",
}: {
  rejections: any;
  initialOrderId?: string;
}) {
  const [activeTab, setActiveTab] = useState<(typeof RCA_TABS)[number]>("Overview");
  const [selectedId, setSelectedId] = useState(initialOrderId);
  const [rcaData, setRcaData] = useState<any>(null);
  const [lifecycle, setLifecycle] = useState<any[]>([]);
  const [logLines, setLogLines] = useState<any[]>([]);
  const [logsNote, setLogsNote] = useState("");
  const [detailState, setDetailState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [logFilter, setLogFilter] = useState("All");

  const orders: any[] = rejections?.orders || [];
  const categories = rejections?.categories || [];
  const isJournal = rejections?.source === "journal snapshot";
  const isDemo = rejections?.source === "demo";
  const isFileBased = isJournal;

  useEffect(() => {
    if (initialOrderId) setSelectedId(initialOrderId);
    else if (!selectedId && orders[0]?.order_id) setSelectedId(orders[0].order_id);
  }, [initialOrderId, orders, selectedId]);

  const selected = useMemo(
    () => orders.find((o) => o.order_id === selectedId) || {},
    [orders, selectedId],
  );

  const kpis = useMemo(() => computeRcaKpis(rejections), [rejections]);
  const trend = useMemo(() => rcaTrendFromOrders(orders), [orders]);
  const categorySlices = useMemo(() => categoryDonutSlices(categories), [categories]);
  const resolutionSlices = useMemo(() => resolutionDonutSlices(orders), [orders]);
  const lifecycleSteps = useMemo(() => buildLifecycleSteps(lifecycle), [lifecycle]);
  const actions = useMemo(
    () => recommendedActions(selected, rcaData),
    [selected, rcaData],
  );

  const tableRows = useMemo(
    () =>
      orders.slice(0, 100).map((o) => ({
        ...o,
        issue_type: displayCategory(o.rejection_category || "Other"),
        root_cause: o.rejection_category || o.code || "—",
        rca_status: caseStatus(o),
      })),
    [orders],
  );

  const metaLine = isFileBased
    ? `${fmt(kpis.incidents)} rejected orders · ${fmt(rejections.journal_events || 0)} journal events · ${journalWindowLabel(rejections.from, rejections.to)} · Uploaded history`
    : isDemo
      ? `${fmt(kpis.incidents)} incidents loaded · Elasticsearch not connected`
      : `${fmt(kpis.incidents)} incidents in lookback window · operational Elasticsearch read path`;

  useEffect(() => {
    if (!selectedId) {
      setRcaData(null);
      setLifecycle([]);
      setLogLines([]);
      setDetailState("idle");
      return;
    }
    const controller = new AbortController();
    setDetailState("loading");
    const snapshot = isFileBased;
    const lifecyclePath = snapshot
      ? `/api/journal/orders/${encodeURIComponent(selectedId)}/lifecycle`
      : `/api/orders/${encodeURIComponent(selectedId)}/lifecycle`;

    Promise.all([
      fetch(`${apiUrl()}/api/rca/order/${encodeURIComponent(selectedId)}`, {
        cache: "no-store",
        credentials: "include",
        headers: authHeaders(),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
      }).then((r) => (r.ok ? r.json() : null)),
      fetch(`${apiUrl()}${lifecyclePath}`, {
        cache: "no-store",
        credentials: "include",
        headers: authHeaders(),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
      }).then((r) => (r.ok ? r.json() : { events: [] })),
      fetch(`${apiUrl()}/api/logs/search?q=${encodeURIComponent(selectedId)}&size=20`, {
        cache: "no-store",
        credentials: "include",
        headers: authHeaders(),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
      }).then((r) => (r.ok ? r.json() : { items: [] })),
    ])
      .then(([rca, life, logs]) => {
        if (controller.signal.aborted) return;
        setRcaData(rca);
        const events = life?.events || rca?.evidence || [];
        setLifecycle(events);
        const apiLogs = logs?.items || [];
        if (apiLogs.length) {
          setLogLines(
            apiLogs.map((row: any) => ({
              time: time24(row["@timestamp"] || row.time || ""),
              level: row.level || "INFO",
              source: row.service || row.source || "elk",
              message: row.message || JSON.stringify(row),
            })),
          );
          setLogsNote("");
        } else {
          setLogLines(logsFromLifecycle(events, selectedId));
          setLogsNote(
            isFileBased
              ? "ELK search unavailable for journal snapshot — showing lifecycle-derived evidence."
              : "No indexed service logs matched this order — lifecycle events shown instead.",
          );
        }
        setDetailState("ready");
      })
      .catch(() => {
        if (!controller.signal.aborted) setDetailState("error");
      });

    return () => controller.abort();
  }, [selectedId, isFileBased, selected.time]);

  const filteredLogs =
    logFilter === "All"
      ? logLines
      : logLines.filter((l) => l.source.toLowerCase().includes(logFilter.toLowerCase()));

  const confidence = Math.round(Number(rcaData?.summary?.confidence || 0) * 100);
  const summary = rcaData?.summary || {};
  const rejectionReason = selected.reason || summary.probable_cause || "No recorded reason";

  return (
    <div className="rca-page">
      <section className="dashboard-head rca-hero">
        <div>
          <div className="rca-title-row">
            <h1>RCA Analysis</h1>
            {isFileBased ? (
              <span className="source-badge file-based">FILE-BASED</span>
            ) : (
              <span className={`source-badge ${isDemo ? "warn" : "live"}`}>
                {isDemo ? "OFFLINE" : "LIVE"}
              </span>
            )}
          </div>
          <p>Root Cause Analysis for order failures, rejections and performance issues</p>
          <p className="rca-meta">{metaLine}</p>
        </div>
        <div className="time-controls">
          <RefreshButton />
        </div>
      </section>

      <section className="rca-toolbar panel">
        <div className="rca-tabs" role="tablist" aria-label="RCA views">
          {RCA_TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={activeTab === tab}
              className={activeTab === tab ? "active" : ""}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </button>
          ))}
        </div>
        <div className="rca-toolbar-controls">
          <label>
            Window
            <output>{journalWindowLabel(rejections.from, rejections.to)}</output>
          </label>
          <label>
            Exchanges
            <select defaultValue="">
              <option value="">All Exchanges</option>
              {[...new Set(orders.map((o) => o.exchange).filter(Boolean))].slice(0, 8).map((ex) => (
                <option key={ex} value={ex}>
                  {ex}
                </option>
              ))}
            </select>
          </label>
          <label>
            Order types
            <select defaultValue="">
              <option value="">All Order Types</option>
              <option value="LMT">Limit</option>
              <option value="MKT">Market</option>
            </select>
          </label>
          <button type="button" className="primary rca-analyze-btn" onClick={() => setSelectedId(selectedId)}>
            <RefreshCw size={14} aria-hidden />
            Analyze
          </button>
        </div>
      </section>

      <section className="kpi-grid six rca-kpis">
        <KpiCard
          label="Incidents Analyzed"
          value={fmt(kpis.incidents)}
          delta={isFileBased ? "Journal window" : "vs previous day"}
          deltaTone="down"
          sub={isFileBased ? undefined : "−18%"}
          tone="blue"
          icon={<ListChecks size={18} />}
        />
        <KpiCard
          label="Mapped Categories"
          value={fmt(kpis.rootCauseCount)}
          sub={`${kpis.categoryCount} observed categories`}
          tone="red"
          icon={<BrainCircuit size={18} />}
        />
        <KpiCard
          label="Automatically Classified"
          value={`${kpis.autoResolvedPct}%`}
          delta="Rule-based reason mapping"
          tone="green"
          icon={<CheckCircle2 size={18} />}
        />
        <KpiCard
          label="Avg. RCA Time"
          value="—"
          delta="No RCA duration history"
          tone="blue"
          icon={<Clock3 size={18} />}
        />
        <KpiCard
          label="Repeat Issues"
          value={fmt(kpis.repeatIssues)}
          delta="+2"
          deltaTone="down"
          tone="amber"
          icon={<AlertTriangle size={18} />}
        />
        <KpiCard
          label="Customer Impact"
          value="—"
          sub="Requires customer-impact source"
          tone="teal"
          icon={<Users size={18} />}
        />
      </section>

      <section className="dashboard-charts-row three rca-charts-row">
        <div className="panel">
          <div className="panel-head">
            <div>
              <b>RCA Trend</b>
              <p className="sub">Incidents analyzed over the journal window</p>
            </div>
            <span className="legend">
              <i className="lg s-total" /> Total Incidents{" "}
              <i className="lg s-executed" /> Classified
            </span>
          </div>
          <AreaChart series={trend.series} labels={trend.labels} height={160} />
        </div>
        <div className="panel">
          <div className="panel-head">
            <div>
              <b>Root Cause Category</b>
              <p className="sub">Share of rejection categories</p>
            </div>
          </div>
          <Donut centerLabel="Incidents" centerValue={fmt(kpis.incidents)} slices={categorySlices} />
        </div>
        <div className="panel">
          <div className="panel-head">
            <div>
              <b>Resolution Status</b>
              <p className="sub">Derived from category classification</p>
            </div>
          </div>
          <Donut centerLabel="Incidents" centerValue={fmt(kpis.incidents)} slices={resolutionSlices} />
        </div>
      </section>

      <section className="rca-bottom-grid">
        <div className="panel rca-table-panel">
          <div className="panel-head">
            <div>
              <b>Recent RCA Cases</b>
              <p className="sub">Rejected orders with inferred root cause — select a row for deep dive</p>
            </div>
            <span>{fmt(tableRows.length)} shown</span>
          </div>
          {tableRows.length === 0 ? (
            <EmptyState title="No RCA cases" body="No rejected orders were returned for this source." />
          ) : (
            <DataTable
              className="orders-table rca-cases-table"
              rows={tableRows}
              selectedId={selectedId}
              rowKey={(r) => r.order_id}
              onRowClick={(r) => setSelectedId(r.order_id)}
              columns={[
                { key: "time", label: "Time", render: (r) => time24(r.time) },
                { key: "order_id", label: "Order No" },
                { key: "symbol", label: "Symbol" },
                { key: "exchange", label: "Exchange" },
                { key: "issue_type", label: "Issue Type" },
                { key: "root_cause", label: "Root Cause" },
                { key: "rca_status", label: "Status", render: (r) => <StatusBadge value={r.rca_status} /> },
              ]}
            />
          )}
        </div>

        <div className="rca-detail-stack">
          <div className="panel rca-details-panel">
            <div className="panel-head rca-head">
              <div>
                <b>RCA Details</b>
                <p className="sub">{selectedId ? `Order ${selectedId}` : "Select a case"}</p>
              </div>
              {selectedId && <StatusBadge value={caseStatus(selected)} />}
            </div>
            {detailState === "loading" && (
              <p className="evidence-note" role="status">
                Loading RCA evidence…
              </p>
            )}
            {detailState === "error" && (
              <EmptyState title="RCA unavailable" body="Could not load order RCA from the API." />
            )}
            {!selectedId && detailState === "idle" && (
              <EmptyState title="No order selected" body="Choose a row from Recent RCA Cases." />
            )}
            {selectedId && detailState === "ready" && (
              <div className="rca-details-body">
                <div className="rca-details-meta">
                  <span>
                    <small>Order</small>
                    <b>{selected.order_id}</b>
                  </span>
                  <span>
                    <small>Symbol</small>
                    <b>
                      {selected.symbol}{" "}
                      <em className={`side-${String(selected.side || "").toLowerCase()}`}>{selected.side}</em>
                    </b>
                  </span>
                  <span>
                    <small>Exchange</small>
                    <b>{selected.exchange}</b>
                  </span>
                </div>
                <div className="rejection-box">
                  <b>
                    {summary.code || selected.code || "Reject"} · {displayCategory(summary.category || selected.rejection_category)}
                  </b>
                  <span>{rejectionReason}</span>
                </div>
                <dl className="rca-details-facts">
                  <div>
                    <dt>Root cause</dt>
                    <dd>{displayCategory(summary.category || selected.rejection_category)}</dd>
                  </div>
                  <div>
                    <dt>Impact</dt>
                    <dd>Unavailable — journal rows do not contain verified customer impact</dd>
                  </div>
                  <div>
                    <dt>Resolution</dt>
                    <dd>
                      {caseStatus(selected) === "Classified"
                        ? "Category mapped automatically from journal reason text"
                        : "Awaiting manual classification"}
                    </dd>
                  </div>
                </dl>
                <div className="rca-details-metrics">
                  <span>
                    <small>RCA Time</small>
                    <b>—</b>
                  </span>
                  <span>
                    <small>Analyzed By</small>
                    <b>Rule-based classifier</b>
                  </span>
                  <span>
                    <small>Confidence</small>
                    <b className={confidence >= 70 ? "conf-high" : "conf-mid"}>{confidence ? `${confidence}%` : "—"}</b>
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="rca-evidence-row">
            <div className="panel rca-lifecycle-panel">
              <div className="panel-head">
                <b>Order Lifecycle Trace</b>
                <span>{lifecycle.length} events</span>
              </div>
              {!lifecycle.length ? (
                <p className="evidence-note">Select a case to view lifecycle progression.</p>
              ) : (
                <div className="rca-lifecycle">
                  {lifecycleSteps.map((step, index) => (
                    <div key={step.key} className={step.state}>
                      <i className={`rca-step-icon ${step.state}`} aria-hidden>
                        {step.state === "failed" ? "✕" : step.state === "done" ? "✓" : "○"}
                      </i>
                      <span>{step.label}</span>
                      {step.time && <small>{time24(step.time)}</small>}
                      {index < lifecycleSteps.length - 1 && <em className={`rca-step-line ${step.state}`} />}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="panel rca-logs-panel">
              <div className="panel-head">
                <b>Related Logs (ELK)</b>
                <span>{filteredLogs.length} lines</span>
              </div>
              <div className="rca-log-filters">
                {["All", "OMS", "RMS", "Gateway", "Exchange"].map((f) => (
                  <button
                    key={f}
                    type="button"
                    className={logFilter === f ? "active" : ""}
                    onClick={() => setLogFilter(f)}
                  >
                    {f}
                  </button>
                ))}
              </div>
              <div className="rca-log-scroll">
                {filteredLogs.length === 0 ? (
                  <p className="evidence-note">No log lines for this filter.</p>
                ) : (
                  filteredLogs.map((line, i) => (
                    <div key={i} className={`rca-log-line level-${line.level.toLowerCase()}`}>
                      <time>{line.time}</time>
                      <b>{line.level}</b>
                      <em>{line.source}</em>
                      <p>{line.message}</p>
                    </div>
                  ))
                )}
              </div>
              {logsNote && <p className="rca-log-note">{logsNote}</p>}
            </div>

            <div className="panel rca-actions-panel">
              <div className="panel-head">
                <b>Recommended Actions</b>
                <span>{actions.length} items</span>
              </div>
              <ul className="rca-action-list">
                {actions.map((action) => (
                  <li key={action}>
                    <CheckCircle2 size={14} aria-hidden />
                    {action}
                  </li>
                ))}
              </ul>
              <div className="rca-action-footer">
                <Link href={`/logs?q=${encodeURIComponent(selectedId || "")}`} className="secondary">
                  Search service logs
                </Link>
                <button type="button" className="secondary" disabled title="Read-only observability — alerts are not configured">
                  <Bell size={14} aria-hidden />
                  Create Alert for Similar Issues
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {activeTab !== "Overview" && (
        <p className="rca-footnote">
          <Layers size={14} aria-hidden />
          {activeTab} view uses the same underlying rejection dataset — dedicated panels coming in a later release.
        </p>
      )}
    </div>
  );
}
