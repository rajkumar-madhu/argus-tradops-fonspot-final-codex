'use client';

/** Time-scaled observations: no generated points, zero baseline, visible units. */

import { useState } from 'react';

export type TrendPoint = { time: string; value: number | null };
export type TrendSeries = { name: string; points: TrendPoint[] };
export type HistogramBin = { label: string; count: number; share?: number | null };
type Tip = { left: number; top: number; title: string; rows: string[] };

const SERIES_COUNT = 5;
const LEFT = 68;
const RIGHT = 752;
const TOP = 36;
const BOTTOM = 188;
const WIDTH = RIGHT - LEFT;

function usable(points: TrendPoint[]) {
  return points.filter((point) => point.value != null && Number.isFinite(point.value) && Number.isFinite(Date.parse(point.time)));
}

function displayUnit(unit: string) {
  if (unit === 'us') return 'µs';
  if (unit === 'ms') return 'ms';
  if (unit === 's') return 's';
  return unit;
}

function clock(time: string) {
  return `${new Date(time).toISOString().slice(11, 16)} UTC`;
}

function formatValue(value: number | null | undefined, unit: string) {
  if (value == null || !Number.isFinite(value)) return '—';
  const text = value.toLocaleString('en-US', { maximumFractionDigits: 2 });
  return unit ? `${text} ${displayUnit(unit)}` : text;
}

function place(event: React.MouseEvent<SVGElement>, host: DOMRect): { left: number; top: number } {
  let left = event.clientX - host.left + 12;
  let top = event.clientY - host.top + 14;
  if (left > host.width - 180) left = Math.max(8, event.clientX - host.left - 180);
  if (top > host.height - 72) top = Math.max(8, event.clientY - host.top - 72);
  return { left, top };
}

function timeTicks(min: number, maxTime: number) {
  if (!(maxTime > min)) return [min];
  return [0, 0.25, 0.5, 0.75, 1].map((fraction) => min + (maxTime - min) * fraction);
}

function ChartTip({ tip }: { tip: Tip | null }) {
  if (!tip) return null;
  return (
    <div className="chart-tip" role="status" style={{ left: tip.left, top: tip.top }}>
      <b>{tip.title}</b>
      {tip.rows.map((row, index) => <span key={`${index}-${row}`}>{row}</span>)}
    </div>
  );
}

function Legend({ items }: { items: Array<{ name: string; index: number; swatch: 'line' | 'bar' }> }) {
  return (
    <ul className="series-legend chart-legend">
      {items.map((item) => (
        <li key={`${item.name}-${item.index}`}>
          <i className={`s${item.index % SERIES_COUNT}${item.swatch === 'bar' ? ' volume-swatch' : ''}`} />
          {item.name}
        </li>
      ))}
    </ul>
  );
}

export default function ObservedTrend({
  points,
  series,
  unit,
  label,
  variant = 'line',
  legend,
  scale = 'linear',
  tall = false,
  dashedFrom,
}: {
  points?: TrendPoint[];
  series?: TrendSeries[];
  unit: string;
  label: string;
  /** Bars are opt-in. Callers that pass only `points` stay a single line. */
  variant?: 'line' | 'bars';
  legend?: string;
  scale?: 'linear' | 'log';
  tall?: boolean;
  dashedFrom?: number;
}) {
  if (variant === 'bars') return <BarTrend points={points ?? []} unit={unit} label={label} legend={legend} tall={tall} />;
  if (!series) return <SingleTrend points={points ?? []} unit={unit} label={label} tall={tall} />;
  return <MultiTrend series={series} unit={unit} label={label} scale={scale} tall={tall} dashedFrom={dashedFrom} />;
}

function frameClass(tall: boolean) {
  return tall ? 'observed-chart tall' : 'observed-chart';
}

function yTicks(max: number) {
  return [0, 0.25, 0.5, 0.75, 1].map((fraction) => max * fraction);
}

function logTicks(minV: number, maxV: number) {
  const ticks: number[] = [];
  const start = Math.floor(Math.log10(minV));
  const end = Math.ceil(Math.log10(maxV));
  for (let power = start; power <= end; power += 1) {
    const tick = 10 ** power;
    if (tick >= minV * 0.999 && tick <= maxV * 1.001) ticks.push(tick);
  }
  if (ticks.length < 2) return [minV, maxV];
  return ticks;
}

