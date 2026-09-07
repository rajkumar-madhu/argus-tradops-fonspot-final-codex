/** Deterministic demo series for SVG charts (no Date.now / Math.random). */

export function demoTimeLabels(count: number, startHour = 9, startMin = 15, stepMin = 10): string[] {
  const start = startHour * 60 + startMin;
  return Array.from({ length: count }, (_, i) => {
    const m = start + i * stepMin;
    const h = Math.floor(m / 60);
    const mm = m % 60;
    return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  });
}

export function demoSeries(seed: number, count: number, base: number, variance: number): number[] {
  return Array.from({ length: count }, (_, i) =>
    Math.max(0, Math.round(base + Math.sin((i + seed) * 0.65) * variance + ((i + seed) % 4) * 1.5)),
  );
}

export function exchangeLatencyTrend(exchanges: string[]) {
  const labels = demoTimeLabels(12, 8, 30, 5);
  const palette = ["s-latency-1", "s-latency-2", "s-latency-3", "s-latency-4", "s-latency-5", "s-latency-6"];
  const bases = [12, 14, 45, 18, 20, 16];
  return {
    labels,
    series: exchanges.slice(0, 6).map((name, i) => ({
      name,
      points: demoSeries(i + 1, labels.length, bases[i % bases.length], 4 + i * 2),
      cls: palette[i % palette.length],
    })),
  };
}

export function orderFlowTrend() {
  const labels = demoTimeLabels(14, 9, 0, 5);
  const preOpen = labels.map((_, i) => (i < 3 ? 120 + i * 40 : 0));
  const market = labels.map((_, i) => (i < 3 ? 0 : 800 + Math.sin(i * 0.8) * 200 + i * 30));
  return {
    labels,
    bars: labels.map((l, i) => ({ label: l, value: Math.round(preOpen[i] + market[i]), cls: i < 3 ? "bar-blue" : "bar-green" })),
  };
}

export function loginTrendFromBuckets(buckets: { time?: string; count?: number }[]) {
  if (!buckets.length) {
    const labels = demoTimeLabels(10, 8, 0, 15);
    return {
      labels,
      series: [{ name: "Logins", points: demoSeries(3, labels.length, 24, 12), cls: "s-total" }],
    };
  }
  const labels = buckets.map((b) => String(b.time || "").slice(0, 5));
  const points = buckets.map((b) => Number(b.count || 0));
  return { labels, series: [{ name: "Logins", points, cls: "s-total" }] };
}

export function portfolioTrend(totalValue: number) {
  const labels = demoTimeLabels(16, 9, 15, 15);
  const base = totalValue * 0.94;
  const investment = labels.map((_, i) => Math.round(base + i * (totalValue - base) / labels.length * 0.3));
  const current = labels.map((_, i) => Math.round(base + (totalValue - base) * (0.2 + (i / labels.length) * 0.8) + Math.sin(i * 0.5) * totalValue * 0.002));
  return {
    labels,
    series: [
      { name: "Investment", points: investment, cls: "s-total" },
      { name: "Current Value", points: current, cls: "s-executed" },
    ],
  };
}

export function sectorAllocation(rows: { symbol: string; value: number }[]) {
  const sectors: Record<string, number> = {
    "Banking & Finance": 0,
    IT: 0,
    "Oil & Gas": 0,
    Auto: 0,
    Others: 0,
  };
  const map: Record<string, string> = {
    RELIANCE: "Oil & Gas",
    HDFCBANK: "Banking & Finance",
    INFY: "IT",
    TCS: "IT",
    ALPHA: "Others",
    GAMMA: "Others",
  };
  for (const r of rows) {
    const key = Object.keys(map).find((k) => r.symbol.includes(k)) || "Others";
    sectors[map[key] || "Others"] += Number(r.value || 0);
  }
  const entries = Object.entries(sectors).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const total = Math.max(1, entries.reduce((s, [, v]) => s + v, 0));
  return entries.map(([name, value], i) => ({
    label: name,
    value,
    pct: `${((value / total) * 100).toFixed(1)}%`,
    cls: ["bar-blue", "bar-purple", "bar-teal", "bar-amber", "bar-green"][i % 5],
    barPct: (value / total) * 100,
  }));
}

export function mtmDistribution(rows: { pnl_pct: number }[]) {
  const buckets = [
    { label: "< -5%", min: -Infinity, max: -5 },
    { label: "-5% to 0%", min: -5, max: 0 },
    { label: "0% to 5%", min: 0, max: 5 },
    { label: "5% to 10%", min: 5, max: 10 },
    { label: "> 10%", min: 10, max: Infinity },
  ];
  return buckets.map((b, i) => {
    const count = rows.filter((r) => Number(r.pnl_pct) > b.min && Number(r.pnl_pct) <= b.max).length;
    return { label: b.label, value: count, cls: i < 2 ? "bar-red" : i < 3 ? "bar-amber" : "bar-green" };
  });
}

export function tradeVolumeTrend(rows: { time: string; value: number }[]) {
  const bins = new Map<string, number>();
  for (const r of rows) {
    const d = new Date(r.time);
    if (Number.isNaN(d.getTime())) continue;
    const key = `${String(d.getHours()).padStart(2, "0")}:${String(Math.floor(d.getMinutes() / 15) * 15).padStart(2, "0")}`;
    bins.set(key, (bins.get(key) || 0) + Number(r.value || 0));
  }
  const keys = Array.from(bins.keys()).sort();
  const labels = keys.length >= 4 ? keys : demoTimeLabels(8, 9, 15, 15);
  const values = keys.length >= 4 ? keys.map((k) => bins.get(k) || 0) : demoSeries(5, 8, 12000, 4000);
  return {
    labels,
    series: [{ name: "Turnover", points: values, cls: "s-executed" }],
  };
}

export function sparklineValues(seed: number, count = 10): number[] {
  return demoSeries(seed, count, 50, 22);
}
