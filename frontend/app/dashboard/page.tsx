import Shell from '@/components/Shell';
import CommandCenter from '@/components/CommandCenter';
import DashboardView from '@/components/DashboardView';
import { apiWindowQuery, queryDay, windowLabel, windowSelectValue } from '@/components/QueryWindow';
import { getJSON } from '@/lib/api';

export const dynamic = 'force-dynamic';

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ lookback?: string; day?: string }>;
}) {
  const params = await searchParams;
  const lookback = windowSelectValue(params.lookback, params.day);
  const day = queryDay(params.day);
  const qs = apiWindowQuery(params.lookback, params.day);
  const windowText = windowLabel(params.lookback, params.day);
  // Align with /api/orders Query(le=10000); keep default batch large enough for desk KPIs.
  const orderSize = 10000;
  const fileSources: any = await getJSON('/api/files/sources');

  // limit=1: the Command Center only needs the summary, trend and per-source
  // rows these endpoints compute over the whole file, not the paged event list.
  const [
    overview,
    orders,
    rejections,
    exchanges,
    yel,
    latency,
    queues,
    infra,
    ready,
    sessions,
    yelRecords,
    freshness,
  ] = await Promise.all([
    getJSON(`/api/overview?${qs}`),
    getJSON(`/api/orders?size=${orderSize}&evidence=false&${qs}`),
    getJSON(`/api/rejections?${qs}`),
    getJSON(`/api/exchanges?${qs}`),
    getJSON('/api/exchanges/yel'),
    getJSON('/api/files/latency?limit=1'),
    getJSON('/api/files/queues?limit=1'),
    getJSON('/api/infra'),
    getJSON('/health/ready'),
    getJSON('/api/sessions'),
    // Exchange connect events (masked projection); exchange:read, journal source.
    getJSON('/api/journal/explore?msg_type=yel_connected&limit=8'),
    getJSON('/api/freshness'),
  ]);

  return (
    <Shell>
      <DashboardView
        lookback={windowText}
        day={day}
        selectValue={lookback}
        windowQuery={qs}
        overview={overview}
        orders={orders}
        rejections={rejections}
        exchanges={exchanges}
        yel={yel}
        fileSources={fileSources}
        sessions={sessions}
        infra={infra}
        ready={ready}
        yelRecords={yelRecords}
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
            freshness={freshness}
          />
        }
      />
    </Shell>
  );
}
