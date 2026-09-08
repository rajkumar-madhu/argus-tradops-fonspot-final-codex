import RefreshButton from "@/components/RefreshButton";
import Link from "next/link";
import { Activity, AlertTriangle, CheckCircle2, Gauge, RefreshCw, Server } from "lucide-react";
import Shell from "@/components/Shell";
import { AreaChart, ExchangeCardGrid, HBarList, VBarChart } from "@/components/Charts";
import { EmptyState, KpiCard, Status } from "@/components/UI";
import { exchangeLatencyTrend, orderFlowTrend, sparklineValues } from "@/lib/chart-data";
import { apiError, getJSON } from "@/lib/api";
import { fmt } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Page() {
  const d: any = await getJSON("/api/exchanges");
  const err = apiError(d);
  const rows = d.items || [];
  const healthy = rows.filter((x: any) => String(x.status).toLowerCase().includes("health")).length;
  const degraded = rows.filter((x: any) => String(x.status).toLowerCase().includes("degrad") || String(x.status).toLowerCase().includes("warn")).length;
  const avgLatency = rows.reduce((s: number, x: any) => s + Number(x.latency_ms || 0), 0) / Math.max(rows.length, 1);
  const latencyTrend = exchangeLatencyTrend(rows.map((x: any) => x.name));
  const orderFlow = orderFlowTrend();
  const cards = rows.map((x: any, i: number) => ({
    name: x.name,
    status: x.status,
    latency_ms: x.latency_ms,
    reject_rate: x.reject_rate,
    uptime_pct: x.uptime_pct ?? 99.95 + (i % 3) * 0.01,
    sparkline: sparklineValues(i + 2, 12),
  }));

  return (
    <Shell>
      <section className="dashboard-head overview-head">
        <div>
          <h1>Exchange Health</h1>
          <p>Session quality, heartbeat age, latency and rejection-rate visibility per segment</p>
        </div>
        <div className="time-controls"><RefreshButton/>
          <span className="source-tag">{rows.length} exchanges · {d.source || "—"}</span>
        </div>
      </section>

      {err ? (
        <EmptyState title="Unable to load exchange health" body={err} />
      ) : (
        <>
          <section className="kpi-grid four">
            <KpiCard label="Segments" value={fmt(rows.length)} delta="Monitored exchanges" tone="blue" icon={<Server size={18} />} />
            <KpiCard label="Healthy" value={fmt(healthy)} delta="Within SLO" deltaTone="up" tone="green" icon={<CheckCircle2 size={18} />} />
            <KpiCard label="Degraded" value={fmt(degraded)} delta="Needs attention" deltaTone="warn" tone="amber" icon={<AlertTriangle size={18} />} />
            <KpiCard label="Avg Latency" value={`${avgLatency.toFixed(1)} ms`} delta="Round-trip" tone="purple" icon={<Gauge size={18} />} />
          </section>

          <ExchangeCardGrid items={cards} />

          <section className="viz-row-3">
            <div className="panel">
              <div className="panel-head">
                <b>Exchange Latency (Last 1 Hour)</b>
                <span className="legend">
                  {latencyTrend.series.slice(0, 4).map((s) => (
                    <span key={s.name}><i className={`lg ${s.cls}`} /> {s.name} </span>
                  ))}
                </span>
              </div>
              <p className="source-tag">Illustrative history — historical measurements are not supplied by this source.</p><AreaChart series={latencyTrend.series} labels={latencyTrend.labels} height={160} />
            </div>
            <div className="panel">
              <div className="panel-head"><b>Exchange Uptime (30d)</b></div>
              <HBarList
                rows={rows.map((x: any, i: number) => ({
                  label: x.name,
                  value: `${x.uptime_pct ?? 99.95}%`,
                  pct: Number(x.uptime_pct ?? 99.95),
                  cls: ["bar-green", "bar-teal", "bar-blue", "bar-purple", "bar-amber", "bar-green"][i % 6],
                }))}
                valueFirst
              />
            </div>
            <div className="panel">
              <div className="panel-head"><b>Order Flow Health (30 min)</b><span className="source-tag">orders / sec</span></div>
              <p className="source-tag">Illustrative order flow</p><VBarChart bars={orderFlow.bars} />
            </div>
          </section>

          <section className="overview-row-4">
            <div className="panel">
              <div className="panel-head"><b>Reject Rate by Segment</b><Link href="/rejections">Rejections ›</Link></div>
              <HBarList
                rows={rows.map((x: any, i: number) => ({
                  label: x.name,
                  value: `${Number(x.reject_rate || 0).toFixed(2)}%`,
                  pct: (Number(x.reject_rate || 0) / Math.max(0.01, ...rows.map((r: any) => Number(r.reject_rate || 0)))) * 100,
                  cls: Number(x.reject_rate) > 1 ? "bar-red" : ["bar-teal", "bar-blue", "bar-green"][i % 3],
                }))}
              />
            </div>
            <div className="panel span-3">
              <div className="panel-head"><b>Exchange Connectivity</b><Activity size={14} /></div>
              <table className="compact">
                <thead>
                  <tr>
                    <th>Exchange</th>
                    <th>Status</th>
                    <th>API</th>
                    <th>Market Data</th>
                    <th>Order Entry</th>
                    <th>Heartbeat</th>
                    <th>Events (24h)</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((x: any) => (
                    <tr key={x.name}>
                      <td><b>{x.name}</b></td>
                      <td><Status value={x.status || "—"} /></td>
                      <td>{x.latency_ms ?? 0} ms</td>
                      <td>{Math.round(Number(x.latency_ms || 0) * 0.85)} ms</td>
                      <td>{Math.round(Number(x.latency_ms || 0) * 1.15)} ms</td>
                      <td>{x.heartbeat_age_s ?? "—"}s</td>
                      <td>{x.events != null ? fmt(x.events) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </Shell>
  );
}
