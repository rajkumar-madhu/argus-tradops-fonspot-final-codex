'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { istParts, sessionQuery, SESSION_PRESETS } from '@/lib/latency-dashboard';
import type { FileQuery } from '@/lib/file-analytics';
export default function LatencySessionControls({ query, dates, path = '/order-latency' }: { query: FileQuery; dates: string[]; path?: '/order-latency' | '/queue-monitor' }) {
  const router = useRouter(), [pending, transition] = useTransition();
  const a = istParts(query.start), b = istParts(query.end);
  const [date, setDate] = useState(a?.date || dates[0] || '');
  const [start, setStart] = useState(a?.time || '00:00'), [end, setEnd] = useState(b?.time || '23:59');
  const [error, setError] = useState('');
  const apply = (from = start, to = end) => {
    try { const next = sessionQuery(query, date, from, to); setError(''); transition(() => router.push(`${path}?${next}`)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Invalid range'); }
  };
  return <section className="panel latency-session"><div className="panel-head"><b>Trading session</b><span>Asia/Kolkata · applies to every chart and export</span></div>
    <form onSubmit={e => { e.preventDefault(); apply(); }} className="latency-session-form">
      <label>Trade date<input type="date" required value={date} onChange={e => setDate(e.target.value)} list="latency-dates" /></label>
      <datalist id="latency-dates">{dates.map(d => <option key={d} value={d} />)}</datalist>
      <label>From (IST)<input type="time" required value={start} onChange={e => setStart(e.target.value)} /></label>
      <label>To (IST)<input type="time" required value={end} onChange={e => setEnd(e.target.value)} /></label>
      <button className="primary-btn" disabled={pending || !date}>Apply session</button>
    </form>
    <div className="latency-presets">{SESSION_PRESETS.map(p => <button key={p.name} className="btn" aria-pressed={start === p.start && end === p.end && a?.time === start && b?.time === end} disabled={pending || !date} onClick={() => { setStart(p.start); setEnd(p.end); apply(p.start, p.end); }}>{p.name}<small>{p.start}–{p.end} IST</small></button>)}</div>
    {error && <p role="alert">{error}</p>}
  </section>;
}
