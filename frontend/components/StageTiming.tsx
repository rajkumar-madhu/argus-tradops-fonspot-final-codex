import Link from 'next/link';
import { EmptyState } from '@/components/UI';
import { apiError, getJSON } from '@/lib/api';
import { istStamp } from '@/lib/journal-explore';
import { formatMicros, hopQuery, logWidth, traceBars, type SlowOrder, type StageStat, type TraceStage } from '@/lib/stage-timing';

type Query = Record<string, string | string[] | undefined>;
const one = (value: unknown) => (typeof value === 'string' ? value : '');

function Unavailable({ title, body }: { title: string; body: string }) {
  return (
    <section className="panel">
      <div className="panel-head"><b>Stage timing</b><span>Per-stage durations from ORDERLATENCYSORTED files</span></div>
      <EmptyState title={title} body={body} />
    </section>
  );
}

/**
 * Where inside the pipeline an order's time went, from ORDERLATENCYSORTED files.
 * Filters use hop_* parameters so they never collide with the page's latency filters;
 * the trace defaults to the slowest order and switches by link, so no client state.
 */
export default async function StageTiming({ query }: { query: Query }) {
  const segment = one(query.hop_segment);
  const instance = one(query.hop_instance);
  const params = new URLSearchParams();
  if (segment) params.set('segment', segment);
  if (instance) params.set('instance', instance);

  const d: any = await getJSON(`/api/files/hops?${params}`);
  const error = apiError(d);
  if (error) return <Unavailable title="Stage timing unavailable" body={`${error}.`} />;
  if (!d.orders) {
    return <Unavailable title="No stage-timing file ingested"
      body="Place an ORDERLATENCYSORTED export in the CSV source directory and restart the API." />;
  }

  const stages: StageStat[] = d.stages ?? [];
  const slowest: SlowOrder[] = d.slowest ?? [];
  const selected = one(query.hop_order) || slowest[0]?.order_id || '';
  const trace: any = selected ? await getJSON(`/api/files/hops/${encodeURIComponent(selected)}`) : null;
  const traceError = trace ? apiError(trace) : 'No order selected';
  const bars = traceError ? [] : traceBars(trace.stages as TraceStage[], trace.span_us);
  const dominant = bars.find((b) => b.dominant);
  const barMax = Math.max(1, ...stages.map((s) => s.p95 ?? 0));
  const kept = Object.entries(query).filter(([key, value]) => typeof value === 'string' && value && !key.startsWith('hop_'));

  return (
    <>
      <section className="panel stage-timing">
        <div className="panel-head">
          <b>Stage timing</b>
          <span>{d.orders.toLocaleString('en-US')} orders · microseconds · stage names pending Noren definitions</span>
        </div>
        <form className="stage-filters" action="/order-latency">
          {kept.map(([key, value]) => <input key={key} type="hidden" name={key} value={value as string} />)}
          <label>Segment
            <select name="hop_segment" defaultValue={segment}>
              <option value="">All</option>
              {(d.choices?.segment ?? []).map((s: string) => <option key={s}>{s}</option>)}
            </select>
          </label>
          <label>Instance
            <select name="hop_instance" defaultValue={instance}>
              <option value="">All</option>
              {(d.choices?.instance ?? []).map((s: string) => <option key={s}>{s}</option>)}
            </select>
          </label>
          <button className="btn" type="submit">Apply</button>
        </form>
        <div className="table-scroll" tabIndex={0} aria-label="Per-stage timing percentiles">
          <table className="orders-table stage-table">
            <thead>
              <tr><th>Stage</th><th>Orders</th><th>p50</th><th>p95</th><th>p99</th><th>Max</th><th className="stage-bar-col">p95 · log scale</th></tr>
            </thead>
            <tbody>
              {stages.map((s) => (
                <tr key={s.stage}>
                  <td>Stage {s.stage}</td>
                  <td className="num">{s.orders.toLocaleString('en-US')}</td>
                  <td className="num">{formatMicros(s.p50)}</td>
                  <td className="num">{formatMicros(s.p95)}</td>
                  <td className="num">{formatMicros(s.p99)}</td>
                  <td className="num">{formatMicros(s.max)}</td>
                  <td><span className="stage-bar" style={{ width: `${logWidth(s.p95, barMax)}%` }} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="stage-grid">
        <div className="panel">
          <div className="panel-head"><b>Slowest orders</b><span>By observed span, first stage start to last stage end</span></div>
          <div className="table-scroll" tabIndex={0} aria-label="Slowest orders by span">
            <table className="orders-table stage-table">
              <thead><tr><th>Order</th><th>Segment</th><th>Instance</th><th>Stages</th><th>Span</th></tr></thead>
              <tbody>
                {slowest.map((o) => (
                  <tr key={o.order_id} className={o.order_id === selected ? 'row-selected' : undefined}>
                    <td>
                      <Link href={`/order-latency?${hopQuery(query, { hop_order: o.order_id })}`}
                            aria-current={o.order_id === selected ? 'true' : undefined}>{o.order_id}</Link>
                    </td>
                    <td>{o.segment}</td>
                    <td>{o.instance}</td>
                    <td className="num">{o.stages}</td>
                    <td className="num">{formatMicros(o.span_us)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <b>Order trace</b>
            <span>{traceError ? 'Pick an order' : `${formatMicros(trace.span_us)} span`}</span>
          </div>
          {traceError ? (
            <EmptyState title="No trace for this order" body="It has no stage timings in the ingested files." />
          ) : (
            <div className="trace">
              <p className="trace-meta">
                {trace.order_id} · {trace.segment} · {trace.instance} · first stage {istStamp(trace.first_start)}
              </p>
              {bars.map((b) => (
                <div className="trace-row" key={`${b.stage}-${b.position}`}>
                  <span>Stage {b.stage}</span>
                  <div className="trace-track" title={`Stage ${b.stage}: ${formatMicros(b.start_us)} → ${formatMicros(b.end_us)}`}>
                    <i className={b.dominant ? 'trace-bar dominant' : 'trace-bar'} style={{ left: `${b.left}%`, width: `${b.width}%` }} />
                  </div>
                  <span className="num">{formatMicros(b.duration_us)}</span>
                </div>
              ))}
              {dominant && (
                <p className="trace-note">
                  Stage {dominant.stage} covers {Math.round((dominant.duration_us / trace.span_us) * 100)}% of this order&apos;s span.
                </p>
              )}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
