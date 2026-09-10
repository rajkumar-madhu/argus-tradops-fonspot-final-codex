import Link from "next/link";
import type { ReactNode } from "react";
import { CheckCircle2, ClipboardList, Clock3, UserRound, Users, XCircle } from "lucide-react";
import RefreshButton from "@/components/RefreshButton";
import QueryWindow from "@/components/QueryWindow";
import MissionControlTable from "@/components/MissionControlTable";
import { AreaChart, Donut, HBarList } from "@/components/Charts";
import { EmptyState, KpiCard } from "@/components/UI";
import { apiError } from "@/lib/api-result";
import { platformHealth } from "@/lib/command-center";
import { orderTrendFromRows, statusDonutSlices } from "@/lib/dashboard-data";
import { sourceBadgeText, sourceBadgeTone, sourceDisplayName } from "@/lib/data-source";
import { fmt, journalWindowLabel } from "@/lib/format";
import { istTime } from "@/lib/journal-explore";
import { MISSION_KPI_DEFS, fileSourceStripMeta, rejectRatePct } from "@/lib/mission-control";

export type DashboardPayload = {
  lookback: string;
  overview: any;
  orders: any;
  rejections: any;
  exchanges: any;
  yel: any;
  fileSources?: unknown;
  sessions?: any;
  infra?: any;
  ready?: any;
  yelRecords?: any;
  /** Rendered after the reference layout (the Command Center detail section). */
  detail?: ReactNode;
};

const pct = (n: number, total: number) => (total ? `${((n / total) * 100).toFixed(1)}%` : "0.0%");
const REASON_BARS = ["bar-red", "bar-amber", "bar-blue", "bar-purple", "bar-teal"];

/** Latest order event per exchange, for the Exchange Health "Last update" column. */
function lastEventByExchange(orders: any[]) {
  const latest = new Map<string, string>();
  for (const o of orders) {
    const x = String(o.exchange || "");
    if (!x || !o.time) continue;
    const prev = latest.get(x);
    if (!prev || Date.parse(o.time) > Date.parse(prev)) latest.set(x, o.time);
  }
  return latest;
}

