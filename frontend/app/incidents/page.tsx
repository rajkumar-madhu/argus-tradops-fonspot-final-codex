import { CircleAlert, Database, Radio } from "lucide-react";
import Shell from "@/components/Shell";
import { Card, DataTable, EmptyState, KpiCard, PageHead, Severity } from "@/components/UI";
import { apiError, getJSON } from "@/lib/api";
import { fmt } from "@/lib/format";

export default async function Page() {
  const [persisted, derived]: any[] = await Promise.all([
    getJSON("/api/incidents?limit=50"),
    getJSON("/api/incidents/derived?lookback=15m"),
  ]);
  const err = apiError(persisted) || apiError(derived);
  const items = [...(derived.items || []), ...(persisted.items || [])];

  return (
    <Shell>
      <PageHead title="Alerts & Incidents" subtitle="Derived operational incidents and persisted correlation events from Redis/PostgreSQL" badge={`${items.length} incidents`} badgeTone="warn" />
      {err && <EmptyState title="Unable to load incidents" body={err} />}
      {!err && (
        <>
          <section className="kpi-grid three">
            <KpiCard label="Open Incidents" value={fmt(items.filter((i: any) => (i.status || "OPEN") === "OPEN").length)} sub="Needs triage" deltaTone="warn" tone="red" icon={<CircleAlert size={18} />} />
            <KpiCard label="Derived (ELK)" value={fmt((derived.items || []).length)} sub="Last 15 minutes" tone="blue" icon={<Radio size={18} />} />
            <KpiCard label="Persisted (PG)" value={fmt((persisted.items || []).length)} sub="Correlation worker" tone="purple" icon={<Database size={18} />} />
          </section>
          <Card title="Incident queue">
            <DataTable
              className="data-table"
              rows={items}
              rowKey={(r, i) => r.id || r.fingerprint || String(i)}
              columns={[
                { key: "id", label: "ID", render: (r) => <b>{r.id || r.incident_key || "—"}</b> },
                { key: "severity", label: "Severity", render: (r) => <Severity value={r.severity || "P3"} /> },
                { key: "type", label: "Type", render: (r) => r.type || r.incident_type || "—" },
                { key: "title", label: "Title" },
                { key: "status", label: "Status" },
                { key: "source", label: "Source", render: (r) => r.source || derived.source || persisted.source || "—" },
              ]}
            />
          </Card>
        </>
      )}
    </Shell>
  );
}
