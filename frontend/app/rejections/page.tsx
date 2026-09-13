import Shell from "@/components/Shell";
import RejectionsView from "@/components/RejectionsView";
import { EmptyState } from "@/components/UI";
import { apiError, getJSON } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function Page() {
  // The order universe gives totals and per-type/product rates; a role without
  // orders:read gets an error object here and the view falls back gracefully.
  const [d, universe]: any[] = await Promise.all([
    getJSON("/api/rejections?lookback=24h"),
    getJSON("/api/orders?size=10000&evidence=false&lookback=24h"),
  ]);
  const err = apiError(d);

  return (
    <Shell>
      {err ? (
        <EmptyState title="Unable to load rejections" body={`${err}. Confirm the API is reachable.`} />
      ) : (
        <RejectionsView data={d} universe={apiError(universe) ? null : universe} />
      )}
    </Shell>
  );
}
