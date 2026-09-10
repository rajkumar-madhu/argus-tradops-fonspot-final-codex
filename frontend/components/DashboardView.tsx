import Link from "next/link";
import type { ReactNode } from "react";
import {
  CheckCircle2,
  ClipboardList,
  Clock3,
  Percent,
  XCircle,
} from "lucide-react";
import RefreshButton from "@/components/RefreshButton";
import QueryWindow from "@/components/QueryWindow";
import MissionControlTable from "@/components/MissionControlTable";
import { AreaChart, Donut, HBarList } from "@/components/Charts";
import { EmptyState, KpiCard, Status } from "@/components/UI";
import { apiError } from "@/lib/api-result";
import {
  exchangeVolumeRows,
  orderTrendFromRows,
  rejectionTrendFromRows,
  statusDonutSlices,
} from "@/lib/dashboard-data";
import { sourceBadgeText, sourceBadgeTone, sourceDisplayName } from "@/lib/data-source";
import { fmt, journalWindowLabel } from "@/lib/format";
import {
  MISSION_KPI_DEFS,
  fileSourceStripMeta,
  rejectRatePct,
  thirdChartPanel,
} from "@/lib/mission-control";

export type DashboardPayload = {
  lookback: string;
  overview: any;
  orders: any;
  rejections: any;
  exchanges: any;
  yel: any;
  fileSources?: unknown;
};

