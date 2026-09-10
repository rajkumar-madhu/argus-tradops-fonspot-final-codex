/**
 * Navigation model for the sidebar rail.
 *
 * Pure and React-free on purpose: the rail grew to twenty routes across four
 * groups, and the filtering/pinning/collapsing rules are the part worth testing.
 * Shell.tsx owns the state and maps `icon` keys onto lucide components; nothing
 * here imports React, so `tests/nav-model.test.mjs` can strip-type it directly.
 */

export type NavItem = { href: string; label: string; icon: string };
export type NavGroup = { label: string; items: NavItem[] };

/** The four groups deliberately mirror the RBAC route sets in ROLE_ROUTES. */
export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Desk",
    items: [
      { href: "/dashboard", label: "Mission Control", icon: "BarChart3" },
      { href: "/orders", label: "Live Orders", icon: "ClipboardList" },
      { href: "/order-book", label: "Order Book", icon: "BookOpenCheck" },
      { href: "/trades", label: "Trades", icon: "CircleDollarSign" },
      { href: "/positions", label: "Positions", icon: "LineChart" },
      { href: "/holdings", label: "Holdings", icon: "WalletCards" },
    ],
  },
  {
    label: "Investigate",
    items: [
      { href: "/rejections", label: "Rejections", icon: "Activity" },
      { href: "/rca", label: "RCA & Analysis", icon: "ShieldCheck" },
      { href: "/order-latency", label: "OMS Latency", icon: "Timer" },
      { href: "/queue-monitor", label: "Queue Monitor", icon: "Layers3" },
      { href: "/data-quality", label: "Data Quality", icon: "Boxes" },
    ],
  },
  {
    label: "Coverage",
    items: [
      { href: "/market-data", label: "Market Data", icon: "Gauge" },
      { href: "/exchange", label: "Exchange Health", icon: "Network" },
      { href: "/sessions", label: "Users & Sessions", icon: "Users" },
      { href: "/risk", label: "Risk & Limits", icon: "Layers3" },
    ],
  },
  {
    label: "Platform",
    items: [
      { href: "/infra", label: "Infrastructure", icon: "Server" },
      { href: "/logs", label: "Logs Explorer", icon: "Search" },
      { href: "/incidents", label: "Alerts & Incidents", icon: "AlertTriangle" },
      { href: "/reports", label: "Reports", icon: "Boxes" },
      { href: "/configuration", label: "Configuration", icon: "Settings" },
    ],
  },
];

export const PINNED_GROUP = "Pinned";
export const MAX_PINNED = 6;

export type BuiltItem = NavItem & { pinned: boolean };
export type BuiltGroup = {
  label: string;
  items: BuiltItem[];
  /** False only when the operator collapsed this group and no filter is active. */
  open: boolean;
  /** Rows hidden behind a collapsed group heading; 0 when open. */
  hiddenCount: number;
  /** Rows matching the active filter; 0 when no filter is active. */
  matchCount: number;
  /** Pinned is a shortcut, not a workspace group — it never collapses to icons. */
  isPinned: boolean;
};

export type BuildNavOptions = {
  /** Route allowlist; when empty every route is shown (roles not yet decoded). */
  visible?: (href: string) => boolean;
  query?: string;
  pinned?: string[];
  closed?: Record<string, boolean>;
  /** The 56px icon rail drops the Pinned shortcut so routes never render twice. */
  collapsed?: boolean;
  groups?: NavGroup[];
};

/**
 * Builds the render model for the rail.
 *
 * Filtering wins over collapsing — a group with a hit opens itself, otherwise a
 * filter could match a route the operator cannot see. Pinned is suppressed while
 * filtering and while collapsed, both times to avoid showing a route twice.
 */
export function buildNav(options: BuildNavOptions = {}): { groups: BuiltGroup[]; noMatches: boolean } {
  const source = options.groups ?? NAV_GROUPS;
  const pinned = options.pinned ?? [];
  const closed = options.closed ?? {};
  const collapsed = !!options.collapsed;
  const query = (options.query ?? "").trim().toLowerCase();
  const allowed = options.visible ?? (() => true);

  const matches = (item: NavItem) => !query || item.label.toLowerCase().includes(query);
  const built: BuiltGroup[] = [];

  if (!query && !collapsed && pinned.length) {
    const items = source
      .flatMap((group) => group.items)
      .filter((item) => pinned.includes(item.href) && allowed(item.href))
      .map((item) => ({ ...item, pinned: true }));
    if (items.length) {
      const open = !closed[PINNED_GROUP];
      built.push({
        label: PINNED_GROUP,
        items: open ? items : [],
        open,
        hiddenCount: open ? 0 : items.length,
        matchCount: 0,
        isPinned: true,
      });
    }
  }

  for (const group of source) {
    const items = group.items
      .filter((item) => allowed(item.href) && matches(item))
      .map((item) => ({ ...item, pinned: pinned.includes(item.href) }));
    if (!items.length) continue;
    const open = query ? true : !closed[group.label];
    built.push({
      label: group.label,
      items: open ? items : [],
      open,
      hiddenCount: open ? 0 : items.length,
      matchCount: query ? items.length : 0,
      isPinned: false,
    });
  }

  return { groups: built, noMatches: !!query && built.length === 0 };
}

/** Toggles a route's pin, capped at MAX_PINNED so the shortcut stays a shortcut. */
export function togglePinned(pinned: string[], href: string): string[] {
  if (pinned.includes(href)) return pinned.filter((h) => h !== href);
  return [...pinned, href].slice(-MAX_PINNED);
}
