import Shell from '@/components/Shell';
import CommandCenter from '@/components/CommandCenter';
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

  // limit=1: the Command Center only needs the summary, trend and per-source
  // rows these endpoints compute over the whole file, not the paged event list.
  const [overview, orders, rejections, exchanges, yel, latency, queues, infra, ready] =
    await Promise.all([
      getJSON('/api/overview'),
      getJSON(`/api/orders?size=${orderSize}&lookback=${lookback}`),
      getJSON(`/api/rejections?lookback=${lookback}`),
      getJSON('/api/exchanges'),
      getJSON('/api/exchanges/yel'),
      getJSON('/api/files/latency?limit=1'),
      getJSON('/api/files/queues?limit=1'),
      getJSON('/api/infra'),
      getJSON('/health/ready'),
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
        detail={
          <CommandCenter
            overview={overview}
            orders={orders}
            rejections={rejections}
            yel={yel}
            latency={latency}
            queues={queues}
            infra={infra}
            ready={ready}
            fileSources={fileSources}
          />
        }
      />
    </Shell>
  );
}
