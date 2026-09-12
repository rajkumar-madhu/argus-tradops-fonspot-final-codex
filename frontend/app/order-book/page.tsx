import Shell from "@/components/Shell";
import OrderBookView from "@/components/OrderBookView";
import { ApiErrorState, PageHead } from "@/components/UI";
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
        <ApiErrorState title="Unable to load order book" data={initial} />
      ) : (
        <OrderBookView initial={initial} />
      )}
    </Shell>
  );
}
