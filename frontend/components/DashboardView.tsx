import Link from "next/link";
import {
  Activity,
  Building2,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Layers,
  Radio,
  Server,
  Users,
  XCircle,
} from "lucide-react";
import RefreshButton from "@/components/RefreshButton";
import OverviewOrders from "@/components/OverviewOrders";
import QueryWindow from "@/components/QueryWindow";
import { AreaChart, Donut, HBarList } from "@/components/Charts";
import { EmptyState, KpiCard, Status } from "@/components/UI";
import { apiError } from "@/lib/api-result";
import { loginTrendFromBuckets } from "@/lib/chart-data";
import {
  exchangeVolumeRows,
  orderTrendFromRows,
  rejectionTrendFromRows,
  statusDonutSlices,
} from "@/lib/dashboard-data";
import { fmt, journalWindowLabel, time24, timeIstStamp } from "@/lib/format";

export type DashboardPayload = {
  lookback: string;
  overview: any;
  orders: any;
  rejections: any;
  exchanges: any;
  sessions: any;
  infra: any;
  loginTrend: any;
  yel: any;
};

export default function DashboardView({
  lookback,
  overview: ov,
  orders: od,
  rejections: rj,
  exchanges: ex,
  sessions: ss,
  infra,
  loginTrend: lt,
  yel,
}: DashboardPayload) {
  const orders: any[] = (od.items || []).map((o: any) => ({ ...o, time_label: time24(o.time) }));
  const groups: any[] = rj.groups || [];
  const exchangeItems: any[] = ex.items || [];
  const sessionItems: any[] = ss.items || [];

  const source = String(ov.source || od.source || "");
  const isJournal = source === "journal snapshot";
  const isDemo = source === "demo";
  const isFileBased = isJournal;

  const total = Number(ov.orders ?? od.count ?? orders.length);
  const complete = Number(ov.complete ?? 0);
  const rejected = Number(ov.rejected ?? rj.rejected_unique_orders ?? 0);
  const open = Number(ov.open ?? orders.filter((o) => o.status === "OPEN").length);
  const pending = Number(
    ov.pending ??
      orders.filter((o) => ["PENDING", "TRIGGER_PENDING"].includes(String(o.status))).length,
  );
  const rejectRate = Number(ov.reject_rate ?? (total ? (rejected / total) * 100 : 0));
  const exchangeCount = Number(ex.count ?? exchangeItems.length ?? ov.exchanges?.length ?? 0);
  const sessionCount = Number(
    ss.count ?? ov.sessions?.total_events ?? ov.sessions?.active_sessions ?? sessionItems.length,
  );
  const uniqueUsers = Number(ov.sessions?.unique_users ?? 0);
  const journalEvents = Number(ov.journal_events ?? rj.journal_events ?? 0);
  const symbols = Number(ov.symbols ?? 0);
  const brokers = Number(ov.brokers ?? 0);

  const pct = (n: number) => (total ? `${((n / total) * 100).toFixed(1)}%` : "0.0%");
  const today = new Date().toLocaleDateString("en-GB").replace(/\//g, "-");

  const useRealCharts = isJournal || (!isDemo && orders.length > 0);
  const orderTrend = useRealCharts ? orderTrendFromRows(orders) : null;
  const rejectionTrend = useRealCharts
    ? rejectionTrendFromRows(rj.orders?.length ? rj.orders : orders)
    : null;
  const loginChart = lt?.buckets?.length ? loginTrendFromBuckets(lt.buckets) : null;

  const donutSlices = statusDonutSlices({ total, complete, rejected, open, pending });
  const exchangeBars = exchangeVolumeRows(
    exchangeItems.length
      ? exchangeItems
      : (ov.exchanges || []).map((x: any) => ({ name: x.name, events: x.events })),
  );

  const maxReason = Math.max(1, ...groups.map((g) => Number(g.count || 0)));
  const reasonCls = ["bar-red", "bar-amber", "bar-blue", "bar-purple", "bar-teal"];
  const rejectionMessages = (rj.orders || orders.filter((o) => o.reason)).slice(0, 6);

  const infraRows = Object.entries(infra || {})
    .filter(([k, v]) => typeof v === "object" && v && k !== "source")
    .map(([k, v]: [string, any]) => {
      const label =
        k === "elasticsearch"
          ? "Elasticsearch"
          : k === "postgres"
            ? "PostgreSQL"
            : k === "redis"
              ? "Redis / Streams"
              : k === "journal"
                ? "Journal file"
                : k.toUpperCase();
      const status = String(v.status || v.cluster_health || "—");
      const pctVal = Number(
        v.cpu_pct ?? v.memory_pct ?? (/healthy|connected|loaded/i.test(status) ? 92 : 48),
      );
      return {
        label,
        value: status,
        pct: pctVal,
        cls: /healthy|connected|loaded/i.test(status) ? "bar-green" : "bar-amber",
      };
    });

  const yelKeys: string[] = yel?.keys || ov.yel?.keys || [];
  const yelConnected = Boolean(yel?.connected ?? ov.yel?.connected);

  const metaLine = isFileBased
    ? `${fmt(journalEvents || ov.records || 0)} journal events · ${journalWindowLabel(ov.from, ov.to)} · Uploaded history, not a live feed`
    : isDemo
      ? `${fmt(total)} orders in the demo snapshot · synthetic operational data`
      : `${fmt(total)} orders in the ${lookback} window · live Elasticsearch read path`;

  const ovErr = apiError(ov);

  return (
    <div className="dashboard-page">
      <section className="dashboard-head dashboard-hero">
        <div>
          <div className="dashboard-title-row">
            <h1>Trading Operations Dashboard</h1>
            {isFileBased ? (
              <span className="source-badge file-based">FILE-BASED</span>
            ) : (
              <span className={`source-badge ${isDemo ? "warn" : "live"}`}>
                {isDemo ? "DEMO" : "LIVE"}
              </span>
            )}
          </div>
          <p>Real-time observability across Noren OMS, RMS, exchange connectivity, and platform health.</p>
          <p className="dashboard-meta">{metaLine}</p>
        </div>
        <div className="time-controls">
          <RefreshButton />
        </div>
      </section>

      {!isFileBased && !isDemo && (
        <QueryWindow value={lookback} source={source} label="Dashboard window" />
      )}

      {ovErr ? (
        <EmptyState
          title="Unable to load overview"
          body={`${ovErr}. Confirm the API is running on port 8001.`}
        />
      ) : (
        <>
          <section className="kpi-grid dashboard-kpis-primary">
            <KpiCard
              label="Total orders"
              value={fmt(total)}
              delta={isFileBased ? "Unique orders in journal" : `${lookback} window`}
              tone="blue"
              icon={<ClipboardList size={18} />}
            />
            <KpiCard
              label="Complete"
              value={fmt(complete)}
              delta={pct(complete)}
              deltaTone="up"
              tone="green"
              icon={<CheckCircle2 size={18} />}
            />
            <KpiCard
              label="Rejected"
              value={fmt(rejected)}
              delta={`${rejectRate.toFixed(2)}% reject rate`}
              deltaTone="down"
              tone="red"
              icon={<XCircle size={18} />}
            />
            <KpiCard
              label="Open orders"
              value={fmt(open)}
              delta={pending ? `${fmt(pending)} pending / trigger` : "No pending queue"}
              deltaTone={open > 0 ? "warn" : ""}
              tone="amber"
              icon={<Clock3 size={18} />}
            />
          </section>

          <section className="kpi-grid four dashboard-kpis-secondary">
            <KpiCard
              label="Sessions"
              value={fmt(sessionCount)}
              delta={
                uniqueUsers
                  ? `${fmt(uniqueUsers)} users · ${fmt(ss.login_count ?? ov.sessions?.login_events ?? 0)} logins`
                  : "Login / logout events"
              }
              tone="purple"
              icon={<Users size={18} />}
            />
            <KpiCard
              label="Exchanges"
              value={fmt(exchangeCount)}
              delta={`${fmt(symbols)} symbols · ${fmt(brokers)} brokers`}
              tone="teal"
              icon={<Building2 size={18} />}
            />
            <KpiCard
              label="Reject rate"
              value={`${rejectRate.toFixed(2)}%`}
              delta={`${fmt(rejected)} of ${fmt(total)} orders`}
              deltaTone={rejectRate > 5 ? "down" : "up"}
              tone="red"
              icon={<Activity size={18} />}
            />
            <KpiCard
              label="Data source"
              value={source || "—"}
              delta={isFileBased ? "Journal snapshot" : isDemo ? "Demo fixtures" : "Elasticsearch"}
              tone="blue"
              icon={<Layers size={18} />}
            />
          </section>

          <section className="dashboard-charts-row">
            <div className="panel">
              <div className="panel-head">
                <div>
                  <b>Order flow trend</b>
                  <p className="sub">
                    {useRealCharts
                      ? `Binned from ${fmt(orders.length)} loaded orders`
                      : "Awaiting order rows for trend"}
                  </p>
                </div>
                <span className="legend">
                  <i className="lg s-total" /> Total <i className="lg s-executed" /> Complete{" "}
                  <i className="lg s-rejected" /> Rejected
                </span>
              </div>
              {orderTrend ? (
                <AreaChart series={orderTrend.series} labels={orderTrend.labels} height={160} />
              ) : (
                <EmptyState title="No trend data" body="Load orders to plot the operational timeline." />
              )}
            </div>
            <div className="panel">
              <div className="panel-head">
                <div>
                  <b>Status mix</b>
                  <p className="sub">Share of loaded order universe</p>
                </div>
              </div>
              <Donut centerLabel="Orders" centerValue={fmt(total)} slices={donutSlices} />
            </div>
          </section>

          <section className="dashboard-charts-row three">
            <div className="panel">
              <div className="panel-head">
                <div>
                  <b>Rejection trend</b>
                  <p className="sub">Rejected orders over time</p>
                </div>
              </div>
              {rejectionTrend ? (
                <AreaChart series={rejectionTrend.series} labels={rejectionTrend.labels} height={140} />
              ) : (
                <EmptyState title="No rejections" body="No rejected orders in the current dataset." />
              )}
            </div>
            <div className="panel">
              <div className="panel-head">
                <div>
                  <b>Exchange volume</b>
                  <p className="sub">Order events by venue</p>
                </div>
                <Link href="/exchange">Exchange ›</Link>
              </div>
              {exchangeBars.length === 0 ? (
                <EmptyState title="No exchanges" body="Exchange breakdown is empty for this source." />
              ) : (
                <HBarList
                  rows={exchangeBars.map((r) => ({
                    label: r.sub ? `${r.label} · ${r.sub}` : r.label,
                    value: r.value,
                    pct: r.pct,
                    cls: r.cls,
                  }))}
                />
              )}
            </div>
            <div className="panel">
              <div className="panel-head">
                <div>
                  <b>Session logins</b>
                  <p className="sub">Login events in snapshot window</p>
                </div>
                <Link href="/sessions">Sessions ›</Link>
              </div>
              {loginChart ? (
                <AreaChart series={loginChart.series} labels={loginChart.labels} height={140} />
              ) : (
                <EmptyState title="No login trend" body="Session login buckets were not returned." />
              )}
            </div>
          </section>

          <section className="dashboard-detail-row">
            <div className="panel">
              <div className="panel-head">
                <div>
                  <b>Top rejection reasons</b>
                  <p className="sub">Ranked by unique rejected orders</p>
                </div>
                <Link href="/rejections">Rejections ›</Link>
              </div>
              {apiError(rj) ? (
                <EmptyState title="Rejections unavailable" body={String(apiError(rj))} />
              ) : groups.length === 0 ? (
                <EmptyState title="No rejections" body="No rejected orders in the current window." />
              ) : (
                <HBarList
                  rows={groups.slice(0, 6).map((g, i) => ({
                    label: `${g.code || "—"} · ${String(g.reason || "").replace(/^RED:/, "").slice(0, 42)}`,
                    value: fmt(g.count),
                    pct: (Number(g.count || 0) / maxReason) * 100,
                    cls: reasonCls[i % reasonCls.length],
                  }))}
                />
              )}
            </div>
            <div className="panel">
              <div className="panel-head">
                <div>
                  <b>Exchange health</b>
                  <p className="sub">Venue status and rejection share</p>
                </div>
                <Link href="/exchange">View all ›</Link>
              </div>
              {apiError(ex) ? (
                <EmptyState title="Exchanges unavailable" body={String(apiError(ex))} />
              ) : (
                <table className="compact tight dashboard-exchange-table">
                  <thead>
                    <tr>
                      <th>Exchange</th>
                      <th>Status</th>
                      <th>Events</th>
                      <th>Rej %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {exchangeItems.slice(0, 8).map((x) => (
                      <tr key={x.name}>
                        <td><b>{x.name}</b></td>
                        <td><Status value={x.status || "—"} /></td>
                        <td>{fmt(x.events ?? 0)}</td>
                        <td>{Number(x.reject_rate || 0).toFixed(2)}%</td>
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
            <OverviewOrders rows={orders.slice(0, 50)} today={today} />
          )}

          <section className="dashboard-bottom-row">
            <div className="panel">
              <div className="panel-head">
                <div>
                  <b>Recent rejection messages</b>
                  <p className="sub">Latest exchange / RMS responses</p>
                </div>
                <Link href="/rejections">Evidence ›</Link>
              </div>
              {rejectionMessages.length === 0 ? (
                <EmptyState
                  title="No rejection messages"
                  body="Rejection text is withheld on general order lists; see Rejections for full evidence."
                />
              ) : (
                <table className="compact dashboard-messages-table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Order</th>
                      <th>Exchange</th>
                      <th>Message</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rejectionMessages.map((m: any, i: number) => (
                      <tr key={`${m.order_id}-${i}`}>
                        <td className="mono">{time24(m.time)}</td>
                        <td>
                          <Link className="link-btn" href={`/rca?order_id=${encodeURIComponent(m.order_id)}`}>
                            {m.order_id}
                          </Link>
                        </td>
                        <td>{m.exchange || "—"}</td>
                        <td className="ellipsis">{String(m.reason || "").replace(/^RED:/, "")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="panel">
              <div className="panel-head">
                <div>
                  <b>Recent session events</b>
                  <p className="sub">Latest login and logout observations</p>
                </div>
                <Link href="/sessions">Sessions ›</Link>
              </div>
              {apiError(ss) ? (
                <EmptyState title="Sessions unavailable" body={String(apiError(ss))} />
              ) : sessionItems.length === 0 ? (
                <EmptyState title="No sessions" body="No session events in the current source." />
              ) : (
                <table className="compact dashboard-sessions-table">
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Event</th>
                      <th>Result</th>
                      <th>Time · IST</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessionItems.slice(0, 8).map((s, i) => (
                      <tr key={`${s.user_id}-${s.source_row ?? i}-${s.time}`}>
                        <td><b>{s.user_id}</b></td>
                        <td className="mono">{s.event || "—"}</td>
                        <td>{s.result || (String(s.status || "").toLowerCase().includes("success") ? "Success" : s.status || "—")}</td>
                        <td className="mono">{timeIstStamp(s.time)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="panel">
              <div className="panel-head">
                <div>
                  <b>YEL connectivity</b>
                  <p className="sub">Exchange line keys from yel_connected</p>
                </div>
                <Radio size={16} aria-hidden />
              </div>
              <div className="yel-status-block">
                <p className={`yel-connection ${yelConnected ? "connected" : "disconnected"}`}>
                  <span className="health-dot" />
                  {yelConnected ? "Connected" : "Disconnected"}
                </p>
                {yelKeys.length ? (
                  <ul className="yel-key-list">
                    {yelKeys.slice(0, 12).map((key) => (
                      <li key={key} className="mono">{key}</li>
                    ))}
                    {yelKeys.length > 12 && (
                      <li className="muted">+{yelKeys.length - 12} more keys</li>
                    )}
                  </ul>
                ) : (
                  <EmptyState title="No YEL keys" body="yel_connected documents were not found in this source." />
                )}
              </div>
            </div>
            <div className="panel">
              <div className="panel-head">
                <div>
                  <b>Platform health</b>
                  <p className="sub">Data plane and dependencies</p>
                </div>
                <Link href="/infra">
                  <Server size={14} aria-hidden /> Infra ›
                </Link>
              </div>
              {apiError(infra) ? (
                <EmptyState title="Infra unavailable" body={String(apiError(infra))} />
              ) : infraRows.length === 0 ? (
                <EmptyState title="No infra metrics" body="Infrastructure status was not returned." />
              ) : (
                <HBarList rows={infraRows} valueFirst />
              )}
            </div>
          </section>

          {isFileBased && (
            <p className="dashboard-footnote">
              Journal snapshot mode — KPIs reflect the full uploaded file ({fmt(total)} orders,{" "}
              {fmt(journalEvents)} events). Order table shows the most recent {fmt(Math.min(50, orders.length))}{" "}
              rows; rejection evidence with full text is on the Rejections page.
            </p>
          )}
        </>
      )}
    </div>
  );
}
