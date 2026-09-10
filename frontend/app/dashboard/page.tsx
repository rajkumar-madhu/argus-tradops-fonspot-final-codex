import Shell from '@/components/Shell';
import DashboardView from '@/components/DashboardView';
import { queryWindow } from '@/components/QueryWindow';
import { getJSON } from '@/lib/api';

export const dynamic = 'force-dynamic';

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ lookback?: string }>;
}) {
  const lookback = queryWindow((await searchParams).lookback);
  // Align with /api/orders Query(le=10000); keep default batch large enough for desk KPIs.
  const orderSize = 10000;
  const fileSources: any = await getJSON('/api/files/sources');

  const [overview, orders, rejections, exchanges, yel] =
    await Promise.all([
      getJSON('/api/overview'),
      getJSON(`/api/orders?size=${orderSize}&lookback=${lookback}`),
      getJSON(`/api/rejections?lookback=${lookback}`),
      getJSON('/api/exchanges'),
      getJSON('/api/exchanges/yel'),
    ]);

  return (
    <Shell>
      <DashboardView
        lookback={lookback}
        overview={overview}
        orders={orders}
        rejections={rejections}
        exchanges={exchanges}
        yel={yel}
        fileSources={fileSources}
      />
    </Shell>
  );
}
