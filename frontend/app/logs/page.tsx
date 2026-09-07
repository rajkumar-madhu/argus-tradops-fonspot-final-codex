import { CircleAlert, ScrollText, Search, Server } from "lucide-react";
import Shell from "@/components/Shell";
import { EmptyState, KpiCard, PageHead } from "@/components/UI";
import { apiError, getJSON } from "@/lib/api";
import { fmt } from "@/lib/format";

export default async function Page() {
  const d: any = await getJSON("/api/logs/search");
  const err = apiError(d);
  const rows: any[] = d.items || [];
  const level = (r: any) => String(r.level || "").toUpperCase();
  const errors = rows.filter((r) => level(r) === "ERROR").length;
  const warns = rows.filter((r) => level(r) === "WARN" || level(r) === "WARNING").length;
  const services = new Set(rows.map((r) => r.service).filter(Boolean)).size;

  return (
    <Shell>
      <PageHead
        title="Log Explorer"
        subtitle="Operator-friendly search across the Noren journal in Elasticsearch"
        badge={`Source: ${d.source || "demo"}`}
      />
      {err && <EmptyState title="Unable to load logs" body={err} />}
      {!err && (
        <>
          <section className="kpi-grid four">
            <KpiCard label="Entries" value={fmt(rows.length)} sub="In current window" tone="blue" icon={<ScrollText size={18} />} />
            <KpiCard label="Errors" value={fmt(errors)} delta={rows.length ? `${((errors / rows.length) * 100).toFixed(1)}%` : "0.0%"} deltaTone="down" tone="red" icon={<CircleAlert size={18} />} />
            <KpiCard label="Warnings" value={fmt(warns)} sub="Needs review" tone="amber" icon={<CircleAlert size={18} />} />
            <KpiCard label="Services" value={fmt(services)} sub="Reporting in" tone="teal" icon={<Server size={18} />} />
          </section>

          <section className="panel">
            <div className="panel-head"><b>Search</b><span>Masked fields are excluded server-side</span></div>
            <form action="/logs" className="rca-form">
              <label>
                Query
                <input name="q" placeholder="order_id, account, symbol, exchange, error code, host, service…" />
              </label>
              <button className="primary" type="submit"><Search size={14} /> Search</button>
            </form>
          </section>

          <section className="panel">
            <div className="panel-head"><b>Log stream</b><span>{rows.length} entries</span></div>
            {rows.length === 0 ? (
              <EmptyState title="No log entries" body="Nothing matched in the current window." />
            ) : (
              <div className="logs">
                {rows.map((r: any, i: number) => (
                  <div className="log-row" key={i}>
                    <span>{r["@timestamp"]}</span>
                    <b className={`lvl-${level(r).toLowerCase()}`}>{r.level}</b>
                    <em>{r.service}</em>
                    <strong>{r.order_id}</strong>
                    <p>{r.message}</p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </Shell>
  );
}
