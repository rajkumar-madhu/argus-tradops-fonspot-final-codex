/* ── Generic SVG charts (no dependencies) ─────────────────────────────── */

type Series = { name: string; points: number[]; cls: string };

function polyline(points: number[], w: number, h: number, max: number, pad = 6) {
  const n = Math.max(points.length - 1, 1);
  return points
    .map((v, i) => `${((i / n) * w).toFixed(1)},${(h - pad - (v / max) * (h - pad * 2)).toFixed(1)}`)
    .join(" ");
}

/** Multi-series line chart with soft area fills. `series[0]` is drawn at the back. */
export function AreaChart({ series, labels, height = 140 }: { series: Series[]; labels: string[]; height?: number }) {
  const w = 430;
  const max = Math.max(1, ...series.flatMap((s) => s.points));
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(max * f));
  return (
    <div className="chart-v2">
      <div className="chart-v2-y">{[...yTicks].reverse().map((t, i) => <span key={i}>{t.toLocaleString()}</span>)}</div>
      <div className="chart-v2-plot">
        <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" role="img" aria-label="Trend chart">
          {yTicks.map((t, i) => {
            const y = height - 6 - (i / 4) * (height - 12);
            return <line key={i} x1="0" x2={w} y1={y} y2={y} className="grid-line" />;
          })}
          {series.map((s) => {
            const pts = polyline(s.points, w, height, max);
            return (
              <g key={s.name} className={s.cls}>
                <polygon points={`0,${height} ${pts} ${w},${height}`} className="area-fill" />
                <polyline points={pts} className="area-line" />
              </g>
            );
          })}
        </svg>
        <div className="chart-axis">{labels.map((l, i) => <span key={`${l}-${i}`}>{l}</span>)}</div>
      </div>
    </div>
  );
}

type Slice = { label: string; value: number; cls: string; pct?: string };

/** Donut with a centre label and a legend on the right. */
export function Donut({ slices, centerLabel, centerValue }: { slices: Slice[]; centerLabel: string; centerValue: string }) {
  const total = Math.max(1, slices.reduce((a, s) => a + s.value, 0));
  const r = 40;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="donut">
      <svg viewBox="0 0 120 120" role="img" aria-label={centerLabel}>
        <circle cx="60" cy="60" r={r} className="donut-track" />
        {slices.map((s) => {
          const len = (s.value / total) * c;
          const el = (
            <circle
              key={s.label}
              cx="60"
              cy="60"
              r={r}
              className={`donut-seg ${s.cls}`}
              strokeDasharray={`${len} ${c - len}`}
              strokeDashoffset={-offset}
              transform="rotate(-90 60 60)"
            />
          );
          offset += len;
          return el;
        })}
        <text x="60" y="56" textAnchor="middle" className="donut-value">{centerValue}</text>
        <text x="60" y="72" textAnchor="middle" className="donut-label">{centerLabel}</text>
      </svg>
      <ul className="donut-legend">
        {slices.map((s) => (
          <li key={s.label}>
            <i className={s.cls} />
            <span>{s.label}</span>
            <b>{s.value.toLocaleString()}<em>{s.pct ?? `${((s.value / total) * 100).toFixed(1)}%`}</em></b>
          </li>
        ))}
      </ul>
    </div>
  );
}

type BarRow = { label: string; value: React.ReactNode; pct: number; cls?: string };

/** Horizontal bar list (rejection reasons, system health, exposure by segment). */
export function HBarList({ rows, valueFirst = false }: { rows: BarRow[]; valueFirst?: boolean }) {
  return (
    <div className="hbar-list">
      {rows.map((r, i) => (
        <div className="hbar-row" key={`${r.label}-${i}`}>
          <span className="hbar-label">{r.label}</span>
          <div className="hbar-track">
            <i className={r.cls || "bar-blue"} style={{ width: `${Math.max(2, Math.min(100, r.pct))}%` }} />
          </div>
          <b className="hbar-value">{valueFirst ? `${Math.round(r.pct)}%` : r.value}</b>
        </div>
      ))}
    </div>
  );
}

