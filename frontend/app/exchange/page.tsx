import Shell from '@/components/Shell';
import ExchangeView from '@/components/ExchangeView';
import { getJSON } from '@/lib/api';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const exchanges: any = await getJSON('/api/exchanges');
  const isJournal = exchanges?.source === 'journal snapshot';

  const [yel, infra, orders, rejections] = await Promise.all([
    getJSON('/api/exchanges/yel'),
    getJSON('/api/infra'),
    getJSON(isJournal ? '/api/journal/orders?size=10000' : '/api/orders?size=500&lookback=24h'),
    getJSON('/api/rejections'),
  ]);

  return (
    <Shell>
      <ExchangeView
        exchanges={exchanges}
        yel={yel}
        infra={infra}
        orders={orders}
        rejections={rejections}
      />
    </Shell>
  );
}
