import Shell from "@/components/Shell";
import MarketDataView from "@/components/MarketDataView";
import { EmptyState, PageHead } from "@/components/UI";
import { apiError, getJSON } from "@/lib/api";

export default async function Page() {
  const d: any = await getJSON("/api/market-data");
  const err = apiError(d);
  const symbols: any[] = d.items || d.symbols || [];

  return (
    <Shell>
      <PageHead
        title="Market Data"
        subtitle="Live tick snapshot read from the Redis cache — browsers never connect to the feed directly"
        badge={`${symbols.length || d.count || 0} symbols · ${d.source || "—"}`}
        badgeTone={d.connected === false ? "warn" : "ok"}
      />
      {err ? (
        <EmptyState title="Unable to load market data" body={`${err}. Confirm the API is running on port 8001.`} />
      ) : (
        <MarketDataView data={d} />
      )}
    </Shell>
  );
}
