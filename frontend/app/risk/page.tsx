import Link from "next/link";
import { AlertTriangle, Gauge, IndianRupee, PieChart, ShieldAlert, ShieldCheck } from "lucide-react";
import Shell from "@/components/Shell";
import RefreshButton from "@/components/RefreshButton";
import { Donut, HBarList, MultiLineChart } from "@/components/Charts";
import { EmptyState, KpiCard } from "@/components/UI";
import { apiError, getJSON } from "@/lib/api";
import { fmt, journalWindowLabel } from "@/lib/format";
import { istTime } from "@/lib/journal-explore";
import { breachesByRule, brokerExposure, inr, rmsBreaches, valueTrend, workingExposure } from "@/lib/risk-overview";

export const dynamic = "force-dynamic";

const SLICE = ["seg-blue", "seg-green", "seg-amber", "seg-purple", "seg-red", "seg-muted"];
const denied = (d: any) => d?._status === 401 || d?._status === 403;

/** Risk & Limits (reference mockup 01_19_28) from journal evidence; see lib/risk-overview. */
export default async function Page() {
  const [risk, rejections, orders]: any[] = await Promise.all([
    getJSON("/api/risk"),
    getJSON("/api/rejections?lookback=24h"),
    getJSON("/api/orders?size=10000&lookback=24h"),
  ]);
  const err = apiError(risk);
  const source = String(risk?.source || rejections?.source || "");
  const isJournal = source === "journal snapshot";
  const limits: any[] = risk?.limits || [];
  const rejected: any[] = apiError(rejections) ? [] : rejections?.orders || [];
  const orderRows: any[] = apiError(orders) ? [] : orders?.items || [];
  const ordersDenied = denied(orders);

  const exposure = workingExposure(orderRows);
  const brokers = brokerExposure(orderRows);
  const breaches = rmsBreaches(rejected);
  const byRule = breachesByRule(rejected);
  const margin = byRule.find((r) => r.rule === "Margin")?.count ?? 0;
  const trend = valueTrend(orderRows);
  const maxRule = Math.max(1, ...byRule.map((r) => r.count));

  return (
    <Shell>
      <div className="risk-page ref-page">
        <section className="ref-head">
          <div>
            <div className="ref-title-row">
              <h1>Risk &amp; Limits</h1>
              <span className={`source-badge ${isJournal ? "file-based" : "live"}`}>{isJournal ? "FILE-BASED" : "LIVE"}</span>
            </div>
            <p>Order exposure, RMS rule hits and limit monitoring{isJournal ? ` · ${journalWindowLabel(rejections?.from, rejections?.to)} · uploaded history` : ""}</p>
          </div>
          <div className="ref-controls"><RefreshButton /></div>
        </section>

        {err ? (
          <EmptyState title="Unable to load risk data" body={err} />
        ) : (
          <>
            <section className="kpi-grid ref-kpis six">
              <KpiCard label="Working Order Value" value={ordersDenied ? "—" : inr(exposure.total)} delta={ordersDenied ? "Requires order access" : `${fmt(exposure.count)} open / pending${exposure.excluded ? ` · ${exposure.excludedVenues.join(", ")} excluded` : ""}`} tone="green" icon={<IndianRupee size={18} />} />
              <KpiCard label="Limit Utilization" value={limits.length ? `${limits.length} limits` : "—"} delta={limits.length ? "From the risk feed" : "No RMS limit feed connected"} tone="blue" icon={<Gauge size={18} />} />
              <KpiCard label="Open Position Risk (VaR)" value="—" delta="No position or VaR feed" tone="purple" icon={<PieChart size={18} />} />
              <KpiCard label="Margin Rejections" value={fmt(margin)} delta="RMS margin-shortfall rule hits" deltaTone={margin ? "down" : ""} tone="amber" icon={<ShieldAlert size={18} />} />
              <KpiCard label="RMS Rule Breaches" value={fmt(breaches.length)} delta={`${fmt(byRule.length)} rules hit`} deltaTone={breaches.length ? "down" : ""} tone="red" icon={<AlertTriangle size={18} />} />
              <KpiCard label="Risk Status" value={breaches.length ? "REVIEW" : "NORMAL"} delta={breaches.length ? "RMS rejections in window" : "No RMS rule hits"} tone={breaches.length ? "amber" : "green"} icon={<ShieldCheck size={18} />} />
            </section>

            <section className="ref-grid three">
              <div className="panel">
                <div className="panel-head"><b>Working Order Value Trend</b><span className="sub">by venue · value placed per bucket</span></div>
                {ordersDenied ? (
                  <EmptyState title="Access limited" body="Order value needs order access for this role." />
                ) : trend ? (
                  <div className="ref-chart">
                    <MultiLineChart
                      series={trend.series.map((s) => ({ name: s.name, points: s.points.map((v) => v / 1e5) }))}
                      labels={Array.from({ length: trend.n }, (_, i) => istTime(new Date(trend.start + i * trend.width).toISOString()).slice(0, 5))}
                      unit="L"
                    />
                    <p className="ref-note">₹ lakh of open / pending order value placed in each bucket, for {trend.series.map((s) => s.name).join(", ")}. Order value, not a settled position.{exposure.excluded ? ` ${fmt(exposure.excluded)} ${exposure.excludedVenues.join(", ")} orders excluded: their rupee notional is not established from the journal.` : ""}</p>
                  </div>
                ) : (
                  <EmptyState title="No working orders" body="No open or pending order with a price in scope." />
                )}
              </div>
              <div className="panel">
                <div className="panel-head"><b>Limit Utilization by Segment</b></div>
                {limits.length ? (
                  <div className="ref-chart">
                    <HBarList valueFirst rows={limits.map((l: any) => ({ label: l.name, value: `${l.used_pct}%`, pct: Number(l.used_pct || 0), cls: Number(l.used_pct) > 75 ? "bar-red" : Number(l.used_pct) > 60 ? "bar-amber" : "bar-green" }))} />
                  </div>
                ) : (
                  <EmptyState title="No limit feed" body="Segment limits come from the RMS; none is connected, so utilisation cannot be computed." />
                )}
              </div>
              <div className="panel">
                <div className="panel-head"><b>Exposure Distribution</b></div>
                {ordersDenied ? (
                  <EmptyState title="Access limited" body="Order value needs order access for this role." />
                ) : exposure.venues.length ? (
                  <div className="ref-donut">
                    <Donut centerLabel="Working value" centerValue={inr(exposure.total).replace("₹ ", "₹")} slices={exposure.venues.slice(0, 6).map((v, i) => ({ label: v.name, value: Math.round(v.value), cls: SLICE[i % SLICE.length], pct: `${v.share.toFixed(1)}%` }))} />
                  </div>
                ) : (
                  <EmptyState title="No working orders" body="No open or pending order with a price in scope." />
                )}
              </div>
            </section>

            <section className="ref-grid three">
              <div className="panel">
                <div className="panel-head"><b>Top Brokers by Working Value</b></div>
                {ordersDenied ? (
                  <EmptyState title="Access limited" body="Order value needs order access for this role." />
                ) : brokers.length ? (
                  <table className="compact ref-table">
                    <thead><tr><th>#</th><th>Broker</th><th className="num">Working Value</th><th className="num">Orders</th><th className="num">Reject %</th><th>Risk</th></tr></thead>
                    <tbody>
                      {brokers.map((b, i) => (
                        <tr key={b.broker}>
                          <td>{i + 1}</td>
                          <td><b>{b.broker}</b></td>
                          <td className="num">{inr(b.value)}</td>
                          <td className="num">{fmt(b.orders)}</td>
                          <td className="num">{b.rejectPct.toFixed(1)}%</td>
                          <td><span className={`ref-pill ${b.rejectPct >= 20 ? "bad" : b.rejectPct >= 10 ? "warn" : "ok"}`}>{b.rejectPct >= 20 ? "High" : b.rejectPct >= 10 ? "Medium" : "Low"}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <EmptyState title="No working orders" body="No broker has an open or pending order with a price." />
                )}
                {brokers.length > 0 && <p className="ref-note ref-note-pad">Risk column: reject rate 20%+ High, 10–20% Medium, below Low.</p>}
              </div>
              <div className="panel">
                <div className="panel-head"><b>RMS Rule Hits</b><span className="sub">in the margin-utilisation slot</span></div>
                {byRule.length ? (
                  <div className="ref-chart">
                    <HBarList rows={byRule.map((r, i) => ({ label: r.rule, value: fmt(r.count), pct: (r.count / maxRule) * 100, cls: ["bar-red", "bar-amber", "bar-blue", "bar-purple", "bar-teal"][i % 5] }))} />
                    <p className="ref-note">No margin feed is connected; these are RMS rejections by rule.</p>
                  </div>
                ) : (
                  <EmptyState title="No RMS rule hits" body="No rejection in an RMS rule category." />
                )}
              </div>
              <div className="panel">
                <div className="panel-head"><b>Open Position Risk (VaR)</b></div>
                <EmptyState title="No VaR source" body="VaR needs positions and a risk model; neither is connected to this console." />
              </div>
            </section>

            <section className="ref-grid three">
              <div className="panel">
                <div className="panel-head"><b>Recent Limit Breaches</b><Link href="/rejections">View all ›</Link></div>
                {breaches.length ? (
                  <table className="compact ref-table">
                    <thead><tr><th>Time</th><th>Broker</th><th>Segment</th><th>RMS Rule</th><th className="num">Order Value</th><th>Status</th></tr></thead>
                    <tbody>
                      {breaches.slice(0, 6).map((b) => (
                        <tr key={b.orderId}>
                          <td className="mono">{istTime(b.time)}</td>
                          <td>{b.broker}</td>
                          <td className="text-amber">{b.segment}</td>
                          <td>{b.rule}</td>
                          <td className="num">{b.value ? inr(b.value) : "—"}</td>
                          <td><span className="ref-pill bad">Rejected</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <EmptyState title="No breaches" body="No RMS rule rejected an order in the window." />
                )}
              </div>
              <div className="panel">
                <div className="panel-head"><b>Risk Alerts</b><Link href="/incidents">View all ›</Link></div>
                {byRule.length ? (
                  <ul className="risk-alerts">
                    {byRule.slice(0, 6).map((r) => (
                      <li key={r.rule}><i className={`sev-dot ${r.count >= 50 ? "sev-critical" : r.count >= 10 ? "sev-major" : "sev-minor"}`} /><span>{r.rule}: {fmt(r.count)} RMS rejections</span></li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState title="No risk alerts" body="No RMS rule hits in the window." />
                )}
              </div>
              <div className="panel">
                <div className="panel-head"><b>Stress Test Overview</b></div>
                <EmptyState title="No stress engine" body="Scenario P&amp;L needs positions and a pricing model; neither is connected." />
              </div>
            </section>
          </>
        )}
      </div>
    </Shell>
  );
}
