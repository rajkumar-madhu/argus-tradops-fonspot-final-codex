import Shell from '@/components/Shell';
import {PageHead,EmptyState} from '@/components/UI';
import FileAnalyticsControls from '@/components/FileAnalyticsControls';
import ObservedTrend from '@/components/ObservedTrend';
import {apiError,getJSON} from '@/lib/api';
import {fileQuery,metric,type FileQuery} from '@/lib/file-analytics';
export const dynamic='force-dynamic';
export default async function Page({searchParams}:{searchParams:Promise<FileQuery>}){
 const q=await searchParams;const d:any=await getJSON(`/api/files/queues?${fileQuery(q)}`);const err=apiError(d);
 return <Shell><PageHead title="Queue monitor" subtitle="Exchange instance backlog · file observations with explicit freshness" badge="FILE-BASED" badgeTone="warn"/>
 {err?<EmptyState title="Queue source unavailable" body={err}/>:<><FileAnalyticsControls key={fileQuery(q)} query={q} mode="queue"/>
 <p className="file-context">{d.note} Samples strictly above each filtered source’s p99 are statistical anomalies, not configured incident alerts. <a className="btn" href={`/api/exports/queues?${fileQuery(q)}`}>Export matching observations</a></p>
 <section className="panel"><div className="panel-head"><b>Instance health</b><span>Queue size in entries · event time in UTC</span></div><div className="table-scroll" tabIndex={0} aria-label="Queue instance health"><table className="orders-table"><thead><tr>{['Instance','Source state','Samples','Latest (entries)','Peak (entries)','Above source p99','Possible alias','Freshness','Last event (UTC)'].map(x=><th key={x}>{x}</th>)}</tr></thead><tbody>{(d.items||[]).map((r:any)=><tr key={r.file}><td><b>{r.instance}</b></td><td><span className={`status ${r.state==='Ready'?'good':'warn'}`}>{r.state}</span></td><td>{metric(r.samples)}</td><td>{metric(r.latest)}</td><td>{metric(r.peak)}</td><td title={r.anomaly_rule}>{metric(r.anomalies)}</td><td>{r.identical_content_to || '—'}</td><td>{r.freshness}</td><td>{r.last_observed?.replace('T',' ').replace('+00:00','')||'No data received'}</td></tr>)}</tbody></table></div></section>
 {!d.items?.length&&<EmptyState title="No matching queue sources" body="Reset the instance filter or inspect the ingestion status."/>}
 <div className="queue-trends">{(d.items||[]).filter((r:any)=>r.samples>0).map((r:any)=><section key={r.file} className="panel"><div className="panel-head"><b>{r.instance} backlog</b><span>Peak per {r.bucket_seconds} seconds</span></div><ObservedTrend unit="queue entries" label={`${r.instance} backlog`} points={(r.trend||[]).map((p:any)=>({time:p.time,value:p.peak}))}/></section>)}</div>
 </>}</Shell>;
}
