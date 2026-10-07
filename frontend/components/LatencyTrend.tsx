'use client';
import { useState } from 'react';
import { metric } from '@/lib/file-analytics';
type Series = { key: string; label: string; color: string };
export default function LatencyTrend({ points, series, unit, label }: { points: { time: string; [key: string]: any }[]; series: Series[]; unit: string; label: string }) {
  const [hidden, setHidden] = useState<string[]>([]), [selected, setSelected] = useState<number | null>(null);
  const shown = series.filter(s => !hidden.includes(s.key));
  const rows = points.filter(p => Number.isFinite(Date.parse(p.time)));
  const values = rows.flatMap(p => shown.map(s => p[s.key]).filter(v => typeof v === 'number' && Number.isFinite(v)));
  const min = rows.length ? Date.parse(rows[0].time) : 0, last = rows.length ? Date.parse(rows[rows.length - 1].time) : min;
  const max = Math.max(1, ...values), x = (p: typeof rows[number]) => 64 + (Date.parse(p.time) - min) / Math.max(1, last - min) * 678;
  const y = (v: number) => 170 - v / max * 140;
  const clock = (t: string) => new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(t));
  return <div className="latency-trend">
    <div className="latency-legend">{series.map(s => <button className="btn" key={s.key} aria-pressed={!hidden.includes(s.key)} onClick={() => setHidden(h => h.includes(s.key) ? h.filter(k => k !== s.key) : [...h, s.key])}><i style={{ background: s.color }} />{s.label}</button>)}</div>
    {!values.length ? <p className="empty-state">{shown.length ? 'No measured samples in this interval.' : 'Select a series to display.'}</p> : <>
    <svg viewBox="0 0 780 212" role="img" aria-label={`${label}, ${unit}; ${rows.length} observed buckets. Series can be toggled above.`} onPointerMove={e => { const box = e.currentTarget.getBoundingClientRect(), vx = (e.clientX - box.left) / box.width * 780; let nearest = 0; rows.forEach((p, i) => { if (Math.abs(x(p) - vx) < Math.abs(x(rows[nearest]) - vx)) nearest = i; }); setSelected(nearest); }} onPointerLeave={() => setSelected(null)}>
      {[0, .5, 1].map(f => <g key={f}><line className="grid-line" x1="64" x2="742" y1={y(max * f)} y2={y(max * f)} /><text x="56" y={y(max * f) + 4} textAnchor="end">{metric(max * f)}</text></g>)}
      <text x="64" y="16">{unit}</text>
      {shown.map(s => { let path = '', connected = false; rows.forEach(p => { const v = p[s.key]; if (typeof v !== 'number' || !Number.isFinite(v)) { connected = false; return; } path += `${connected ? 'L' : 'M'}${x(p)},${y(v)} `; connected = true; }); return <g key={s.key}><path d={path} fill="none" stroke={s.color} strokeWidth="2" />{rows.length === 1 && typeof rows[0][s.key] === 'number' && <circle cx={x(rows[0])} cy={y(rows[0][s.key])} r="4" fill={s.color} />}</g>; })}
      {selected !== null && <line x1={x(rows[selected])} x2={x(rows[selected])} y1="25" y2="170" stroke="var(--muted)" strokeDasharray="4 4" />}
      <text x="64" y="196">{clock(rows[0].time)} IST</text><text x="742" y="196" textAnchor="end">{clock(rows[rows.length - 1].time)} IST</text>
    </svg>
    {selected !== null && <p className="chart-caption">{clock(rows[selected].time)} IST · {shown.map(s => `${s.label}: ${metric(rows[selected][s.key], unit)}`).join(' · ')}</p>}
    </>}
    <details><summary>View chart data</summary><div className="table-scroll"><table className="orders-table"><thead><tr><th>Time (IST)</th>{shown.map(s => <th key={s.key}>{s.label} ({unit})</th>)}</tr></thead><tbody>{rows.map(p => <tr key={p.time}><td>{clock(p.time)}</td>{shown.map(s => <td key={s.key}>{metric(p[s.key])}</td>)}</tr>)}</tbody></table></div></details>
    <p className="chart-caption">Observed buckets only. Lines connect available samples; gaps do not establish continuous coverage.</p>
  </div>;
}
