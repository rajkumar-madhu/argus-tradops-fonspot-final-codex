import {Timer} from 'lucide-react';
import Shell from '@/components/Shell';
import {PageHead,EmptyState,KpiCard,DataTable} from '@/components/UI';
import {apiError,getJSON} from '@/lib/api';
import {metric} from '@/lib/file-analytics';
export const dynamic='force-dynamic';
export default async function Page(){
 const d:any=await getJSON('/api/files/sources'),err=apiError(d),rows:any[]=d.items||[];
 const sum=(key:string)=>rows.reduce((n,r)=>n+Number(r[key]||0),0);
 return <Shell><PageHead title="Data quality & ingestion" subtitle="Source inventory, validation outcomes and row reconciliation" badge="FILE-BASED" badgeTone="warn"/>
 {err?<EmptyState title="File ingestion unavailable" body={err}/>:<>
 <section className="kpi-grid four"><KpiCard icon={<Timer size={18}/>} label="Discovered sources" value={metric(rows.length)} sub={`${rows.filter(r=>r.state==='No data received').length} empty files`} tone="blue"/><KpiCard icon={<Timer size={18}/>} label="Processed rows" value={metric(sum('processed_rows'))} sub="Across distinct source instances" tone="purple"/><KpiCard icon={<Timer size={18}/>} label="Accepted events" value={metric(sum('accepted_rows'))} sub="After exact-row deduplication" tone="teal"/><KpiCard icon={<Timer size={18}/>} label="Rejected rows" value={metric(sum('rejected_rows'))} sub={`${metric(sum('duplicate_rows'))} duplicate rows excluded`} tone="red"/></section>
 <p className="file-context">Processed rows = accepted + rejected + duplicates. Invalid/missing values are field counts encountered during row validation. Validation success does not imply live source freshness.</p>
 <section className="panel"><div className="panel-head"><b>Source files</b><span>Original source files remain read-only</span></div><DataTable rows={rows} rowKey={r=>r.name} columns={[{key:'name',label:'Source file'},{key:'instance',label:'Instance'},{key:'state',label:'Validation state'},{key:'bytes',label:'Bytes'},{key:'processed_rows',label:'Processed'},{key:'accepted_rows',label:'Accepted'},{key:'rejected_rows',label:'Rejected'},{key:'duplicate_rows',label:'Duplicates'},{key:'invalid_values',label:'Malformed values'},{key:'missing_values',label:'Missing values'},{key:'duration_seconds',label:'Import (s)'},{key:'timestamp_mismatches',label:'Timestamp mismatches'}]}/></section>
 <section className="panel"><div className="panel-head"><b>Import contract</b></div><ul className="config-list"><li>Files are ingested at API startup or by the explicit ingestion command. Requests read the derived cache.</li><li>Latency unit: {d.unit}. The included feed has no status columns, broker, trader, account or client dimensions.</li><li>Journal_Converted.xlsx is not a valid ZIP workbook. The application uses the original journal and CSV files instead.</li><li>Matching hashes across differently named queue instances do not establish that those instances are interchangeable.</li></ul></section>
 </>}</Shell>;
}
