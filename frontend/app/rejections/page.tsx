import Shell from "@/components/Shell";
import RejectionsView from "@/components/RejectionsView";
import { EmptyState, PageHead } from "@/components/UI";
import { apiError, getJSON } from "@/lib/api";

export default async function Page() {
  const d: any = await getJSON("/api/rejections");
  const err = apiError(d);
  const groups: any[] = d.groups || [];
  const total = groups.reduce((s: number, g: any) => s + Number(g.count || 0), 0);

  return (
    <Shell>
      <PageHead
        title="Rejections"
        subtitle="Rejected order flow grouped by exchange reason code, streaming from the event bus"
        badge={`${total} rejections · ${groups.length} reasons · ${d.source || "—"}`}
        badgeTone="warn"
      />
      {err ? (
        <EmptyState title="Unable to load rejections" body={`${err}. Confirm the API is running on port 8001.`} />
      ) : (
        <RejectionsView data={d} />
      )}
    </Shell>
  );
}
