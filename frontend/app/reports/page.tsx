import { CheckCircle2, FileText, Send } from "lucide-react";
import Shell from "@/components/Shell";
import { Card, DataTable, EmptyState, KpiCard, PageHead } from "@/components/UI";
import { apiError, getJSON } from "@/lib/api";
import { fmt } from "@/lib/format";

export default async function Page() {
  const d: any = await getJSON("/api/reports");
  const err = apiError(d);
  const rows = d.items || [];

  return (
    <Shell>
      <PageHead title="Reports" subtitle="Scheduled operational, rejection and session audit reports" badge={`Source: ${d.source || "—"}`} />
      {err && <EmptyState title="Unable to load reports" body={err} />}
      {!err && (
        <>
          <section className="kpi-grid three">
            <KpiCard label="Scheduled Reports" value={fmt(rows.length)} sub="Available templates" tone="blue" icon={<FileText size={18} />} />
            <KpiCard label="Ready" value={fmt(rows.filter((r: any) => r.status === "Ready").length)} sub="Can be generated" deltaTone="up" tone="green" icon={<CheckCircle2 size={18} />} />
            <KpiCard label="Delivery" value="Email + S3" sub="Production integration" tone="teal" icon={<Send size={18} />} />
          </section>
          <Card title="Report catalog">
            <DataTable
              className="data-table"
              rows={rows}
              rowKey={(r) => r.id}
              columns={[
                { key: "id", label: "Report ID", render: (r) => <b>{r.id}</b> },
                { key: "title", label: "Title" },
                { key: "schedule", label: "Schedule" },
                { key: "status", label: "Status" },
              ]}
            />
          </Card>
        </>
      )}
    </Shell>
  );
}
