'use client';
import Link from 'next/link';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { fileQuery, type FileQuery } from '@/lib/file-analytics';
export default function FileAnalyticsControls({query,facets,mode='latency'}:{query:FileQuery;facets?:{segments:string[];statuses:string[]};mode?:'latency'|'queue'}) {
 const router=useRouter();const [pending,startTransition]=useTransition();
 const base=mode==='latency'?'/order-latency':'/queue-monitor';
 return <form className="grid-filters file-filters" onChange={event=>{
  const endInput=event.currentTarget.elements.namedItem('end') as HTMLInputElement;
  endInput?.setCustomValidity('');
 }} onSubmit={event=>{
  event.preventDefault();const data=new FormData(event.currentTarget);const next:Record<string,string>={};
  for(const [key,value] of data.entries()) if(value) next[key]=String(value);
  for(const key of ['start','end']) if(next[key]) next[key]+='Z';
  const endInput=event.currentTarget.elements.namedItem('end') as HTMLInputElement;
  endInput.setCustomValidity(next.start && next.end && next.start>next.end ? 'To must be after From.' : '');
  if(!event.currentTarget.reportValidity()) return;
  startTransition(()=>router.push(`${base}?${fileQuery(next)}`));
 }}>
 {mode==='latency'?<>
 <label>Order ID contains<input name="q" type="search" defaultValue={String(query.q||'')} maxLength={128} placeholder="Search source order ID"/></label>
 <label>Segment<select name="segment" defaultValue={String(query.segment||'')}><option value="">All segments</option>{facets?.segments.map(s=><option key={s}>{s}</option>)}</select></label>
 <label>OMS status<select name="status" defaultValue={String(query.status||'')} disabled={!facets?.statuses.length}><option value="">{facets?.statuses.length?'All statuses':'Not supplied by this feed'}</option>{facets?.statuses.map(s=><option key={s}>{s}</option>)}</select></label>
 </>:<label>Source instance<input name="instance" defaultValue={String(query.instance||'')} placeholder="e.g. NSE-2729" maxLength={128}/></label>}
 <label>From (UTC)<input type="datetime-local" name="start" defaultValue={String(query.start||'').replace(/Z$/,'')}/></label>
 <label>To (UTC)<input type="datetime-local" name="end" onChange={event=>event.currentTarget.setCustomValidity('')} defaultValue={String(query.end||'').replace(/Z$/,'')}/></label>
 {mode==='latency'&&<><label>Sort<select name="sort" defaultValue={String(query.sort||'time')}><option value="time">Event time</option><option value="oms">OMS latency</option><option value="confirmation">Confirmation timing</option><option value="order_id">Order ID</option></select></label><label>Direction<select name="direction" defaultValue={String(query.direction||'desc')}><option value="desc">Descending</option><option value="asc">Ascending</option></select></label><label>Rows<select name="limit" defaultValue={String(query.limit||'50')}>{[25,50,100,250].map(n=><option key={n}>{n}</option>)}</select></label></>}
 <button type="submit" className="primary-btn" disabled={pending}>{pending?'Loading…':'Apply filters'}</button><Link className="btn" href={base}>Reset filters</Link>
 </form>
}
