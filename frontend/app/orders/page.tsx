import Shell from "@/components/Shell";
import LiveOrders from "@/components/LiveOrders";
import { EmptyState, PageHead } from "@/components/UI";
import { apiError, getJSON } from "@/lib/api";

export default async function Page() {
  const initial: any = await getJSON("/api/orders?size=100");
  const err = apiError(initial);

  return (
    <Shell>
      <PageHead
        title="Live Orders"
        subtitle="Streaming order flow from the Noren journal via the Redis event bus"
        badge={`${initial.count ?? initial.returned ?? 0} orders · ${initial.source || "—"}`}
        badgeTone="ok"
      />
      {err ? (
        <EmptyState title="Unable to load orders" body={`${err}. Confirm the API is running on port 8001.`} />
      ) : (
        <LiveOrders initial={initial} />
      )}
    </Shell>
  );
}
