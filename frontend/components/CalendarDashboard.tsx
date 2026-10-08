'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, CalendarDays, Download, Filter, RotateCcw, X } from 'lucide-react';
import { dateLabel, shiftDate, type CalendarData } from '@/lib/calendar';
import { csvCell } from '@/lib/table-filters';
import { sourceDisplayName } from '@/lib/data-source';
import { EmptyState } from '@/components/UI';

const number = (value: number, available: boolean) => available ? value.toLocaleString('en-IN') : '—';
const clock = (value: string) => Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(value)) : '—';

export default function CalendarDashboard({ data }: { data: CalendarData }) {
  const router = useRouter();
  const [pending, transition] = useTransition();
  const [selected, setSelected] = useState(data.selected);
  const [tab, setTab] = useState<'orders' | 'rejected' | 'incidents'>('orders');
  const dialog = useRef<HTMLDialogElement>(null);
  const day = data.days.find(item => item.date === selected);
  useEffect(() => {
    if (day && !dialog.current?.open) dialog.current?.showModal();
    if (!day && dialog.current?.open) dialog.current.close();
  }, [day]);
  const open = (date: string) => { setTab('orders'); setSelected(date); };
  const navigate = (start: string, end: string) => {
    const params = new URLSearchParams({ start, end });
    if (data.exchange) params.set('exchange', data.exchange);
    transition(() => router.push(`/calendar?${params}`));
  };
  const move = (direction: -1 | 1) => {
    const end = shiftDate(data.end, direction * 30);
    const capped = end > data.today ? data.today : end;
    navigate(shiftDate(capped, -29), capped);
  };
  const exportCSV = () => {
    const lines = [['Date (IST)', 'Observed orders', 'Complete', 'Open/pending', 'Rejected', 'Loaded incidents'], ...data.days.map(day => [day.date, ...[day.orders.length, day.complete, day.pending, day.rejected].map(n => data.ordersAvailable ? n : ''), data.incidentsAvailable ? day.incidents.length : ''])];
    const url = URL.createObjectURL(new Blob(['\uFEFF' + lines.map(row => row.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `calendar-${data.start}-${data.end}.csv`; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const records = day ? tab === 'incidents' ? day.incidents : day.orders.filter(row => tab !== 'rejected' || String(row.status).toLowerCase() === 'rejected') : [];
  return <div className="calendar-page">
    <header className="calendar-head"><div><div className="calendar-title"><CalendarDays size={22} /><h1>Operational Calendar</h1></div><p>Order observations and recorded incidents · Asia/Kolkata (IST)</p></div><button type="button" className="btn" onClick={exportCSV} disabled={!data.ordersAvailable && !data.incidentsAvailable}><Download size={15} />Export CSV</button></header>
    <div className="calendar-notice"><b>{sourceDisplayName(data.source)}</b><span>{data.loaded.toLocaleString()} loaded orders{data.total !== null ? ` of ${data.total.toLocaleString()} reported` : ''}. Daily counts use each order’s latest available observation.</span></div>
    {(!data.complete || data.fallback) && <p className="calendar-notice warning">{data.fallback ? 'The live source fell back to a journal file. ' : ''}Coverage may be incomplete. Counts apply to loaded observations; an empty day does not establish zero activity.</p>}
    {data.orderError && <p className="calendar-notice warning">{data.orderError}</p>}
    {data.incidentError && <p className="calendar-notice warning">Incidents unavailable: {data.incidentError}</p>}
    <form className="calendar-toolbar" onSubmit={event => {
      event.preventDefault(); const form = new FormData(event.currentTarget); const params = new URLSearchParams();
      for (const [key, value] of form) if (value) params.set(key, String(value));
      transition(() => router.push(`/calendar?${params}`));
    }}>
      <span className="calendar-filter-label"><Filter size={15} />Filters</span>
      <label>Exchange<select name="exchange" defaultValue={data.exchange}><option value="">All exchanges</option>{data.exchanges.map(exchange => <option key={exchange}>{exchange}</option>)}</select></label>
      <label>From<input type="date" name="start" defaultValue={data.start} max={data.today} required /></label>
      <label>To<input type="date" name="end" defaultValue={data.end} max={data.today} required /></label>
      <button className="btn primary" disabled={pending}>{pending ? 'Loading…' : 'Apply filters'}</button><Link className="btn" href="/calendar" aria-label="Reset calendar filters"><RotateCcw size={16} /></Link>
    </form>
    <section className="calendar-panel panel" aria-busy={pending}>
      <div className="calendar-range-head"><button type="button" className="btn" aria-label="Previous 30 days" onClick={() => move(-1)} disabled={pending}><ArrowLeft size={16} /></button><div><b>{dateLabel(data.start, { day: 'numeric', month: 'short' })} – {dateLabel(data.end, { day: 'numeric', month: 'short', year: 'numeric' })}</b><span>Customer trading timezone: Asia/Kolkata</span></div><button type="button" className="btn" aria-label="Next 30 days" onClick={() => move(1)} disabled={pending || data.end >= data.today}><ArrowRight size={16} /></button></div>
      <div className="calendar-weekdays" aria-hidden="true">{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(name => <span key={name}>{name}</span>)}</div>
      <div className="calendar-grid">
        {Array.from({ length: new Date(`${data.start}T12:00:00Z`).getUTCDay() }, (_, i) => <span className="calendar-spacer" key={i} aria-hidden="true" />)}
        {data.days.map(day => <button type="button" key={day.date} className={`calendar-day${day.date === data.today ? ' today' : ''}${day.date === selected ? ' selected' : ''}`} onClick={() => open(day.date)} aria-label={`Open ${day.date} details`}>
          <span className="calendar-day-date"><b>{dateLabel(day.date, { day: 'numeric' })}</b><small>{dateLabel(day.date, { month: 'short' })}</small>{day.date === data.today && <em>Today</em>}</span>
          <span className="calendar-day-total"><b>{number(day.orders.length, data.ordersAvailable)}</b> orders</span>
          <span className="calendar-metrics"><span>{number(day.complete, data.ordersAvailable)} complete</span><span>{number(day.incidents.length, data.incidentsAvailable)} incidents</span></span>
          <span className="calendar-day-status"><span>{number(day.pending, data.ordersAvailable)} open / pending</span><span>{number(day.rejected, data.ordersAvailable)} rejected</span></span>
        </button>)}
      </div>
      <p className="calendar-footnote">Dates reflect the latest observed order state, not a full order-event history. Live orders are limited to the API’s last 30 days; file observations retain their recorded dates. Incidents include up to {data.incidentLimit} loaded records, by first-seen date, across all exchanges. {data.undated > 0 && `${data.undated} records without an unambiguous timestamp are excluded.`}</p>
    </section>
    <dialog className="calendar-detail" ref={dialog} onClose={() => setSelected('')} onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }} aria-labelledby="calendar-detail-title">
      {day && <div className="calendar-detail-content"><header><div><small>{dateLabel(day.date, { weekday: 'long' })} · IST</small><h2 id="calendar-detail-title">{dateLabel(day.date, { day: 'numeric', month: 'long', year: 'numeric' })}</h2></div><button type="button" className="btn" onClick={() => dialog.current?.close()} aria-label="Close day details"><X size={18} /></button></header>
        <div className="calendar-detail-totals"><div>Orders<b>{number(day.orders.length, data.ordersAvailable)}</b></div><div>Complete<b>{number(day.complete, data.ordersAvailable)}</b></div><div>Open / pending<b>{number(day.pending, data.ordersAvailable)}</b></div><div>Rejected<b>{number(day.rejected, data.ordersAvailable)}</b></div></div>
        <div className="calendar-detail-tabs" role="group" aria-label="Day records">{(['orders', 'rejected', 'incidents'] as const).map(name => <button className="btn" type="button" key={name} aria-pressed={tab === name} onClick={() => setTab(name)}>{name === 'orders' ? 'Orders' : name === 'rejected' ? 'Rejections' : 'Incidents'}</button>)}</div>
        {records.length ? <div className="table-scroll"><table><thead><tr><th>Time (IST)</th><th>{tab === 'incidents' ? 'Incident' : 'Order'}</th><th>{tab === 'incidents' ? 'Severity' : 'Symbol'}</th><th>Status</th></tr></thead><tbody>{records.map((row, index) => <tr key={String(row.order_id || row.id || index)}><td>{clock(tab === 'incidents' ? row.first_seen : row.time)}</td><td>{tab === 'incidents' ? <Link href="/incidents">{row.title || row.type || 'View incident'}</Link> : <Link href={`/orders/${encodeURIComponent(row.order_id)}`}>{row.order_id}</Link>}</td><td>{tab === 'incidents' ? row.severity : row.symbol}</td><td>{row.status || '—'}</td></tr>)}</tbody></table></div> : <EmptyState title="No loaded records for this day" body="This view is limited to the observations available to your account and current filters." />}
      </div>}
    </dialog>
  </div>;
}
