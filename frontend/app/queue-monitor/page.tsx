import Shell from '@/components/Shell';
import {PageHead,EmptyState,KpiCard} from '@/components/UI';
import FileAnalyticsControls from '@/components/FileAnalyticsControls';
import LatencyTrend from '@/components/LatencyTrend';
import LatencySessionControls from '@/components/LatencySessionControls';
import {sessionQuery} from '@/lib/latency-dashboard';
import {queueOverlay} from '@/lib/queue-dashboard';
import {Layers} from 'lucide-react';
import {apiError,getJSON} from '@/lib/api';
import {fileQuery,metric,type FileQuery} from '@/lib/file-analytics';
export const dynamic='force-dynamic';
export default async function Page({searchParams}:{searchParams:Promise<FileQuery>}){
 let q=await searchParams;let d:any=await getJSON(`/api/files/queues?${fileQuery(q)}`);
 if(!apiError(d)&&!q.start&&!q.end&&d.trade_dates?.[0]){q=Object.fromEntries(new URLSearchParams(sessionQuery(q,d.trade_dates[0],'00:00','23:59')));d=await getJSON(`/api/files/queues?${fileQuery(q)}`);}
 const latencyQuery={start:q.start,end:q.end};
 const latency:any=await getJSON(`/api/files/latency?${fileQuery(latencyQuery)}`),latencyError=apiError(latency),unit=latency.unit||'source units';
 const err=apiError(d),overlay=queueOverlay(d.items||[]),sources=d.items||[];
 const peaks=sources.map((r:any)=>r.peak).filter((n:any)=>typeof n==='number'),durations=sources.map((r:any)=>r.longest_episode_seconds).filter((n:any)=>typeof n==='number');
 return <Shell><PageHead title="Queue monitor" subtitle="Exchange instance backlog · imported observations with explicit batch dates" badge="FILE-BASED" badgeTone="warn"/>
 {err?<EmptyState title="Queue source unavailable" body={err}/>:<><LatencySessionControls key={`session-${fileQuery(q)}`} query={q} dates={d.trade_dates||[]} path="/queue-monitor"/><FileAnalyticsControls key={fileQuery(q)} query={q} mode="queue"/>
 <p className="file-context">{d.note} <a className="btn" href={`/api/exports/queues?${fileQuery(q)}`}>Export matching observations</a></p>
 <section className="kpi-grid four"><KpiCard icon={<Layers size={18}/>} label="Peak observed depth" value={metric(peaks.length?Math.max(...peaks):null)} sub="Maximum, never summed across lines"/><KpiCard icon={<Layers size={18}/>} label="Source observations" value={metric(d.count)} sub="May include disclosed aliases"/><KpiCard icon={<Layers size={18}/>} label="Longest backlog (s)" value={metric(durations.length?Math.max(...durations):null)} sub="From first pending to empty"/><KpiCard icon={<Layers size={18}/>} label="Reporting instances" value={metric(sources.filter((r:any)=>r.samples>0).length)} sub={`${sources.length} source records in scope`}/></section>
 <section className="panel"><div className="panel-head"><b>Queue depth across instances</b><span>Separate series · depths are not added</span></div><LatencyTrend label="Queue depth by instance" unit="pending entries" series={overlay.series} points={overlay.points as any[]}/></section>
 <section className="panel"><div className="panel-head"><b>Instance health</b><span>Queue size in entries · event time in UTC</span></div><div className="table-scroll" tabIndex={0} aria-label="Queue instance health"><table className="orders-table"><thead><tr>{['Instance','Source state','Rows','Backlog episodes','Peak depth','Longest episode (s)','Rows/s while busy','Possible alias','Freshness','Last event (UTC)'].map(x=><th key={x}>{x}</th>)}</tr></thead><tbody>{(d.items||[]).map((r:any)=><tr key={r.file}><td><b>{r.instance}</b></td><td><span className={`status ${r.state==='Ready'?'good':'warn'}`}>{r.state}</span></td><td>{metric(r.samples)}</td><td>{metric(r.episodes)}</td><td>{metric(r.max_depth)}</td><td>{metric(r.longest_episode_seconds)}</td><td>{metric(r.rows_per_second)}</td><td>{r.identical_content_to || '—'}</td><td>{r.freshness}</td><td>{r.last_observed?.replace('T',' ').replace('+00:00','')||'No data received'}</td></tr>)}</tbody></table></div></section>
 {!d.items?.length&&<EmptyState title="No matching queue sources" body="Reset the instance filter or inspect the ingestion status."/>}
 <div className="queue-trends">{(d.items||[]).filter((r:any)=>r.samples>0).map((r:any)=><section key={r.file} className="panel"><div className="panel-head"><b>{r.instance} backlog</b><span>Peak pending depth per {r.bucket_seconds} seconds</span></div><LatencyTrend unit="pending entries" label={`${r.instance} backlog`} series={[{key:"peak",label:r.instance,color:"var(--signal)"}]} points={r.trend||[]}/></section>)}</div>
 {latencyError?<EmptyState title="Related latency source unavailable" body={latencyError}/>:<>
 <section className="kpi-grid four"><KpiCard icon={<Layers size={18}/>} label={`OMS p50 (${unit})`} value={metric(latency.summary?.oms?.p50)} sub="Same trading session"/><KpiCard icon={<Layers size={18}/>} label={`OMS mean (${unit})`} value={metric(latency.summary?.oms?.mean)} sub="Same trading session"/><KpiCard icon={<Layers size={18}/>} label="Latency events" value={metric(latency.count)} sub="All exchange segments"/><KpiCard icon={<Layers size={18}/>} label="Unique orders" value={metric(latency.unique_orders)} sub="Recorded order identities"/></section>
 <section className="panel"><div className="panel-head"><b>Order latency · OMS and exchange confirmation</b><span>Same session · no order-to-queue correlation inferred</span></div><LatencyTrend label="Related order latency" unit={unit} series={[{key:'p50',label:'OMS p50',color:'var(--signal)'},{key:'mean',label:'OMS mean',color:'var(--ink)'},{key:'max',label:'OMS maximum',color:'var(--red)'},{key:'confirmation',label:'Confirmation mean',color:'var(--amber-ink)'}]} points={(latency.trend||[]).map((r:any)=>({time:r.time,p50:r.oms_stats?.p50,mean:r.oms,max:r.oms_stats?.max,confirmation:r.confirmation}))}/></section>
 <section className="panel"><div className="panel-head"><b>Latency breakdown by segment</b><span>All segments in selected trading session · {unit}</span></div><div className="table-scroll" tabIndex={0} aria-label="Queue session latency breakdown"><table className="orders-table"><thead><tr><th>Segment</th><th>Events</th>{['p50','mean','p95','p99','max'].map(k=><th key={k}>OMS {k} ({unit})</th>)}<th>Confirmation p50 ({unit})</th></tr></thead><tbody>{(latency.by_segment||[]).map((r:any)=><tr key={r.segment}><td>{r.segment}</td><td>{metric(r.count)}</td>{['p50','mean','p95','p99','max'].map(k=><td key={k}>{metric(r.oms?.[k])}</td>)}<td>{metric(r.confirmation?.p50)}</td></tr>)}</tbody></table></div></section>
 </>}
 </>}</Shell>;
}
