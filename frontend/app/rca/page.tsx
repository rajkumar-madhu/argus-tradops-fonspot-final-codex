import Shell from "@/components/Shell";
import RcaView from "@/components/RcaView";
import { EmptyState } from "@/components/UI";
import { apiError, getJSON } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ order_id?: string }>;
}) {
  const sp = await searchParams;
  const initialOrderId = sp.order_id?.trim() || "";

  const rejections: any = await getJSON("/api/rejections?lookback=24h");
  const err = apiError(rejections);

  return (
    <Shell>
      {err ? (
        <EmptyState
          title="Unable to load RCA data"
          body={`${err}. Confirm the API is running on port 8001.`}
        />
      ) : (
        <RcaView rejections={rejections} initialOrderId={initialOrderId} />
      )}
    </Shell>
  );
}
