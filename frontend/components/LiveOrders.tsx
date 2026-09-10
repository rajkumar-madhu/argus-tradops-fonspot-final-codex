'use client';
import { useEffect, useRef, useState } from 'react';
import { fmt, time24 } from '@/lib/format';
import { istTime, lifecycleSteps } from '@/lib/journal-explore';
import { apiUrl } from '@/lib/runtime';
import { authHeaders } from '@/lib/session';
import { openAuthenticatedEventSource } from '@/lib/stream';
import {
  journalFieldValue,
  ORDER_JOURNAL_FIELD_TITLES,
  type OrderJournalFieldValues,
} from '@/lib/order-journal-fields';
import { Activity, Check, CheckCheck, ClipboardList, Clock3, ListChecks, Pause, Play, X, XCircle } from 'lucide-react';
import { DataTable, KpiCard } from '@/components/UI';
function Status({ value }: { value: string }) {
  return <span className={`order-status ${String(value || '').toLowerCase()}`}>{value}</span>;
}

const MAX_ROWS = 500;

/**
 * The `orders` stream carries ONE normalised order per event (the collector
 * publishes per order id), not a snapshot envelope. Replacing state with the
 * event payload would leave `data.items` undefined and blank the table on the
 * first tick, so each event is merged into the existing list by order id.
 */
function mergeOrder(prev: any, incoming: any) {
  const items = [...(prev?.items || [])];
  const idx = items.findIndex((x: any) => x.order_id === incoming.order_id);
  let count = Number(prev?.count || items.length);
  if (idx >= 0) {
    items[idx] = { ...items[idx], ...incoming };
  } else {
    items.unshift(incoming);
    count += 1;
  }
  const trimmed = items.slice(0, MAX_ROWS);
  return {
    ...prev,
    items: trimmed,
    count,
    returned: trimmed.length,
    streamed_at: incoming.streamed_at || prev?.streamed_at,
  };
}

