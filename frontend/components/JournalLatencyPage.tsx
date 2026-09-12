import { CheckCircle2, CircleAlert, Timer, Zap } from 'lucide-react';
import Shell from '@/components/Shell';
import { HBarList } from '@/components/Charts';
import { ApiErrorState, DataTable, EmptyState, KpiCard, PageHead } from '@/components/UI';
import { apiError, getJSON } from '@/lib/api';
import { sourceBadgeText } from '@/lib/data-source';
import { fmt } from '@/lib/format';

export const dynamic = 'force-dynamic';

/**
 * Duration in the unit the payload declares. /api/order-latency states `unit`
 * ("us" for journal event intervals, which are Noren nanosecond clocks ÷ 1000).
 * Without a declared unit the raw number is shown as source units — the same
 * stance as the CSV latency page — rather than assumed to be microseconds.
 */
function dur(value: unknown, unit: string | undefined) {
  const n = Number(value);
  if (value == null || value === '' || !Number.isFinite(n) || n < 0) return '—';
  if (unit !== 'us') return `${n.toLocaleString()} ${unit || 'source units'}`;
  if (n < 1000) return `${n.toFixed(0)} µs`;
  if (n < 1_000_000) return `${(n / 1000).toFixed(2)} ms`;
  return `${(n / 1_000_000).toFixed(2)} s`;
}

export default async function Page() {
  const d: any = await getJSON('/api/order-latency');
  const err = apiError(d);
  const rows: any[] = d.items || [];
  const s: any = d.summary || {};
  const unit: string | undefined = typeof d.unit === 'string' ? d.unit : undefined;
  const segments: any[] = d.by_segment || [];
  const journalInterval = d.latency_kind === 'journal_event_interval';
  const latencyLabel = journalInterval ? 'Event Interval' : 'OMS Latency';
  const maxSeg = Math.max(1, ...segments.map((x) => Number(x.orders || 0)));

  return (
    <Shell>
      <PageHead
        title="Order Latency"
        subtitle={
          journalInterval
            ? 'Journal event intervals and exchange order-number evidence, per order'
            : 'OMS processing time and exchange confirmation timing, per order'
        }
        badge={
          d.source === 'journal snapshot'
            ? `FILE-BASED · ${d.count || 0} orders`
            : `${d.count || 0} orders · ${sourceBadgeText(d.source)}`
        }
        badgeTone={s.unconfirmed_orders ? 'warn' : 'ok'}
      />

      {err && (
        <ApiErrorState title="Unable to load order latency" data={d} />
      )}

      {!err && rows.length === 0 && (
        <EmptyState
          title="No latency data"
          body={d.note || 'No OMS latency intervals were found for this data source.'}
        />
      )}

      {!err && rows.length > 0 && (
        <>
          <section className="kpi-grid four">
            <KpiCard
              label={`${latencyLabel} p50`}
              value={dur(s.oms_p50_us, unit)}
              sub={journalInterval ? 'Original to current event' : 'Median internal processing'}
              tone="blue"
              icon={<Zap size={18} />}
            />
            <KpiCard
              label={`${latencyLabel} p95`}
              value={dur(s.oms_p95_us, unit)}
              delta={`max ${dur(s.oms_max_us, unit)}`}
              tone="purple"
              icon={<Timer size={18} />}
            />
            <KpiCard
              label="Exchange Confirm p50"
              value={
                d.confirmation_timing_available === false ? 'Unavailable' : dur(s.confirm_p50_us, unit)
              }
              sub={`${fmt(s.confirmed_orders)} confirmed${journalInterval ? ' · order number present' : ''}`}
              tone="teal"
              icon={<CheckCircle2 size={18} />}
            />
            <KpiCard
              label="Unconfirmed"
              value={fmt(s.unconfirmed_orders)}
              delta={`${Number(s.unconfirmed_pct || 0).toFixed(1)}%`}
              deltaTone={Number(s.unconfirmed_pct || 0) > 10 ? 'down' : 'warn'}
              sub={journalInterval ? 'No exchange order number' : 'No confirmation evidence'}
              tone="red"
              icon={<CircleAlert size={18} />}
            />
          </section>

          {(d.notes || []).length > 0 && (
            <section className="panel">
              <div className="panel-head">
                <b>How to read these numbers</b>
              </div>
              <ul className="config-list">
                {(d.notes || []).map((n: string) => (
                  <li key={n}>
                    <span>{n}</span>
                  </li>
                ))}
                {d.oms_status_mapping_confirmed === false && (
                  <li>
                    <span>
                      <b>OMS status codes are provisional.</b> This feed&apos;s codes conflict with
                      the Noren OrdStatus mapping used elsewhere in Argus TradeOps (65 and 56 mean
                      rejected there). They are shown here as the feed&apos;s own values and are
                      pending confirmation.
                    </span>
                  </li>
                )}
              </ul>
            </section>
          )}

          <section className="panel">
            <div className="panel-head">
              <b>{journalInterval ? 'Event Intervals by Segment' : 'Latency by Segment'}</b>
              <span>{segments.length} segments</span>
            </div>
            <HBarList
              rows={segments.map((x, i) => ({
                label: `${x.segment} — p50 ${dur(x.oms_p50_us, unit)}${x.unconfirmed ? ` · ${x.unconfirmed} unconfirmed` : ''}`,
                value: fmt(x.orders),
                pct: (Number(x.orders || 0) / maxSeg) * 100,
                cls: ['bar-blue', 'bar-purple', 'bar-teal', 'bar-amber', 'bar-green'][i % 5],
              }))}
            />
          </section>

          <section className="panel">
            <div className="panel-head">
              <b>{journalInterval ? 'Per-order event interval' : 'Per-order latency'}</b>
              <span>
                {rows.length} orders · {journalInterval ? 'event intervals' : 'latencies'} in
                microseconds
              </span>
            </div>
            <DataTable
              className="data-table"
              rows={rows}
              rowKey={(r, i) => r.order_id || String(i)}
              columns={[
                { key: 'order_id', label: 'Order', render: (r) => <b>{r.order_id}</b> },
                { key: 'segment', label: 'Segment' },
                {
                  key: 'ext_remarks',
                  label: 'Ext Remarks',
                  render: (r) => <span className="text-muted">{r.ext_remarks || '—'}</span>,
                },
                {
                  key: 'oms_status',
                  label: journalInterval ? 'Order Status' : 'OMS Status',
                  render: (r) => (
                    <span
                      title={
                        d.oms_status_mapping_confirmed === false
                          ? 'Provisional mapping — see note above'
                          : 'Noren OrdStatus mapping'
                      }
                    >
                      {r.oms_status} · {r.oms_status_label}
                    </span>
                  ),
                },
                {
                  key: 'oms_latency_us',
                  label: latencyLabel,
                  render: (r) => dur(r.oms_latency_us, unit),
                },
                {
                  key: 'exch_status_label',
                  label: 'Exchange',
                  render: (r) => (
                    <span className={r.confirmed ? 'text-green' : 'text-red'}>
                      {r.confirmed ? 'Confirmed' : 'Not confirmed'}
                    </span>
                  ),
                },
                {
                  key: 'confirm_latency_us',
                  label: 'Confirm Latency',
                  render: (r) =>
                    d.confirmation_timing_available === false ? (
                      <span className="text-muted">Unavailable</span>
                    ) : r.confirmed ? (
                      dur(r.confirm_latency_us, unit)
                    ) : (
                      <span className="text-muted">—</span>
                    ),
                },
              ]}
            />
          </section>
        </>
      )}
    </Shell>
  );
}
