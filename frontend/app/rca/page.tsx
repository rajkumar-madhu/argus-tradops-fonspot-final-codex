import Shell from "@/components/Shell";
import RcaView from "@/components/RcaView";
import { ApiErrorState } from "@/components/UI";
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
        <ApiErrorState title="Unable to load RCA data" data={rejections} />
      ) : (
        <RcaView rejections={rejections} initialOrderId={initialOrderId} />
      )}
    </Shell>
  );
}
