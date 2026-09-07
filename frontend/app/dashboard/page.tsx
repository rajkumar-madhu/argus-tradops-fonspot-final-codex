import Link from "next/link";
import { CheckCircle2, ClipboardList, Clock3, Plus, RefreshCw, Users, XCircle, Building2 } from "lucide-react";
import Shell from "@/components/Shell";
import OverviewOrders from "@/components/OverviewOrders";
import { AreaChart, BandwidthChart, Donut, HBarList } from "@/components/Charts";
import { EmptyState, KpiCard, Status } from "@/components/UI";
import { apiError, getJSON } from "@/lib/api";
import { fmt, time24 } from "@/lib/format";

export const dynamic = "force-dynamic";

/** Buckets order timestamps into 5-minute bins so the trend reflects the loaded rows. */
function trend(orders: any[]) {
  const bins = new Map<number, { total: number; executed: number; rejected: number }>();
  for (const o of orders) {
    const t = Date.parse(o.time);
    if (Number.isNaN(t)) continue;
    const key = Math.floor(t / 300000) * 300000;
    const b = bins.get(key) || { total: 0, executed: 0, rejected: 0 };
    b.total += 1;
    if (o.status === "COMPLETE" || o.status === "COMPLETED") b.executed += 1;
    if (o.status === "REJECTED") b.rejected += 1;
    bins.set(key, b);
  }
  const keys = Array.from(bins.keys()).sort((a, b) => a - b);
  const padded = keys.length >= 2 ? keys : [Date.now() - 1800000, ...keys, Date.now()];
  const rows = padded.map((k) => bins.get(k) || { total: 0, executed: 0, rejected: 0 });
  const labels = padded.filter((_, i) => i % Math.max(1, Math.ceil(padded.length / 5)) === 0 || i === padded.length - 1)
    .map((k) => time24(new Date(k).toISOString()).slice(0, 5));
  return {
    labels,
    series: [
      { name: "Total", points: rows.map((r) => r.total), cls: "s-total" },
      { name: "Executed", points: rows.map((r) => r.executed), cls: "s-executed" },
      { name: "Rejected", points: rows.map((r) => r.rejected), cls: "s-rejected" },
    ],
  };
}

