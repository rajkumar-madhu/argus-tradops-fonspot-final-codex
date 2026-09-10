"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  Gauge,
  RefreshCw,
  Server,
  XCircle,
} from "lucide-react";
import RefreshButton from "@/components/RefreshButton";
import { EmptyState, KpiCard, Status } from "@/components/UI";
import { apiError } from "@/lib/api-result";
import {
  buildAdapterMatrix,
  buildExecutionLogs,
  infraAsProcesses,
  type MatrixCell,
} from "@/lib/exchange-matrix";
import { fmt, journalWindowLabel } from "@/lib/format";

export type ExchangePayload = {
  exchanges: any;
  yel: any;
  infra: any;
  orders: any;
  rejections: any;
};

function cellKey(c: MatrixCell) {
  return `${c.client}::${c.exchange}`;
}

export default function ExchangeView({ exchanges, yel, infra, orders, rejections }: ExchangePayload) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const source = exchanges?.source || orders?.source || "—";
  const isJournal = source === "journal snapshot";
  const isFileBased = isJournal;

  const rows = exchanges?.items || [];
  const orderItems = orders?.items || [];
  const yelKeys: string[] = yel?.keys || [];
  const matrix = useMemo(
    () => buildAdapterMatrix(orderItems, yelKeys),
    [orderItems, yelKeys],
  );

  const selected: MatrixCell | null =
    matrix.cells.find((c) => cellKey(c) === selectedKey) ||
    matrix.cells.find((c) => c.status === "FAILED") ||
    matrix.cells.find((c) => c.status === "SUCCESS") ||
    null;

  const processes = infraAsProcesses(infra || {});
  const logs = buildExecutionLogs(rejections?.orders || [], infra || {});

  const healthy = matrix.summary.failures === 0 && matrix.summary.totalAdapters > 0;
  const overallStatus = healthy ? "Healthy" : matrix.summary.failures ? "Degraded" : "No Data";

  const metaLine = isFileBased
    ? `Adapter matrix derived from ${fmt(orderItems.length)} journal orders and ${fmt(yelKeys.length)} YEL keys · ${journalWindowLabel(orders?.from, orders?.to)}`
    : `${fmt(rows.length)} exchange segments monitored · ${source}`;

  const err = apiError(exchanges);

  return (
    <div className="exchange-apm-page">
      <section className="dashboard-head exchange-hero">
        <div>
          <div className="exchange-title-row">
            <h1>Exchange Health &amp; Adapter Status</h1>
            {isFileBased ? (
              <span className="source-badge file-based">FILE-BASED</span>
            ) : (
              <span className="source-badge live">LIVE</span>
            )}
          </div>
          <p>Real-time exchange connectivity, adapter matrix and process execution visibility.</p>
          <p className="exchange-meta">{metaLine}</p>
        </div>
        <div className="time-controls exchange-controls">
          <label className="exchange-auto-refresh">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            Auto Refresh
          </label>
          <RefreshButton />
        </div>
      </section>

      {err ? (
        <EmptyState title="Unable to load exchange health" body={err} />
      ) : (
        <>
          <div className={`exchange-status-banner ${healthy ? "healthy" : "warn"}`}>
            <CheckCircle2 size={20} aria-hidden />
            <div>
              <b>{overallStatus}</b>
              <span>
                {matrix.summary.totalAdapters
                  ? `${fmt(matrix.summary.success)} success · ${fmt(matrix.summary.failures)} failure(s) across client × exchange matrix`
                  : "No adapter cells derived — upload journal with user/broker and exchange fields"}
              </span>
            </div>
          </div>

          <section className="kpi-grid five exchange-kpis">
            <KpiCard
              label="Total Adapters"
              value={fmt(matrix.summary.totalAdapters)}
              delta={`${fmt(matrix.clients.length)} clients × ${fmt(matrix.exchanges.length)} exchanges`}
              tone="blue"
              icon={<Server size={18} />}
            />
            <KpiCard
              label="Success"
              value={fmt(matrix.summary.success)}
              delta={`${matrix.summary.successPct.toFixed(1)}%`}
              deltaTone="up"
              tone="green"
              icon={<CheckCircle2 size={18} />}
            />
            <KpiCard
              label="Failures"
              value={fmt(matrix.summary.failures)}
              delta="High rejection share"
              deltaTone={matrix.summary.failures ? "down" : "up"}
              tone="red"
              icon={<XCircle size={18} />}
            />
            <KpiCard
              label="Avg Response Time"
              value={
                rows.some((r: any) => r.latency_ms != null && Number.isFinite(r.latency_ms))
                  ? `${(rows.filter((r: any) => r.latency_ms != null && Number.isFinite(r.latency_ms)).reduce((s: number, r: any) => s + r.latency_ms, 0) / rows.filter((r: any) => r.latency_ms != null && Number.isFinite(r.latency_ms)).length).toFixed(2)} ms`
                  : "—"
              }
              delta="Exchange event latency"
              tone="purple"
              icon={<Gauge size={18} />}
            />
            <KpiCard
              label="Last Execution"
              value={orders?.to ? String(orders.to).slice(11, 19) : "—"}
              delta={orders?.to ? String(orders.to).slice(0, 10) : "Journal window end"}
              tone="amber"
              icon={<RefreshCw size={18} />}
            />
          </section>

          <section className="exchange-main-row">
            <div className="panel exchange-matrix-panel">
              <div className="panel-head">
                <div>
                  <b>Adapter Status Matrix</b>
                  <p className="sub">Client IDs × exchange segments — click a cell for details</p>
                </div>
                <span className="exchange-legend">
                  <i className="cell-success" /> Success{" "}
                  <i className="cell-failed" /> Failed{" "}
                  <i className="cell-none" /> No data
                </span>
              </div>
              {matrix.clients.length === 0 ? (
                <EmptyState
                  title="No adapter matrix"
                  body="Journal orders need user/broker and exchange fields to populate the client × exchange grid."
                />
              ) : (
                <div className="table-scroll">
                  <table className="adapter-matrix">
                    <thead>
                      <tr>
                        <th>Client ID</th>
                        {matrix.exchanges.map((ex) => (
                          <th key={ex}>{ex}</th>
                        ))}
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {matrix.clients.map((client) => {
                        const rowCells = matrix.cells.filter((c) => c.client === client);
                        const failed = rowCells.some((c) => c.status === "FAILED");
                        const any = rowCells.some((c) => c.status !== "NONE");
                        return (
                          <tr key={client}>
                            <td><b>{client}</b></td>
                            {matrix.exchanges.map((ex) => {
                              const cell = rowCells.find((c) => c.exchange === ex)!;
                              const key = cellKey(cell);
                              const selectedCls = selectedKey === key ? "selected" : "";
                              return (
                                <td
                                  key={ex}
                                  className={`matrix-cell ${cell.status.toLowerCase()} ${selectedCls}`}
                                  onClick={() => setSelectedKey(key)}
                                  title={
                                    cell.orders
                                      ? `${cell.orders} orders · ${cell.rejected} rejected`
                                      : "No orders"
                                  }
                                >
                                  {cell.orders ? fmt(cell.orders) : "—"}
                                </td>
                              );
                            })}
                            <td>
                              <span className={`matrix-row-status ${failed ? "failed" : any ? "success" : "none"}`}>
                                {failed ? "FAILED" : any ? "SUCCESS" : "—"}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <aside className="panel exchange-detail-sidebar">
              <div className="panel-head">
                <div>
                  <b>Adapter Details</b>
                  <p className="sub">
                    {selected ? `${selected.client} · ${selected.exchange}` : "Select a matrix cell"}
                  </p>
                </div>
                {selected && (
                  <span className={`matrix-row-status ${selected.status === "FAILED" ? "failed" : selected.status === "SUCCESS" ? "success" : "none"}`}>
                    {selected.status}
                  </span>
                )}
              </div>
              {!selected ? (
                <EmptyState title="No cell selected" body="Click a matrix cell to inspect adapter details." />
              ) : (
                <>
                  <ul className="config-list exchange-detail-list">
                    <li><span>Client ID</span><b>{selected.client}</b></li>
                    <li><span>Exchange</span><b>{selected.exchange}</b></li>
                    <li><span>Orders</span><b>{fmt(selected.orders)}</b></li>
                    <li><span>Rejected</span><b>{fmt(selected.rejected)}</b></li>
                    <li><span>YEL Key</span><b>{selected.yelConnected ? "Present" : "Not in snapshot"}</b></li>
                    <li><span>Last Success</span><b className="mono">{selected.lastSuccess?.slice(11, 19) || "—"}</b></li>
                    <li><span>Last Failure</span><b className="mono">{selected.lastFailure?.slice(11, 19) || "—"}</b></li>
                  </ul>
                  {selected.status === "FAILED" && (
                    <div className="exchange-failure-box">
                      <AlertTriangle size={14} aria-hidden />
                      <div>
                        <b>Failure Summary</b>
                        <p>
                          {selected.rejected} of {selected.orders} orders rejected on {selected.exchange} for{" "}
                          {selected.client}.
                        </p>
                      </div>
                    </div>
                  )}
                  <div className="exchange-detail-actions">
                    <RefreshButton />
                    <Link className="link-btn" href="/rejections">View Logs</Link>
                    <Link className="link-btn" href={`/rca`}>Generate RCA</Link>
                  </div>
                </>
              )}
            </aside>
          </section>

          <section className="exchange-bottom-row">
            <div className="panel">
              <div className="panel-head">
                <div>
                  <b>Process Status</b>
                  <p className="sub">Argus TradeOps workers and data plane</p>
                </div>
              </div>
              <div className="table-scroll">
                <table className="compact tight">
                  <thead>
                    <tr>
                      <th>Process</th>
                      <th>Host</th>
                      <th>Status</th>
                      <th>Exit</th>
                      <th>Remarks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {processes.map((p) => (
                      <tr key={p.name}>
                        <td className="mono">{p.name}</td>
                        <td>{p.host}</td>
                        <td><Status value={p.status} /></td>
                        <td>{p.exit_code}</td>
                        <td>{p.remarks}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="panel">
              <div className="panel-head">
                <div>
                  <b>Execution Logs</b>
                  <p className="sub">Rejection errors and infra status</p>
                </div>
                <Link href="/logs">View Full Log</Link>
              </div>
              <div className="exchange-log-scroll">
                {logs.length === 0 ? (
                  <EmptyState title="No logs" body="Rejection and infra events will appear here." />
                ) : (
                  logs.map((line, i) => (
                    <div key={i} className={`exchange-log-line level-${line.level.toLowerCase()}`}>
                      <time>{line.time}</time>
                      <b>{line.level}</b>
                      <em>{line.process}</em>
                      <p>{line.message}</p>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="panel">
              <div className="panel-head">
                <div>
                  <b>Exchange Segments</b>
                  <p className="sub">Venue health from API</p>
                </div>
                <Link href="/rejections">Rejections ›</Link>
              </div>
              <table className="compact tight">
                <thead>
                  <tr>
                    <th>Exchange</th>
                    <th>Status</th>
                    <th>Events</th>
                    <th>Rej %</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((x: any) => (
                    <tr key={x.name}>
                      <td><b>{x.name}</b></td>
                      <td><Status value={x.status || "—"} /></td>
                      <td>{fmt(x.events ?? 0)}</td>
                      <td>{x.reject_rate == null ? 'Unavailable' : `${Number(x.reject_rate).toFixed(2)}%`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {isFileBased && (
            <p className="exchange-footnote">
              <FileText size={13} aria-hidden />
              Journal mode — matrix cells show order counts per client × exchange. Empty cells have no orders in the uploaded file; not fabricated adapter health.
            </p>
          )}
        </>
      )}
    </div>
  );
}
