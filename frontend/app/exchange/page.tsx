import Shell from '@/components/Shell';
import ExchangeView from '@/components/ExchangeView';
import { getJSON } from '@/lib/api';

export const dynamic = 'force-dynamic';

const LATENCY_SEGMENTS = ['NSE', 'NFO', 'BSE', 'BFO', 'MCX', 'CDS'];

export default async function Page() {
  const exchanges: any = await getJSON('/api/exchanges');
  const isJournal = exchanges?.source === 'journal snapshot';

  const [yel, infra, orders, rejections, latency] = await Promise.all([
    getJSON('/api/exchanges/yel'),
    getJSON('/api/infra'),
    getJSON(isJournal ? '/api/journal/orders?size=10000' : '/api/orders?size=500&lookback=24h'),
    getJSON('/api/rejections'),
    getJSON('/api/files/latency?limit=1'),
  ]);

  // One trend per segment the latency file actually carries (cached server-side after first use).
  const present = new Set(((latency as any)?.by_segment || []).map((s: any) => s.segment));
  const segments = LATENCY_SEGMENTS.filter((s) => present.has(s));
  const segmentTrends = await Promise.all(
    segments.map(async (segment) => ({ segment, data: await getJSON(`/api/files/latency?segment=${segment}&limit=1`) })),
  );

  return (
    <Shell>
      <ExchangeView
        exchanges={exchanges}
        yel={yel}
        infra={infra}
        orders={orders}
        rejections={rejections}
        latency={latency}
        segmentTrends={segmentTrends}
      />
    </Shell>
  );
}
