import Shell from "@/components/Shell";
import RejectionsView from "@/components/RejectionsView";
import { EmptyState } from "@/components/UI";
import { apiError, getJSON } from "@/lib/api";

export default async function Page() {
  const d: any = await getJSON("/api/rejections?lookback=24h");
  const err = apiError(d);

  return (
    <Shell>
      {err ? (
        <EmptyState title="Unable to load rejections" body={`${err}. Confirm the API is running on port 8001.`} />
      ) : (
        <RejectionsView data={d} />
      )}
    </Shell>
  );
}