function Grid({
  min,
  maxTime,
  ticks,
  y,
  unit,
  log = false,
  tickTimes,
  axisLabel,
}: {
  min: number;
  maxTime: number;
  ticks: number[];
  y: (value: number) => number;
  unit: string;
  log?: boolean;
  tickTimes?: number[];
  axisLabel?: string;
}) {
  const xOf = (time: number) => LEFT + ((time - min) / Math.max(1, maxTime - min)) * WIDTH;
  const marks = (tickTimes ?? timeTicks(min, maxTime)).filter((time) => time >= min && time <= maxTime);
  return (
    <>
      {ticks.map((tick) => (
        <g key={tick}>
          <line x1={LEFT} x2={RIGHT} y1={y(tick)} y2={y(tick)} className="grid-line" />
          <text className="axis-tick" x={LEFT - 8} y={y(tick) + 4} textAnchor="end">{tick.toLocaleString('en-US', { maximumFractionDigits: tick >= 100 ? 0 : 1 })}</text>
        </g>
      ))}
      {marks.map((time) => (
        <g key={time}>
          <line x1={xOf(time)} x2={xOf(time)} y1={TOP} y2={BOTTOM} className="grid-line" />
          <text className="axis-tick" x={xOf(time)} y={BOTTOM + 18} textAnchor="middle">{new Date(time).toISOString().slice(11, 16)}</text>
        </g>
      ))}
      <text className="axis-title" x={LEFT} y={16}>{axisLabel ?? `${displayUnit(unit)}${log ? ' · log' : ''}`}</text>
      <text className="axis-tick" x={RIGHT} y={BOTTOM + 32} textAnchor="end">UTC</text>
    </>
  );
}

function BarTrend({ points, unit, label, legend, tall }: { points: TrendPoint[]; unit: string; label: string; legend?: string; tall: boolean }) {
  const valid = usable(points);
  const [tip, setTip] = useState<Tip | null>(null);
  if (!valid.length) return <p className="empty-state">No measured samples in this interval.</p>;
  const ordered = [...valid].sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
  const times = ordered.map((point) => Date.parse(point.time));
  const dataMin = Math.min(...times);
  const dataMax = Math.max(...times);
  const sorted = [...times].sort((a, b) => a - b);
  const positiveGaps = sorted.slice(1).map((time, index) => time - sorted[index]).filter((gap) => gap > 0);
  const median = positiveGaps.length ? [...positiveGaps].sort((a, b) => a - b)[Math.floor(positiveGaps.length / 2)] : Math.max(1, dataMax - dataMin);
  const pad = median / 2;
  const min = dataMin - pad;
  const maxTime = dataMax + pad;
  const span = Math.max(1, maxTime - min);
  const max = Math.max(1, ...ordered.map((point) => point.value!));
  const x = (time: string) => LEFT + (Date.parse(time) - min) / span * WIDTH;
  const y = (value: number) => BOTTOM - Math.max(0, value) / max * (BOTTOM - TOP);
  const width = Math.max(2, (median / span) * WIDTH);
  const name = legend || 'Orders';
  const show = (event: React.MouseEvent<SVGElement>, point: TrendPoint) => {
    const host = event.currentTarget.ownerSVGElement?.parentElement?.getBoundingClientRect();
    if (!host) return;
    setTip({ ...place(event, host), title: clock(point.time), rows: [`${formatValue(point.value, '')} ${name.toLowerCase()}`] });
  };
  return (
    <div className={frameClass(tall)}>
      <svg viewBox="0 0 780 228" role="img" aria-label={`${label}, bar chart, ${displayUnit(unit)}, UTC; ${valid.length} observed buckets`} onMouseLeave={() => setTip(null)}>
        <Grid min={min} maxTime={maxTime} ticks={yTicks(max)} y={y} unit={unit} axisLabel="orders" tickTimes={timeTicks(dataMin, dataMax)} />
        {ordered.map((point, index) => {
          const top = y(point.value!);
          const barX = x(point.time) - width / 2;
          return (
            <g key={`${point.time}-${index}`}>
              <rect className="volume-bar" x={barX} y={top} width={width} height={Math.max(0, BOTTOM - top)} />
              <rect className="bar-hit" x={barX} y={TOP} width={width} height={BOTTOM - TOP} onMouseEnter={(event) => show(event, point)} onMouseMove={(event) => show(event, point)} />
            </g>
          );
        })}
      </svg>
      <Legend items={[{ name, index: 0, swatch: 'bar' }]} />
      <ChartTip tip={tip} />
      <p className="chart-caption">{label}. Bars fill each observed bucket. Empty stretches are buckets with no rows.</p>
    </div>
  );
}

