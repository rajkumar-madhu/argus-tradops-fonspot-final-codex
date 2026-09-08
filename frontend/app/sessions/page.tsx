import RefreshButton from "@/components/RefreshButton";
import Link from "next/link";
import { Building2, LogIn, MonitorSmartphone, RefreshCw, Users } from "lucide-react";
import Shell from "@/components/Shell";
import { AreaChart, HBarList } from "@/components/Charts";
import { DataTable, EmptyState, KpiCard } from "@/components/UI";
import { loginTrendFromBuckets } from "@/lib/chart-data";
import { apiError, getJSON } from "@/lib/api";
import { fmt, time24 } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Page() {
  const [d, s, trend]: any[] = await Promise.all([
    getJSON("/api/sessions"),
    getJSON("/api/sessions/summary"),
    getJSON("/api/sessions/login-trend"),
  ]);
  const err = apiError(d) || apiError(s);
  const rows: any[] = d.items || [];
  const brokers = s.brokers || [];
  const accessTypes = s.access_types || [];
  const maxBroker = Math.max(1, ...brokers.map((b: any) => Number(b.count || 0)));
  const maxAccess = Math.max(1, ...accessTypes.map((a: any) => Number(a.count || 0)));
  const loginTrend = loginTrendFromBuckets(trend.buckets || []);

  return (
    <Shell>
      <section className="dashboard-head overview-head">
        <div>
          <h1>Users & Sessions</h1>
          <p>Active state correlated from noren-login-intraday and noren-logout-intraday</p>
        </div>
        <div className="time-controls"><RefreshButton/>
          <span className="source-tag">{s.active_sessions || 0} active · {s.source || "—"}</span>
        </div>
      </section>

      {err ? (
        <EmptyState title="Unable to load sessions" body={err} />
      ) : (
        <>
          <section className="kpi-grid four">
            <KpiCard label="Active Sessions" value={fmt(s.active_sessions || 0)} delta="● Live" deltaTone="up" tone="green" icon={<LogIn size={18} />} />
            <KpiCard label="Unique Users" value={fmt(s.unique_users || 0)} delta={`${rows.length} rows loaded`} tone="blue" icon={<Users size={18} />} />
            <KpiCard label="Unique Brokers" value={fmt(s.unique_brokers || 0)} delta={`${brokers.length} broker codes`} tone="purple" icon={<Building2 size={18} />} />
            <KpiCard label="Access Channels" value={fmt(accessTypes.length)} delta={accessTypes[0]?.name ? `Top: ${accessTypes[0].name}` : "—"} tone="teal" icon={<MonitorSmartphone size={18} />} />
          </section>

          <section className="viz-row-3">
            <div className="panel">
              <div className="panel-head"><b>Login Trend (Today)</b><span className="legend"><i className="lg s-total" /> Logins</span></div>
              <AreaChart series={loginTrend.series} labels={loginTrend.labels} height={160} />
            </div>
            <div className="panel">
              <div className="panel-head"><b>Sessions by Broker</b><Link href="/configuration">Config ›</Link></div>
              <HBarList
                rows={brokers.map((b: any, i: number) => ({
                  label: b.name,
                  value: fmt(b.count),
                  pct: (Number(b.count || 0) / maxBroker) * 100,
                  cls: ["bar-blue", "bar-purple", "bar-teal", "bar-amber", "bar-green"][i % 5],
                }))}
              />
            </div>
            <div className="panel">
              <div className="panel-head"><b>Access Types</b></div>
              <HBarList
                rows={accessTypes.map((a: any, i: number) => ({
                  label: a.name,
                  value: fmt(a.count),
                  pct: (Number(a.count || 0) / maxAccess) * 100,
                  cls: ["bar-teal", "bar-blue", "bar-purple", "bar-amber"][i % 4],
                }))}
              />
            </div>
          </section>

          <section className="panel">
            <div className="panel-head"><b>Session register</b><span>{rows.length} rows · {d.source || "—"}</span></div>
            <DataTable
              className="compact"
              rows={rows}
              rowKey={(r, i) => r.session_id || `${r.user_id}-${i}`}
              columns={[
                { key: "user_id", label: "User", render: (r) => <b>{r.user_id}</b> },
                { key: "broker", label: "Broker" },
                { key: "region", label: "Region" },
                { key: "access_type", label: "Access" },
                { key: "segments", label: "Segments", render: (r) => (r.segments || []).join(", ") || "—" },
                { key: "app_version", label: "Version", render: (r) => r.app_version || "—" },
                { key: "time", label: "Login", render: (r) => time24(r.time) },
                { key: "active", label: "Status", render: (r) => <span className="health healthy">● Active</span> },
              ]}
            />
          </section>
        </>
      )}
    </Shell>
  );
}
