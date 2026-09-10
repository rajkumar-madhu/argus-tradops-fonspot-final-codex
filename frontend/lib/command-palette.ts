/**
 * Ctrl+K command palette model.
 *
 * Pure and React-free so `tests/command-palette.test.mjs` can load it with
 * strip-types; `components/CommandPalette.tsx` owns the dialog. Every command
 * is navigation — the palette never runs an action against a trading system.
 */

export type PaletteRoute = { href: string; label: string };
export type PaletteCommand = {
  id: string;
  kind: "route" | "order" | "search" | "recent";
  label: string;
  hint: string;
  href: string;
};

/** Words an operator types that are not in a route's label. */
export const ROUTE_KEYWORDS: Record<string, string[]> = {
  "/dashboard": ["home", "mission control", "summary", "kpi"],
  "/orders": ["ordupd", "order flow", "oms"],
  "/order-book": ["book", "open orders"],
  "/trades": ["fills", "executions"],
  "/positions": ["net", "flow", "mtm"],
  "/holdings": ["portfolio", "demat"],
  "/rejections": ["rejected", "rms", "reject reason"],
  "/rca": ["root cause", "lifecycle", "trace", "analysis"],
  "/market-data": ["ticks", "truedata", "indices", "quotes"],
  "/exchange": ["yel", "gateway", "nse", "bse", "connectivity"],
  "/sessions": ["login", "users", "clients"],
  "/risk": ["rms", "margin", "limits", "exposure"],
  "/infra": ["redis", "postgres", "elasticsearch", "services"],
  "/logs": ["journal", "search", "explorer"],
  "/incidents": ["alerts", "incident", "sev"],
  "/reports": ["export", "csv", "download"],
  "/order-latency": ["latency", "p99", "oms latency"],
  "/queue-monitor": ["queue", "backlog"],
  "/data-quality": ["quality", "duplicates", "freshness"],
  "/configuration": ["settings", "config", "help", "integrations"],
};

/** A Noren order number is all digits; shorter numbers are more likely qty or price. */
export const ORDER_NUMBER = /^\d{8,20}$/;
export const MAX_RECENT = 5;

/**
 * Scores how well `query` matches `text`: 100 exact, 80 prefix, 60 word
 * prefix, 40 substring, 10 in-order subsequence, 0 no match.
 */
export function matchScore(text: string, query: string): number {
  const t = text.toLowerCase();
  const q = query.trim().toLowerCase();
  if (!q) return 1;
  if (t === q) return 100;
  if (t.startsWith(q)) return 80;
  if (t.split(/[\s&/·-]+/).some((w) => w.startsWith(q))) return 60;
  if (t.includes(q)) return 40;
  let i = 0;
  for (const ch of t) if (ch === q[i]) i += 1;
  return i === q.length ? 10 : 0;
}

function routeScore(route: PaletteRoute, query: string): number {
  const label = matchScore(route.label, query);
  const words = (ROUTE_KEYWORDS[route.href] || []).map((k) => matchScore(k, query));
  // A keyword hit ranks below the same-strength label hit.
  const keyword = words.length ? Math.max(...words) - 5 : 0;
  return Math.max(label, keyword > 5 ? keyword : 0);
}

export type PaletteOptions = {
  query: string;
  routes: PaletteRoute[];
  /** Route allowlist from the token's roles; every command is checked against it. */
  visible?: (href: string) => boolean;
  recent?: string[];
};

/**
 * Builds the ordered command list. An order number offers RCA and Live Orders
 * lookups first; any other text offers a journal search after the route hits.
 * With no query, recent routes lead, followed by every visible route.
 */
export function paletteCommands({ query, routes, visible = () => true, recent = [] }: PaletteOptions): PaletteCommand[] {
  const q = query.trim();
  const allowed = routes.filter((r) => visible(r.href));
  const byHref = new Map(allowed.map((r) => [r.href, r]));

  if (!q) {
    const recents = recent
      .map((href) => byHref.get(href))
      .filter((r): r is PaletteRoute => !!r)
      .slice(0, MAX_RECENT)
      .map((r) => ({ id: `recent:${r.href}`, kind: "recent" as const, label: r.label, hint: "Recent", href: r.href }));
    const seen = new Set(recents.map((r) => r.href));
    return [
      ...recents,
      ...allowed.filter((r) => !seen.has(r.href)).map((r) => ({ id: `route:${r.href}`, kind: "route" as const, label: r.label, hint: "Go to page", href: r.href })),
    ];
  }

  const out: PaletteCommand[] = [];
  if (ORDER_NUMBER.test(q)) {
    const enc = encodeURIComponent(q);
    if (visible("/rca")) out.push({ id: "order:rca", kind: "order", label: `Trace order ${q}`, hint: "RCA & Analysis", href: `/rca?order_id=${enc}` });
    if (visible("/orders")) out.push({ id: "order:live", kind: "order", label: `Find order ${q}`, hint: "Live Orders", href: `/orders?order=${enc}` });
  }

  out.push(
    ...allowed
      .map((r) => ({ r, score: routeScore(r, q) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || a.r.label.localeCompare(b.r.label))
      .map(({ r }) => ({ id: `route:${r.href}`, kind: "route" as const, label: r.label, hint: "Go to page", href: r.href })),
  );

  if (visible("/logs")) {
    out.push({ id: "search:logs", kind: "search", label: `Search journal logs for “${q}”`, hint: "Logs Explorer", href: `/logs?q=${encodeURIComponent(q)}` });
  }
  return out;
}

/** Moves `href` to the front of the recent list, deduplicated and capped. */
export function pushRecent(recent: string[], href: string): string[] {
  const path = href.split("?")[0];
  return [path, ...recent.filter((h) => h !== path)].slice(0, MAX_RECENT);
}
