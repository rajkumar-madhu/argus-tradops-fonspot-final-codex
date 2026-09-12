/* ── Generic SVG charts (no dependencies) ─────────────────────────────── */

import { placeBands } from "@/lib/chart-data";

type Series = { name: string; points: number[]; cls: string };

function polyline(points: number[], w: number, h: number, max: number, pad = 6) {
  const n = Math.max(points.length - 1, 1);
  return points
    .map((v, i) => `${((i / n) * w).toFixed(1)},${(h - pad - (v / max) * (h - pad * 2)).toFixed(1)}`)
    .join(" ");
}

/** Multi-series line chart with soft area fills. `series[0]` is drawn at the back. */
export function AreaChart({ series, labels, height = 140, unit = "", emptyMessage }: { series: Series[]; labels: string[]; height?: number; unit?: string; emptyMessage?: string }) {
  const w = 430;
  const values = series.flatMap((s) => s.points).filter((v) => Number.isFinite(v));
  if (!values.length) return <ChartEmpty message={emptyMessage || "No observations in this window"} />;
  const max = Math.max(1, ...values);
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(max * f));
  return (
    <div className="chart-v2">
      <div className="chart-v2-y">{[...yTicks].reverse().map((t, i) => <span key={i}>{t.toLocaleString()}{unit && i === 0 ? ` ${unit}` : ""}</span>)}</div>
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
          {labels.map((l, i) => {
            const n = Math.max(labels.length - 1, 1);
            const slot = w / (labels.length || 1);
            return (
              <rect key={`h${i}`} x={(i / n) * w - slot / 2} y="0" width={slot} height={height} fill="transparent">
                <title>{`${l} · ${series.map((s) => `${s.name}: ${(s.points[i] ?? 0).toLocaleString()}${unit ? " " + unit : ""}`).join(" · ")}`}</title>
              </rect>
            );
          })}
        </svg>
        <div className="chart-axis">{labels.map((l, i) => <span key={`${l}-${i}`}>{l}</span>)}</div>
        {series.length > 1 && (
          <ul className="chart-legend">
            {series.map((s) => <li key={s.name} className={s.cls}><i />{s.name}</li>)}
          </ul>
        )}
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
  if (!bars.some((v) => Number.isFinite(v) && v > 0) && !line.some((v) => Number.isFinite(v) && v > 0)) {
    return <ChartEmpty message="No events in this window" />;
  }
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

/**
 * Chart series colours are CSS custom properties, never literals: the palette is
 * still settling (cobalt today, gold/teal on the design branch) and dark mode
 * redefines every token. Charts follow whatever is in effect instead of pinning
 * one theme's hex into the markup. Defined in globals.css under "chart series".
 */
export const SERIES_COLORS = [
  "var(--series-1)", "var(--series-2)", "var(--series-3)",
  "var(--series-4)", "var(--series-5)", "var(--series-6)",
];

/** Shown instead of an axis when a panel has nothing to plot — an empty chart reads as zero. */
export function ChartEmpty({ message }: { message: string }) {
  return <p className="chart-empty" role="status">{message}</p>;
}

type Band = {
  value: number;
  label: string;
  /** limit = a hard boundary (circuit), price = the observed order price, target = a goal. */
  tone?: "limit" | "price" | "target" | "neutral";
};
type Marker = { index: number; label: string; tone?: "ok" | "bad" | "neutral" };

/**
 * A series with labelled horizontal reference lines and point markers.
 *
 * The reference lines carry their own value at the right edge, so a reader sees
 * "the order sat above this limit" without cross-referencing an axis — the same
 * idiom trading platforms use for stop/target. Every band and marker must come
 * from recorded data; nothing here invents a level.
 */
export function AnnotatedSeries({
  points, labels, bands = [], markers = [], unit = "", height = 230, valueLabel = "Value", emptyMessage,
}: {
  points: (number | null)[];
  labels: string[];
  bands?: Band[];
  markers?: Marker[];
  unit?: string;
  height?: number;
  valueLabel?: string;
  emptyMessage?: string;
}) {
  const measured = points.filter((v): v is number => v !== null && Number.isFinite(v));
  if (!measured.length) return <ChartEmpty message={emptyMessage || "No measured values in this window"} />;

  const w = 620;
  // The right gutter holds the reference-line pills; sized to the longest label
  // these charts produce ("Upper circuit 1,464.70" measures ~120px at 9.5px).
  const pad = { l: 52, r: 142, t: 14, b: 22 };
  const plotW = w - pad.l - pad.r;
  const plotH = height - pad.t - pad.b;
  // Bands share the axis: a limit outside the observed range must stay visible.
  const all = [...measured, ...bands.map((b) => b.value)].filter((v) => Number.isFinite(v));
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const span = hi - lo || Math.abs(hi) || 1;
  const min = lo - span * 0.12;
  const max = hi + span * 0.12;
  const n = Math.max(2, points.length);
  const x = (i: number) => pad.l + (plotW * i) / (n - 1);
  const y = (v: number) => pad.t + plotH - ((v - min) / (max - min)) * plotH;
  const fmt = (v: number) => (Math.abs(v) >= 1000 ? v.toLocaleString("en-IN", { maximumFractionDigits: 2 }) : String(Number(v.toFixed(2))));
  const every = Math.max(1, Math.ceil(n / 6));

  const segments: string[][] = [[]];
  points.forEach((v, i) => {
    if (v === null || !Number.isFinite(v)) { if (segments[segments.length - 1].length) segments.push([]); return; }
    segments[segments.length - 1].push(`${x(i).toFixed(1)},${y(v).toFixed(1)}`);
  });

  return (
    <svg className="annotated" viewBox={`0 0 ${w} ${height}`} role="img"
         aria-label={`${valueLabel} over time with ${bands.length} reference ${bands.length === 1 ? "line" : "lines"}`}>
      {[0, 0.5, 1].map((t) => {
        const yy = pad.t + plotH * (1 - t);
        return (
          <g key={t}>
            <line x1={pad.l} x2={w - pad.r} y1={yy} y2={yy} className="grid-line" />
            <text x={pad.l - 6} y={yy + 3} textAnchor="end" className="axis-text">{fmt(min + (max - min) * t)}</text>
          </g>
        );
      })}

      {placeBands(bands, y).map(({ band: b, lineY, labelY }) => (
        <g key={`${b.label}-${b.value}`} className={`band band-${b.tone || "neutral"}`}>
          <line x1={pad.l} x2={w - pad.r} y1={lineY} y2={lineY} />
          {/* Leader from the line to a label nudged clear of its neighbour. */}
          {Math.abs(labelY - lineY) > 1 && (
            <line x1={w - pad.r} x2={w - pad.r + 6} y1={lineY} y2={labelY} className="band-leader" />
          )}
          <rect x={w - pad.r + 6} y={labelY - 8} width={pad.r - 12} height="16" rx="3" className="band-pill" />
          <text x={w - pad.r + 11} y={labelY + 3} className="band-text">{b.label} {fmt(b.value)}</text>
        </g>
      ))}

      {segments.filter((s) => s.length > 1).map((s, i) => (
        <polyline key={i} points={s.join(" ")} className="annotated-line" />
      ))}
      {segments.filter((s) => s.length === 1).map((s, i) => {
        const [cx, cy] = s[0].split(",");
        return <circle key={`p${i}`} cx={cx} cy={cy} r="2.6" className="annotated-dot" />;
      })}

      {markers.map((m) => {
        const v = points[m.index];
        if (v === null || v === undefined || !Number.isFinite(v)) return null;
        return (
          <g key={`${m.index}-${m.label}`} className={`marker marker-${m.tone || "neutral"}`}>
            <circle cx={x(m.index)} cy={y(v)} r="4" />
            <text x={x(m.index)} y={y(v) - 9} textAnchor="middle" className="marker-text">{m.label}</text>
          </g>
        );
      })}

      {points.map((v, i) => (
        <rect key={`h${i}`} x={x(i) - plotW / (n - 1) / 2} y={pad.t} width={plotW / (n - 1)} height={plotH} fill="transparent">
          <title>{`${labels[i] ?? ""} · ${v === null || !Number.isFinite(v as number) ? "no measurement" : `${fmt(v as number)}${unit ? " " + unit : ""}`}`}</title>
        </rect>
      ))}

      {labels.map((l, i) => showTick(i, n, every) && (
        <text key={`l${i}`} x={x(i)} y={height - 5} textAnchor="middle" className="axis-text">{l}</text>
      ))}
      {unit && <text x={pad.l - 6} y={pad.t - 4} textAnchor="end" className="axis-unit">{unit}</text>}
    </svg>
  );
}

/** Several unfilled lines on one axis (e.g. latency per exchange segment). */
export function MultiLineChart({ series, labels, unit = "", height = 180 }: {
  series: { name: string; points: (number | null)[] }[]; labels: string[]; unit?: string; height?: number;
}) {
  const w = 460;
  const pad = { l: 40, r: 22, t: 8, b: 20 };
  const plotW = w - pad.l - pad.r;
  const plotH = height - pad.t - pad.b;
  const values = series.flatMap((s) => s.points.filter((v): v is number => v !== null && Number.isFinite(v)));
  if (!values.length) return <ChartEmpty message="No measured values in this window" />;
  const max = Math.max(1, ...values);
  const n = Math.max(2, labels.length);
  const x = (i: number) => pad.l + (plotW * i) / (n - 1);
  const y = (v: number) => pad.t + plotH - (v / max) * plotH;
  const every = Math.max(1, Math.ceil(n / 6));
  return (
    <>
    <svg className="multiline" viewBox={`0 0 ${w} ${height}`} role="img" aria-label={`Trend by series${unit ? ` in ${unit}` : ""}`}>
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
      {labels.map((l, i) => (
        <rect key={`h${i}`} x={x(i) - plotW / (n - 1) / 2} y={pad.t} width={plotW / (n - 1)} height={plotH} fill="transparent">
          <title>{`${l} · ${series.map((s) => `${s.name}: ${s.points[i] === null || s.points[i] === undefined ? "no measurement" : `${s.points[i]}${unit}`}`).join(" · ")}`}</title>
        </rect>
      ))}
      {labels.map((l, i) => showTick(i, n, every) && (
        <text key={`l${i}`} x={x(i)} y={height - 5} textAnchor="middle" className="axis-text">{l}</text>
      ))}
    </svg>
    {series.length > 1 && (
      <ul className="chart-legend">
        {series.map((s, si) => (
          <li key={s.name}><i style={{ background: SERIES_COLORS[si % SERIES_COLORS.length] }} />{s.name}</li>
        ))}
      </ul>
    )}
    </>
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
  if (!bins.some((b) => b.values.some((v) => v > 0))) return <ChartEmpty message="No events in this window" />;
  const max = Math.max(1, ...bins.map((b) => b.values.reduce((a, v) => a + v, 0)));
  const slot = plotW / Math.max(1, bins.length);
  const every = Math.max(1, Math.ceil(bins.length / 7));
  return (
    <>
    <svg className="stackedbars" viewBox={`0 0 ${w} ${height}`} role="img" aria-label={`Stacked bars by ${series.join(", ")}`}>
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
      <ul className="chart-legend">
        {series.map((s, si) => <li key={s}><i style={{ background: colors[si % colors.length] }} />{s}</li>)}
      </ul>
    </>
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
