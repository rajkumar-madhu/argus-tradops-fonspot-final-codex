"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { canSee } from "@/lib/auth";
import { clearToken, decodeSession, getToken, isExpired, type SessionUser } from "@/lib/session";
import { safeReturnTo } from "@/lib/auth-routing";
import { logout } from "@/lib/oidc";
import MarketTicker from "@/components/MarketTicker";
import LiveStatusStrip from "@/components/LiveStatusStrip";
import { apiUrl } from "@/lib/runtime";
import CommandPalette from "@/components/CommandPalette";
import { buildNav, NAV_GROUPS, togglePinned } from "@/lib/nav-model";
import { SIGNAL_ROUTES, formatSignal, hasSignal, parseSignalCount, type NavSignals } from "@/lib/nav-signals";
import { sourceChip, type SourceChip } from "@/lib/data-source";
import {
  Activity, AlertTriangle, BarChart3, Bell, BookOpenCheck, Boxes, ChevronLeft,
  ChevronRight, CircleDollarSign, ClipboardList, FileText, Gauge, HelpCircle, Layers3, LineChart,
  Lock, Network, Pin, Search, Server, Settings, ShieldCheck, Timer, Users, WalletCards, Menu,
} from "lucide-react";

/** `lib/nav-model` is React-free so it can be unit tested; icons are bound here. */
const ICONS: Record<string, typeof BarChart3> = {
  Activity, AlertTriangle, BarChart3, BookOpenCheck, Boxes, CircleDollarSign, ClipboardList,
  FileText, Gauge, Layers3, LineChart, Network, Search, Server, Settings, ShieldCheck, Timer, Users,
  WalletCards,
};

// v2: the rail follows the reference mockups (flat, no Pinned group by
// default), so earlier saved layouts are not carried over.
const PREFS_KEY = "argus-nav-prefs-v2";
const DEFAULT_PINNED: string[] = [];
const PALETTE_ROUTES = NAV_GROUPS.flatMap((g) => g.items);

type NavPrefs = { collapsed: boolean; pinned: string[]; closed: Record<string, boolean> };
const DEFAULT_PREFS: NavPrefs = { collapsed: false, pinned: DEFAULT_PINNED, closed: {} };

function readPrefs(): NavPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<NavPrefs>;
    return {
      collapsed: !!parsed.collapsed,
      pinned: Array.isArray(parsed.pinned) ? parsed.pinned.filter((h) => typeof h === "string") : DEFAULT_PINNED,
      closed: parsed.closed && typeof parsed.closed === "object" ? parsed.closed : {},
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

/** Live clock for the top bar. Renders placeholders until mounted so SSR and client match. */
function Clock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="clock">
      <b>{now ? now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "--:--:--"}</b>
      <span>{now ? now.toLocaleDateString([], { weekday: "short", day: "2-digit", month: "short", year: "numeric" }) : " "}</span>
    </div>
  );
}

