import Shell from "@/components/Shell";
import OrderBookView from "@/components/OrderBookView";
import { EmptyState, PageHead } from "@/components/UI";
import { apiError, getJSON } from "@/lib/api";

export default async function Page() {
  const initial: any = await getJSON("/api/order-book?size=200");
  const err = apiError(initial);

  return (
    <Shell>
      <PageHead
        title="Order Book"
        subtitle="Consolidated resting order book reconstructed from the Noren journal"
        badge={`${initial.count ?? initial.returned ?? 0} orders · ${initial.source || "—"}`}
        badgeTone="ok"
      />
      {err ? (
        <EmptyState title="Unable to load order book" body={`${err}. Confirm the API is running on port 8001.`} />
      ) : (
        <OrderBookView initial={initial} />
      )}
    </Shell>
  );
}
