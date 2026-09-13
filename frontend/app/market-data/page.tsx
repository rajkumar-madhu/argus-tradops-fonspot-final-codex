import Shell from "@/components/Shell";
import MarketDataView from "@/components/MarketDataView";
import { apiError, getJSON } from "@/lib/api";
import { apiErrorGuidance } from "@/lib/api-result";

export const dynamic = "force-dynamic";

export default async function Page() {
  const data: any = await getJSON("/api/market-data");
  const err = apiError(data);

  let journalOrders: any = null;
  if (!err && (data.source === "journal snapshot" || !(data.symbols || []).length)) {
    journalOrders = await getJSON("/api/journal/orders?size=5000&evidence=false");
  }

  return (
    <Shell>
      {err ? (
        <MarketDataView
          data={{ source: "—", symbols: [], note: apiErrorGuidance(data)?.body ?? err }}
        />
      ) : (
        <MarketDataView data={data} journalOrders={journalOrders} />
      )}
    </Shell>
  );
}
