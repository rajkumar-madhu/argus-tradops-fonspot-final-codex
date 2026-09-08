import QueryWindow, { queryWindow } from "@/components/QueryWindow";
import Shell from "@/components/Shell";
import LiveOrders from "@/components/LiveOrders";
import { EmptyState, PageHead } from "@/components/UI";
import { apiError, getJSON } from "@/lib/api";

export default async function Page({searchParams}: {searchParams: Promise<{source?: string; order?: string; lookback?: string}>}) {
  const params = await searchParams;
  const snapshot = params.source === 'journal';
  const lookback = queryWindow(params.lookback);
  const initial: any = await getJSON(snapshot ? "/api/journal/orders?size=10000" : `/api/orders?size=100&lookback=${lookback}${params.order ? `&q=${encodeURIComponent(params.order)}` : ""}`);
  const err = apiError(initial);

  return (
    <Shell>
      <PageHead
        title={snapshot ? "Journal Orders" : "Live Orders"}
        subtitle={snapshot ? `Historical journal snapshot · ${initial.from || "—"} to ${initial.to || "—"}` : "Streaming order flow from the Noren journal via the Redis event bus"}
        badge={`${initial.count ?? initial.returned ?? 0} orders · ${initial.source || "—"}`}
        badgeTone="ok"
      />
      <div className="grid-toolbar"><a className="link-btn" href="/orders">API order feed</a><a className="link-btn" href="/orders?source=journal">Local journal snapshot</a></div>
      {!snapshot && <QueryWindow value={lookback} source={initial.source}/>}
      {err ? (
        <EmptyState title="Unable to load orders" body={`${err}. Confirm the API is running on port 8001.`} />
      ) : (
        <LiveOrders initial={initial} snapshot={snapshot} requestedOrder={params.order} />
      )}
    </Shell>
  );
}
