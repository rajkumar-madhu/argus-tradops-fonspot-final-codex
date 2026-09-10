import RefreshButton from "@/components/RefreshButton";
import Link from "next/link";
import { AlertTriangle, RefreshCw, Shield, ShieldAlert, ShieldCheck } from "lucide-react";
import Shell from "@/components/Shell";
import { HBarList } from "@/components/Charts";
import { DataTable, EmptyState, KpiCard, Severity } from "@/components/UI";
import { apiError, getJSON } from "@/lib/api";
import { fmt } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Page() {
  const d: any = await getJSON("/api/risk");
  const err = apiError(d);
  const limits = d.limits || [];
  const breaches = d.breaches || [];
  const watch = limits.filter((l: any) => l.status === "Watch").length;

  return (
    <Shell>
      <section className="dashboard-head overview-head">
        <div>
          <h1>Risk & Limits</h1>
          <p>Margin utilization, concentration limits and breach monitoring</p>
        </div>
        <div className="time-controls"><RefreshButton/>
          <span className="source-tag">{breaches.length} breaches · {d.source || "—"}</span>
        </div>
      </section>

      {err ? (
        <EmptyState title="Unable to load risk data" body={err} />
      ) : (
        <>
          <section className="kpi-grid three">
            <KpiCard label="Active Limits" value={fmt(limits.length)} delta="Monitored thresholds" tone="blue" icon={<Shield size={18} />} />
            <KpiCard label="Watch Items" value={fmt(watch)} delta="Near breach" deltaTone="warn" tone="amber" icon={<ShieldAlert size={18} />} />
            <KpiCard label="Breaches" value={fmt(breaches.length)} delta="Requires review" deltaTone="down" tone="red" icon={<AlertTriangle size={18} />} />
          </section>

          <section className="overview-row-4">
            <div className="panel span-2">
              <div className="panel-head"><b>Limit Utilization</b><ShieldCheck size={14} /></div>
              <HBarList
                rows={limits.map((l: any) => ({
                  label: l.name,
                  value: `${l.used_pct}%`,
                  pct: Number(l.used_pct || 0),
                  cls: Number(l.used_pct) > 75 ? "bar-red" : Number(l.used_pct) > 60 ? "bar-amber" : "bar-green",
                }))}
                valueFirst
              />
            </div>
            <div className="panel span-2">
              <div className="panel-head"><b>Recent Breaches</b><Link href="/incidents">Incidents ›</Link></div>
              <DataTable
                className="compact"
                rows={breaches}
                rowKey={(r) => r.id}
                columns={[
                  { key: "id", label: "ID", render: (r) => <b>{r.id}</b> },
                  { key: "severity", label: "Severity", render: (r) => <Severity value={r.severity} /> },
                  { key: "title", label: "Title" },
                  { key: "time", label: "Time" },
                ]}
              />
            </div>
          </section>
        </>
      )}
    </Shell>
  );
}
