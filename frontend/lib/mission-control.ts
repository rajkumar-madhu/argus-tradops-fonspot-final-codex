/** Pure Mission Control helpers — KPI copy, tab filters, chart panel choice. */

export type MissionTab = "live" | "open" | "rejected" | "complete";

export const MISSION_TABS: { id: MissionTab; label: string }[] = [
  { id: "live", label: "Live" },
  { id: "open", label: "Open" },
  { id: "rejected", label: "Rejected" },
  { id: "complete", label: "Complete" },
];

export const MISSION_KPI_DEFS = [
  {
    key: "total",
    label: "Total orders",
    definition: "Unique orders in the current observation set / lookback",
  },
  {
    key: "complete",
    label: "Complete",
    definition: "Orders in complete status",
  },
  {
    key: "rejected",
    label: "Rejected",
    definition: "Unique rejected orders",
  },
  {
    key: "open_pending",
    label: "Open / pending",
    definition: "Open plus trigger-pending and pending counts",
  },
  {
    key: "reject_rate",
    label: "Reject rate",
    definition: "Rejected ÷ total (0% when total is 0)",
  },
] as const;

const OPEN_STATUSES = new Set(["OPEN", "PENDING", "TRIGGER_PENDING"]);

export function isLiveSource(source?: string | null): boolean {
  return source === "elasticsearch";
}

export function filterOrdersByTab<T extends { status?: string | null }>(
  rows: T[],
  tab: MissionTab,
): T[] {
  if (tab === "live") return rows;
  if (tab === "open") {
    return rows.filter((r) => OPEN_STATUSES.has(String(r.status || "").toUpperCase()));
  }
  if (tab === "rejected") {
    return rows.filter((r) => String(r.status || "").toUpperCase() === "REJECTED");
  }
  return rows.filter((r) => String(r.status || "").toUpperCase() === "COMPLETE");
}

/** Spec: rejects panel when any rejects exist; otherwise exchange health. */
export function thirdChartPanel(rejectedCount: number): "rejects" | "exchange" {
  return rejectedCount > 0 ? "rejects" : "exchange";
}

export function rejectRatePct(total: number, rejected: number): number {
  if (!total) return 0;
  return (rejected / total) * 100;
}

/** Distinct facet values for Mission Control dropdowns (reference filter bar). */
export function facetOptions(
  rows: Array<Record<string, unknown>>,
  key: string,
): string[] {
  const values = new Set<string>();
  for (const row of rows) {
    const raw = row[key];
    for (const item of Array.isArray(raw) ? raw : [raw]) {
      if (item == null || item === "") continue;
      values.add(String(item));
    }
  }
  return Array.from(values).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

export type MissionFacets = {
  exchange?: string;
  product?: string;
  status?: string;
  side?: string;
  symbol?: string;
  user?: string;
  account?: string;
};

/** Quiet CSV coverage banner — hidden on fetch error or an empty source list. */
export function fileSourceStripMeta(
  fileSources: unknown,
): { count: number; awaiting: number } | null {
  if (!fileSources || typeof fileSources !== "object") return null;
  const body = fileSources as Record<string, unknown>;
  if (typeof body._error === "string") return null;
  const items = Array.isArray(body.items) ? body.items : [];
  const count = Number(body.count ?? items.length);
  if (!count && items.length === 0) return null;
  const awaiting = items.filter(
    (row) =>
      row &&
      typeof row === "object" &&
      (row as { state?: unknown }).state === "No data received",
  ).length;
  return { count, awaiting };
}

/** Client-side filter of already-loaded (masked) rows — never invents live ES queries. */
export function applyMissionFacets<T extends Record<string, unknown>>(
  rows: T[],
  facets: MissionFacets,
): T[] {
  const symbolQ = (facets.symbol || "").trim().toLowerCase();
  const userQ = (facets.user || "").trim().toLowerCase();
  const accountQ = (facets.account || "").trim().toLowerCase();
  return rows.filter((row) => {
    if (facets.exchange && String(row.exchange || "") !== facets.exchange) return false;
    if (facets.product && String(row.product || "") !== facets.product) return false;
    if (facets.status && String(row.status || "") !== facets.status) return false;
    if (facets.side && String(row.side || "") !== facets.side) return false;
    if (symbolQ && !String(row.symbol || "").toLowerCase().includes(symbolQ)) return false;
    if (userQ && !String(row.user || "").toLowerCase().includes(userQ)) return false;
    if (accountQ && !String(row.account || "").toLowerCase().includes(accountQ)) return false;
    return true;
  });
}
