import { Cpu, Database, Network, Server } from "lucide-react";
import Shell from "@/components/Shell";
import { Card, EmptyState, KpiCard, PageHead, Status } from "@/components/UI";
import { apiError, getJSON } from "@/lib/api";

function labelize(key: string) {
  return key.replaceAll("_", " ");
}

export default async function Page() {
  const d: any = await getJSON("/api/infra");
  const err = apiError(d);
  const entries = Object.entries(d).filter(([k]) => !k.startsWith("_") && k !== "source" && k !== "note");

  return (
    <Shell>
      <PageHead title="Infrastructure Observability" subtitle="OMS/RMS, database, Elasticsearch, Redis and WAN telemetry" badge={d.source ? `Source: ${d.source}` : undefined} />
      {err && <EmptyState title="Unable to load infrastructure metrics" body={err} />}
      {!err && (
        <>
          <section className="kpi-grid four">
            {entries.slice(0, 4).map(([name, v]: any, i: number) => {
              const healthy = /healthy|connected|ok|up/i.test(String((v as any).status ?? ""));
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
                  <h3>{name.toUpperCase()}</h3>
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
          <Card title="WAN bandwidth">
            <div className="wan-chart">
              <div className="line l1" />
              <div className="line l2" />
              <div className="axis">08:30　08:45　09:00　09:15　09:30</div>
            </div>
          </Card>
        </>
      )}
    </Shell>
  );
}