export default function DashboardView({
  lookback,
  overview: ov,
  orders: od,
  rejections: rj,
  exchanges: ex,
  yel,
  fileSources,
  sessions,
  infra,
  ready,
  yelRecords,
  detail,
}: DashboardPayload) {
  const orders: any[] = od.items || [];
  const groups: any[] = rj.groups || [];
  const exchangeItems: any[] = ex.items || [];

  const source = String(ov.source || od.source || "");
  const isJournal = source === "journal snapshot";
  const isDemo = source === "demo";

  const total = Number(ov.orders ?? od.count ?? orders.length);
  const complete = Number(ov.complete ?? 0);
  const rejected = Number(ov.rejected ?? rj.rejected_unique_orders ?? 0);
  const open = Number(ov.open ?? orders.filter((o) => o.status === "OPEN").length);
  const pending = Number(ov.pending ?? orders.filter((o) => ["PENDING", "TRIGGER_PENDING"].includes(String(o.status))).length);
  const rejectRate = Number(ov.reject_rate ?? rejectRatePct(total, rejected));
  const sessionSummary = ov.sessions || {};
  const activeUsers = sessionSummary.active_sessions ?? sessions?.active_count;
  const brokersWithSessions = sessionSummary.unique_brokers;
  const brokersInOrders = Number(ov.brokers ?? 0);

  const useRealCharts = isJournal || (!isDemo && orders.length > 0);
  const orderTrend = useRealCharts ? orderTrendFromRows(orders) : null;
  const donutSlices = statusDonutSlices({ total, complete, rejected, open, pending });
  const maxReason = Math.max(1, ...groups.map((g) => Number(g.count || 0)));
  const lastByExchange = lastEventByExchange(orders);
  const health = apiError(infra) ? null : platformHealth(infra, ready);
  const sessionRows: any[] = (sessions?.items || []).filter((s: any) => s.event === "login").slice(0, 5);
  const yelRows: any[] = (yelRecords?.items || []).slice(0, 5);

  const metaLine = isJournal
    ? `${fmt(Number(ov.journal_events || 0))} journal events · ${journalWindowLabel(ov.from, ov.to)} · uploaded history, not a live feed`
    : isDemo
      ? "Elasticsearch not connected"
      : `${fmt(total)} orders in the ${lookback} window · live Elasticsearch read path`;

  const ovErr = apiError(ov);
  const fileStrip = fileSourceStripMeta(fileSources);

  const kpiValues: Record<string, { value: string; delta: string; deltaTone?: "up" | "down" | "warn" | ""; tone: "blue" | "green" | "red" | "amber" | "purple" | "teal"; icon: ReactNode }> = {
    total: { value: fmt(total), delta: isJournal ? "Unique orders in journal" : `${lookback} window`, tone: "blue", icon: <ClipboardList size={18} /> },
    complete: { value: fmt(complete), delta: pct(complete, total), deltaTone: "up", tone: "green", icon: <CheckCircle2 size={18} /> },
    rejected: { value: fmt(rejected), delta: `${rejectRate.toFixed(2)}%`, deltaTone: "down", tone: "red", icon: <XCircle size={18} /> },
    pending: { value: fmt(open + pending), delta: `${fmt(open)} open · ${fmt(pending)} pending`, deltaTone: open + pending ? "warn" : "", tone: "amber", icon: <Clock3 size={18} /> },
    active_users: {
      value: activeUsers == null ? "—" : fmt(activeUsers),
      delta: activeUsers == null ? "Sessions not available" : `${fmt(sessionSummary.unique_users ?? activeUsers)} unique users`,
      tone: "purple",
      icon: <UserRound size={18} />,
    },
    brokers: {
      value: brokersWithSessions == null ? "—" : `${fmt(brokersWithSessions)}${brokersInOrders ? ` / ${fmt(brokersInOrders)}` : ""}`,
      delta: brokersWithSessions == null ? "Sessions not available" : "With a session / seen in orders",
      tone: "teal",
      icon: <Users size={18} />,
    },
  };

  return (
    <div className="dashboard-page mission-control ref-page">
      <section className="ref-head">
        <div>
          <div className="ref-title-row">
            <h1>Trading Operations Dashboard</h1>
            <span className={`source-badge ${isJournal ? "file-based" : sourceBadgeTone(source)}`}>{sourceBadgeText(source)}</span>
          </div>
          <p>Monitoring for Noren Trader / OMS / RMS / Exchange / Infrastructure · {metaLine}</p>
        </div>
        <div className="ref-controls">
          {!isJournal && !isDemo && <QueryWindow value={lookback} source={source} label="Dashboard window" />}
          <RefreshButton />
        </div>
      </section>

      {ovErr ? (
        <EmptyState title="Unable to load overview" body={`${ovErr}. Confirm the API is running and reachable.`} />
      ) : (
        <>
          <section className="kpi-grid ref-kpis six mission-kpis" aria-label="Dashboard KPIs">
            {MISSION_KPI_DEFS.map((def) => {
              const v = kpiValues[def.key];
              // The reference tiles carry value + one line; the definition moves to the tooltip.
              return <div key={def.key} title={def.definition}><KpiCard label={def.label} value={v.value} delta={v.delta} deltaTone={v.deltaTone} tone={v.tone} icon={v.icon} /></div>;
            })}
          </section>

          <section className="ref-grid four mission-charts">
            <div className="panel">
              <div className="panel-head">
                <b>Orders Trend</b>
                <span className="legend"><i className="lg s-total" /> Total <i className="lg s-executed" /> Executed <i className="lg s-rejected" /> Rejected</span>
              </div>
              {orderTrend ? (
                <div className="ref-chart"><AreaChart series={orderTrend.series} labels={orderTrend.labels} height={150} /></div>
              ) : (
                <EmptyState title="No trend data" body="Load orders to plot the operational timeline." />
              )}
            </div>
            <div className="panel">
              <div className="panel-head"><b>Order Distribution</b></div>
              <div className="ref-donut"><Donut centerLabel="Total Orders" centerValue={fmt(total)} slices={donutSlices} /></div>
            </div>
            <div className="panel">
              <div className="panel-head"><b>Top Rejection Reasons</b><Link href="/rejections">Rejections ›</Link></div>
              {apiError(rj) ? (
                <EmptyState title="Rejections unavailable" body={String(apiError(rj))} />
              ) : groups.length === 0 ? (
                <EmptyState title="No rejections" body="No rejected orders in the current window." />
              ) : (
                <div className="ref-chart">
                  <HBarList
                    rows={groups.slice(0, 5).map((g, i) => ({
                      label: `${g.code || "—"} · ${String(g.category || g.reason || "").slice(0, 30)}`,
                      value: fmt(g.count),
                      pct: (Number(g.count || 0) / maxReason) * 100,
                      cls: REASON_BARS[i % REASON_BARS.length],
                    }))}
                  />
                </div>
              )}
            </div>
            <div className="panel">
              <div className="panel-head"><b>Exchange Health</b><Link href="/exchange">Exchange ›</Link></div>
              {apiError(ex) ? (
                <EmptyState title="Exchanges unavailable" body={String(apiError(ex))} />
              ) : exchangeItems.length === 0 ? (
                <EmptyState title="No exchanges" body="Exchange breakdown is empty for this source." />
              ) : (
                <table className="compact ref-table">
                  <thead><tr><th>Exchange</th><th>Status</th><th className="num">Reject %</th><th>Last Update</th></tr></thead>
                  <tbody>
                    {exchangeItems.slice(0, 6).map((x: any) => (
                      <tr key={x.name}>
                        <td><b>{x.name}</b></td>
                        <td><span className={`ref-pill ${x.status === "Connected" || x.status === "Healthy" ? "ok" : isJournal ? "info" : "warn"}`}>{isJournal ? "Observed" : x.status || "—"}</span></td>
                        <td className="num">{x.reject_rate == null ? "—" : `${Number(x.reject_rate).toFixed(1)}%`}</td>
                        <td className="mono">{lastByExchange.get(x.name) ? istTime(lastByExchange.get(x.name)) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>

          {apiError(od) ? (
            <EmptyState title="Unable to load orders" body={String(apiError(od))} />
          ) : (
            <MissionControlTable initial={od} source={source} lookback={lookback} />
          )}

          <section className="ref-grid four">
            <div className="panel">
              <div className="panel-head"><b>Network Bandwidth (WAN)</b></div>
              <EmptyState title="No bandwidth source" body="Set PROMETHEUS_URL with node-exporter to chart interface throughput." />
            </div>
            <div className="panel">
              <div className="panel-head"><b>Recent Exchange Messages</b><Link href="/logs?msg_type=yel_connected">View all ›</Link></div>
              {yelRows.length ? (
                <table className="compact ref-table">
                  <thead><tr><th>Time</th><th>Exchange</th><th>Type</th><th>Message</th></tr></thead>
                  <tbody>
                    {yelRows.map((r: any) => {
                      const keys: any[] = Array.isArray(r.fields?.Keys) ? r.fields.Keys : [];
                      const stamp = String(keys[3] || "");
                      const state = String(keys[4] || "").toUpperCase();
                      return (
                        <tr key={r.source_line}>
                          <td className="mono">{stamp.split(" ")[1] || "—"}</td>
                          <td><b>{keys[0] || "—"}</b></td>
                          <td><span className={`ref-pill ${state === "CONNECTED" ? "info" : "warn"}`}>{state === "CONNECTED" ? "INFO" : "WARN"}</span></td>
                          <td>Gateway {state ? state.toLowerCase() : "event"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <EmptyState title="No exchange messages" body={isJournal ? "The journal carries no yel_connected events in scope." : "Exchange connect events are read from the journal explorer."} />
              )}
            </div>
            <div className="panel">
              <div className="panel-head"><b>Active Sessions</b><Link href="/sessions">View all ›</Link></div>
              {sessionRows.length ? (
                <table className="compact ref-table">
                  <thead><tr><th>User</th><th>Broker</th><th>Login (IST)</th><th>Status</th></tr></thead>
                  <tbody>
                    {sessionRows.map((s: any, i: number) => (
                      <tr key={`${s.user_id}-${i}`}>
                        <td className="mono">{s.user_id || "—"}</td>
                        <td>{s.broker || "—"}</td>
                        <td className="mono">{istTime(s.time)}</td>
                        <td><span className={`ref-dot ${s.active ? "ok" : "idle"}`} />{s.active ? "Active" : "Ended"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <EmptyState title="No sessions" body="No login events are available to this role or source." />
              )}
            </div>
            <div className="panel">
              <div className="panel-head"><b>System Health</b><Link href="/infra">Infrastructure ›</Link></div>
              {health ? (
                <ul className="ref-health">
                  {health.map((h) => (
                    <li key={h.name}><span>{h.name}</span><span className={`cc-pill cc-${h.tone}`}>{h.state}</span></li>
                  ))}
                </ul>
              ) : (
                <EmptyState title="Health not available" body="Dependency status needs infrastructure access." />
              )}
            </div>
          </section>

          {fileStrip && (
            <section className="panel dashboard-source-strip">
              <div>
                <b>File source coverage</b>
                <span>{fileStrip.count} CSV sources · {fileStrip.awaiting} awaiting data</span>
              </div>
              <p>Journal orders and CSV latency are separate observations; source dates may differ.</p>
              <Link href="/data-quality">Review ingestion</Link>
            </section>
          )}

          {detail && <div className="ref-detail">{detail}</div>}

          <p className="dashboard-footnote">
            Evidence source: {sourceDisplayName(source)}.
            {isJournal
              ? ` Journal snapshot — KPIs reflect the uploaded file (${fmt(total)} orders).`
              : " Read-only — Argus TradeOps never places or cancels orders."}
          </p>
        </>
      )}
    </div>
  );
}
