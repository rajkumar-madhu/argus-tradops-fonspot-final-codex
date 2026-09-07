"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { canSee } from "@/lib/auth";
import { decodeSession, getToken, isExpired, type SessionUser } from "@/lib/session";
import { logout } from "@/lib/oidc";
import MarketTicker from "@/components/MarketTicker";
import {
  Activity, AlertTriangle, BarChart3, Bell, BookOpenCheck, ChevronDown, Boxes, CircleDollarSign,
  ClipboardList, Gauge, Layers3, LineChart, Network, Search, Server,
  Settings, ShieldCheck, Users, WalletCards
} from "lucide-react";

const nav = [
  ["/dashboard", "Overview", BarChart3],
  ["/orders", "Live Orders", ClipboardList],
  ["/order-book", "Order Book", BookOpenCheck],
  ["/trades", "Trades", CircleDollarSign],
  ["/positions", "Positions", LineChart],
  ["/holdings", "Holdings", WalletCards],
  ["/rejections", "Rejections", Activity],
  ["/rca", "RCA & Analysis", ShieldCheck],
  ["/market-data", "Market Data", Gauge],
  ["/exchange", "Exchange Health", Network],
  ["/sessions", "Users & Sessions", Users],
  ["/risk", "Risk & Limits", Layers3],
  ["/infra", "Infrastructure", Server],
  ["/logs", "Logs Explorer", Search],
  ["/incidents", "Alerts & Incidents", AlertTriangle],
  ["/reports", "Reports", Boxes],
  ["/configuration", "Configuration", Settings],
] as const;

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
      <span>{now ? now.toLocaleDateString([], { weekday: "short", day: "2-digit", month: "short", year: "numeric" }) : " "}</span>
    </div>
  );
}

export default function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [session, setSession] = useState<SessionUser | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const current = decodeSession(getToken());
    setSession(current);
    setChecked(true);
  }, []);

  // Nav is filtered by the roles in the token so users are not shown links that
  // will 403. The backend `require()` dependency remains the actual authority.
  const roles = session?.roles || [];
  const visible = checked && roles.length
    ? nav.filter(([href]) => canSee(href as string, roles))
    : nav;
  const expired = checked && !!session && isExpired(session);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-bars"><i/><i/><i/></div>
          <div><strong>TradeOps</strong><span>Trading Observability Platform</span></div>
        </div>
        <nav className="nav-list">
          {visible.map(([href, label, Icon]) => (
            <Link key={href} href={href} className={path === href ? "nav active" : "nav"}>
              <Icon size={17}/><span>{label}</span>{label === "Alerts & Incidents" && <b className="nav-badge">3</b>}
            </Link>
          ))}
        </nav>
        <div className="sidebar-foot"><span className="live-dot"/> Connected<div>v1.0.0</div></div>
      </aside>
      <main className="main">
        <header className="marketbar">
          <div className="env-pill"><span className="live-dot"/> Production <ChevronDown size={13}/></div>
          <MarketTicker variant="bar"/>
          <div className="market-right">
            <Clock/>
            <label className="topsearch hide-sm"><Search size={14}/><input placeholder="Search orders, symbols, users, error codes, logs…" readOnly/><kbd>Ctrl+K</kbd></label>
            <div className="bell"><Bell size={17} strokeWidth={2}/><b>3</b></div>
            <div className="bell hide-sm"><Settings size={17} strokeWidth={2}/></div>
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
        <div className="page">{children}</div>
      </main>
    </div>
  );
}
