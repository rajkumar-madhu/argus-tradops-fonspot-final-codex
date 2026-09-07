import { CircleAlert, ScrollText, Search, Server } from "lucide-react";
import Shell from "@/components/Shell";
import { DataTable, EmptyState, KpiCard, PageHead } from "@/components/UI";
import { apiError, getJSON } from "@/lib/api";
import { fmt } from "@/lib/format";

export default async function Page({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const submitted = await searchParams;
  const params = new URLSearchParams();
  for (const key of ["q", "size", "index"]) {
    const value = submitted[key];
    const first = Array.isArray(value) ? value[0] : value;
    if (first !== undefined) params.set(key, first);
  }
  const query = params.get("q") || "";
  const d: any = await getJSON(`/api/logs/search?${params.toString()}`);
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
        badge={`Source: ${d.source || "unavailable"}`}
      />
      {err && <EmptyState title="Unable to load logs" body={err} />}
      <>
          {!err && <section className="kpi-grid four">
            <KpiCard label="Entries" value={fmt(rows.length)} sub="In current window" tone="blue" icon={<ScrollText size={18} />} />
            <KpiCard label="Errors" value={fmt(errors)} delta={rows.length ? `${((errors / rows.length) * 100).toFixed(1)}%` : "0.0%"} deltaTone="down" tone="red" icon={<CircleAlert size={18} />} />
            <KpiCard label="Warnings" value={fmt(warns)} sub="Needs review" tone="amber" icon={<CircleAlert size={18} />} />
            <KpiCard label="Services" value={fmt(services)} sub="Reporting in" tone="teal" icon={<Server size={18} />} />
          </section>}

          <section className="panel">
            <div className="panel-head"><b>Search</b><span>Masked fields are excluded server-side</span></div>
            <form action="/logs" className="rca-form">
              {["size", "index"].map((key) => params.has(key) ? (
                <input key={key} type="hidden" name={key} value={params.get(key)!} />
              ) : null)}
              <label>
                Query
                <input name="q" defaultValue={query} placeholder="order_id, account, symbol, exchange, error code, host, service…" />
              </label>
              <button className="primary" type="submit"><Search size={14} /> Search</button>
            </form>
          </section>

          {!err && <section className="panel">
            <div className="panel-head"><b>Log stream</b><span>{rows.length} entries</span></div>
            {rows.length === 0 ? (
              <EmptyState title="No log entries" body="Nothing matched in the current window." />
            ) : (
              <DataTable
                className="logs-table"
                columns={[
                  { key: "@timestamp", label: "Timestamp" },
                  { key: "level", label: "Level" },
                  { key: "service", label: "Service" },
                  { key: "order_id", label: "Order ID" },
                  { key: "message", label: "Message" },
                ]}
                rows={rows}
                rowKey={(row, index) => `${row["@timestamp"]}-${row.order_id}-${index}`}
              />
            )}
          </section>}
      </>
    </Shell>
  );
}
