import Link from "next/link";
import { Cpu, Database, HardDrive, MemoryStick, Network, Server } from "lucide-react";
import Shell from "@/components/Shell";
import RefreshButton from "@/components/RefreshButton";
import { HBarList } from "@/components/Charts";
import { EmptyState, KpiCard } from "@/components/UI";
import { apiError, getJSON } from "@/lib/api";
import { stateTone } from "@/lib/command-center";
import { sourceBadgeText, sourceDisplayName } from "@/lib/data-source";
import { fmt } from "@/lib/format";

export const dynamic = "force-dynamic";

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const pct = (v: number | null) => (v === null ? "—" : `${v.toFixed(0)}%`);
const bytes = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(2)} GB` : n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${fmt(Math.round(n / 1e3))} KB`);
const uptime = (s?: number) => (s === undefined ? "—" : s >= 86400 ? `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h` : `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`);

/**
 * Infrastructure (reference mockup 01_16_53). Node, CPU, memory and storage
 * panels read Prometheus node-exporter through /api/infra when PROMETHEUS_URL
 * is set; container, pod, traffic-history and capacity panels need a
 * Kubernetes/metrics-history integration and say so. Service health, the
 * pipeline topology, alerts and system information come from live
 * dependency status and runtime config.
 */
export default async function Page() {
  const [infra, ready, config, sources]: any[] = await Promise.all([
    getJSON("/api/infra"),
    getJSON("/health/ready"),
    getJSON("/api/config"),
    getJSON("/api/files/sources"),
  ]);
  const err = apiError(infra);
  const source = String(infra?.source || config?.source || "");
  const prom = infra?.prometheus || {};
  const nodes: any[] = Array.isArray(prom.nodes) ? prom.nodes : [];
  const cpu = avg(nodes.map((n) => n.cpu_used_pct).filter((v) => typeof v === "number"));
  const mem = avg(nodes.map((n) => n.memory_used_pct).filter((v) => typeof v === "number"));
  const disk = avg(nodes.map((n) => n.root_used_pct).filter((v) => typeof v === "number"));
  const net = nodes.reduce((a, n) => a + (Number(n.network_bytes_per_second) || 0), 0);

  const deps: Record<string, string> = ready?.dependencies || {};
  const services = [
    { name: "API", type: "FastAPI", status: apiError(ready) && ready?._status !== 503 ? "Unreachable" : ready?.status === "ready" ? "Ready" : "Not ready", detail: ready?.mode ? `${ready.mode} mode` : "Readiness probe" },
    { name: "Elasticsearch", type: "Search / journal store", status: infra?.elasticsearch?.status || "Unavailable", detail: infra?.elasticsearch?.cluster_health ? `cluster ${infra.elasticsearch.cluster_health}` : "—" },
    { name: "Redis", type: "Event bus streams", status: infra?.redis?.status || "Unavailable", detail: Array.isArray(infra?.redis?.streams) && infra.redis.streams.length ? `${infra.redis.streams.length} streams` : "—" },
    { name: "PostgreSQL", type: "Incidents / RCA store", status: infra?.postgres?.status || "Unavailable", detail: infra?.postgres?.migrations ? `migrations: ${infra.postgres.migrations}` : "—" },
    ...(infra?.journal ? [{ name: "Journal", type: "Snapshot file", status: infra.journal.status || "Unknown", detail: "Read-only, loaded once" }] : []),
    ...(deps.csv_cache ? [{ name: "CSV cache", type: "File analytics", status: deps.csv_cache === "ready" ? "Ready" : deps.csv_cache, detail: Array.isArray(sources?.items) ? `${sources.items.length} files` : "—" }] : []),
    { name: "Prometheus", type: "Metrics", status: prom.status || "Not configured", detail: nodes.length ? `${nodes.length} nodes` : prom.note ? "No node exporter" : "—" },
  ];
  const up = services.filter((s) => stateTone(s.status) === "ok").length;
  const alerts = services.filter((s) => stateTone(s.status) === "bad");
  const files: any[] = Array.isArray(sources?.items) ? sources.items : [];
  const maxBytes = Math.max(1, ...files.map((f) => Number(f.bytes || 0)));

  // The deployed pipeline (CLAUDE.md architecture), each stage coloured by what the API reports.
  const tone = (s?: string) => stateTone(s || "Unavailable");
  const pipeline = [
    { name: "Noren journal", sub: infra?.journal ? "file snapshot" : "Filebeat → Logstash", tone: infra?.journal ? tone(infra.journal.status) : "idle" },
    { name: "Elasticsearch", sub: "noren-*-intraday", tone: tone(infra?.elasticsearch?.status) },
    { name: "Collector", sub: "leader-elected poller", tone: "idle" },
    { name: "Redis Streams", sub: "event bus", tone: tone(infra?.redis?.status) },
    { name: "Correlation", sub: "consumer group", tone: "idle" },
    { name: "PostgreSQL", sub: "incidents / RCA", tone: tone(infra?.postgres?.status) },
    { name: "API", sub: "FastAPI", tone: stateTone(services[0].status) },
  ];

  return (
    <Shell>
      <div className="infra-page ref-page">
        <section className="ref-head">
          <div>
            <div className="ref-title-row">
              <h1>Infrastructure</h1>
              <span className={`source-badge ${source === "journal snapshot" ? "file-based" : "live"}`}>{sourceBadgeText(source)}</span>
            </div>
            <p>Servers, core services and data pipeline · source: {sourceDisplayName(source)}</p>
          </div>
          <div className="ref-controls"><RefreshButton /></div>
        </section>

        {err ? (
          <EmptyState title="Infrastructure status unavailable" body={err} />
        ) : (
          <>
            <section className="kpi-grid ref-kpis six">
              <KpiCard label="Total Nodes" value={nodes.length ? fmt(nodes.length) : "—"} delta={nodes.length ? "node-exporter instances" : prom.status || "Prometheus not configured"} tone="blue" icon={<Server size={18} />} />
              <KpiCard label="Core Services" value={`${up} / ${services.length}`} delta={alerts.length ? `${alerts.length} unavailable` : "All reporting healthy"} deltaTone={alerts.length ? "down" : "up"} tone="purple" icon={<Database size={18} />} />
              <KpiCard label="CPU Usage" value={pct(cpu)} delta={cpu === null ? "Needs node-exporter" : "Average across nodes"} tone="green" icon={<Cpu size={18} />} />
              <KpiCard label="Memory Usage" value={pct(mem)} delta={mem === null ? "Needs node-exporter" : "Average across nodes"} tone="green" icon={<MemoryStick size={18} />} />
              <KpiCard label="Storage Usage" value={pct(disk)} delta={disk === null ? "Needs node-exporter" : "Root filesystem, average"} tone="red" icon={<HardDrive size={18} />} />
              <KpiCard label="Network Throughput" value={nodes.length ? `${(net / 1e6).toFixed(1)} MB/s` : "—"} delta={nodes.length ? "Receive + transmit, all nodes" : "Needs node-exporter"} tone="blue" icon={<Network size={18} />} />
            </section>

            <section className="ref-grid three">
              <div className="panel">
                <div className="panel-head"><b>Infrastructure Resource Usage</b></div>
                <EmptyState title="No resource history" body="Usage over time needs Prometheus range queries; the API reads current node values only." />
              </div>
              <div className="panel">
                <div className="panel-head"><b>Node Health</b></div>
                {nodes.length ? (
                  <table className="compact ref-table">
                    <thead><tr><th>Node</th><th className="num">CPU</th><th className="num">Memory</th><th className="num">Disk</th><th>Uptime</th></tr></thead>
                    <tbody>
                      {nodes.slice(0, 8).map((n) => (
                        <tr key={n.instance}>
                          <td><Link href={`/infra/${encodeURIComponent(n.instance)}`}>{n.instance}</Link></td>
                          <td className={`num ${n.cpu_used_pct > 70 ? "text-red" : ""}`}>{pct(n.cpu_used_pct ?? null)}</td>
                          <td className={`num ${n.memory_used_pct > 80 ? "text-red" : ""}`}>{pct(n.memory_used_pct ?? null)}</td>
                          <td className={`num ${n.root_used_pct > 85 ? "text-red" : ""}`}>{pct(n.root_used_pct ?? null)}</td>
                          <td>{uptime(n.uptime_seconds)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <EmptyState title={prom.status || "Not configured"} body={prom.note || "Set PROMETHEUS_URL to read node-exporter metrics."} />
                )}
              </div>
              <div className="panel">
                <div className="panel-head"><b>Container / Pod Status</b></div>
                <EmptyState title="No Kubernetes integration" body="Pod phases need kube-state-metrics or Kubernetes API access; neither is connected." />
              </div>
            </section>

            <section className="ref-grid three">
              <div className="panel">
                <div className="panel-head"><b>Service Health</b></div>
                <table className="compact ref-table">
                  <thead><tr><th>Service</th><th>Type</th><th>Status</th><th>Detail</th></tr></thead>
                  <tbody>
                    {services.map((s) => (
                      <tr key={s.name}>
                        <td><b>{s.name}</b></td>
                        <td>{s.type}</td>
                        <td><span className={`cc-pill cc-${stateTone(s.status)}`}>{s.status}</span></td>
                        <td>{s.detail}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="panel">
                <div className="panel-head"><b>Data Pipeline Topology</b></div>
                <ol className="infra-topology">
                  {pipeline.map((p) => (
                    <li key={p.name} className={`cc-${p.tone}`}>
                      <i /><b>{p.name}</b><span>{p.sub}</span>
                    </li>
                  ))}
                </ol>
                <p className="ref-note ref-note-pad">Stages coloured by API-reported status; collector and correlation workers report through their own metrics ports, grey here.</p>
              </div>
              <div className="panel">
                <div className="panel-head"><b>Alerts &amp; Events</b><Link href="/incidents">View all ›</Link></div>
                {alerts.length ? (
                  <table className="compact ref-table">
                    <thead><tr><th>Severity</th><th>Component</th><th>Message</th></tr></thead>
                    <tbody>
                      {alerts.map((a) => (
                        <tr key={a.name}>
                          <td><span className={`sev-dot ${a.name === "API" || a.name === "Elasticsearch" ? "sev-critical" : "sev-major"}`} />{a.name === "API" || a.name === "Elasticsearch" ? "Critical" : "Warning"}</td>
                          <td>{a.name}</td>
                          <td>{a.name} reports {a.status.toLowerCase()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <EmptyState title="No dependency alerts" body="Every core service reports healthy." />
                )}
                {source === "journal snapshot" && alerts.length > 0 && <p className="ref-note ref-note-pad">In file-snapshot mode Elasticsearch, Redis and PostgreSQL are not used, so unavailable is expected.</p>}
              </div>
            </section>

            <section className="ref-grid four">
              <div className="panel">
                <div className="panel-head"><b>Ingested Data</b><span className="sub">in the storage slot</span></div>
                {files.length ? (
                  <div className="ref-chart">
                    <HBarList rows={files.slice(0, 6).map((f, i) => ({ label: String(f.name || "").replace(/_\d{2}-[A-Za-z]{3}-\d{4}\.csv$/, ""), value: bytes(Number(f.bytes || 0)), pct: (Number(f.bytes || 0) / maxBytes) * 100, cls: ["bar-blue", "bar-green", "bar-amber", "bar-purple", "bar-teal", "bar-red"][i % 6] }))} />
                  </div>
                ) : (
                  <EmptyState title="No ingested files" body="No CSV source is configured." />
                )}
              </div>
              <div className="panel">
                <div className="panel-head"><b>Network Traffic</b></div>
                <EmptyState title="No traffic history" body="Interface history needs Prometheus range queries." />
              </div>
              <div className="panel">
                <div className="panel-head"><b>System Information</b></div>
                <dl className="ex-session">
                  <div><dt>Data source</dt><dd>{sourceDisplayName(source)}</dd></div>
                  <div><dt>Schema</dt><dd>{config?.schema || "—"}</dd></div>
                  <div><dt>Order index</dt><dd className="mono">{config?.indices?.orders || "—"}</dd></div>
                  <div><dt>Event time field</dt><dd className="mono">{config?.timestamp_field || "—"}</dd></div>
                  <div><dt>Price divisor</dt><dd>{config?.price_divisor ?? "—"}</dd></div>
                  <div><dt>Metrics endpoint</dt><dd>{config?.metrics_enabled ? "Enabled" : "Disabled"}</dd></div>
                  <div><dt>Environment</dt><dd><span className="ref-pill info">{config?.auth_disabled ? "Local (auth off)" : "Secured"}</span></dd></div>
                </dl>
              </div>
              <div className="panel">
                <div className="panel-head"><b>Capacity Forecast</b></div>
                <EmptyState title="No capacity history" body="Forecasts need resource history over days; none is recorded." />
              </div>
            </section>
          </>
        )}
      </div>
    </Shell>
  );
}
