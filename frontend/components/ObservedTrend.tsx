/** Time-scaled observations: no generated points, zero baseline, visible units. */
export default function ObservedTrend({points,unit,label}:{points:{time:string;value:number|null}[];unit:string;label:string}) {
 const valid=points.filter(p=>p.value!=null && Number.isFinite(p.value) && Number.isFinite(Date.parse(p.time)));
 if(!valid.length)return <p className="empty-state">No measured samples in this interval.</p>;
 const min=Math.min(...valid.map(p=>Date.parse(p.time))),maxTime=Math.max(...valid.map(p=>Date.parse(p.time)));
 const max=Math.max(1,...valid.map(p=>p.value!));
 const x=(t:string)=>58+(Date.parse(t)-min)/Math.max(1,maxTime-min)*690;
 const y=(v:number)=>164-v/max*140;
 return <div className="observed-chart"><svg viewBox="0 0 780 205" role="img" aria-label={`${label}, ${unit}, UTC; ${valid.length} observed buckets`}>
 {[0,.5,1].map(f=><g key={f}><line x1="58" x2="748" y1={y(max*f)} y2={y(max*f)} className="grid-line"/><text x="50" y={y(max*f)+4} textAnchor="end">{(max*f).toLocaleString('en-US',{maximumFractionDigits:1})}</text></g>)}
 <text x="58" y="14">{unit}</text>
 <polyline points={valid.map(p=>`${x(p.time)},${y(p.value!)}`).join(' ')} fill="none" stroke="var(--brand)" strokeWidth="2"/>
 {valid.length===1&&<circle cx={x(valid[0].time)} cy={y(valid[0].value!)} r="4" fill="var(--brand)"/>}
 <text x="58" y="190">{new Date(min).toISOString().slice(0,16).replace('T',' ')} UTC</text>
 <text x="748" y="190" textAnchor="end">{new Date(maxTime).toISOString().slice(0,16).replace('T',' ')} UTC</text>
 </svg><p className="chart-caption">{label}. Lines connect observed buckets; gaps do not imply continuous coverage.</p></div>
}
