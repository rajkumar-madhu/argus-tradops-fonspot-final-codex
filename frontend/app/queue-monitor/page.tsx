import { Clock3, Hash, Layers3, Timer } from 'lucide-react';
import Link from 'next/link';
import Shell from '@/components/Shell';
import { PageHead, EmptyState, KpiCard } from '@/components/UI';
import FileAnalyticsControls from '@/components/FileAnalyticsControls';
import ObservedTrend from '@/components/ObservedTrend';
import { apiError, getJSON } from '@/lib/api';
import { fileQuery, instancePrefix, isKnownSegment, metric, queuePrefixes, suggestedSessionDate, type FileQuery } from '@/lib/file-analytics';

export const dynamic = 'force-dynamic';

const stamp = (value?: string) => value?.replace('T', ' ').replace('+00:00', '') || 'No data received';
const one = (value: string | string[] | undefined) => (typeof value === 'string' ? value : '');

function highest(rows: any[], field: string) {
  return rows.reduce((best: any, row: any) => {
    const value = row[field];
    if (value == null || !Number.isFinite(value)) return best;
    if (!best || value > best[field]) return row;
    return best;
  }, null);
}

export default async function Page({ searchParams }: { searchParams: Promise<FileQuery> }) {
  const q = await searchParams;
  const prefix = one(q.prefix);
  const latencySegment = isKnownSegment(prefix) ? prefix : '';
  const [d, latency]: any[] = await Promise.all([
    getJSON(`/api/files/queues?${fileQuery(q, { prefix: '' })}`),
    getJSON(`/api/files/latency?${fileQuery({ start: q.start, end: q.end, segment: latencySegment }, { limit: '1' })}`),
  ]);
  const err = apiError(d);
  const items: any[] = d.items || [];
  const visible = prefix ? items.filter((row) => instancePrefix(String(row.instance || '')) === prefix) : items;
  const stamps = items.flatMap((row) => [...(row.trend || []).map((point: { time?: string }) => point.time), row.last_observed]);
  const peak = highest(visible, 'max_depth');
  const longest = highest(visible, 'longest_episode_seconds');
  const rows = visible.reduce((sum, row) => sum + (Number.isFinite(row.samples) ? row.samples : 0), 0);
  const single = visible.length === 1 ? visible[0] : null;
  const series = visible.filter((row) => row.samples > 0).map((row) => ({
    name: row.instance,
    points: (row.trend || []).map((point: any) => ({ time: point.time, value: point.peak })),
  }));
  const prefixes = queuePrefixes(items.map((row) => String(row.instance || '')));
  const latencyError = apiError(latency);
  const latencyUnit = latency.unit || 'source units';

  return (
    <Shell>
      <PageHead title="Queue monitor" subtitle="Exchange instance backlog · file observations with explicit freshness" badge="FILE-BASED" badgeTone="warn" />
      {err ? <EmptyState title="Queue source unavailable" body={err} /> : (
        <>
          <div className="file-context">
            <span>{d.note}</span>
            <a className="btn" href={`/api/exports/queues?${fileQuery(q, { prefix: '' })}`}>Export CSV</a>
          </div>
          <FileAnalyticsControls key={fileQuery(q)} query={q} mode="queue" suggestedDate={suggestedSessionDate(stamps)} />
          <nav className="prefix-chips" aria-label="Instance prefix">
            <Link href={`?${fileQuery(q, { prefix: '' })}`} aria-current={prefix ? undefined : 'page'}>All</Link>
            {prefixes.map((name) => {
              const count = items.filter((row) => instancePrefix(String(row.instance || '')) === name).reduce((sum, row) => sum + (Number.isFinite(row.samples) ? row.samples : 0), 0);
              return (
                <Link key={name} href={`?${fileQuery(q, { prefix: name })}`} aria-current={prefix === name ? 'page' : undefined}>
                  {name}<small>{metric(count)} rows</small>
                </Link>
              );
            })}
          </nav>
          <section className={`kpi-grid ${single ? 'five' : 'four'}`}>
            <KpiCard icon={<Layers3 size={18} />} tone="teal" label="Highest episode peak" value={metric(peak?.max_depth)} sub={peak ? peak.instance : 'No episode in view'} />
            <KpiCard icon={<Hash size={18} />} tone="teal" label="Rows" value={metric(rows)} sub="Processed messages, not summed depth" />
            <KpiCard icon={<Layers3 size={18} />} tone="teal" label="Instances" value={metric(visible.length)} sub={prefix ? `Prefix ${prefix}` : 'All loaded files'} />
            <KpiCard icon={<Clock3 size={18} />} tone="teal" label="Longest episode (s)" value={metric(longest?.longest_episode_seconds)} sub={longest ? longest.instance : 'No episode in view'} />
            {single && <KpiCard icon={<Timer size={18} />} tone="teal" label="Median episode peak" value={metric(single.median_depth)} sub={single.instance} />}
          </section>
          <section className="panel">
            <div className="panel-head"><b>Peak pending depth</b><span>One line per instance · UTC · depths are not added together</span></div>
            <ObservedTrend label="Peak pending depth by instance" unit="queue entries" series={series} />
          </section>
          {!items.length && <EmptyState title="No matching queue sources" body="Reset the instance filter or inspect the ingestion status." />}
          {!!items.length && !visible.length && <EmptyState title="No instances for this prefix" body="Choose another prefix or clear it to see every loaded file." />}
          <div className="instance-cards">
            {visible.map((row) => (
              <section key={row.file} className="panel">
                <div className="panel-head">
                  <b>{row.instance}</b>
                  <span className={`status ${row.state === 'Ready' ? 'good' : 'warn'}`}>{row.freshness}</span>
                </div>
                {row.samples > 0 ? (
                  <dl className="metric-list">
                    <div><dt>Peak depth</dt><dd>{metric(row.max_depth)}</dd></div>
                    <div><dt>Rows</dt><dd>{metric(row.samples)}</dd></div>
                    <div><dt>Backlog episodes</dt><dd>{metric(row.episodes)}</dd></div>
                    <div><dt>Longest episode (s)</dt><dd>{metric(row.longest_episode_seconds)}</dd></div>
                    <div><dt>Rows/s while busy</dt><dd>{metric(row.rows_per_second)}</dd></div>
                    <div><dt>Possible alias</dt><dd>{row.identical_content_to || '—'}</dd></div>
                    <div><dt>Source state</dt><dd>{row.state}</dd></div>
                    <div><dt>Last event (UTC)</dt><dd>{stamp(row.last_observed)}</dd></div>
                  </dl>
                ) : <p className="instance-empty">No data received</p>}
              </section>
            ))}
          </div>
          <section className="panel">
            <div className="panel-head">
              <b>Mean OMS timing</b>
              <span>{latencySegment ? `${latencySegment} · ` : ''}Same time window · UTC</span>
            </div>
            {latencyError ? <EmptyState title="Latency strip unavailable" body={`${latencyError}. Queue figures above are unchanged.`} /> : (
              <>
                <ObservedTrend label="Mean OMS timing" unit={latencyUnit} points={(latency.trend || []).map((row: any) => ({ time: row.time, value: row.oms }))} />
                <div className="table-scroll">
                  <table className="orders-table">
                    <thead>
                      <tr>
                        <th>Segment</th><th>Events</th><th>OMS p50</th><th>OMS p95</th><th>OMS p99</th><th>OMS max</th><th>Confirmation p50</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(latency.by_segment || []).map((row: any) => (
                        <tr key={row.segment}>
                          <td>{row.segment}</td>
                          <td>{metric(row.count)}</td>
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
                <p className="chart-caption">Percentiles use the latency file for this time window{latencySegment ? ` and ${latencySegment}` : ''}. Unit: {latencyUnit}. {latency.bucket_seconds}-second mean buckets.</p>
              </>
            )}
          </section>
        </>
      )}
    </Shell>
  );
}
