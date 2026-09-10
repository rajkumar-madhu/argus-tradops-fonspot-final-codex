/** Chart series derived from API rows. Every point must come from returned data. */

export function loginTrendFromBuckets(buckets: { time?: string; key?: string; count?: number }[]) {
  const labels = buckets.map((b) => {
    const raw = String(b.time || b.key || "");
    if (!raw) return "";
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) {
      return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
    }
    return raw.length >= 16 ? raw.slice(11, 16) : raw.slice(0, 5);
  });
  const points = buckets.map((b) => Number(b.count || 0));
  return { labels, series: [{ name: "Logins", points, cls: "s-total" }] };
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
  const labels = keys;
  const values = keys.map((k) => bins.get(k) || 0);
  return {
    labels,
    series: [{ name: "Turnover", points: values, cls: "s-executed" }],
  };
}
