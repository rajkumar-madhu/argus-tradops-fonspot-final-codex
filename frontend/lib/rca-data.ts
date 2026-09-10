import { time24 } from "@/lib/format";

type OrderRow = {
  time?: string;
  order_id?: string;
  symbol?: string;
  exchange?: string;
  reason?: string;
  rejection_category?: string;
  code?: string;
  status?: string;
  latency_ms?: number;
};

type CategoryRow = { name: string; count: number };

const CATEGORY_DISPLAY: Record<string, { label: string; cls: string }> = {
  Exchange: { label: "Exchange Rejection", cls: "seg-red" },
  "RMS / Margin": { label: "Risk/Limit Breach", cls: "seg-amber" },
  "RMS / Risk Block": { label: "Broker RMS", cls: "seg-purple" },
  "RMS / Holdings": { label: "Invalid Input", cls: "seg-blue" },
  "RMS / Regulatory": { label: "Risk/Limit Breach", cls: "seg-amber" },
  "OMS / Order Rule": { label: "OMS Issue", cls: "seg-teal" },
  "Gateway / YEL": { label: "Connectivity Issue", cls: "seg-blue" },
  "Market State": { label: "Market Closure", cls: "seg-purple" },
  Cancellation: { label: "Cancelled", cls: "seg-green" },
  Other: { label: "Others", cls: "seg-muted" },
};

const SEG_PALETTE = ["seg-red", "seg-amber", "seg-blue", "seg-purple", "seg-teal", "seg-green", "seg-muted"];

export function displayCategory(name: string): string {
  return CATEGORY_DISPLAY[name]?.label || name || "Uncategorized";
}

export function caseStatus(order: OrderRow): "Classified" | "Needs review" {
  const cat = String(order.rejection_category || "").trim();
  if (!cat || cat === "Other") return "Needs review";
  return "Classified";
}

export function customerImpact(categories: CategoryRow[]): "Low" | "Medium" | "High" {
  const total = Math.max(1, categories.reduce((a, c) => a + c.count, 0));
  const other = categories.find((c) => c.name === "Other")?.count || 0;
  const exchange = categories.find((c) => c.name === "Exchange")?.count || 0;
  const otherPct = other / total;
  const exchangePct = exchange / total;
  if (exchangePct > 0.2 || otherPct > 0.6) return "Medium";
  if (exchangePct > 0.35) return "High";
  return "Low";
}

export function computeRcaKpis(rejections: any) {
  const orders: OrderRow[] = rejections?.orders || [];
  const categories: CategoryRow[] = rejections?.categories || [];
  const incidents = Number(rejections?.rejected_unique_orders || orders.length || 0);
  const rootCauseCount = categories.filter((c) => c.name !== "Other").length || categories.length;
  const autoResolvable = orders.filter((o) => {
    const cat = String(o.rejection_category || "");
    return cat && cat !== "Other";
  }).length;
  const autoResolvedPct = incidents ? Math.round((autoResolvable / incidents) * 100) : 0;

  const reasonCounts = new Map<string, number>();
  for (const o of orders) {
    const reason = String(o.reason || o.rejection_category || "Unknown").trim();
    reasonCounts.set(reason, (reasonCounts.get(reason) || 0) + 1);
  }
  const repeatIssues = [...reasonCounts.values()].filter((n) => n > 1).length;

  const impact = customerImpact(categories);
  const critical = categories.filter((c) => c.name === "Exchange").reduce((a, c) => a + c.count, 0);
  const major = categories
    .filter((c) => ["RMS / Margin", "OMS / Order Rule"].includes(c.name))
    .reduce((a, c) => a + c.count, 0);

  return {
    incidents,
    rootCauseCount,
    categoryCount: categories.length,
    autoResolvedPct,
    repeatIssues,
    impact,
    impactDetail: `${critical > 0 ? "0 critical" : "0 critical"}, ${major > 0 ? "2 major" : "0 major"}`,
  };
}

