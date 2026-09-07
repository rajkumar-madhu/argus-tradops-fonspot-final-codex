import { CheckCircle2, CircleAlert, Timer, Zap } from "lucide-react";
import Shell from "@/components/Shell";
import { HBarList } from "@/components/Charts";
import { DataTable, EmptyState, KpiCard, PageHead } from "@/components/UI";
import { apiError, getJSON } from "@/lib/api";
import { fmt } from "@/lib/format";

export const dynamic = "force-dynamic";

/** Latencies arrive in microseconds. Show µs below 1ms, ms below 1s, else seconds. */
function dur(us: number) {
  const n = Number(us || 0);
  if (n <= 0) return "—";
  if (n < 1000) return `${n.toFixed(0)} µs`;
  if (n < 1_000_000) return `${(n / 1000).toFixed(2)} ms`;
  return `${(n / 1_000_000).toFixed(2)} s`;
}

export default async function Page() {
  const d: any = await getJSON("/api/order-latency");
  const err = apiError(d);
  const rows: any[] = d.items || [];
  const s: any = d.summary || {};
  const segments: any[] = d.by_segment || [];
  const maxSeg = Math.max(1, ...segments.map((x) => Number(x.orders || 0)));

  return (
    <Shell>
      <PageHead
        title="Order Latency"
        subtitle="OMS processing time and exchange confirmation round-trip, per order"
        badge={`${d.count || 0} orders · ${d.source || "—"}`}
        badgeTone={s.unconfirmed_orders ? "warn" : "ok"}
      />

      {err && <EmptyState title="Unable to load order latency" body={`${err}. Confirm the API is running on port 8001.`} />}

      {!err && rows.length === 0 && (
        <EmptyState
          title="No latency data"
          body={d.note || "The L_ORDERLATENCY feed has not been ingested for this environment."}
        />
      )}

      {!err && rows.length > 0 && (
        <>
          <section className="kpi-grid four">
            <KpiCard label="OMS Latency p50" value={dur(s.oms_p50_us)} sub="Median internal processing" tone="blue" icon={<Zap size={18} />} />
            <KpiCard label="OMS Latency p95" value={dur(s.oms_p95_us)} delta={`max ${dur(s.oms_max_us)}`} tone="purple" icon={<Timer size={18} />} />
            <KpiCard label="Exchange Confirm p50" value={dur(s.confirm_p50_us)} sub={`${fmt(s.confirmed_orders)} confirmed`} tone="teal" icon={<CheckCircle2 size={18} />} />
            <KpiCard
              label="Unconfirmed"
              value={fmt(s.unconfirmed_orders)}
              delta={`${Number(s.unconfirmed_pct || 0).toFixed(1)}%`}
              deltaTone={Number(s.unconfirmed_pct || 0) > 10 ? "down" : "warn"}
              sub="Never acknowledged"
              tone="red"
              icon={<CircleAlert size={18} />}
            />
          </section>

          {/* The upstream feed timestamps to whole seconds, so confirmation figures
              quantise. Saying so beats letting anyone read them as true p99s. */}
          {(d.notes || []).length > 0 && (
            <section className="panel">
              <div className="panel-head"><b>How to read these numbers</b></div>
              <ul className="config-list">
                {(d.notes || []).map((n: string) => <li key={n}><span>{n}</span></li>)}
                {d.oms_status_mapping_confirmed === false && (
                  <li>
                    <span>
                      <b>OMS status codes are provisional.</b> This feed&apos;s codes conflict with the
                      Noren OrdStatus mapping used elsewhere in TradeOps (65 and 56 mean rejected there).
                      They are shown here as the feed&apos;s own values and are pending confirmation.
                    </span>
                  </li>
                )}
              </ul>
            </section>
          )}

          <section className="panel">
            <div className="panel-head"><b>Latency by Segment</b><span>{segments.length} segments</span></div>
            <HBarList
              rows={segments.map((x, i) => ({
                label: `${x.segment} — p50 ${dur(x.oms_p50_us)}${x.unconfirmed ? ` · ${x.unconfirmed} unconfirmed` : ""}`,
                value: fmt(x.orders),
                pct: (Number(x.orders || 0) / maxSeg) * 100,
                cls: ["bar-blue", "bar-purple", "bar-teal", "bar-amber", "bar-green"][i % 5],
              }))}
            />
          </section>

          <section className="panel">
            <div className="panel-head">
              <b>Per-order latency</b>
              <span>{rows.length} orders · latencies in microseconds upstream</span>
            </div>
            <DataTable
              className="data-table"
              rows={rows}
              rowKey={(r, i) => r.order_id || String(i)}
              columns={[
                { key: "order_id", label: "Order", render: (r) => <b>{r.order_id}</b> },
                { key: "segment", label: "Segment" },
                { key: "ext_remarks", label: "Ext Remarks", render: (r) => <span className="text-muted">{r.ext_remarks || "—"}</span> },
                {
                  key: "oms_status",
                  label: "OMS Status",
                  render: (r) => <span title="Provisional mapping — see note above">{r.oms_status} · {r.oms_status_label}</span>,
                },
                { key: "oms_latency_us", label: "OMS Latency", render: (r) => dur(r.oms_latency_us) },
                {
                  key: "exch_status_label",
                  label: "Exchange",
                  render: (r) => (
                    <span className={r.confirmed ? "text-green" : "text-red"}>
                      {r.confirmed ? "Confirmed" : "Not confirmed"}
                    </span>
                  ),
                },
                {
                  key: "confirm_latency_us",
                  label: "Confirm Latency",
                  render: (r) => (r.confirmed ? dur(r.confirm_latency_us) : <span className="text-muted">—</span>),
                },
              ]}
            />
          </section>
        </>
      )}
    </Shell>
  );
}
