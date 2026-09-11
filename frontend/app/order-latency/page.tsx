import {Timer} from 'lucide-react';
import Link from 'next/link';
import Shell from '@/components/Shell';
import JournalLatencyPage from '@/components/JournalLatencyPage';
import FileAnalyticsControls from '@/components/FileAnalyticsControls';
import ObservedTrend from '@/components/ObservedTrend';
import StageTiming from '@/components/StageTiming';
import {PageHead,EmptyState,KpiCard} from '@/components/UI';
import {getJSON,apiError} from '@/lib/api';
import {fileQuery,metric,type FileQuery} from '@/lib/file-analytics';
export const dynamic='force-dynamic';
export default async function Page({searchParams}:{searchParams:Promise<FileQuery>}) {
 const q=await searchParams;const d:any=await getJSON(`/api/files/latency?${fileQuery(q)}`);
 // The legacy journal view remains available when CSV analytics is unconfigured.
 if(d._status===503){const config:any=await getJSON('/api/config');if(config.csv_configured===false)return <JournalLatencyPage/>;}
 const error=apiError(d),s=d.summary||{},limit=Number(q.limit||50),offset=Number(q.offset||0),unit=d.unit||'source units';
 return <Shell><PageHead title="OMS latency analytics" subtitle="Processing and exchange confirmation observations · historical file snapshot" badge="FILE-BASED" badgeTone="warn"/>
 {error?<EmptyState title="Unable to load latency analytics" body={`${error}. Retry when the source service is available.`}/>:<>
 <div className="file-context"><span><b>{metric(d.count)}</b> matching events · <b>{metric(d.unique_orders)}</b> unique orders</span><Link href="/data-quality">Source health & ingestion →</Link></div>
 <FileAnalyticsControls key={fileQuery(q)} query={q} facets={{segments:d.choices?.segment||[],statuses:d.facets?.statuses||[]}}/>
 <section className="kpi-grid four">{[50,90,95,99].map(p=><KpiCard icon={<Timer size={18}/>} key={p} label={`OMS p${p} (${unit})`} value={metric(s.oms?.[`p${p}`])} sub={`${metric(s.oms?.samples)} valid samples`} tone="blue"/>)}</section>
 <section className="panel"><div className="panel-head"><b>Latency distribution</b><span>Same filters as the event table and export</span></div><div className="table-scroll" tabIndex={0} aria-label="Latency percentile comparison"><table className="orders-table"><thead><tr><th>Measurement ({unit})</th><th>Valid samples</th>{['p50','p90','p95','p99','max'].map(p=><th key={p}>{p}</th>)}</tr></thead><tbody>{[['oms','OMS processing'],['confirmation','Reported exchange confirmation']].map(([key,name])=><tr key={key}><td>{name}</td><td>{metric(s[key]?.samples)}</td>{['p50','p90','p95','p99','max'].map(p=><td key={p}>{metric(s[key]?.[p])}</td>)}</tr>)}</tbody></table></div></section>
 <section className="panel"><div className="panel-head"><b>Mean OMS timing over time</b><span>{d.bucket_seconds}-second event buckets · UTC</span></div><ObservedTrend label="Mean OMS timing" unit={unit} points={(d.trend||[]).map((r:any)=>({time:r.time,value:r.oms}))}/></section>
 <section className="panel"><div className="panel-head"><b>Segment comparison</b><span>Filtered observations</span></div><div className="table-scroll"><table className="orders-table"><thead><tr><th>Segment</th><th>Events</th><th>Valid samples</th><th>p50 ({unit})</th><th>p95 ({unit})</th><th>Maximum ({unit})</th></tr></thead><tbody>{(d.by_segment||[]).map((r:any)=><tr key={r.segment}><td>{r.segment}</td><td>{metric(r.count)}</td><td>{metric(r.oms?.samples)}</td><td>{metric(r.oms?.p50)}</td><td>{metric(r.oms?.p95)}</td><td>{metric(r.oms?.max)}</td></tr>)}</tbody></table></div></section>
 <StageTiming query={q}/>
 <section className="panel"><div className="panel-head"><b>Event evidence</b><a className="btn" href={`/api/exports/latency?${fileQuery(q,{limit:'',offset:''})}`}>Export all matching rows</a></div>
 <div className="table-scroll" tabIndex={0} aria-label="Scrollable latency events"><table className="orders-table"><thead><tr><th>Order</th><th>Segment</th><th>Event time (UTC)</th><th>OMS ({unit})</th><th>Confirmation ({unit})</th><th>OMS status</th><th>Source file</th></tr></thead><tbody>{(d.items||[]).map((r:any)=><tr key={`${r.file}:${r.fingerprint}`}><td><Link href={`/orders?order=${encodeURIComponent(r.order_id)}`}>{r.order_id}</Link></td><td>{r.segment}</td><td>{r.event_time?.replace('T',' ').replace('+00:00','')}</td><td>{metric(r.oms)}</td><td>{metric(r.confirmation)}</td><td>{r.oms_status??'Not supplied'}</td><td>{r.file}</td></tr>)}</tbody></table></div>
 {!d.count&&<EmptyState title="No matching events" body="Widen the time range or reset your filters."/>}
 <div className="table-foot"><span role="status">{d.count?offset+1:0}–{Math.min(offset+limit,d.count)} of {metric(d.count)} matching events</span><div className="grid-pagination">{offset>0&&<Link className="btn" href={`?${fileQuery(q,{offset:String(Math.max(0,offset-limit))})}`}>Previous page</Link>}{offset+limit<d.count&&<Link className="btn" href={`?${fileQuery(q,{offset:String(offset+limit)})}`}>Next page</Link>}</div></div></section>
 <section className="panel"><div className="panel-head"><b>Data interpretation</b></div><ul className="config-list">{(d.notes?.length?d.notes:(d.note?[d.note]:[])).map((n:string)=><li key={n}>{n}</li>)}</ul></section>
 </>}</Shell>;
}