/** Tiny bar sparkline used inside the landing hero preview. */
export function MiniBars({ values, cls = "bar-blue" }: { values: number[]; cls?: string }) {
  const max = Math.max(1, ...values);
  return (
    <div className="mini-bars">
      {values.map((v, i) => <i key={i} className={cls} style={{ height: `${(v / max) * 100}%` }} />)}
    </div>
  );
}

/**
 * Bars (count, left axis) with a line (percentage, right axis) over the same
 * bins — the reference "Rejections Trend" panel.
 */
export function BarLineChart({ bars, line, labels, barLabel, lineLabel, height = 170 }: {
  bars: number[]; line: number[]; labels: string[]; barLabel: string; lineLabel: string; height?: number;
}) {
  const w = 460;
  const pad = { l: 34, r: 34, t: 8, b: 20 };
  const plotW = w - pad.l - pad.r;
  const plotH = height - pad.t - pad.b;
  const barMax = Math.max(1, ...bars);
  const lineMax = Math.max(1, ...line);
  const n = Math.max(1, bars.length);
  const slot = plotW / n;
  const x = (i: number) => pad.l + slot * i + slot / 2;
  const yBar = (v: number) => pad.t + plotH - (v / barMax) * plotH;
  const yLine = (v: number) => pad.t + plotH - (v / lineMax) * plotH;
  const ticks = [0, 0.5, 1];
  const every = Math.max(1, Math.ceil(n / 7));
  return (
    <svg className="barline" viewBox={`0 0 ${w} ${height}`} role="img" aria-label={`${barLabel} and ${lineLabel}`}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={pad.l} x2={w - pad.r} y1={pad.t + plotH * (1 - t)} y2={pad.t + plotH * (1 - t)} className="grid-line" />
          <text x={pad.l - 6} y={pad.t + plotH * (1 - t) + 3} textAnchor="end" className="axis-text">{Math.round(barMax * t)}</text>
          <text x={w - pad.r + 6} y={pad.t + plotH * (1 - t) + 3} className="axis-text">{(lineMax * t).toFixed(lineMax < 10 ? 1 : 0)}%</text>
        </g>
      ))}
      {bars.map((v, i) => (
        <rect key={i} x={x(i) - slot * 0.32} width={slot * 0.64} y={yBar(v)} height={Math.max(0, pad.t + plotH - yBar(v))} className="barline-bar" rx="1.5">
          <title>{`${labels[i] ?? ""} · ${v} ${barLabel.toLowerCase()} · ${line[i]?.toFixed(1) ?? "0"}%`}</title>
        </rect>
      ))}
      <polyline points={line.map((v, i) => `${x(i).toFixed(1)},${yLine(v).toFixed(1)}`).join(" ")} className="barline-line" />
      {labels.map((l, i) => (i % every === 0 || i === n - 1) && (
        <text key={`l${i}`} x={x(i)} y={height - 5} textAnchor="middle" className="axis-text">{l}</text>
      ))}
    </svg>
  );
}

export const SERIES_COLORS = ["#0b5cff", "#16a34a", "#8b5cf6", "#f59e0b", "#e5383b", "#06b6d4"];

/** Several unfilled lines on one axis (e.g. latency per exchange segment). */
export function MultiLineChart({ series, labels, unit = "", height = 180 }: {
  series: { name: string; points: (number | null)[] }[]; labels: string[]; unit?: string; height?: number;
}) {
  const w = 460;
  const pad = { l: 40, r: 22, t: 8, b: 20 };
  const plotW = w - pad.l - pad.r;
  const plotH = height - pad.t - pad.b;
  const values = series.flatMap((s) => s.points.filter((v): v is number => v !== null));
  const max = Math.max(1, ...values);
  const n = Math.max(2, labels.length);
  const x = (i: number) => pad.l + (plotW * i) / (n - 1);
  const y = (v: number) => pad.t + plotH - (v / max) * plotH;
  const every = Math.max(1, Math.ceil(n / 6));
  return (
    <svg className="multiline" viewBox={`0 0 ${w} ${height}`} role="img" aria-label="Trend by series">
      {[0, 0.5, 1].map((t) => (
        <g key={t}>
          <line x1={pad.l} x2={w - pad.r} y1={pad.t + plotH * (1 - t)} y2={pad.t + plotH * (1 - t)} className="grid-line" />
          <text x={pad.l - 6} y={pad.t + plotH * (1 - t) + 3} textAnchor="end" className="axis-text">{Math.round(max * t)}{unit}</text>
        </g>
      ))}
      {series.map((s, si) => {
        // A missing bucket breaks the line rather than dropping to zero.
        const segments: string[][] = [[]];
        s.points.forEach((v, i) => {
          if (v === null) { if (segments[segments.length - 1].length) segments.push([]); return; }
          segments[segments.length - 1].push(`${x(i).toFixed(1)},${y(v).toFixed(1)}`);
        });
        return segments.filter((p) => p.length > 1).map((p, pi) => (
          <polyline key={`${s.name}-${pi}`} points={p.join(" ")} fill="none" stroke={SERIES_COLORS[si % SERIES_COLORS.length]} strokeWidth="1.6" strokeLinejoin="round" />
        ));
      })}
      {labels.map((l, i) => showTick(i, n, every) && (
        <text key={`l${i}`} x={x(i)} y={height - 5} textAnchor="middle" className="axis-text">{l}</text>
      ))}
    </svg>
  );
}