export default function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [session, setSession] = useState<SessionUser | null>(null);
  const [checked, setChecked] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // Rail state. Preferences load in an effect rather than during render so the
  // server-rendered markup and the first client render agree.
  const [prefs, setPrefs] = useState<NavPrefs>(DEFAULT_PREFS);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const query = "";
  const [signals, setSignals] = useState<NavSignals>({});
  const [chip, setChip] = useState<SourceChip>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);


  useEffect(() => { setPrefs(readPrefs()); setPrefsLoaded(true); }, []);
  useEffect(() => {
    if (!prefsLoaded) return;
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch {}
  }, [prefs, prefsLoaded]);

  useEffect(() => {
    const current = decodeSession(getToken());
    setSession(current);
    setChecked(true);
    if (!current) return; // Auth-disabled local previews have no token.
    const checkExpiry = () => {
      if (isExpired(decodeSession(getToken()))) {
        clearToken();
        const destination = safeReturnTo(window.location.pathname + window.location.search);
        window.location.replace(`/signin?reason=expired&returnTo=${encodeURIComponent(destination)}`);
      }
    };
    // A suspended tab can miss its timer; checking focus closes that gap.
    const timer = setTimeout(checkExpiry, Math.max(0, Math.min(current.expiresAt - Date.now(), 2147483647)));
    window.addEventListener('focus', checkExpiry);
    return () => { clearTimeout(timer); window.removeEventListener('focus', checkExpiry); };
  }, []);

  // Rail signals. One request per page load, never polled: the rail is not a
  // dashboard, and a wrong-but-fresh count is worse here than no count at all.
  // Every failure path (403 for a role without access, network error, unusable
  // payload) leaves the entry unset, and an unset entry renders no badge.
  useEffect(() => {
    if (!checked) return;
    // No token is not a reason to stay silent: with AUTH_DISABLED the API
    // answers anyway, and with auth on a 401 simply leaves the chip unset.
    const token = getToken();
    const current = decodeSession(token);
    const abort = new AbortController();
    const base = apiUrl();
    const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
    const get = async (route: string) => {
      try {
        const res = await fetch(`${base}${route}`, { headers, signal: abort.signal, cache: "no-store", credentials: "include" });
        if (!res.ok) return null;
        return await res.json();
      } catch { return null; }
    };
    (async () => {
      const next: NavSignals = {};
      await Promise.all(Object.entries(SIGNAL_ROUTES).map(async ([href, route]) => {
        if (token && (!current || isExpired(current) || !canSee(href, current.roles))) return;
        const count = parseSignalCount(await get(route));
        if (hasSignal(count)) next[href] = count as number;
      }));
      if (!abort.signal.aborted) setSignals(next);
      const [config, fresh] = await Promise.all([get("/api/config"), get("/api/freshness")]);
      const parsed = sourceChip(config, fresh);
      if (!abort.signal.aborted && parsed) setChip(parsed);
    })();
    return () => abort.abort();
  }, [checked]);

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault(); setPaletteOpen((o) => !o);
      }
      if (event.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, []);
  useEffect(() => setMenuOpen(false), [path]);

  const roles = useMemo(() => session?.roles || [], [session]);
  // Nav is filtered by the roles in the token so users are not shown links that
  // will 403. The backend `require()` dependency remains the actual authority.
  const visible = useCallback(
    (href: string) => (checked && roles.length ? canSee(href, roles) : true),
    [checked, roles],
  );

  // The drawer is a full rail: collapsing to icons is a desktop affordance only.
  const collapsed = prefs.collapsed && !menuOpen;
  const { groups } = useMemo(
    // Groups render flat and never collapse: the reference rail has no headings.
    () => buildNav({ visible, query, pinned: prefs.pinned, closed: {}, collapsed }),
    [visible, query, prefs.pinned, collapsed],
  );

  const toggleRail = () =>
    setPrefs((p) => ({ ...p, collapsed: !p.collapsed }));
  const pin = (href: string) =>
    setPrefs((p) => ({ ...p, pinned: togglePinned(p.pinned, href) }));

  const expired = checked && !!session && isExpired(session);

  return (
    <div className={`app-shell${menuOpen ? " menu-open" : ""}${collapsed ? " rail-collapsed" : ""}`}>
      <a className="skip-link" href="#main-content">Skip to content</a>
      <aside className="sidebar" id="app-navigation">
        <div className="brand">
          <div className="brand-bars" aria-hidden="true"><i /><i /><i /></div>
          <div className="brand-name"><strong>Argus TradeOps</strong><span>Trading Observability Platform</span></div>
          <button
            type="button"
            className="rail-toggle"
            onClick={toggleRail}
            aria-expanded={!collapsed}
            aria-controls="app-navigation"
            aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
            title={collapsed ? "Expand navigation" : "Collapse navigation"}
          >
            {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>
        </div>

        <nav className="nav-list" aria-label="Argus TradeOps workspaces">
          {groups.map((group) => (
            <div className={`nav-group${group.isPinned ? " nav-group-pinned" : ""}`} key={group.label}>
              {group.items.map((item) => {
                const Icon = ICONS[item.icon] || Boxes;
                const count = signals[item.href];
                const active = path === item.href;
                return (
                  // The pin is a sibling of the link, not a child: a <button>
                  // inside an <a> is invalid and swallows the row's own click.
                  <div className="nav-row" key={`${group.label}${item.href}`}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      title={collapsed ? item.label : undefined}
                      className={`nav nav-${item.href.slice(1).replaceAll("/", "-")}${active ? " active" : ""}`}
                    >
                      <Icon size={17} aria-hidden="true" />
                      <span>{item.label}</span>
                      {hasSignal(count) && (
                        <em className="nav-badge" aria-label={`${count} open`}>{formatSignal(count)}</em>
                      )}
                    </Link>
                    {!collapsed && (
                      <button
                        type="button"
                        className={`nav-pin${item.pinned ? " is-pinned" : ""}`}
                        aria-label={item.pinned ? `Unpin ${item.label}` : `Pin ${item.label}`}
                        aria-pressed={item.pinned}
                        onClick={() => pin(item.href)}
                      >
                        <Pin size={12} aria-hidden="true" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="sidebar-foot">
          {chip
            ? <span className={`nav-source tone-${chip.tone}`} title={chip.detail || undefined}><i aria-hidden="true" />{chip.text}</span>
            : <span className="nav-source tone-unknown"><i aria-hidden="true" />Source unreported</span>}
          <div><Lock size={11} aria-hidden="true" />Read-only · never places orders</div>
          {visible("/configuration") && <Link href="/configuration" className="sidebar-help"><HelpCircle size={14} aria-hidden="true" />Help &amp; configuration</Link>}
        </div>
      </aside>
      <main className="main" id="main-content" tabIndex={-1}>
        <header className="marketbar">
          <button type="button" className="nav-toggle" aria-label="Toggle navigation" aria-expanded={menuOpen} aria-controls="app-navigation" onClick={() => setMenuOpen(!menuOpen)}><Menu size={20}/></button><div className="env-pill">Read only</div>
          <MarketTicker variant="bar"/>
          <div className="market-right">
            <Clock/>
            <form action="/logs" className="topsearch"><Search size={14}/><input name="q" aria-label="Search journal logs" placeholder="Search journal logs…"/><button type="submit" aria-label="Search logs">Go</button><button type="button" className="kbd-btn" onClick={() => setPaletteOpen(true)} aria-label="Open command palette" title="Command palette"><kbd>⌘/Ctrl K</kbd></button></form>
            <Link href="/incidents" className="bell" aria-label="Alerts and incidents"><Bell size={17}/></Link>
            {visible("/configuration") && <Link href="/configuration" className="bell hide-sm" aria-label="Configuration"><Settings size={17}/></Link>}
            <div className="avatar">{(session?.username || "T").slice(0, 1).toUpperCase()}</div>
            <div className="profile">
              <b>{session?.username || "Argus TradeOps"}</b>
              <span>{roles.length ? roles.join(", ") : "RBAC protected"}</span>
            </div>
            {checked && (session
              ? <button className="link-btn" onClick={() => logout()}>Sign out</button>
              : <Link className="link-btn" href="/signin">Sign in</Link>)}
          </div>
        </header>
        {expired && (
          <div className="panel empty-state">
            <b>Session expired</b>
            <p>Your access token has expired. <Link href="/signin">Sign in again</Link> to reload live data.</p>
          </div>
        )}
        {(path === "/dashboard" || path === "/orders") && (
          <LiveStatusStrip chip={chip} />
        )}
        <div className="page">{children}</div>
      </main>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} routes={PALETTE_ROUTES} visible={visible} />
    </div>
  );
}