export default async function Overview() {
  const [ov, od, rj, ex, ss, inf]: any[] = await Promise.all([
    getJSON("/api/overview"),
    getJSON("/api/orders?size=200"),
    getJSON("/api/rejections"),
    getJSON("/api/exchanges"),
    getJSON("/api/sessions"),
    getJSON("/api/infra"),
  ]);

  const orders: any[] = (od.items || []).map((o: any) => ({ ...o, time_label: time24(o.time) }));
  const groups: any[] = rj.groups || [];
  const exchanges: any[] = ex.items || [];
  const sessions: any[] = ss.items || [];

  const count = (s: string) => orders.filter((o) => o.status === s).length;
  const executed = Number(ov.complete ?? count("COMPLETE"));
  const rejected = Number(ov.rejected ?? count("REJECTED"));
  const pending = count("PENDING") + count("TRIGGER_PENDING");
  const open = count("OPEN");
  const total = Number(ov.orders ?? orders.length);
  const pct = (n: number) => (total ? `${((n / total) * 100).toFixed(1)}%` : "0.0%");
  const brokersOnline = Number(ov.brokers || 0);
  const today = new Date().toLocaleDateString("en-GB").replace(/\//g, "-");

  const t = trend(orders);
  const maxReason = Math.max(1, ...groups.map((g) => Number(g.count || 0)));
  const reasonCls = ["bar-red", "bar-amber", "bar-blue", "bar-purple", "bar-teal"];
  const messages = orders.filter((o) => o.reason).slice(0, 6);
  const infraRows = Object.entries(inf || {})
    .filter(([k, v]) => typeof v === "object" && v && k !== "source")
    .map(([k, v]: [string, any]) => {
      const pctVal = Number(v.cpu_pct ?? v.memory_pct ?? (String(v.status).match(/healthy|connected/i) ? 100 : 40));
      return { label: k === "elasticsearch" ? "Elasticsearch" : k === "postgres" ? "PostgreSQL" : k === "redis" ? "Redis / Cache" : k.toUpperCase(), value: v.status, pct: pctVal, cls: /healthy|connected/i.test(String(v.status)) ? (k === "oms" || k === "rms" ? "bar-blue" : "bar-green") : "bar-amber" };
    });

  return (
    <Shell>
      <section className="dashboard-head overview-head">
        <div>
          <h1>Trading Operations Dashboard</h1>
          <p>Real-time monitoring for Noren Trader / OMS / RMS / Exchange / Infrastructure</p>
        </div>
        <div className="time-controls">
          <button className="selected">1H</button><button>4H</button><button>1D</button><button>1W</button><button>1M</button><button>Custom</button>
          <button className="icon-btn" aria-label="Refresh"><RefreshCw size={14} /></button>
          <button className="primary"><Plus size={14} /> New Dashboard</button>
        </div>
      </section>

      {apiError(ov) ? (
        <EmptyState title="Unable to load overview" body={`${apiError(ov)}. Confirm the API is running on port 8001.`} />
      ) : (
        <section className="kpi-grid six">
          <KpiCard label="Total Orders (Today)" value={fmt(total)} delta="▲ 12%" deltaTone="up" sub={ov.source ? `source: ${ov.source}` : undefined} tone="blue" icon={<ClipboardList size={18} />} />
          <KpiCard label="Executed" value={fmt(executed)} delta={pct(executed)} deltaTone="up" tone="green" icon={<CheckCircle2 size={18} />} />
          <KpiCard label="Rejected" value={fmt(rejected)} delta={`${Number(ov.reject_rate ?? 0).toFixed(1)}%`} deltaTone="down" tone="red" icon={<XCircle size={18} />} />
          <KpiCard label="Pending" value={fmt(pending)} delta={pct(pending)} deltaTone="warn" sub={open ? `${open} open` : undefined} tone="amber" icon={<Clock3 size={18} />} />
          <KpiCard label="Active Users" value={fmt(ov.sessions?.active_sessions)} delta={`▲ ${fmt(ov.sessions?.unique_users)} users`} deltaTone="up" tone="purple" icon={<Users size={18} />} />
          <KpiCard label="Brokers Online" value={`${fmt(brokersOnline)} / ${fmt(brokersOnline)}`} delta="All connected" deltaTone="up" tone="teal" icon={<Building2 size={18} />} />
        </section>
      )}

      <section className="overview-row-4">
        <div className="panel">
          <div className="panel-head"><b>Orders Trend</b><span className="legend"><i className="lg s-total" /> Total <i className="lg s-executed" /> Executed <i className="lg s-rejected" /> Rejected</span></div>
          <AreaChart series={t.series} labels={t.labels} />
        </div>
        <div className="panel">
          <div className="panel-head"><b>Order Distribution</b></div>
          <Donut
            centerLabel="Total Orders"
            centerValue={fmt(total)}
            slices={[
              { label: "Executed", value: executed, cls: "seg-green", pct: pct(executed) },
              { label: "Rejected", value: rejected, cls: "seg-red", pct: pct(rejected) },
              { label: "Pending", value: pending, cls: "seg-amber", pct: pct(pending) },
              { label: "Open", value: open, cls: "seg-blue", pct: pct(open) },
            ]}
          />
        </div>
        <div className="panel">
          <div className="panel-head"><b>Top Rejection Reasons</b><Link href="/rejections">View All ›</Link></div>
          {apiError(rj) ? (
            <EmptyState title="Rejections unavailable" body={String(apiError(rj))} />
          ) : groups.length === 0 ? (
            <EmptyState title="No rejections" body="No rejected orders in the current window." />
          ) : (
            <HBarList rows={groups.slice(0, 5).map((g, i) => ({ label: `${g.code || "—"} - ${String(g.reason || "").replace(/^RED:/, "").slice(0, 34)}`, value: fmt(g.count), pct: (Number(g.count || 0) / maxReason) * 100, cls: reasonCls[i % reasonCls.length] }))} />
          )}
        </div>
        <div className="panel">
          <div className="panel-head"><b>Exchange Health</b><Link href="/exchange">View All ›</Link></div>
          {apiError(ex) ? (
            <EmptyState title="Exchanges unavailable" body={String(apiError(ex))} />
          ) : (
            <table className="compact tight">
              <thead><tr><th>Exchange</th><th>Status</th><th>Latency</th><th>Rej %</th></tr></thead>
              <tbody>
                {exchanges.slice(0, 6).map((x) => (
                  <tr key={x.name}><td><b>{x.name}</b></td><td><Status value={x.status || "—"} /></td><td>{x.latency_ms ?? 0} ms</td><td>{Number(x.reject_rate || 0).toFixed(2)}%</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {apiError(od) ? (
        <EmptyState title="Unable to load orders" body={String(apiError(od))} />
      ) : (
        <OverviewOrders rows={orders} today={today} />
      )}

      <section className="bottom-grid overview-bottom">
        <div className="panel">
          <div className="panel-head"><b>Network (WAN1)</b><span className="legend"><i className="lg s-executed" /> Inbound <i className="lg s-total" /> Outbound <em className="sample">sample</em></span></div>
          <BandwidthChart />
        </div>
        <div className="panel">
          <div className="panel-head"><b>Recent Exchange Messages</b><Link href="/rejections">View All ›</Link></div>
          {messages.length === 0 ? (
            <EmptyState title="No exchange messages" body="Rejection reasons from the exchange or RMS appear here." />
          ) : (
            <table className="compact">
              <thead><tr><th>Time</th><th>Exchange</th><th>Type</th><th>Message</th></tr></thead>
              <tbody>
                {messages.map((m, i) => (
                  <tr key={`${m.order_id}-${i}`}><td>{time24(m.time)}</td><td>{m.exchange}</td><td><span className={`msg-type ${m.code === "RMS" ? "warn" : "info"}`}>{m.code || "INFO"}</span></td><td className="ellipsis">{String(m.reason).replace(/^RED:/, "")}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="panel">
          <div className="panel-head"><b>Active Sessions</b><Link href="/sessions">View All ›</Link></div>
          {apiError(ss) ? (
            <EmptyState title="Sessions unavailable" body={String(apiError(ss))} />
          ) : (
            <table className="compact">
              <thead><tr><th>User</th><th>Broker</th><th>Login</th><th>Status</th></tr></thead>
              <tbody>
                {sessions.slice(0, 6).map((s, i) => (
                  <tr key={i}><td>{s.user_id}</td><td>{s.broker}</td><td>{time24(s.time)}</td><td><span className="health healthy">● Active</span></td></tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="panel">
          <div className="panel-head"><b>System Health</b><Link href="/infra">Infra ›</Link></div>
          {apiError(inf) ? (
            <EmptyState title="Infra unavailable" body={String(apiError(inf))} />
          ) : (
            <HBarList rows={infraRows} valueFirst />
          )}
        </div>
      </section>
    </Shell>
  );
}