/** Every `every`-th tick plus the last one, unless the last would crowd its neighbour. */
function showTick(i: number, n: number, every: number) {
  if (i === n - 1) return (n - 1) % every >= Math.ceil(every / 2) || (n - 1) % every === 0;
  return i % every === 0;
}

/** Stacked vertical bars, one colour per series (e.g. orders per bin by exchange). */
export function StackedBars({ bins, series, height = 170, colors = SERIES_COLORS }: {
  bins: { label: string; values: number[] }[]; series: string[]; height?: number; colors?: string[];
}) {
  const w = 460;
  const pad = { l: 34, r: 8, t: 8, b: 20 };
  const plotW = w - pad.l - pad.r;
  const plotH = height - pad.t - pad.b;
  const max = Math.max(1, ...bins.map((b) => b.values.reduce((a, v) => a + v, 0)));
  const slot = plotW / Math.max(1, bins.length);
  const every = Math.max(1, Math.ceil(bins.length / 7));
  return (
    <svg className="stackedbars" viewBox={`0 0 ${w} ${height}`} role="img" aria-label="Stacked bars">
      {[0, 0.5, 1].map((t) => (
        <g key={t}>
          <line x1={pad.l} x2={w - pad.r} y1={pad.t + plotH * (1 - t)} y2={pad.t + plotH * (1 - t)} className="grid-line" />
          <text x={pad.l - 6} y={pad.t + plotH * (1 - t) + 3} textAnchor="end" className="axis-text">{Math.round(max * t)}</text>
        </g>
      ))}
      {bins.map((b, i) => {
        let acc = 0;
        return (
          <g key={i}>
            {b.values.map((v, si) => {
              const h = (v / max) * plotH;
              const yTop = pad.t + plotH - acc - h;
              acc += h;
              return v ? (
                <rect key={si} x={pad.l + slot * i + slot * 0.18} width={slot * 0.64} y={yTop} height={h} fill={colors[si % colors.length]}>
                  <title>{`${b.label} · ${series[si]}: ${v}`}</title>
                </rect>
              ) : null;
            })}
            {showTick(i, bins.length, every) && (
              <text x={pad.l + slot * i + slot / 2} y={height - 5} textAnchor="middle" className="axis-text">{b.label}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/**
 * Placeholder bars for marketing and pre-sign-in illustrations. Uniform height
 * on purpose: a rising series would read as a real trend.
 */
export function SkeletonBars({ count }: { count: number }) {
  return (
    <div className="mini-bars skeleton-bars" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => <i key={i} />)}
    </div>
  );
}

type VBar = { label: string; value: number; cls?: string };

/** Vertical bar chart (order flow, MTM distribution). */
export function VBarChart({ bars, showValues = false }: { bars: VBar[]; showValues?: boolean }) {
  const max = Math.max(1, ...bars.map((b) => b.value));
  return (
    <div className="vbar-chart">
      {bars.map((b, i) => (
        <div className="vbar-col" key={`${b.label}-${i}`}>
          {showValues && <b>{b.value}</b>}
          <i className={b.cls || "bar-blue"} style={{ height: `${Math.max(4, (b.value / max) * 100)}%` }} />
          <span>{b.label}</span>
        </div>
      ))}
    </div>
  );
}
