"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { canSee } from "@/lib/auth";
import { decodeSession, getToken, isExpired, type SessionUser } from "@/lib/session";
import { logout } from "@/lib/oidc";
import MarketTicker from "@/components/MarketTicker";
import LiveStatusStrip from "@/components/LiveStatusStrip";
import { apiUrl } from "@/lib/runtime";
import { buildNav, togglePinned } from "@/lib/nav-model";
import { SIGNAL_ROUTES, formatSignal, hasSignal, parseSignalCount, type NavSignals } from "@/lib/nav-signals";
import { sourceChip, type SourceChip } from "@/lib/data-source";
import {
  Activity, AlertTriangle, BarChart3, Bell, BookOpenCheck, Boxes, ChevronDown, ChevronLeft,
  ChevronRight, CircleDollarSign, ClipboardList, Gauge, Layers3, LineChart, Lock, Network,
  Pin, Search, Server, Settings, ShieldCheck, Timer, Users, WalletCards, Menu,
} from "lucide-react";

/** `lib/nav-model` is React-free so it can be unit tested; icons are bound here. */
const ICONS: Record<string, typeof BarChart3> = {
  Activity, AlertTriangle, BarChart3, BookOpenCheck, Boxes, CircleDollarSign, ClipboardList,
  Gauge, Layers3, LineChart, Network, Search, Server, Settings, ShieldCheck, Timer, Users,
  WalletCards,
};

