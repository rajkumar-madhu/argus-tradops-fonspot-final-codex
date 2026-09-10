"use client";

import { useState } from "react";
import { CheckCircle2, Clock3, Repeat, UserRound, Users, XCircle } from "lucide-react";
import RefreshButton from "@/components/RefreshButton";
import SessionsView from "@/components/SessionsView";
import { Donut, HBarList, StackedBars } from "@/components/Charts";
import { EmptyState, KpiCard } from "@/components/UI";
import { fmt, journalWindowLabel } from "@/lib/format";
import { istTime } from "@/lib/journal-explore";
import {
  type SessionEvent, activeBy, durationText, loginTrend, pairedDurations, repeatLogins, sessionKpis, userType,
} from "@/lib/sessions-overview";

const TABS = ["Overview", "Session Register"] as const;
const SLICE = ["seg-blue", "seg-green", "seg-amber", "seg-red", "seg-purple", "seg-muted"];
const BARS = ["bar-blue", "bar-green", "bar-amber", "bar-purple", "bar-red", "bar-teal"];

/**
 * Users & Sessions. The Overview tab follows the reference layout; the
 * Session Register tab keeps the full register, report and exports.
 */
export default function SessionsOverview({ data, summary }: { data: any; summary?: any }) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Overview");
  const events: SessionEvent[] = data?.items || [];
  const source = String(data?.source || "");
  const isJournal = source === "journal snapshot";
  const k = sessionKpis(events);
  const trend = loginTrend(events);
  const byType = activeBy(events, userType);
  const bySegment = activeBy(events, (e) => e.segments || []).slice(0, 6);
  const byBroker = activeBy(events, (e) => e.broker || "").slice(0, 6);
  const active = events.filter((e) => e.active).slice(0, 10);
  const recent = [...events].sort((a, b) => Date.parse(String(b.time)) - Date.parse(String(a.time))).slice(0, 6);
  const repeats = repeatLogins(events);
  const longest = pairedDurations(events).sort((a, b) => b.ms - a.ms).slice(0, 5);
  const maxSeg = Math.max(1, ...bySegment.map((s) => s.count));
  const maxBroker = Math.max(1, ...byBroker.map((s) => s.count));

  return (
    <div className="sessions-overview ref-page">
      <section className="ref-head">
        <div>
          <div className="ref-title-row">
            <h1>User Sessions</h1>
            <span className={`source-badge ${isJournal ? "file-based" : "live"}`}>{isJournal ? "FILE-BASED" : "LIVE"}</span>
          </div>
          <p>User logins, active sessions and access across trading systems{isJournal ? ` · ${journalWindowLabel(data?.from, data?.to)} · uploaded history` : ""}</p>
        </div>
        <div className="ref-controls"><RefreshButton /></div>
      </section>

      <div className="ref-tabs" role="tablist" aria-label="Session views">
        {TABS.map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      {tab === "Session Register" ? (
        <SessionsView data={data} summary={summary} embedded />
      ) : (
        <>
          <section className="kpi-grid ref-kpis six">
            <KpiCard label="Active Sessions" value={fmt(k.active)} delta={isJournal ? "Latest event is a login" : "Current window"} tone="green" icon={<UserRound size={18} />} />
            <KpiCard label="Unique Users" value={fmt(k.uniqueUsers)} delta="Users with a login" tone="blue" icon={<Users size={18} />} />
            <KpiCard label="Login Success" value={fmt(k.loginSuccess)} delta={`${k.successRate.toFixed(1)}%`} deltaTone="up" tone="green" icon={<CheckCircle2 size={18} />} />
            <KpiCard label="Login Failures" value={fmt(k.loginFailures)} delta={`${(100 - k.successRate).toFixed(1)}%`} deltaTone={k.loginFailures ? "down" : ""} tone="red" icon={<XCircle size={18} />} />
            <KpiCard label="Avg. Session Duration" value={durationText(k.avgDurationMs)} delta={k.pairedSessions ? `${fmt(k.pairedSessions)} login→logout pairs` : "No login→logout pair"} tone="purple" icon={<Clock3 size={18} />} />
            <KpiCard label="Repeat Logins" value={fmt(k.repeatLoginUsers)} delta="Users with 2+ logins" tone="amber" icon={<Repeat size={18} />} />
          </section>

          <section className="ref-grid three">
            <div className="panel">
              <div className="panel-head">
                <b>User Login Trend</b>
                <span className="legend"><span><i className="lg" style={{ background: "#16a34a" }} /> Successful</span><span><i className="lg" style={{ background: "#e5383b" }} /> Failed</span></span>
              </div>
              {trend.length ? (
                <div className="ref-chart">
                  <StackedBars series={["Successful", "Failed"]} colors={["#16a34a", "#e5383b"]} bins={trend.map((b) => ({ label: istTime(new Date(b.start).toISOString()).slice(0, 5), values: [b.ok, b.failed] }))} />
                </div>
              ) : (
                <EmptyState title="No logins" body="No login events in this source." />
              )}
            </div>
            <div className="panel">
              <div className="panel-head"><b>Active Sessions by User Type</b></div>
              {byType.length ? (
                <div className="ref-donut">
                  <Donut centerLabel="Active Sessions" centerValue={fmt(k.active)} slices={byType.slice(0, 6).map((r, i) => ({ label: r.name, value: r.count, cls: SLICE[i % SLICE.length], pct: `${r.share.toFixed(1)}%` }))} />
                </div>
              ) : (
                <EmptyState title="No active sessions" body="No login is the latest event for any user." />
              )}
            </div>
            <div className="panel">
              <div className="panel-head"><b>Sessions by Exchange</b></div>
              {bySegment.length ? (
                <div className="ref-chart">
                  <HBarList rows={bySegment.map((s, i) => ({ label: s.name, value: `${fmt(s.count)} (${s.share.toFixed(1)}%)`, pct: (s.count / maxSeg) * 100, cls: BARS[i % BARS.length] }))} />
                </div>
              ) : (
                <EmptyState title="No segments" body="Active sessions carry no segment list." />
              )}
            </div>
          </section>

          <section className="ref-grid recent">
            <div className="panel">
              <div className="panel-head"><b>Active Sessions</b><span className="sub">{fmt(k.active)} active · first 10</span></div>
              {active.length ? (
                <div className="table-scroll">
                  <table className="compact ref-table">
                    <thead><tr><th>#</th><th>User ID</th><th>User Type</th><th>Broker</th><th>Segments</th><th>Login (IST)</th><th>Application</th><th>Status</th></tr></thead>
                    <tbody>
                      {active.map((e, i) => (
                        <tr key={`${e.user_id}-${e.time}-${i}`}>
                          <td>{i + 1}</td>
                          <td className="mono">{e.user_id || "—"}</td>
                          <td>{userType(e)}</td>
                          <td>{e.broker || "—"}</td>
                          <td className="text-amber">{(e.segments || []).slice(0, 3).join(", ") || "—"}{(e.segments || []).length > 3 ? " …" : ""}</td>
                          <td className="mono">{istTime(e.time)}</td>
                          <td>{e.access_type || "—"}{e.app_version ? ` · ${e.app_version}` : ""}</td>
                          <td><span className="ref-pill ok">Active</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState title="No active sessions" body="No login is the latest event for any user." />
              )}
            </div>
            <div className="panel">
              <div className="panel-head"><b>Sessions by Broker</b></div>
              {byBroker.length ? (
                <div className="ref-chart">
                  <HBarList rows={byBroker.map((s, i) => ({ label: s.name, value: `${fmt(s.count)} (${s.share.toFixed(1)}%)`, pct: (s.count / maxBroker) * 100, cls: BARS[i % BARS.length] }))} />
                  <p className="ref-note">IP addresses are masked and carry no location, so sessions are grouped by broker instead of geography.</p>
                </div>
              ) : (
                <EmptyState title="No brokers" body="Active sessions carry no broker." />
              )}
            </div>
          </section>

          <section className="ref-grid three">
            <div className="panel">
              <div className="panel-head"><b>Recent Login Activity</b></div>
              <table className="compact ref-table">
                <thead><tr><th>Time</th><th>User ID</th><th>Event</th><th>Application</th><th>Status</th></tr></thead>
                <tbody>
                  {recent.map((e, i) => (
                    <tr key={`${e.user_id}-${i}`}>
                      <td className="mono">{istTime(e.time)}</td>
                      <td className="mono">{e.user_id || "—"}</td>
                      <td className={e.event === "login" ? "text-green" : ""}>{e.event === "login" ? "Login" : "Logout"}{/success/i.test(String(e.result)) ? " success" : " failed"}</td>
                      <td>{e.access_type || "—"}</td>
                      <td><span className={`ref-pill ${/success/i.test(String(e.result)) ? "ok" : "bad"}`}>{/success/i.test(String(e.result)) ? "Success" : "Failed"}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="panel">
              <div className="panel-head"><b>Session Anomalies</b><span className="sub">Repeat logins in the window</span></div>
              {repeats.length ? (
                <table className="compact ref-table">
                  <thead><tr><th>Last (IST)</th><th>User ID</th><th>Anomaly</th><th>Severity</th></tr></thead>
                  <tbody>
                    {repeats.map((r) => (
                      <tr key={r.user}>
                        <td className="mono">{istTime(r.last)}</td>
                        <td className="mono">{r.user}</td>
                        <td className="text-red">{r.logins} logins</td>
                        <td><span className={`ref-pill ${r.logins >= 4 ? "bad" : "warn"}`}>{r.logins >= 4 ? "High" : "Medium"}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <EmptyState title="No anomalies" body="No user logged in more than once in the window." />
              )}
              <p className="ref-note">Severity: 4+ logins is High, 2–3 is Medium. A repeat login can be a normal reconnect.</p>
            </div>
            <div className="panel">
              <div className="panel-head"><b>Top Users by Session Duration</b></div>
              {longest.length ? (
                <table className="compact ref-table">
                  <thead><tr><th>#</th><th>User ID</th><th className="num">Duration</th></tr></thead>
                  <tbody>
                    {longest.map((d, i) => (
                      <tr key={`${d.user}-${i}`}><td>{i + 1}</td><td className="mono">{d.user}</td><td className="num">{durationText(d.ms)}</td></tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <EmptyState title="No completed sessions" body="Durations need a login followed by a logout for the same user." />
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
