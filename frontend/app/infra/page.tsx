import Link from "next/link";
import { healthTone } from "@/lib/health-state";
import { Cpu, Database, Network, Server } from "lucide-react";
import Shell from "@/components/Shell";
import { Card, EmptyState, KpiCard, PageHead, Status } from "@/components/UI";
import { apiError, getJSON } from "@/lib/api";
import { sourceDisplayName } from "@/lib/data-source";

function labelize(key: string) {
  return key.replaceAll("_", " ");
}

export default async function Page() {
  const d: any = await getJSON("/api/infra");
  const err = apiError(d);
  const entries = Object.entries(d).filter(([k]) => !k.startsWith("_") && k !== "source" && k !== "note" && k !== "prometheus");
  const prometheus = d.prometheus || {};

  return (
    <Shell>
      <PageHead title="Infrastructure Observability" subtitle="OMS/RMS, database, Elasticsearch, Redis and WAN telemetry" badge={d.source ? `Source: ${sourceDisplayName(d.source)}` : undefined} />
      {err && <EmptyState title="Unable to load infrastructure metrics" body={err} />}
      {!err && (
        <>
          <section className="kpi-grid four">
            {entries.slice(0, 4).map(([name, v]: any, i: number) => {
              const healthy = healthTone(v.status) === "good";
              const icons = [<Server key="s" size={18} />, <Database key="d" size={18} />, <Cpu key="c" size={18} />, <Network key="n" size={18} />];
              const tones = ["blue", "purple", "teal", "amber"] as const;
              return (
                <KpiCard
                  key={name}
                  label={name.toUpperCase()}
                  value={(v as any).status || "—"}
                  sub={Object.keys(v as object).filter((k) => k !== "status").slice(0, 2).map((k) => `${labelize(k)}: ${(v as any)[k]}`).join(" · ")}
                  deltaTone={healthy ? "up" : "warn"}
                  tone={healthy ? tones[i % tones.length] : "red"}
                  icon={icons[i % icons.length]}
                />
              );
            })}
          </section>
          <div className="infra-cards">
            {entries.map(([name, v]: any) => (
              <Card key={name}>
                <div className="exchange-head">
                  <h3><Link href={`/infra/${encodeURIComponent(name)}`}>{name.toUpperCase()}</Link></h3>
                  <Status value={v.status} />
                </div>
                {Object.entries(v).filter(([k]) => k !== "status").map(([k, val]: any) => (
                  <div className="metric-row" key={k}>
                    <span>{labelize(k)}</span>
                    <b>{String(val)}</b>
                  </div>
                ))}
              </Card>
            ))}
          </div>
          <Card title="Node exporter coverage">
            {prometheus.nodes?.length ? (
              <div className="node-exporter-table"><table><thead><tr><th>Instance</th><th>CPU</th><th>Memory</th><th>Root disk</th><th>Load</th><th>Uptime</th></tr></thead><tbody>{prometheus.nodes.map((node: any) => <tr key={node.instance}><td>{node.instance}</td><td>{node.cpu_used_pct == null ? "—" : `${node.cpu_used_pct}%`}</td><td>{node.memory_used_pct == null ? "—" : `${node.memory_used_pct}%`}</td><td>{node.root_used_pct == null ? "—" : `${node.root_used_pct}%`}</td><td>{node.load_1m ?? "—"}</td><td>{node.uptime_seconds == null ? "—" : `${Math.floor(node.uptime_seconds / 86400)}d`}</td></tr>)}</tbody></table></div>
            ) : <EmptyState title={prometheus.status || "Node exporter unavailable"} body={prometheus.note || "Configure Prometheus to display node CPU and memory metrics."} />}
          </Card>
          <Card title="Infrastructure telemetry coverage">
            <EmptyState
              title="Historical resource series unavailable"
              body={d.note || "CPU, memory, storage, network, node, pod and topology charts require a metrics integration such as Prometheus. Status cards above contain only values returned by the current API."}
            />
          </Card>
        </>
      )}
    </Shell>
  );
}
