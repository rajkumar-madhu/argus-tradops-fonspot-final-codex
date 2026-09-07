import { Activity, BrainCircuit, Gauge, ListChecks, Search } from "lucide-react";
import Shell from "@/components/Shell";
import { EmptyState, KpiCard, PageHead, Status } from "@/components/UI";
import { getJSON } from "@/lib/api";

export default async function Page({ searchParams }: { searchParams: Promise<{ order_id?: string }> }) {
  const sp = await searchParams;
  const order = sp.order_id || "";
  const d: any = order ? await getJSON(`/api/rca/order/${order}`) : {};
  const ev: any[] = d.evidence || [];
  const confidence = Math.round(Number(d.summary?.confidence || 0) * 100);

  return (
    <Shell>
      <PageHead
        title="RCA & Analysis"
        subtitle="Evidence-driven Noren order lifecycle analysis"
        badge={order ? `Order ${order}` : "Awaiting order number"}
        badgeTone={order && d.found ? "ok" : undefined}
      />

      <section className="panel">
        <div className="panel-head"><b>Order lookup</b><span>Enter a NorenOrdNum to rebuild its lifecycle</span></div>
        <form action="/rca" className="rca-form">
          <label>
            Order Number
            <input name="order_id" defaultValue={order} placeholder="e.g. 24010500012345" />
          </label>
          <button className="primary" type="submit"><Search size={14} /> Analyze</button>
        </form>
      </section>

      {order && !d.found && (
        <EmptyState
          title="Order not found"
          body="No lifecycle events matched that order number. Check the lookback window and the configured Noren order index."
        />
      )}

      {!order && (
        <EmptyState
          title="No order selected"
          body="Enter a Noren order number above to see its full evidence chain, probable cause and confidence score."
        />
      )}

      {d.found && (
        <>
          <section className="kpi-grid four">
            <KpiCard label="Final Status" value={d.summary?.status || "—"} sub={d.summary?.symbol} tone="blue" icon={<Activity size={18} />} />
            <KpiCard label="Category" value={d.summary?.category || "—"} sub="Rejection class" tone="amber" icon={<BrainCircuit size={18} />} />
            <KpiCard label="Status Code" value={d.summary?.code || "—"} sub={d.summary?.exchange} tone="purple" icon={<ListChecks size={18} />} />
            <KpiCard
              label="Confidence"
              value={`${confidence}%`}
              delta={confidence >= 70 ? "High" : confidence >= 40 ? "Medium" : "Low"}
              deltaTone={confidence >= 70 ? "up" : confidence >= 40 ? "warn" : "down"}
              tone="green"
              icon={<Gauge size={18} />}
            />
          </section>

          <section className="panel">
            <div className="panel-head"><b>Probable Cause</b><span>{d.summary?.exchange} · {d.summary?.symbol}</span></div>
            <div className="rejection-box">
              <b>{d.summary?.category || "Root cause"}</b>
              <span>{d.summary?.probable_cause || "No probable cause recorded for this order."}</span>
            </div>
          </section>

          <section className="panel">
            <div className="panel-head"><b>Evidence Chain</b><span>{ev.length} events</span></div>
            <div className="table-scroll">
              <table className="orders-table">
                <thead>
                  <tr>
                    <th>Time</th><th>Status</th><th>Code</th><th>Report</th>
                    <th>Eref</th><th>Exchange Order</th><th>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {ev.map((e: any, i: number) => (
                    <tr key={i}>
                      <td>{e.time}</td>
                      <td><Status value={e.status || "—"} /></td>
                      <td>{e.status_code ?? "—"}</td>
                      <td>{e.report_type || "—"}</td>
                      <td>{e.eref || "—"}</td>
                      <td>{e.exchange_order_id || "—"}</td>
                      <td>{e.reason || "—"}</td>
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