export default function DashboardView({
  lookback,
  overview: ov,
  orders: od,
  rejections: rj,
  exchanges: ex,
  yel,
  fileSources,
}: DashboardPayload) {
  const orders: any[] = od.items || [];
  const groups: any[] = rj.groups || [];
  const exchangeItems: any[] = ex.items || [];

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
  const rejectRate = Number(ov.reject_rate ?? rejectRatePct(total, rejected));
  const exchangeCount = Number(ex.count ?? exchangeItems.length ?? ov.exchanges?.length ?? 0);
  const journalEvents = Number(ov.journal_events ?? rj.journal_events ?? 0);

  const useRealCharts = isJournal || (!isDemo && orders.length > 0);
  const orderTrend = useRealCharts ? orderTrendFromRows(orders) : null;
  const donutSlices = statusDonutSlices({ total, complete, rejected, open, pending });
  const third = thirdChartPanel(rejected);
  const maxReason = Math.max(1, ...groups.map((g) => Number(g.count || 0)));
  const reasonCls = ["bar-red", "bar-amber", "bar-blue", "bar-purple", "bar-teal"];
  const exchangeBars = exchangeVolumeRows(
    exchangeItems.length
      ? exchangeItems
      : (ov.exchanges || []).map((x: any) => ({ name: x.name, events: x.events })),
  );

  const yelKeys: string[] = yel?.keys || ov.yel?.keys || [];
  const yelConnected = Boolean(yel?.connected ?? ov.yel?.connected);

  const metaLine = isFileBased
    ? `${fmt(journalEvents || ov.records || 0)} journal events · ${journalWindowLabel(ov.from, ov.to)} · Uploaded history, not a live feed`
    : isDemo
      ? `${fmt(total)} orders loaded · Elasticsearch not connected`
      : `${fmt(total)} orders in the ${lookback} window · live Elasticsearch read path`;

  const ovErr = apiError(ov);
  const fileStrip = fileSourceStripMeta(fileSources);

  const kpiValues: Record<string, { value: string; delta: string; deltaTone?: "up" | "down" | "warn" | ""; tone: "blue" | "green" | "red" | "amber" | "purple"; icon: ReactNode }> = {
    total: {
      value: fmt(total),
      delta: isFileBased ? "Unique orders in journal" : `${lookback} window`,
      tone: "blue",
      icon: <ClipboardList size={18} />,
    },
    complete: {
      value: fmt(complete),
      delta: total ? `${((complete / total) * 100).toFixed(1)}%` : "0.0%",
      deltaTone: "up",
      tone: "green",
      icon: <CheckCircle2 size={18} />,
    },
    rejected: {
      value: fmt(rejected),
      delta: `${rejectRate.toFixed(2)}% reject rate`,
      deltaTone: "down",
      tone: "red",
      icon: <XCircle size={18} />,
    },
    open_pending: {
      value: fmt(open + pending),
      delta: `${fmt(open)} open · ${fmt(pending)} pending`,
      deltaTone: open + pending > 0 ? "warn" : "",
      tone: "amber",
      icon: <Clock3 size={18} />,
    },
    reject_rate: {
      value: `${rejectRate.toFixed(2)}%`,
      delta: `${fmt(rejected)} of ${fmt(total)}`,
      deltaTone: rejectRate > 5 ? "down" : "",
      tone: "purple",
      icon: <Percent size={18} />,
    },
  };

  return (
    <div className="dashboard-page mission-control">
      <section className="dashboard-head dashboard-hero">
        <div>
          <div className="dashboard-title-row">
            <h1>Mission Control</h1>
            {isFileBased ? (
              <span className="source-badge file-based">FILE-BASED</span>
            ) : (
              <span className={`source-badge ${sourceBadgeTone(source)}`}>
                {sourceBadgeText(source)}
              </span>
            )}
          </div>
          <p>Read-only live overview of orders, rejections, and exchange observations.</p>
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
          body={`${ovErr}. Confirm the API is running and reachable.`}
        />
      ) : (
        <>
          <section className="kpi-grid dashboard-kpis-primary mission-kpis" aria-label="Mission Control KPIs">
            {MISSION_KPI_DEFS.map((def) => {
              const v = kpiValues[def.key];
              return (
                <KpiCard
                  key={def.key}
                  label={def.label}
                  value={v.value}
                  delta={v.delta}
                  deltaTone={v.deltaTone}
                  sub={def.definition}
                  tone={v.tone}
                  icon={v.icon}
                />
              );
            })}
          </section>

          {apiError(od) ? (
            <EmptyState title="Unable to load orders" body={String(apiError(od))} />
          ) : (
            <MissionControlTable initial={od} source={source} lookback={lookback} />
          )}

          <section className="dashboard-charts-row three mission-charts">
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
                <AreaChart series={orderTrend.series} labels={orderTrend.labels} height={140} />
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
            <div className="panel">
              {third === "rejects" ? (
                <>
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
                </>
              ) : (
                <>
                  <div className="panel-head">
                    <div>
                      <b>Exchange health</b>
                      <p className="sub">
                        {yelConnected ? "YEL connected" : "Venue status"} · {fmt(exchangeCount)} venues
                      </p>
                    </div>
                    <Link href="/exchange">Exchange ›</Link>
                  </div>
                  {apiError(ex) ? (
                    <EmptyState title="Exchanges unavailable" body={String(apiError(ex))} />
                  ) : exchangeItems.length === 0 && exchangeBars.length === 0 ? (
                    <EmptyState title="No exchanges" body="Exchange breakdown is empty for this source." />
                  ) : (
                    <table className="compact tight dashboard-exchange-table">
                      <thead>
                        <tr>
                          <th>Exchange</th>
                          <th>Status</th>
                          <th>Events</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(exchangeItems.length ? exchangeItems : exchangeBars.map((b) => ({ name: b.label, status: "—", events: b.value }))).slice(0, 8).map((x: any) => (
                          <tr key={x.name || x.label}>
                            <td><b>{x.name || x.label}</b></td>
                            <td><Status value={x.status || "—"} /></td>
                            <td>{fmt(x.events ?? x.value ?? 0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  {yelKeys.length > 0 && (
                    <p className="mission-yel-note mono">{yelKeys.slice(0, 4).join(" · ")}{yelKeys.length > 4 ? ` · +${yelKeys.length - 4}` : ""}</p>
                  )}
                </>
              )}
            </div>
          </section>

          {fileStrip && (
            <section className="panel dashboard-source-strip">
              <div>
                <b>File source coverage</b>
                <span>
                  {fileStrip.count} CSV sources · {fileStrip.awaiting} awaiting data
                </span>
              </div>
              <p>Journal orders and CSV latency are separate observations; source dates may differ.</p>
              <Link href="/data-quality">Review ingestion</Link>
            </section>
          )}

          <p className="dashboard-footnote">
            Evidence source: {sourceDisplayName(source)}.
            {isFileBased
              ? ` Journal snapshot — KPIs reflect the uploaded file (${fmt(total)} orders).`
              : " Read-only — TradeOps never places or cancels orders."}
          </p>
        </>
      )}
    </div>
  );
}
