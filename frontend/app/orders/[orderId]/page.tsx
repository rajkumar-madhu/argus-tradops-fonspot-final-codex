import Shell from "@/components/Shell";
import RefreshButton from "@/components/RefreshButton";
import OrderInvestigation from "@/components/OrderInvestigation";
import { apiError, getJSON } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * Single-order investigation. The lifecycle route resolves the same three
 * sources as the rest of the API, so this page works against Elasticsearch and
 * against a journal snapshot without a source switch of its own.
 */
export default async function Page({
  params, searchParams,
}: {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<{ source?: string }>;
}) {
  const { orderId } = await params;
  const snapshot = (await searchParams).source === "journal";
  const path = snapshot ? "/api/journal/orders" : "/api/orders";
  const d: any = await getJSON(`${path}/${encodeURIComponent(orderId)}/lifecycle`);
  const err = apiError(d);

  return (
    <Shell>
      <div className="oi-page">
        <section className="ref-head">
          <div>
            <div className="ref-title-row">
              <h1>Order {orderId}</h1>
            </div>
            <p>Recorded lifecycle, RMS evidence and the limits quoted against this order</p>
          </div>
          <div className="ref-controls"><RefreshButton /></div>
        </section>
        <OrderInvestigation
          orderId={orderId}
          events={err ? [] : d?.events || []}
          source={err ? null : d?.source}
          error={err}
        />
      </div>
    </Shell>
  );
}
