import { Database, FileText, Search, ShieldCheck } from "lucide-react";
import Shell from "@/components/Shell";
import { Card, EmptyState, KpiCard, PageHead, Status } from "@/components/UI";
import { apiError, getJSON } from "@/lib/api";
import { serverRuntimeConfig } from "@/lib/runtime";

export default async function Page() {
  const [config, bus, elk]: any[] = await Promise.all([
    getJSON("/api/config"),
    getJSON("/api/event-bus/status"),
    getJSON("/api/elk/status"),
  ]);
  const err = apiError(config);

  const indexRows = config.indices
    ? Object.entries(config.indices).map(([k, v]) => ({ key: k, value: String(v) }))
    : [];

  return (
    <Shell>
      <PageHead title="Configuration" subtitle="Runtime integration settings for Noren journal observability" badge={config.demo_mode ? "Demo mode" : "Production"} badgeTone={config.demo_mode ? "warn" : "ok"} />
      {err && <EmptyState title="Unable to load configuration" body={err} />}
      {!err && (
        <>
          <section className="kpi-grid four">
            <KpiCard label="Schema" value={config.schema || "—"} sub="Noren field map" tone="blue" icon={<FileText size={18} />} />
            <KpiCard label="Auth" value={config.auth_disabled ? "Disabled" : "Keycloak"} sub={config.auth_disabled ? "Local demo" : "RBAC enforced"} deltaTone={config.auth_disabled ? "warn" : "up"} tone={config.auth_disabled ? "amber" : "green"} icon={<ShieldCheck size={18} />} />
            <KpiCard label="Redis" value={bus.connected ? "Connected" : "Down"} sub={config.redis_label || "event bus"} deltaTone={bus.connected ? "up" : "down"} tone={bus.connected ? "teal" : "red"} icon={<Database size={18} />} />
            <KpiCard label="Elasticsearch" value={elk.connected ? "Connected" : "Demo/Offline"} sub={elk.cluster || elk.mode || "—"} deltaTone={elk.connected ? "up" : "warn"} tone={elk.connected ? "purple" : "amber"} icon={<Search size={18} />} />
          </section>
          <div className="config-grid">
            <Card title="Noren indices">
              <ul className="config-list">
                {indexRows.map((row) => (
                  <li key={row.key}><span>{row.key}</span><b>{row.value}</b></li>
                ))}
                <li><span>Timestamp field</span><b>{config.timestamp_field}</b></li>
                <li><span>Price divisor</span><b>{config.price_divisor}</b></li>
              </ul>
            </Card>
            <Card title="Platform services">
              <ul className="config-list">
                <li><span>API URL</span><b>{serverRuntimeConfig().apiUrl}</b></li>
                <li><span>Metrics</span><b>{config.metrics_enabled ? "Enabled" : "Disabled"}</b></li>
                <li><span>Event bus</span><b><Status value={bus.connected ? "Connected" : "Disconnected"} /></b></li>
                <li><span>ELK cluster</span><b>{elk.cluster || "—"}</b></li>
              </ul>
            </Card>
          </div>
        </>
      )}
    </Shell>
  );
}
