import { Hash, Timer } from 'lucide-react';
import Link from 'next/link';
import Shell from '@/components/Shell';
import JournalLatencyPage from '@/components/JournalLatencyPage';
import FileAnalyticsControls from '@/components/FileAnalyticsControls';
import ObservedTrend, { LatencyHistogram } from '@/components/ObservedTrend';
import StageTiming from '@/components/StageTiming';
import { PageHead, EmptyState, KpiCard } from '@/components/UI';
import { getJSON, apiError } from '@/lib/api';
import { earlyWindowSpike, fileQuery, metric, spansOrdersOfMagnitude, suggestedSessionDate, type FileQuery } from '@/lib/file-analytics';

export const dynamic = 'force-dynamic';

const stamp = (value?: string) => value?.replace('T', ' ').replace('+00:00', '') || '—';

function bucketSeries(trend: Array<Record<string, number | string | null>>, key: 'oms' | 'confirmation', meanName: string) {
  const label = key === 'oms' ? 'OMS' : 'confirmation';
  const hasSpread = trend.some((row) => row[`${key}_p50`] != null || row[`${key}_max`] != null);
  const points = (field: string, fallback?: string) => trend.map((row) => ({
    time: String(row.time ?? ''),
    value: (row[field] ?? (fallback ? row[fallback] : null)) as number | null,
  }));
  if (!hasSpread) return [{ name: meanName, points: points(key) }];
  return [
    { name: `P50 ${label}`, points: points(`${key}_p50`) },
    { name: `Avg ${label}`, points: points(`${key}_avg`, key) },
    { name: `Max ${label}`, points: points(`${key}_max`) },
  ];
}
const withUnit = (value: number | null | undefined, unit: string) => {
  const text = metric(value);
  return text === '—' ? text : `${text} ${unit}`;
};

