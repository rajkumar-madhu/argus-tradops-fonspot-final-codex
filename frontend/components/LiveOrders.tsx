'use client';
import { useEffect, useRef, useState } from 'react';
import { time24 } from '@/lib/format';
import { apiUrl } from '@/lib/runtime';
import { authHeaders } from '@/lib/session';
import { openAuthenticatedEventSource } from '@/lib/stream';
import {
  journalFieldValue,
  ORDER_JOURNAL_FIELD_TITLES,
  type OrderJournalFieldValues,
} from '@/lib/order-journal-fields';
import { Activity, CheckCheck, ClipboardList, Clock3, Pause, Play, XCircle } from 'lucide-react';
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
}: {
  initial: any;
  snapshot?: boolean;
  requestedOrder?: string;
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
      <section className="live-orders-kpis" aria-label="Loaded order summary">
        <KpiCard
          label="Loaded orders"
          value={rows.length}
          sub={snapshot ? 'Historical snapshot' : 'Current loaded window'}
          icon={<ClipboardList size={20} />}
        />
        <KpiCard
          label="Executed"
          value={rows.filter((r: any) => r.status === 'COMPLETE').length}
          sub="In loaded rows"
          tone="green"
          icon={<CheckCheck size={20} />}
        />
        <KpiCard
          label="Rejected"
          value={rows.filter((r: any) => r.status === 'REJECTED').length}
          sub="In loaded rows"
          tone="red"
          icon={<XCircle size={20} />}
        />
        <KpiCard
          label="Open / Pending"
          value={
            rows.filter((r: any) =>
              ['OPEN', 'PENDING', 'TRIGGER_PENDING', 'PARTIAL'].includes(r.status),
            ).length
          }
          sub="Includes partial fills"
          tone="amber"
          icon={<Clock3 size={20} />}
        />
        <KpiCard
          label="Stream / source"
          value={
            snapshot
              ? 'Historical'
              : initial?.source === 'demo'
                ? 'Offline'
                : paused
                  ? 'Paused'
                  : connected
                    ? 'Connected'
                    : 'Disconnected'
          }
          sub={
            snapshot || initial?.source === 'demo'
              ? 'No live stream'
              : paused
                ? 'Display paused · buffering'
                : initial?.source || 'Source unavailable'
          }
          tone={connected && !paused ? 'green' : 'blue'}
          icon={<Activity size={20} />}
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
            <b>Selected Order</b>
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
          <ol className="evidence-timeline">
            {events.slice(-8).map((event: any, index: number) => (
              <li key={`${event.time}-${index}`}>
                <Status value={event.status} />
                <time>{time24(event.time)} IST</time>
                <span>
                  Report {event.report_type ?? '—'} · filled {event.filled_qty ?? 0}
                </span>
              </li>
            ))}
          </ol>
          {events.length > 8 && (
            <p className="evidence-note">Latest 8 events shown; complete evidence is below.</p>
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
