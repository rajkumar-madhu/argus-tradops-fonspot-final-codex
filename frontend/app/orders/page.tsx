import QueryWindow, { queryWindow } from '@/components/QueryWindow';
import Shell from '@/components/Shell';
import LiveOrders from '@/components/LiveOrders';
import { ApiErrorState, PageHead } from '@/components/UI';
import { apiError, getJSON } from '@/lib/api';

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ source?: string; order?: string; lookback?: string }>;
}) {
  const params = await searchParams;
  const snapshot = params.source === 'journal';
  const lookback = queryWindow(params.lookback);
  // Totals for the KPI row come from the overview, not from the loaded page of rows.
  const overviewPromise = getJSON('/api/overview');
  // Search and filters run over the loaded rows, so load as many as the route
  // allows: every order of a journal snapshot, and up to the backend's own cap
  // (500) from Elasticsearch.
  const initial: any = await getJSON(
    snapshot
      ? '/api/journal/orders?size=10000'
      : `/api/orders?size=10000&evidence=false&lookback=${lookback}${params.order ? `&q=${encodeURIComponent(params.order)}` : ''}`,
  );
  const err = apiError(initial);
  const overview: any = await overviewPromise;

  return (
    <Shell>
      <div className="live-orders-page">
        <PageHead
          title={snapshot ? 'Journal Orders' : 'Live Orders'}
          subtitle={
            snapshot
              ? `Historical journal snapshot · ${initial.from || '—'} to ${initial.to || '—'}`
              : 'Order flow from Noren Trader / OMS'
          }
          badge={`${initial.count ?? initial.returned ?? 0} orders · ${initial.source || '—'}`}
        />
        <div className="orders-source-controls">
          <nav className="orders-source-tabs" aria-label="Order source">
            <a aria-current={!snapshot ? 'page' : undefined} href="/orders">
              API order feed
            </a>
            <a aria-current={snapshot ? 'page' : undefined} href="/orders?source=journal">
              Local journal snapshot
            </a>
          </nav>
          {!snapshot && <QueryWindow value={lookback} source={initial.source} />}
        </div>
        {err ? (
          <ApiErrorState title="Unable to load orders" data={initial} />
        ) : (
          <LiveOrders initial={initial} snapshot={snapshot} requestedOrder={params.order} overview={apiError(overview) ? null : overview} />
        )}
      </div>
    </Shell>
  );
}
