'use client';
import { useState } from 'react';
import { metric } from '@/lib/file-analytics';
type Series = { key: string; label: string; color: string };
export default function LatencyTrend({ points, series, unit, label, variant = 'line' }: { points: { time: string; [key: string]: any }[]; series: Series[]; unit: string; label: string; variant?: 'line' | 'bar' }) {
  const [hidden, setHidden] = useState<string[]>([]), [selected, setSelected] = useState<number | null>(null);
  const shown = series.filter(s => !hidden.includes(s.key));
  const rows = points.filter(p => Number.isFinite(Date.parse(p.time)));
  const values = rows.flatMap(p => shown.map(s => p[s.key]).filter(v => typeof v === 'number' && Number.isFinite(v)));
  const min = rows.length ? Date.parse(rows[0].time) : 0, last = rows.length ? Date.parse(rows[rows.length - 1].time) : min;
  const max = Math.max(1, ...values) * 1.08, x = (p: typeof rows[number]) => 64 + (Date.parse(p.time) - min) / Math.max(1, last - min) * 678;
  const y = (v: number) => 250 - v / max * 220;
  const active = selected !== null && rows[selected] ? selected : null;
  const tickCount = Math.min(5, rows.length);
  const ticks = Array.from({length:tickCount},(_,i)=>Math.round(i*(rows.length-1)/Math.max(1,tickCount-1)));
  const barWidth = Math.max(1,Math.min(28,600/Math.max(1,rows.length*shown.length)));
  const clock = (t: string) => new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(t));
  return <div className="latency-trend">
    <div className="latency-legend">{series.map(s => <button className="btn" key={s.key} aria-pressed={!hidden.includes(s.key)} onClick={() => setHidden(h => h.includes(s.key) ? h.filter(k => k !== s.key) : [...h, s.key])}><i style={{ background: s.color }} />{s.label}</button>)}</div>
    {!values.length ? <p className="empty-state">{shown.length ? 'No measured samples in this interval.' : 'Select a series to display.'}</p> : <>
    <svg viewBox="0 0 780 296" role="img" tabIndex={0} onFocus={() => { if(rows.length)setSelected(0); }} onBlur={() => setSelected(null)} onKeyDown={e => { if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();setSelected(i=>Math.max(0,Math.min(rows.length-1,(i??0)+(e.key==='ArrowRight'?1:-1))));} }} aria-label={`${label}, ${unit}; ${rows.length} observed buckets. Series can be toggled above.`} onPointerMove={e => { const box = e.currentTarget.getBoundingClientRect(), vx = (e.clientX - box.left) / box.width * 780; let nearest = 0; rows.forEach((p, i) => { if (Math.abs(x(p) - vx) < Math.abs(x(rows[nearest]) - vx)) nearest = i; }); setSelected(nearest); }} onPointerLeave={() => setSelected(null)}>
      {[0, .25, .5, .75, 1].map(f => <g key={f}><line className="grid-line" x1="64" x2="742" y1={y(max * f)} y2={y(max * f)} /><text x="56" y={y(max * f) + 4} textAnchor="end">{metric(max * f)}</text></g>)}
      <text x="64" y="16">{unit}</text>
      {ticks.map(i=><g key={i}><line className="grid-line" x1={x(rows[i])} x2={x(rows[i])} y1="30" y2="250"/><text x={x(rows[i])} y="278" textAnchor={i===0?'start':i===rows.length-1?'end':'middle'}>{clock(rows[i].time)}</text></g>)}
      <text x="742" y="16" textAnchor="end">IST</text>
      {shown.map((s,si) => { let path = '', connected = false; rows.forEach(p => { const v = p[s.key]; if (typeof v !== 'number' || !Number.isFinite(v)) { connected = false; return; } path += `${connected ? 'L' : 'M'}${x(p)},${y(v)} `; connected = true; }); return <g key={s.key}>
        {variant==='bar'?rows.map((p,i)=>typeof p[s.key]==='number'&&Number.isFinite(p[s.key])?<rect key={i} x={x(p)-barWidth*shown.length/2+si*barWidth} y={y(p[s.key])} width={barWidth*.8} height={Math.max(0,250-y(p[s.key]))} rx="1" fill={s.color} opacity={active===null||active===i?1:.45}/>:null):<path d={path} fill="none" stroke={s.color} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round"/>}
        {rows.length<=60&&variant==='line'&&rows.map((p,i)=>typeof p[s.key]==='number'&&Number.isFinite(p[s.key])?<circle key={i} cx={x(p)} cy={y(p[s.key])} r={active===i?4:2} fill={s.color}/>:null)}
      </g>; })}
      {active !== null && <line x1={x(rows[active])} x2={x(rows[active])} y1="25" y2="250" stroke="var(--muted)" strokeDasharray="4 4" />}

    </svg>
    <div className="latency-chart-readout" aria-live="polite">{active!==null?<><b>{clock(rows[active].time)} IST</b>{shown.map(s=><span key={s.key}><i style={{background:s.color}}/>{s.label} <strong>{metric(rows[active][s.key],unit)}</strong></span>)}</>:<span>Hover over the graph or focus it and use the arrow keys to inspect values.</span>}</div>
    </>}
    <details><summary>View chart data</summary><div className="table-scroll"><table className="orders-table"><thead><tr><th>Time (IST)</th>{shown.map(s => <th key={s.key}>{s.label} ({unit})</th>)}</tr></thead><tbody>{rows.map(p => <tr key={p.time}><td>{clock(p.time)}</td>{shown.map(s => <td key={s.key}>{metric(p[s.key])}</td>)}</tr>)}</tbody></table></div></details>
    <p className="chart-caption">{variant==='bar'?'Each bar represents an observed time bucket. Missing buckets are not zero.':'Observed buckets only. Lines connect available samples; gaps do not establish continuous coverage.'}</p>
  </div>;
}
