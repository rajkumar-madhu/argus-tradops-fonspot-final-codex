type QueueSource = { instance: string; trend?: { time: string; peak: number | null }[] };
export function queueOverlay(sources: QueueSource[]) {
  const names = [...new Set(sources.map(s => s.instance))];
  const colors = ['var(--signal)', 'var(--red)', 'var(--ink)', 'var(--amber-ink)'];
  const series = names.map((name, i) => ({ key: `series_${i}`, label: name, color: colors[i % colors.length] }));
  const times = new Map<string, Record<string, string | number | null>>();
  for (const source of sources) {
    const key = series[names.indexOf(source.instance)].key;
    for (const point of source.trend || []) {
      if (!Number.isFinite(Date.parse(point.time))) continue;
      const row = times.get(point.time) || { time: point.time, ...Object.fromEntries(series.map(s => [s.key, null])) };
      if (point.peak != null && Number.isFinite(point.peak)) row[key] = Math.max(Number(row[key] ?? 0), point.peak);
      times.set(point.time, row);
    }
  }
  return { series, points: [...times.values()].sort((a, b) => String(a.time).localeCompare(String(b.time))) };
}