function MultiTrend({
  series,
  unit,
  label,
  scale,
  tall,
  dashedFrom,
}: {
  series: TrendSeries[];
  unit: string;
  label: string;
  scale: 'linear' | 'log';
  tall: boolean;
  dashedFrom?: number;
}) {
  const [tip, setTip] = useState<Tip | null>(null);
  const drawn = series.map((item) => ({
    name: item.name,
    points: usable(item.points).filter((point) => scale !== 'log' || point.value! > 0),
  })).filter((item) => item.points.length);
  if (!drawn.length) return <p className="empty-state">No measured samples in this interval.</p>;
  const flat = drawn.flatMap((item) => item.points);
  const min = Math.min(...flat.map((point) => Date.parse(point.time)));
  const maxTime = Math.max(...flat.map((point) => Date.parse(point.time)));
  const span = Math.max(1, maxTime - min);
  const values = flat.map((point) => point.value!);
  const max = Math.max(1, ...values);
  const positive = values.filter((value) => value > 0);
  const logMin = Math.min(...positive);
  const logMax = Math.max(...positive);
  const yLinear = (value: number) => BOTTOM - value / max * (BOTTOM - TOP);
  const yLog = (value: number) => {
    if (!(value > 0) || logMax === logMin) return (TOP + BOTTOM) / 2;
    return BOTTOM - ((Math.log10(value) - Math.log10(logMin)) / (Math.log10(logMax) - Math.log10(logMin))) * (BOTTOM - TOP);
  };
  const y = scale === 'log' ? yLog : yLinear;
  const ticks = scale === 'log' ? logTicks(logMin, logMax) : yTicks(max);
  const x = (time: string) => LEFT + (Date.parse(time) - min) / span * WIDTH;
  const described = drawn.map((item) => `${item.name} ${item.points.length}`).join(', ');
  const move = (event: React.MouseEvent<SVGSVGElement>) => {
    const svg = event.currentTarget.getBoundingClientRect();
    const host = event.currentTarget.parentElement?.getBoundingClientRect();
    if (!svg.width || !host) return;
    const viewX = ((event.clientX - svg.left) / svg.width) * 780;
    if (viewX < LEFT || viewX > RIGHT) { setTip(null); return; }
    const target = min + ((viewX - LEFT) / WIDTH) * span;
    const point = flat.reduce((best, sample) => Math.abs(Date.parse(sample.time) - target) < Math.abs(Date.parse(best.time) - target) ? sample : best);
    setTip({
      ...place(event, host),
      title: clock(point.time),
      rows: drawn.map((item) => `${item.name}: ${formatValue(item.points.find((sample) => sample.time === point.time)?.value, unit)}`),
    });
  };
  return (
    <div className={frameClass(tall)}>
      <svg viewBox="0 0 780 228" role="img" aria-label={`${label}, ${displayUnit(unit)}, ${scale} scale, UTC; ${described}`} onMouseMove={move} onMouseLeave={() => setTip(null)}>
        <Grid min={min} maxTime={maxTime} ticks={ticks} y={y} unit={unit} log={scale === 'log'} />
        {drawn.map((item, index) => {
          const line = item.points.map((point) => `${x(point.time)},${y(point.value!)}`).join(' ');
          const dashed = dashedFrom != null && index >= dashedFrom;
          return (
            <g key={`${item.name}-${index}`}>
              {index === 0 && scale === 'log' && item.points.length > 1 && (
                <polygon className="series-area" points={`${x(item.points[0].time)},${BOTTOM} ${line} ${x(item.points[item.points.length - 1].time)},${BOTTOM}`} />
              )}
              <polyline className={`s${index % SERIES_COUNT}${dashed ? ' dashed' : ''}`} points={line} fill="none" strokeWidth="1.75" />
              {item.points.length === 1 && <circle className={`s${index % SERIES_COUNT}`} cx={x(item.points[0].time)} cy={y(item.points[0].value!)} r="4" />}
            </g>
          );
        })}
      </svg>
      <Legend items={drawn.map((item, index) => ({ name: item.name, index, swatch: 'line' as const }))} />
      <ChartTip tip={tip} />
      <p className="chart-caption">{label}. {scale === 'log' ? 'Log scale; non-positive samples are omitted.' : 'Lines connect observed buckets; gaps do not imply continuous coverage.'}</p>
    </div>
  );
}

