"use client";

import { useState } from "react";
import {
  AlertTriangle, BarChart3, Building2, Database, Plug, Server, Settings, ShieldCheck, SlidersHorizontal, Users,
} from "lucide-react";
import { EmptyState } from "@/components/UI";
import { stateTone } from "@/lib/command-center";
import { sourceDisplayName } from "@/lib/data-source";
import { fmt } from "@/lib/format";

type Row = [string, string];
type Section = { key: string; title: string; blurb: string; icon: typeof Building2; count: string; rows: Row[] };

const NSE_SESSION: Row[] = [["Pre-open", "09:00 – 09:15"], ["Normal market", "09:15 – 15:30"], ["Closing session", "15:30 – 15:40"], ["Post-close", "15:40 – 16:00"]];

/**
 * Configuration in the reference layout (mockup 01_20_08), read-only: every
 * value is the running configuration or observed status. There are no save,
 * add or test-connection controls — the console never writes to any system.
 */
export default function ConfigurationView({ config, bus, elk, exchanges, infra, market, files, apiUrl }: {
  config: any; bus: any; elk: any; exchanges: any; infra: any; market: any; files: any; apiUrl: string;
}) {
  const venues: any[] = exchanges?.items || [];
  const csv: any[] = Array.isArray(files?.items) ? files.items : [];
  const source = String(config?.data_source || config?.source || "");
  const integrations: Row[] = [
    ["Elasticsearch", elk?.connected ? "Connected" : "Offline"],
    ["Redis event bus", bus?.connected ? "Connected" : "Unavailable"],
    ["PostgreSQL", infra?.postgres?.status || "Unavailable"],
    ["Keycloak", config?.auth_disabled ? "Disabled (local)" : "Enforced"],
    ["Prometheus", infra?.prometheus?.status || "Not configured"],
    ["TrueData", Array.isArray(market?.symbols) && market.symbols.length ? "Streaming" : "Not configured"],
  ];
  const configured = integrations.filter(([, s]) => stateTone(s) === "ok" || s === "Enforced").length;

  const sections: Section[] = [
    { key: "exchanges", title: "Exchanges", blurb: "Exchange segments seen in the source", icon: Building2, count: `${fmt(venues.length)} Observed`, rows: venues.map((v) => [v.name, `${fmt(v.events ?? 0)} events`] as Row) },
    { key: "market", title: "Market Data", blurb: "Market data feed and symbols", icon: BarChart3, count: `${fmt(market?.symbols?.length ?? 0)} Symbols`, rows: [["Feed", Array.isArray(market?.symbols) && market.symbols.length ? "TrueData via Redis snapshot" : "Not configured"], ["Note", market?.note || "—"]] },
    { key: "oms", title: "Trading & OMS", blurb: "Noren journal read path", icon: SlidersHorizontal, count: `${Object.keys(config?.indices || {}).length} Indices`, rows: [["Data source", sourceDisplayName(source)], ...Object.entries(config?.indices || {}).map(([k, v]) => [`Index · ${k}`, String(v)] as Row), ["Event time field", String(config?.timestamp_field || "—")], ["Price divisor", String(config?.price_divisor ?? "—")], ["Schema", String(config?.schema || "—")]] },
    { key: "risk", title: "Risk & Limits", blurb: "RMS limit and margin feeds", icon: ShieldCheck, count: "0 Feeds", rows: [["Limit feed", "Not connected"], ["Margin / VaR", "Not connected"], ["Breach evidence", "RMS rejections from the journal"]] },
    { key: "users", title: "Users & Access", blurb: "Authentication and roles", icon: Users, count: "5 Roles", rows: [["Authentication", config?.auth_disabled ? "Disabled — local access" : "Keycloak (OIDC, PKCE)"], ["Roles", "super_admin, trading_ops, risk, infra_sre, auditor"], ["Self-registration", "Off unless explicitly enabled"]] },
    { key: "infra", title: "Infrastructure", blurb: "Core services the API reports", icon: Server, count: `${integrations.length} Components`, rows: integrations },
    { key: "alerts", title: "Alert & Incident", blurb: "Derived alert rules", icon: AlertTriangle, count: "4 Rules", rows: [["Rejection spike", "10+ rejected orders (100+ critical)"], ["Rejection code", "3+ orders with one code"], ["YEL connectivity", "No yel_connected keys"], ["Persisted incidents", infra?.postgres?.status === "Connected" ? "PostgreSQL" : "Needs PostgreSQL"]] },
    { key: "integrations", title: "Integrations", blurb: "Connected systems", icon: Plug, count: `${configured} / ${integrations.length} Connected`, rows: integrations },
    { key: "data", title: "Data & Storage", blurb: "Journal and file sources", icon: Database, count: `${fmt(csv.length)} Files`, rows: [["Journal file", config?.journal_path ? "Mounted (read-only)" : "Not configured"], ["Journal primary", config?.journal_primary ? "Yes" : "No"], ["CSV sources", config?.csv_configured ? `${fmt(csv.length)} files` : "Not configured"], ...csv.slice(0, 4).map((f) => [String(f.name), String(f.state || "—")] as Row)] },
    { key: "system", title: "System Settings", blurb: "Runtime and environment", icon: Settings, count: String(config?.environment || "—"), rows: [["Environment", String(config?.environment || "—")], ["API URL", apiUrl], ["Metrics endpoint", config?.metrics_enabled ? "Enabled" : "Disabled"], ["Redis label", String(config?.redis_label || "—")]] },
  ];
  const [active, setActive] = useState("exchanges");
  const current = sections.find((s) => s.key === active) || sections[0];

  return (
    <div className="config-page ref-page">
      <section className="ref-head">
        <div>
          <div className="ref-title-row">
            <h1>Configuration</h1>
            <span className={`ref-pill ${config?.environment === "production" && !config?.auth_disabled ? "ok" : "warn"}`}>
              {config?.environment === "production" ? (config?.auth_disabled ? "Production · auth off" : "Production") : `${config?.environment || "Unknown"} environment`}
            </span>
          </div>
          <p>System settings, integrations, access and operational parameters · read-only</p>
        </div>
      </section>

      <section className="cfg-cards">
        {sections.map((s) => (
          <button key={s.key} type="button" className={`panel cfg-card${active === s.key ? " active" : ""}`} onClick={() => setActive(s.key)}>
            <span className="cfg-icon"><s.icon size={22} /></span>
            <span className="cfg-text">
              <b>{s.title}</b>
              <small>{s.blurb}</small>
              <em className={/^0\b/.test(s.count) ? "zero" : undefined}>{s.count}</em>
            </span>
          </button>
        ))}
      </section>

      <section className="cfg-main">
        <nav className="panel cfg-nav" aria-label="Configuration sections">
          {sections.map((s) => (
            <button key={s.key} type="button" className={active === s.key ? "active" : ""} onClick={() => setActive(s.key)}>
              <s.icon size={15} /> {s.title}
            </button>
          ))}
        </nav>
        <div className="panel cfg-detail">
          <div className="panel-head"><b>{current.title}</b><span className="sub">{current.blurb}</span></div>
          {current.key === "exchanges" ? (
            venues.length ? (
              <>
                <table className="compact ref-table">
                  <thead><tr><th>Exchange</th><th>Status</th><th>Environment</th><th>Connection</th><th>Market Data</th><th className="num">Events</th></tr></thead>
                  <tbody>
                    {venues.map((v) => (
                      <tr key={v.name}>
                        <td><b>{v.name}</b></td>
                        <td><i className="ref-dot ok" />{source === "journal snapshot" ? "Observed" : v.status || "—"}</td>
                        <td>{config?.environment || "—"}</td>
                        <td>{sourceDisplayName(source)}</td>
                        <td>{Array.isArray(market?.symbols) && market.symbols.length ? "Live" : "Not configured"}</td>
                        <td className="num">{fmt(v.events ?? 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="cfg-subgrid">
                  <div>
                    <b className="cfg-subhead">Session Timings (IST, NSE equity)</b>
                    <dl className="ex-session">{NSE_SESSION.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
                  </div>
                  <div>
                    <b className="cfg-subhead">Read path</b>
                    <dl className="ex-session">
                      <div><dt>Order index</dt><dd className="mono">{config?.indices?.orders || "—"}</dd></div>
                      <div><dt>Gateway index</dt><dd className="mono">{config?.indices?.yel || "—"}</dd></div>
                      <div><dt>Event time</dt><dd className="mono">{config?.timestamp_field || "—"}</dd></div>
                    </dl>
                  </div>
                </div>
              </>
            ) : (
              <EmptyState title="No exchanges observed" body="The source returned no exchange segments." />
            )
          ) : (
            <dl className="ex-session cfg-rows">
              {current.rows.map(([k, v]) => (
                <div key={k}><dt>{k}</dt><dd>{stateTone(v) === "ok" || stateTone(v) === "bad" ? <span className={`cc-pill cc-${stateTone(v)}`}>{v}</span> : v}</dd></div>
              ))}
            </dl>
          )}
          <p className="ref-note ref-note-pad">Read-only: change configuration through environment variables and redeploy. The console never writes to trading or data systems.</p>
        </div>
      </section>
    </div>
  );
}