export default function LiveOrders({
  initial,
  snapshot = false,
  requestedOrder,
  overview,
}: {
  initial: any;
  snapshot?: boolean;
  requestedOrder?: string;
  /** /api/overview totals; null when unavailable to this role or source. */
  overview?: any;
}) {
  const [data, setData] = useState<any>(initial || {});
  const [connected, setConnected] = useState(false);
  const latestData = useRef<any>(initial || {});
  const pausedRef = useRef(false);
  useEffect(() => {
    latestData.current = initial || {};
    if (!pausedRef.current) setData(latestData.current);
  }, [initial]);
  const [selectedId, setSelectedId] = useState<string>(
    requestedOrder || initial?.items?.[0]?.order_id || '',
  );
  const [events, setEvents] = useState<any[]>([]);
  const [evidenceState, setEvidenceState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [evidenceRetry, setEvidenceRetry] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (requestedOrder) setSelectedId(requestedOrder);
  }, [requestedOrder]);

  useEffect(() => {
    if (snapshot || initial?.source === 'demo') {
      setConnected(false);
      return;
    }
    const es = openAuthenticatedEventSource('orders', { interval: 2 });

    es.addEventListener('orders', (e: MessageEvent) => {
      setConnected(true);
      try {
        const order = JSON.parse(e.data);
        if (!order?.order_id || (requestedOrder && order.order_id !== requestedOrder)) return;
        latestData.current = mergeOrder(latestData.current, order);
        if (!pausedRef.current) setData(latestData.current);
      } catch {
        /* malformed frame — keep the last good state */
      }
    });
    es.addEventListener('error', () => setConnected(false));
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    return () => es.close();
  }, [snapshot, initial?.source, requestedOrder]);

  const rows = data.items || [];
  const selected = rows.find((row: any) => row.order_id === selectedId) || {};
  const countStatus = (...statuses: string[]) => rows.filter((r: any) => statuses.includes(r.status)).length;
  // Source-wide totals only when the overview supplied them; otherwise every
  // tile counts the loaded rows, never a mix of `count` and loaded rows.
  const totalOrders = Number(overview?.orders ?? rows.length);
  const liveCount = Number(overview?.open ?? countStatus('OPEN', 'PARTIAL'));
  const executedCount = Number(overview?.complete ?? countStatus('COMPLETE'));
  const rejectedCount = Number(overview?.rejected ?? countStatus('REJECTED'));
  const pendingCount = Number(overview?.pending ?? countStatus('PENDING', 'TRIGGER_PENDING'));
  const share = (n: number) => (totalOrders ? `${((n / totalOrders) * 100).toFixed(1)}%` : '—');
  const lastEvent = rows.reduce((latest: string, r: any) => (r.time && (!latest || Date.parse(r.time) > Date.parse(latest)) ? r.time : latest), '');
  const steps = lifecycleSteps(events);
  // Long partial-fill histories: keep the first and the last two steps.
  const stepperSteps = steps.length > 5 ? [...steps.slice(0, 2), null, ...steps.slice(-2)] : steps;
  const journalFields = (selected.journal_fields || {}) as OrderJournalFieldValues;
  const maskedFields = new Set<string>(selected.masked_fields || []);
  useEffect(() => {
    if (!selectedId && rows[0]) setSelectedId(rows[0].order_id);
  }, [rows, selectedId]);
  useEffect(() => {
    if (!selectedId) {
      setEvents([]);
      setEvidenceState('ready');
      return;
    }
    const controller = new AbortController();
    setEvents([]);
    setEvidenceState('loading');
    fetch(
      `${apiUrl()}/api/${snapshot ? 'journal/' : ''}orders/${encodeURIComponent(selectedId)}/lifecycle`,
      {
        cache: 'no-store',
        credentials: 'include',
        headers: authHeaders(),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
      },
    )
      .then((r) => {
        if (!r.ok) throw new Error('Evidence unavailable');
        return r.json();
      })
      .then((d) => {
        if (!controller.signal.aborted) {
          setEvents(d.events || []);
          setEvidenceState('ready');
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setEvidenceState('error');
      });
    return () => controller.abort();
  }, [selectedId, selected.time, selected.status, selected.filled_qty, snapshot, evidenceRetry]);

  return (
    <>
      <section className="kpi-grid ref-kpis six live-orders-kpis" aria-label="Order summary">
        <KpiCard
          label="Total Orders"
          value={fmt(totalOrders)}
          delta={overview ? 'Unique orders in source' : `${fmt(rows.length)} loaded rows`}
          tone="blue"
          icon={<ClipboardList size={18} />}
        />
        <KpiCard
          label="Live Orders"
          value={fmt(liveCount)}
          delta={overview ? 'Latest status open' : 'Open in loaded rows'}
          tone="green"
          icon={<ListChecks size={18} />}
        />
        <KpiCard
          label="Executed"
          value={fmt(executedCount)}
          delta={share(executedCount)}
          deltaTone="up"
          tone="green"
          icon={<CheckCheck size={18} />}
        />
        <KpiCard
          label="Rejected"
          value={fmt(rejectedCount)}
          delta={share(rejectedCount)}
          deltaTone="down"
          tone="red"
          icon={<XCircle size={18} />}
        />
        <KpiCard
          label="Pending"
          value={fmt(pendingCount)}
          delta={share(pendingCount)}
          deltaTone={pendingCount ? 'warn' : ''}
          tone="amber"
          icon={<Clock3 size={18} />}
        />
        <KpiCard
          label="Last Update"
          value={lastEvent ? istTime(lastEvent) : '—'}
          delta={
            snapshot || initial?.source === 'demo' || initial?.source === 'journal snapshot'
              ? 'Latest journal event (IST)'
              : paused ? 'Display paused · buffering' : connected ? 'Stream connected' : 'Stream disconnected'
          }
          tone={connected && !paused ? 'green' : 'blue'}
          icon={<Activity size={18} />}
        />
      </section>
      <section className="panel orders-main">
        <div className="panel-head orders-feed-head">
          <b>Order Feed ({data.returned ?? rows.length})</b>
          <div className="orders-feed-actions">
            <span className="source-tag" role="status">
              {snapshot
                ? 'Historical snapshot · no live stream'
                : initial?.source === 'demo'
                  ? 'Offline · no live stream'
                  : paused
                    ? 'Display paused · stream continues'
                    : connected
                      ? 'Stream connected'
                      : 'Stream disconnected · last snapshot'}
            </span>
            {!snapshot && initial?.source !== 'demo' && (
              <button
                type="button"
                aria-pressed={paused}
                onClick={() => {
                  pausedRef.current = !pausedRef.current;
                  setPaused(pausedRef.current);
                  if (!pausedRef.current) setData(latestData.current);
                }}
              >
                {paused ? <Play size={13} /> : <Pause size={13} />}
                {paused ? 'Resume updates' : 'Pause updates'}
              </button>
            )}
          </div>
        </div>
        <DataTable
          selectedId={selectedId}
          rows={rows}
          rowKey={(r) => r.order_id}
          onRowClick={(r) => setSelectedId(r.order_id)}
          columns={[
            { key: 'time', label: 'Time (IST)', render: (r) => time24(r.time) },
            { key: 'order_id', label: 'Order' },
            { key: 'account', label: 'Account' },
            { key: 'user', label: 'User' },
            { key: 'broker', label: 'Broker' },
            { key: 'exchange', label: 'Exchange' },
            { key: 'symbol', label: 'Symbol' },
            { key: 'side', label: 'Side' },
            { key: 'product', label: 'Product' },
            { key: 'type', label: 'Type' },
            { key: 'qty', label: 'Qty' },
            { key: 'filled_qty', label: 'Filled' },
            { key: 'price', label: 'Price' },
            { key: 'status', label: 'Status', render: (r) => <Status value={r.status} /> },
            {
              key: 'latency_ms',
              label: 'Event interval',
              render: (r) => (r.latency_ms == null ? '—' : `${r.latency_ms} ms`),
            },
          ]}
        />
      </section>
      <section className="order-evidence-grid" aria-label="Order investigation">
        <section className="panel order-detail">
          <div className="panel-head">
            <b>Order Details{selected.order_id ? ` - ${selected.order_id}` : ''}</b>
            {selected.status && <Status value={selected.status} />}
          </div>
          <dl>
            {[
              ['Order', selected.order_id],
              ['Eref', selected.eref],
              ['Exchange Order', selected.exchange_order_id || '—'],
              ['Account', selected.account],
              ['User', selected.user],
              ['Exchange', selected.exchange],
              ['Symbol', selected.symbol],
              ['Broker', selected.broker],
              ['Product', selected.product],
              ['Type', selected.type],
              ['Side', selected.side],
              ['Qty', selected.qty],
              ['Filled', selected.filled_qty],
              ['Price', selected.price ?? '—'],
              ['Status Code', selected.status_code],
            ].map(([k, v]) => (
              <div key={String(k)}>
                <dt>{k}</dt>
                <dd>{String(v ?? '—')}</dd>
              </div>
            ))}
          </dl>
          {(selected.reason || selected.status === 'REJECTED') && (
            <div className="rejection-box">
              <b>
                {selected.code || 'Reject'} · {selected.rejection_category}
              </b>
              <span>
                {selected.reason ||
                  (snapshot
                    ? 'Free-text reason withheld in local snapshot'
                    : 'Reason not supplied')}
              </span>
            </div>
          )}
        </section>
        <section className="panel">
          <div className="panel-head">
            <b>Order Lifecycle</b>
            <span>{events.length} events</span>
          </div>
          {evidenceState === 'loading' && (
            <p className="evidence-note" role="status">
              Loading order evidence…
            </p>
          )}
          {evidenceState === 'error' && (
            <div className="empty-state" role="alert">
              <b>Evidence unavailable</b>
              <p>The source did not return a usable response.</p>
              <button onClick={() => setEvidenceRetry((n) => n + 1)}>Retry evidence</button>
            </div>
          )}
          {evidenceState === 'ready' && !events.length && (
            <p className="evidence-note">
              {selectedId
                ? 'No lifecycle events were returned for this order.'
                : 'Select an order to inspect its lifecycle.'}
            </p>
          )}
          {steps.length > 0 && (
            <ol className="lifecycle-stepper" aria-label="Order lifecycle">
              {stepperSteps.map((step, index) =>
                step === null ? (
                  <li key="more" className="more">
                    <span className="dot">…</span>
                    <b>{steps.length - 4} more</b>
                    <small>events</small>
                  </li>
                ) : (
                  <li key={`${step.time}-${index}`} className={step.tone ? `tone-${step.tone}` : undefined}>
                    <span className="dot">{step.tone === 'rejected' ? <X size={14} /> : <Check size={14} />}</span>
                    <b>{step.status}</b>
                    <small>{step.time}</small>
                  </li>
                ),
              )}
            </ol>
          )}
          {selected.status === 'REJECTED' && (
            <div className="lifecycle-reject">
              <div><span>Rejection Code</span><b>{selected.code || '—'}</b></div>
              <div><span>Category</span><span>{selected.rejection_category || '—'}</span></div>
              <a href={`/rca?order_id=${encodeURIComponent(selectedId)}`}>Full reason in RCA ›</a>
            </div>
          )}
        </section>
        <section className="panel">
          <div className="panel-head">
            <b>Related Journal Evidence</b>
            <span>{snapshot ? 'Same historical source' : 'Same order lifecycle'}</span>
          </div>
          <div className="table-scroll">
            <table className="orders-table">
              <thead>
                <tr>
                  <th>Time (IST)</th>
                  <th>Report</th>
                  <th>Code / category</th>
                </tr>
              </thead>
              <tbody>
                {events.slice(-8).map((event: any, index: number) => (
                  <tr key={index}>
                    <td>{time24(event.time)}</td>
                    <td>{event.report_type ?? '—'}</td>
                    <td>{event.code || event.rejection_category || event.status || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="evidence-note">
            {snapshot
              ? 'Raw free-text messages are withheld to protect sensitive fields.'
              : 'Additional service logs can be searched separately.'}
          </p>
          {!snapshot && selectedId && (
            <div className="query-window">
              <a href={`/logs?q=${encodeURIComponent(selectedId)}`}>Search service logs</a>
              <a href={`/rca?order_id=${encodeURIComponent(selectedId)}`}>Investigate RCA</a>
            </div>
          )}
        </section>
      </section>
      {snapshot && (
        <details className="panel journal-field-evidence">
          <summary>Mapped Journal.log fields · {selectedId || 'No order selected'}</summary>
          {!selectedId ? (
            <p className="evidence-note">
              Select an order to inspect its allowlisted journal evidence.
            </p>
          ) : (
            <>
              <p className="evidence-note">
                Prices and timestamps are normalized for display. Order Status retains the raw
                OrdStatus code. Fields marked “masked” never expose their original sensitive value.
              </p>
              <dl className="journal-field-grid">
                {ORDER_JOURNAL_FIELD_TITLES.map(([field, title]) => (
                  <div key={field}>
                    <dt>
                      {title}
                      {maskedFields.has(field) && <span className="masked-label">masked</span>}
                    </dt>
                    <dd>{journalFieldValue(journalFields[field])}</dd>
                  </div>
                ))}
              </dl>
            </>
          )}
        </details>
      )}
      <details className="panel evidence-details">
        <summary>
          Market Context · {selected.symbol || 'No symbol selected'} · depth unavailable
        </summary>
        <div className="empty-state">
          <p>
            {snapshot
              ? 'The historical journal does not include contemporaneous bid/ask depth.'
              : 'Order events do not include a correlated market-depth snapshot.'}
          </p>
          <a href="/market-data">Open current market data</a>
        </div>
      </details>
      <details className="panel evidence-details">
        <summary>Complete lifecycle evidence · {selectedId || 'No order selected'}</summary>
        <div className="table-scroll">
          <table className="orders-table">
            <thead>
              <tr>
                <th>Time (IST)</th>
                <th>Status</th>
                <th>Code</th>
                <th>Report</th>
                <th>Exchange Order</th>
                <th>Filled</th>
                <th>Evidence</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event: any, index: number) => (
                <tr key={index}>
                  <td>{time24(event.time)}</td>
                  <td>
                    <Status value={event.status} />
                  </td>
                  <td>{event.status_code}</td>
                  <td>{event.report_type}</td>
                  <td>{event.exchange_order_id || '—'}</td>
                  <td>{event.filled_qty ?? 0}</td>
                  <td>{event.reason || event.rejection_category || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  );
}
