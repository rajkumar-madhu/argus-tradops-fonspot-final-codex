import { time24 } from "@/lib/format";

type OrderRow = { time?: string; status?: string };

/** Adaptive time bins for order/rejection trend charts from real rows. */
export function orderTrendFromRows(orders: OrderRow[], binMs = 300_000) {
  const bins = new Map<number, { total: number; executed: number; rejected: number }>();
  for (const o of orders) {
    const t = Date.parse(String(o.time || ""));
    if (Number.isNaN(t)) continue;
    const key = Math.floor(t / binMs) * binMs;
    const b = bins.get(key) || { total: 0, executed: 0, rejected: 0 };
    b.total += 1;
    const status = String(o.status || "").toUpperCase();
    if (status === "COMPLETE" || status === "COMPLETED") b.executed += 1;
    if (status === "REJECTED") b.rejected += 1;
    bins.set(key, b);
  }
  const keys = Array.from(bins.keys()).sort((a, b) => a - b);
  if (keys.length === 0) {
    return { labels: ["—"], series: [{ name: "Total", points: [0], cls: "s-total" }] };
  }
  const step = Math.max(1, Math.ceil(keys.length / 8));
  const sampledKeys = keys.filter((_, i) => i % step === 0 || i === keys.length - 1);
  const labels = sampledKeys.map((k) => time24(new Date(k).toISOString()).slice(0, 5));
  const rows = sampledKeys.map((k) => bins.get(k) || { total: 0, executed: 0, rejected: 0 });
  return {
    labels,
    series: [
      { name: "Total", points: rows.map((r) => r.total), cls: "s-total" },
      { name: "Executed", points: rows.map((r) => r.executed), cls: "s-executed" },
      { name: "Rejected", points: rows.map((r) => r.rejected), cls: "s-rejected" },
    ],
  };
}

export function rejectionTrendFromRows(orders: OrderRow[], binMs = 300_000) {
  const rejected = orders.filter((o) => String(o.status || "").toUpperCase() === "REJECTED");
  const bins = new Map<number, number>();
  for (const o of rejected) {
    const t = Date.parse(String(o.time || ""));
    if (Number.isNaN(t)) continue;
    const key = Math.floor(t / binMs) * binMs;
    bins.set(key, (bins.get(key) || 0) + 1);
  }
  const keys = Array.from(bins.keys()).sort((a, b) => a - b);
  if (keys.length === 0) {
    return { labels: ["—"], series: [{ name: "Rejections", points: [0], cls: "s-rejected" }] };
  }
  const step = Math.max(1, Math.ceil(keys.length / 8));
  const sampledKeys = keys.filter((_, i) => i % step === 0 || i === keys.length - 1);
  const labels = sampledKeys.map((k) => time24(new Date(k).toISOString()).slice(0, 5));
  const points = sampledKeys.map((k) => bins.get(k) || 0);
  return { labels, series: [{ name: "Rejections", points, cls: "s-rejected" }] };
}

export function exchangeVolumeRows(
  exchanges: { name?: string; events?: number; reject_rate?: number }[],
) {
  const max = Math.max(1, ...exchanges.map((x) => Number(x.events || 0)));
  const palette = ["bar-blue", "bar-green", "bar-purple", "bar-amber", "bar-teal", "bar-red"];
  return exchanges.map((x, i) => ({
    label: x.name || "—",
    value: Number(x.events || 0).toLocaleString(),
    pct: (Number(x.events || 0) / max) * 100,
    cls: palette[i % palette.length],
    sub: x.reject_rate != null ? `${Number(x.reject_rate).toFixed(2)}% rej` : undefined,
  }));
}

export function statusDonutSlices(args: {
  total: number;
  complete: number;
  rejected: number;
  open: number;
  pending: number;
}) {
  const { total, complete, rejected, open, pending } = args;
  const pct = (n: number) => (total ? `${((n / total) * 100).toFixed(1)}%` : "0.0%");
  return [
    { label: "Complete", value: complete, cls: "seg-green", pct: pct(complete) },
    { label: "Rejected", value: rejected, cls: "seg-red", pct: pct(rejected) },
    { label: "Open", value: open, cls: "seg-neutral", pct: pct(open) },
    { label: "Pending", value: pending, cls: "seg-amber", pct: pct(pending) },
  ].filter((s) => s.value > 0);
}