const PREFS_KEY = "argus-nav-prefs";
const DEFAULT_PINNED = ["/dashboard", "/orders", "/rejections"];

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
  const [dark, setDark] = useState(false);

  // Rail state. Preferences load in an effect rather than during render so the
  // server-rendered markup and the first client render agree.
  const [prefs, setPrefs] = useState<NavPrefs>(DEFAULT_PREFS);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [query, setQuery] = useState("");
  const [signals, setSignals] = useState<NavSignals>({});
  const [chip, setChip] = useState<SourceChip>(null);
  const filterRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => { try { setDark(localStorage.getItem('argus-theme') === 'dark'); } catch {} }, []);
  function toggleTheme() { const next = !dark; setDark(next); try { localStorage.setItem('argus-theme', next ? 'dark' : 'light'); } catch {} }

  useEffect(() => { setPrefs(readPrefs()); setPrefsLoaded(true); }, []);
  useEffect(() => {
    if (!prefsLoaded) return;
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch {}
  }, [prefs, prefsLoaded]);

  useEffect(() => {
    const current = decodeSession(getToken());
    setSession(current);
    setChecked(true);
  }, []);

  // Rail signals. One request per page load, never polled: the rail is not a
  // dashboard, and a wrong-but-fresh count is worse here than no count at all.
  // Every failure path (403 for a role without access, network error, unusable
  // payload) leaves the entry unset, and an unset entry renders no badge.
  useEffect(() => {
    const token = getToken();
    if (!token) return;
    const abort = new AbortController();
    const base = apiUrl();
    const headers = { Authorization: `Bearer ${token}` };
    const get = async (route: string) => {
      try {
        const res = await fetch(`${base}${route}`, { headers, signal: abort.signal, cache: "no-store" });
        if (!res.ok) return null;
        return await res.json();
      } catch { return null; }
    };
    (async () => {
      const next: NavSignals = {};
      await Promise.all(Object.entries(SIGNAL_ROUTES).map(async ([href, route]) => {
        const count = parseSignalCount(await get(route));
        if (hasSignal(count)) next[href] = count as number;
      }));
      if (!abort.signal.aborted) setSignals(next);
      const parsed = sourceChip(await get("/api/config"));
      if (!abort.signal.aborted && parsed) setChip(parsed);
    })();
    return () => abort.abort();
  }, [checked]);

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = !!target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault(); searchRef.current?.focus();
      }
      // "/" filters the rail. Deliberately distinct from ⌘K, which searches logs.
      if (event.key === '/' && !typing && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        setPrefs((p) => (p.collapsed ? { ...p, collapsed: false } : p));
        window.requestAnimationFrame(() => filterRef.current?.focus());
      }
      if (event.key === 'Escape') { setMenuOpen(false); setQuery(""); }
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
  const { groups, noMatches } = useMemo(
    () => buildNav({ visible, query, pinned: prefs.pinned, closed: prefs.closed, collapsed }),
    [visible, query, prefs.pinned, prefs.closed, collapsed],
  );

  const toggleGroup = (label: string) =>
    setPrefs((p) => ({ ...p, closed: { ...p.closed, [label]: !p.closed[label] } }));
  const toggleRail = () =>
    setPrefs((p) => ({ ...p, collapsed: !p.collapsed }));
  const pin = (href: string) =>
    setPrefs((p) => ({ ...p, pinned: togglePinned(p.pinned, href) }));

  const expired = checked && !!session && isExpired(session);

  return (
    <div className={`app-shell${dark ? " dashboard-theme" : ""}${menuOpen ? " menu-open" : ""}${collapsed ? " rail-collapsed" : ""}`}>
      <a className="skip-link" href="#main-content">Skip to content</a>
      <aside className="sidebar" id="app-navigation">
        <div className="brand">
          <div className="brand-bars" aria-hidden="true"><i /><i /><i /></div>
          <div className="brand-name"><strong>Argus TradeOps</strong><span>Trading Observability</span></div>
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

        {!collapsed && (
          <div className="nav-filter">
            <Search size={13} aria-hidden="true" />
            <input
              ref={filterRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter workspaces"
              aria-label="Filter workspaces"
              type="search"
            />
            {!query && <kbd>/</kbd>}
          </div>
        )}

        <nav className="nav-list" aria-label="TradeOps workspaces">
          {groups.map((group) => (
            <div className={`nav-group${group.isPinned ? " nav-group-pinned" : ""}`} key={group.label}>
              {!collapsed && (
                <button
                  type="button"
                  className="nav-group-label"
                  onClick={() => toggleGroup(group.label)}
                  aria-expanded={group.open}
                >
                  <ChevronDown size={10} className={group.open ? "" : "is-closed"} aria-hidden="true" />
                  <span>{group.label}</span>
                  {group.hiddenCount > 0 && <em>{group.hiddenCount}</em>}
                  {group.matchCount > 0 && <em className="is-match">{group.matchCount}</em>}
                </button>
              )}
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
          {noMatches && (
            <p className="nav-empty">No workspace matches <b>{query}</b></p>
          )}
        </nav>

        <div className="sidebar-foot">
          {chip
            ? <span className={`nav-source tone-${chip.tone}`}><i aria-hidden="true" />{chip.text}</span>
            : <span className="nav-source tone-unknown"><i aria-hidden="true" />Source unreported</span>}
          <div><Lock size={11} aria-hidden="true" />Read-only · never places orders</div>
        </div>
      </aside>
      <main className="main" id="main-content" tabIndex={-1}>
        <header className="marketbar">
          <button type="button" className="nav-toggle" aria-label="Toggle navigation" aria-expanded={menuOpen} aria-controls="app-navigation" onClick={() => setMenuOpen(!menuOpen)}><Menu size={20}/></button><div className="env-pill">Read only</div>
          <MarketTicker variant="bar"/>
          <div className="market-right">
            <button className="btn theme-toggle" type="button" onClick={toggleTheme} aria-pressed={dark} aria-label="Dark theme">{dark ? "Light theme" : "Dark theme"}</button>
            <Clock/>
            <form action="/logs" className="topsearch"><Search size={14}/><input ref={searchRef} name="q" aria-label="Search journal logs" placeholder="Search journal logs…"/><button type="submit" aria-label="Search logs">Go</button><kbd>⌘/Ctrl K</kbd></form>
            <Link href="/incidents" className="bell" aria-label="Alerts and incidents"><Bell size={17}/></Link>
            <Link href="/configuration" className="bell hide-sm" aria-label="Configuration"><Settings size={17}/></Link>
            <div className="avatar">{(session?.username || "T").slice(0, 1).toUpperCase()}</div>
            <div className="profile">
              <b>{session?.username || "TradeOps"}</b>
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
    </div>
  );
}
