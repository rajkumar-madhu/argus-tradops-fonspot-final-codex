import QueryWindow, { queryWindow } from '@/components/QueryWindow';
import Shell from '@/components/Shell';
import LiveOrders from '@/components/LiveOrders';
import { ApiErrorState, PageHead } from '@/components/UI';
import { apiError, getJSON } from '@/lib/api';
import { sourceDisplayName } from '@/lib/data-source';

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ source?: string; order?: string; lookback?: string; calendar_date?: string; status?: string; account?: string; exchange?: string; service?: string }>;
}) {
  const params = await searchParams;
  const calendarScope = Boolean(params.calendar_date);
  const snapshot = params.source === 'journal';
  const lookback = queryWindow(params.lookback);
  // Totals for the KPI row come from the overview, not from the loaded page of rows.
  const overviewPromise = calendarScope ? Promise.resolve(null) : getJSON(`/api/overview?lookback=${lookback}`);
  // Search and filters run over the loaded rows, so load as many as the route
  // allows: every order of a journal snapshot, and up to the backend's own cap
  // (500) from Elasticsearch.
  let initial: any;
  if (calendarScope) {
    const query = new URLSearchParams({ start: params.calendar_date!, end: params.calendar_date!, date: params.calendar_date! });
    for (const key of ["account", "exchange", "service"] as const) if (params[key]) query.set(key, params[key]!);
    const calendar: any = await getJSON(`/api/calendar?${query}`);
    const items = (calendar.detail?.orders || []).filter((row: any) => !params.status || params.status === "all" || (params.status === "open_pending" ? ["OPEN", "PENDING", "TRIGGER_PENDING", "PARTIAL"].includes(row.status) : String(row.status).toLowerCase() === params.status));
    initial = calendar._error ? calendar : { items, count: items.length, returned: items.length, source: calendar.source, from: params.calendar_date, to: params.calendar_date, truncated: calendar.detail_truncated || !calendar.complete };
  } else initial = await getJSON(
    snapshot
      ? '/api/journal/orders?size=10000&evidence=false'
      : `/api/orders?size=10000&evidence=false&lookback=${lookback}${params.order ? `&q=${encodeURIComponent(params.order)}` : ''}`,
  );
  const err = apiError(initial);
  const overview: any = await overviewPromise;

  return (
    <Shell>
      <div className="live-orders-page">
        <PageHead
          title={calendarScope ? 'Calendar Orders' : snapshot ? 'Journal Orders' : 'Order Details'}
          subtitle={
            calendarScope ? `Selected day ${params.calendar_date} · Asia/Kolkata · ${initial.truncated ? 'Partial source records' : 'Recorded orders'}` : snapshot
              ? `Historical journal snapshot · ${initial.from || '—'} to ${initial.to || '—'}`
              : 'Order flow from Noren Trader / OMS'
          }
          badge={`${initial.count ?? initial.returned ?? 0} orders · ${sourceDisplayName(initial.source)}`}
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
          {!snapshot && !calendarScope && <QueryWindow value={lookback} source={initial.source} />}
        </div>
        {err ? (
          <ApiErrorState title="Unable to load orders" data={initial} />
        ) : (
          <LiveOrders
            initial={initial}
            snapshot={snapshot}
            calendarScope={calendarScope}
            requestedOrder={params.order}
            overview={apiError(overview) ? null : overview}
          />
        )}
      </div>
    </Shell>
  );
}
