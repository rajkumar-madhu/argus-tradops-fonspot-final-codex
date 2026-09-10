import Link from "next/link";
import { ArrowLeft, Server } from "lucide-react";
import Shell from "@/components/Shell";
import { Card, EmptyState, PageHead, Status } from "@/components/UI";
import { apiError, getJSON } from "@/lib/api";
import { sourceDisplayName } from "@/lib/data-source";

function labelize(key: string) { return key.replaceAll("_", " "); }

export default async function Page({ params }: { params: Promise<{ device: string }> }) {
  const { device } = await params;
  const d: any = await getJSON("/api/infra");
  const err = apiError(d);
  const name = decodeURIComponent(device);
  const metric = name === "prometheus" ? d.prometheus : d[name.toLowerCase()];
  return <Shell>
    <PageHead title={`${name.toUpperCase()} detail`} subtitle="Device-class health and available telemetry" badge={d.source ? `Source: ${sourceDisplayName(d.source)}` : undefined} />
    <p className="detail-back"><Link href="/infra"><ArrowLeft size={14} /> Back to infrastructure overview</Link></p>
    {err ? <EmptyState title="Unable to load infrastructure metrics" body={err} /> : !metric ? <EmptyState title="Device class unavailable" body="This device class is not present in the current source response." /> : <>
      <section className="kpi-grid three">
        <div className="kpi-card"><div className="kpi-card-body"><span className="kpi-card-label">Status</span><b className="kpi-card-value"><Status value={metric.status} /></b><small className="kpi-card-delta">Current source state</small></div></div>
        <div className="kpi-card"><div className="kpi-card-body"><span className="kpi-card-label">Telemetry fields</span><b className="kpi-card-value">{Object.keys(metric).filter((key) => key !== "status" && key !== "nodes").length}</b><small className="kpi-card-delta">Values returned by source</small></div></div>
        <div className="kpi-card"><div className="kpi-card-body"><span className="kpi-card-label">Node samples</span><b className="kpi-card-value">{metric.nodes?.length ?? "—"}</b><small className="kpi-card-delta">Prometheus node-exporter coverage</small></div></div>
      </section>
      <Card title="Observed details">
        {Object.entries(metric).filter(([key, value]) => key !== "status" && key !== "nodes" && key !== "note" && typeof value !== "object").map(([key, value]: any) => <div className="metric-row" key={key}><span>{labelize(key)}</span><b>{String(value)}</b></div>)}
        {metric.note && <p className="detail-note">{metric.note}</p>}
      </Card>
      {metric.nodes?.length ? <Card title="Node instances"><div className="node-exporter-table"><table><thead><tr><th><Server size={13} /> Instance</th><th>CPU</th><th>Memory</th><th>Root disk</th><th>Network B/s</th><th>Load</th><th>Uptime</th><th>Exporter</th></tr></thead><tbody>{metric.nodes.map((node: any) => <tr key={node.instance}><td>{node.instance}</td><td>{node.cpu_used_pct == null ? "—" : `${node.cpu_used_pct}%`}</td><td>{node.memory_used_pct == null ? "—" : `${node.memory_used_pct}%`}</td><td>{node.root_used_pct == null ? "—" : `${node.root_used_pct}%`}</td><td>{node.network_bytes_per_second ?? "—"}</td><td>{node.load_1m ?? "—"}</td><td>{node.uptime_seconds == null ? "—" : `${Math.floor(node.uptime_seconds / 86400)}d`}</td><td>{node.exporter_version || "—"}</td></tr>)}</tbody></table></div></Card> : null}
      {metric.virtualization && <Card title="Virtualization coverage"><EmptyState title={metric.virtualization.status} body={metric.virtualization.note} /></Card>}
    </>}
  </Shell>;
}