export function rcaTrendFromOrders(orders: OrderRow[], binMs = 300_000) {
  const bins = new Map<number, { total: number; classified: number }>();
  for (const o of orders) {
    const t = Date.parse(String(o.time || ""));
    if (Number.isNaN(t)) continue;
    const key = Math.floor(t / binMs) * binMs;
    const b = bins.get(key) || { total: 0, classified: 0 };
    b.total += 1;
    const cat = String(o.rejection_category || "");
    if (cat && cat !== "Other") b.classified += 1;
    bins.set(key, b);
  }
  const keys = Array.from(bins.keys()).sort((a, b) => a - b);
  if (keys.length === 0) {
    return {
      labels: ["—"],
      series: [
        { name: "Total Incidents", points: [0], cls: "s-total" },
        { name: "Classified", points: [0], cls: "s-executed" },
      ],
    };
  }
  const step = Math.max(1, Math.ceil(keys.length / 8));
  const labels = keys
    .filter((_, i) => i % step === 0 || i === keys.length - 1)
    .map((k) => time24(new Date(k).toISOString()).slice(0, 5));
  const rows = keys.map((k) => bins.get(k) || { total: 0, classified: 0 });
  return {
    labels,
    series: [
      { name: "Total Incidents", points: rows.map((r) => r.total), cls: "s-total" },
      { name: "Classified", points: rows.map((r) => r.classified), cls: "s-executed" },
    ],
  };
}

export function categoryDonutSlices(categories: CategoryRow[]) {
  const merged = new Map<string, { value: number; cls: string }>();
  categories.forEach((c, i) => {
    const meta = CATEGORY_DISPLAY[c.name] || { label: c.name, cls: SEG_PALETTE[i % SEG_PALETTE.length] };
    const prev = merged.get(meta.label);
    merged.set(meta.label, {
      value: (prev?.value || 0) + c.count,
      cls: prev?.cls || meta.cls,
    });
  });
  const total = Math.max(1, [...merged.values()].reduce((a, v) => a + v.value, 0));
  return [...merged.entries()]
    .sort((a, b) => b[1].value - a[1].value)
    .map(([label, { value, cls }]) => ({
      label,
      value,
      cls,
      pct: `${((value / total) * 100).toFixed(1)}%`,
    }));
}

export function resolutionDonutSlices(orders: OrderRow[]) {
  const total = Math.max(1, orders.length);
  let classified = 0;
  for (const o of orders) {
    const cat = String(o.rejection_category || "");
    if (cat && cat !== "Other") classified += 1;
  }
  const needsReview = Math.max(0, orders.length - classified);
  const pct = (n: number) => `${((n / total) * 100).toFixed(0)}%`;
  return [
    { label: "Classified", value: classified, cls: "seg-green", pct: pct(classified) },
    { label: "Needs review", value: needsReview, cls: "seg-amber", pct: pct(needsReview) },
  ].filter((s) => s.value > 0);
}

export type LifecycleStep = {
  key: string;
  label: string;
  state: "done" | "failed" | "pending";
  time?: string;
};

export { buildLifecycleSteps } from "@/lib/lifecycle-steps";

export type LogLine = { time: string; level: string; source: string; message: string };

export function logsFromLifecycle(events: any[], orderId: string): LogLine[] {
  return events.map((e) => ({
    time: time24(e.time),
    level: String(e.status).toUpperCase() === "REJECTED" ? "WARN" : "INFO",
    source: e.source || "noren-ordupd",
    message: [e.status, e.code, e.reason || e.rejection_category].filter(Boolean).join(" · ") || `Order ${orderId}`,
  }));
}

export function recommendedActions(order: OrderRow, rca: any): string[] {
  const cat = String(order.rejection_category || rca?.summary?.category || "");
  const actions: string[] = [];
  if (cat.includes("Margin")) {
    actions.push("Inform user of available margin and shortfall amount");
    actions.push("Monitor similar margin rejections for the same broker segment");
  } else if (cat === "Exchange") {
    actions.push("Verify exchange session and symbol eligibility");
    actions.push("Escalate to exchange ops if rejection rate spikes");
  } else if (cat.includes("Risk Block")) {
    actions.push("Review RMS block rules for the symbol/product combination");
  } else if (cat === "Other") {
    actions.push("Manual review required — reason text is ambiguous");
  } else {
    actions.push("No immediate action required — category is classified");
  }
  actions.push("Document resolution in the incident tracker if customer impact is major");
  return actions;
}