export default async function Page({ searchParams }: { searchParams: Promise<FileQuery> }) {
  const q = await searchParams;
  const d: any = await getJSON(`/api/files/latency?${fileQuery(q, { prefix: '' })}`);
  // The legacy journal view remains available when CSV analytics is unconfigured.
  if (d._status === 503) {
    const config: any = await getJSON('/api/config');
    if (config.csv_configured === false) return <JournalLatencyPage />;
  }
  const error = apiError(d);
  const s = d.summary || {};
  const limit = Number(q.limit || 50);
  const offset = Number(q.offset || 0);
  const unit = d.unit || 'source units';
  const unitLabel = unit === 'us' ? 'µs' : unit === 'ms' ? 'ms' : unit;
  const trend = d.trend || [];
  const segments = d.by_segment || [];
  const bucketSeconds = Number(d.bucket_seconds);
  const bucketCaption = Number.isFinite(bucketSeconds) && bucketSeconds > 0
    ? `${bucketSeconds}-second buckets · UTC`
    : 'Observed buckets · UTC';
  const suggestedDate = suggestedSessionDate(trend.map((row: { time?: string }) => row.time));
  const exportHref = `/api/exports/latency?${fileQuery(q, { limit: '', offset: '', prefix: '' })}`;
  const samples = `${metric(s.oms?.samples)} valid samples`;
  const omsSeries = bucketSeries(trend, 'oms', 'Mean OMS');
  const confirmationSeries = bucketSeries(trend, 'confirmation', 'Mean confirmation');
  const confirmationScale = spansOrdersOfMagnitude(confirmationSeries.flatMap((item) => item.points.map((point) => point.value))) ? 'log' as const : 'linear' as const;
  const confirmationSpike = earlyWindowSpike(trend.map((row: { time?: string; confirmation_max?: number | null }) => ({ time: row.time, value: row.confirmation_max })));
  const omsDetail = omsSeries.length > 1 ? 'P50, average and maximum' : 'Mean';
  const confirmationDetail = confirmationSeries.length > 1 ? 'P50, average and maximum' : 'Mean';

  return (
    <Shell>
      <PageHead title="OMS latency analytics" subtitle="Processing and exchange confirmation observations · historical file snapshot" badge="FILE-BASED" badgeTone="warn" />
      {error ? <EmptyState title="Unable to load latency analytics" body={`${error}. Retry when the source service is available.`} /> : (
        <>
          <div className="file-context">
            <span><b>{metric(d.count)}</b> matching events · <b>{metric(d.unique_orders)}</b> unique orders</span>
            <span className="file-actions">
              <Link href="/data-quality">Source health & ingestion →</Link>
              <a className="btn" href={exportHref}>Export CSV</a>
            </span>
          </div>
          <FileAnalyticsControls key={fileQuery(q)} query={q} suggestedDate={suggestedDate} facets={{ segments: d.choices?.segment || [], statuses: d.facets?.statuses || [] }} />
          <section className="kpi-grid six">
            <KpiCard icon={<Timer size={18} />} tone="teal" label={`OMS p50 (${unit})`} value={metric(s.oms?.p50)} sub={samples} />
            <KpiCard icon={<Timer size={18} />} tone="teal" label={`OMS p95 (${unit})`} value={metric(s.oms?.p95)} sub={samples} />
            <KpiCard icon={<Timer size={18} />} tone="teal" label={`OMS p99 (${unit})`} value={metric(s.oms?.p99)} sub={samples} />
            <KpiCard icon={<Timer size={18} />} tone="teal" label={`OMS max (${unit})`} value={metric(s.oms?.max)} sub={samples} />
            <KpiCard icon={<Timer size={18} />} tone="teal" label={`Confirmation p50 (${unit})`} value={metric(s.confirmation?.p50)} sub={`${metric(s.confirmation?.samples)} valid samples`} />
            <KpiCard icon={<Hash size={18} />} tone="teal" label="Events" value={metric(d.count)} sub={`${metric(d.unique_orders)} unique orders`} />
          </section>
          <section className="panel">
            <div className="panel-head"><b>OMS latency</b><span>{omsDetail} per bucket · {unitLabel} · {bucketCaption}</span></div>
            <ObservedTrend tall dashedFrom={2} label={`OMS latency, ${omsDetail.toLowerCase()}, ${bucketCaption}`} unit={unit} series={omsSeries} />
          </section>
          <section className="panel">
            <div className="panel-head"><b>Order volume</b><span>Event count per bucket · {bucketCaption}</span></div>
            <ObservedTrend
              tall
              variant="bars"
              legend="Orders"
              label={`Order volume, event count, ${bucketCaption}`}
              unit="events"
              points={trend.map((row: { time?: string; count?: number | null }) => ({ time: row.time || '', value: row.count ?? null }))}
            />
          </section>
          <section className="panel">
            <div className="panel-head"><b>Exchange confirmation latency</b><span>{confirmationScale === 'log' ? 'Log scale · ' : ''}{confirmationDetail} per bucket · {unitLabel} · {bucketCaption}</span></div>
            {confirmationSpike && (
              <p className="chart-warning">Early buckets reach a confirmation maximum of {metric(confirmationSpike.earlyMax)} {unitLabel}, above the later median maximum of {metric(confirmationSpike.laterMedian)} {unitLabel}.</p>
            )}
            <ObservedTrend
              tall
              dashedFrom={2}
              scale={confirmationScale}
              label={`Exchange confirmation latency, ${confirmationDetail.toLowerCase()}, ${bucketCaption}`}
              unit={unit}
              series={confirmationSeries}
            />
          </section>
          {Array.isArray(d.histogram) && d.histogram.length > 0 && (
            <section className="panel">
              <div className="panel-head"><b>Latency distribution histogram</b><span>OMS samples · {unitLabel}</span></div>
              <LatencyHistogram bins={d.histogram} unit={unit} />
            </section>
          )}
          <div className="segment-cards">
            {segments.map((row: any) => (
              <section key={row.segment} className="panel segment-card">
                <div className="segment-card-head">
                  <div>
                    <b>{row.segment}</b>
                    <span>{metric(row.count)} orders</span>
                  </div>
                  <div className="segment-card-meta">
                    <span>Max OMS <b>{withUnit(row.oms?.max, unit)}</b></span>
                    <span>P50 OMS <b>{withUnit(row.oms?.p50, unit)}</b></span>
                  </div>
                </div>
                <dl className="metric-list segment-metrics">
                  <div><dt>P50 OMS</dt><dd>{withUnit(row.oms?.p50, unit)}</dd></div>
                  <div><dt>P95 OMS</dt><dd>{withUnit(row.oms?.p95, unit)}</dd></div>
                  <div><dt>P99 OMS</dt><dd>{withUnit(row.oms?.p99, unit)}</dd></div>
                  <div><dt>Max OMS</dt><dd>{withUnit(row.oms?.max, unit)}</dd></div>
                  <div><dt>P50 confirmation</dt><dd>{withUnit(row.confirmation?.p50, unit)}</dd></div>
                  <div><dt>Orders</dt><dd>{metric(row.count)}</dd></div>
                </dl>
              </section>
            ))}
          </div>
          <section className="panel">
            <div className="panel-head"><b>Latency distribution</b><span>Same filters as the event table and export</span></div>
            <div className="table-scroll" tabIndex={0} aria-label="Latency percentile comparison">
              <table className="orders-table">
                <thead>
                  <tr>
                    <th>Measurement ({unit})</th>
                    <th>Valid samples</th>
                    {['p50', 'p90', 'p95', 'p99', 'max'].map((key) => <th key={key}>{key}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {[['oms', 'OMS processing'], ['confirmation', 'Reported exchange confirmation']].map(([key, name]) => (
                    <tr key={key}>
                      <td>{name}</td>
                      <td>{metric(s[key]?.samples)}</td>
                      {['p50', 'p90', 'p95', 'p99', 'max'].map((keyName) => <td key={keyName}>{metric(s[key]?.[keyName])}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="panel">
            <div className="panel-head"><b>Segment comparison</b><span>Filtered observations · {unit}</span></div>
            <div className="table-scroll">
              <table className="orders-table">
                <thead>
                  <tr>
                    <th>Segment</th><th>Events</th><th>Valid OMS samples</th><th>OMS p50</th><th>OMS p95</th><th>OMS p99</th><th>OMS max</th><th>Confirmation p50</th>
                  </tr>
                </thead>
                <tbody>
                  {segments.map((row: any) => (
                    <tr key={row.segment}>
                      <td>{row.segment}</td>
                      <td>{metric(row.count)}</td>
                      <td>{metric(row.oms?.samples)}</td>
                      <td>{metric(row.oms?.p50)}</td>
                      <td>{metric(row.oms?.p95)}</td>
                      <td>{metric(row.oms?.p99)}</td>
                      <td>{metric(row.oms?.max)}</td>
                      <td>{metric(row.confirmation?.p50)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <StageTiming query={q} />
          <section className="panel">
            <div className="panel-head"><b>Event evidence</b><a className="btn" href={exportHref}>Export CSV</a></div>
            <div className="table-scroll" tabIndex={0} aria-label="Scrollable latency events">
              <table className="orders-table">
                <thead>
                  <tr><th>Order</th><th>Segment</th><th>Event time (UTC)</th><th>OMS ({unit})</th><th>Confirmation ({unit})</th><th>OMS status</th><th>Source file</th></tr>
                </thead>
                <tbody>
                  {(d.items || []).map((row: any) => (
                    <tr key={`${row.file}:${row.fingerprint}`}>
                      <td><Link href={`/orders?order=${encodeURIComponent(row.order_id)}`}>{row.order_id}</Link></td>
                      <td>{row.segment}</td>
                      <td>{stamp(row.event_time)}</td>
                      <td>{metric(row.oms)}</td>
                      <td>{metric(row.confirmation)}</td>
                      <td>{row.oms_status ?? 'Not supplied'}</td>
                      <td>{row.file}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!d.count && <EmptyState title="No matching events" body="Widen the time range or reset your filters." />}
            <div className="table-foot">
              <span role="status">{d.count ? offset + 1 : 0}–{Math.min(offset + limit, d.count)} of {metric(d.count)} matching events</span>
              <div className="grid-pagination">
                {offset > 0 && <Link className="btn" href={`?${fileQuery(q, { offset: String(Math.max(0, offset - limit)) })}`}>Previous page</Link>}
                {offset + limit < d.count && <Link className="btn" href={`?${fileQuery(q, { offset: String(offset + limit) })}`}>Next page</Link>}
              </div>
            </div>
          </section>
          <details className="panel interpretation">
            <summary>Data interpretation</summary>
            <ul className="config-list">{(d.notes?.length ? d.notes : (d.note ? [d.note] : [])).map((note: string) => <li key={note}>{note}</li>)}</ul>
          </details>
        </>
      )}
    </Shell>
  );
}