function SingleTrend({ points, unit, label, tall }: { points: TrendPoint[]; unit: string; label: string; tall: boolean }) {
  const valid = usable(points);
  const [tip, setTip] = useState<Tip | null>(null);
  if (!valid.length) return <p className="empty-state">No measured samples in this interval.</p>;
  const min = Math.min(...valid.map((point) => Date.parse(point.time)));
  const maxTime = Math.max(...valid.map((point) => Date.parse(point.time)));
  const span = Math.max(1, maxTime - min);
  const max = Math.max(1, ...valid.map((point) => point.value!));
  const x = (time: string) => LEFT + (Date.parse(time) - min) / span * WIDTH;
  const y = (value: number) => BOTTOM - value / max * (BOTTOM - TOP);
  const move = (event: React.MouseEvent<SVGSVGElement>) => {
    const svg = event.currentTarget.getBoundingClientRect();
    const host = event.currentTarget.parentElement?.getBoundingClientRect();
    if (!svg.width || !host) return;
    const viewX = ((event.clientX - svg.left) / svg.width) * 780;
    if (viewX < LEFT || viewX > RIGHT) { setTip(null); return; }
    const target = min + ((viewX - LEFT) / WIDTH) * span;
    const point = valid.reduce((best, sample) => Math.abs(Date.parse(sample.time) - target) < Math.abs(Date.parse(best.time) - target) ? sample : best);
    setTip({ ...place(event, host), title: clock(point.time), rows: [formatValue(point.value, unit)] });
  };
  return (
    <div className={frameClass(tall)}>
      <svg viewBox="0 0 780 228" role="img" aria-label={`${label}, ${displayUnit(unit)}, UTC; ${valid.length} observed buckets`} onMouseMove={move} onMouseLeave={() => setTip(null)}>
        <Grid min={min} maxTime={maxTime} ticks={yTicks(max)} y={y} unit={unit} />
        <polyline points={valid.map((point) => `${x(point.time)},${y(point.value!)}`).join(' ')} fill="none" stroke="var(--brand)" strokeWidth="1.75" />
        {valid.length === 1 && <circle cx={x(valid[0].time)} cy={y(valid[0].value!)} r="4" fill="var(--brand)" />}
      </svg>
      <ChartTip tip={tip} />
      <p className="chart-caption">{label}. Lines connect observed buckets; gaps do not imply continuous coverage.</p>
    </div>
  );
}

export function LatencyHistogram({ bins, unit }: { bins: HistogramBin[]; unit: string }) {
  const [tip, setTip] = useState<Tip | null>(null);
  const drawn = bins.filter((bin) => Number.isFinite(bin.count));
  if (!drawn.length) return <p className="empty-state">No measured samples in this interval.</p>;
  const max = Math.max(1, ...drawn.map((bin) => bin.count));
  const slot = WIDTH / drawn.length;
  const barWidth = Math.max(2, slot * 0.72);
  const y = (value: number) => BOTTOM - value / max * (BOTTOM - TOP);
  const show = (event: React.MouseEvent<SVGElement>, bin: HistogramBin) => {
    const host = event.currentTarget.ownerSVGElement?.parentElement?.getBoundingClientRect();
    if (!host) return;
    const share = bin.share != null && Number.isFinite(bin.share) ? ` (${(bin.share * 100).toLocaleString('en-US', { maximumFractionDigits: 1 })}%)` : '';
    setTip({ ...place(event, host), title: bin.label, rows: [`${bin.count.toLocaleString('en-US')} samples${share}`] });
  };
  return (
    <div className="observed-chart tall">
      <svg viewBox="0 0 780 228" role="img" aria-label={`OMS latency histogram, ${displayUnit(unit)}; ${drawn.length} bins`} onMouseLeave={() => setTip(null)}>
        {yTicks(max).map((tick) => (
          <g key={tick}>
            <line x1={LEFT} x2={RIGHT} y1={y(tick)} y2={y(tick)} className="grid-line" />
            <text className="axis-tick" x={LEFT - 8} y={y(tick) + 4} textAnchor="end">{tick.toLocaleString('en-US', { maximumFractionDigits: 0 })}</text>
          </g>
        ))}
        <text className="axis-title" x={LEFT} y={16}>samples</text>
        <text className="axis-title" x={RIGHT} y={BOTTOM + 32} textAnchor="end">{displayUnit(unit)}</text>
        {drawn.map((bin, index) => {
          const center = LEFT + slot * index + slot / 2;
          const top = y(bin.count);
          return (
            <g key={`${bin.label}-${index}`}>
              <rect className="volume-bar" x={center - barWidth / 2} y={top} width={barWidth} height={Math.max(0, BOTTOM - top)} />
              <rect className="bar-hit" x={center - slot / 2} y={TOP} width={slot} height={BOTTOM - TOP} onMouseEnter={(event) => show(event, bin)} onMouseMove={(event) => show(event, bin)} />
              <text className="axis-tick" x={center} y={BOTTOM + 16} textAnchor="end" transform={`rotate(-35 ${center} ${BOTTOM + 16})`}>{bin.label}</text>
            </g>
          );
        })}
      </svg>
      <ChartTip tip={tip} />
      <p className="chart-caption">OMS sample counts by observed range. Bin edges follow the stored minimum and maximum.</p>
    </div>
  );
}
