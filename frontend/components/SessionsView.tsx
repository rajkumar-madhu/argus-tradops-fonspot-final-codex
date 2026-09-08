"use client";

import { useMemo, useState } from "react";
import { FileText, Layers, LogIn, LogOut, Search, Users, X } from "lucide-react";
import RefreshButton from "@/components/RefreshButton";
import { EmptyState, KpiCard } from "@/components/UI";
import { fmt, journalWindowLabel, timeIstStamp } from "@/lib/format";
import { filterRows } from "@/lib/table-filters";

function fromUtcDateInput(v: string): string {
  if (!v) return "";
  return `${v}T00:00:00.000Z`;
}

function toUtcDateEnd(v: string): string {
  if (!v) return "";
  return `${v}T23:59:59.999Z`;
}

function sessionResult(row: Record<string, unknown>): string {
  const result = String(row.result || "").trim();
  if (result) return result;
  const status = String(row.status || "").trim();
  if (!status) return "—";
  if (status.toLowerCase().includes("success")) return "Success";
  return status;
}

export default function SessionsView({ data, summary }: { data: any; summary?: any }) {
  const [query, setQuery] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [eventFilter, setEventFilter] = useState("");

  const live = data || {};
  const summaryData = summary || {};
  const rows: any[] = live.items || [];

  const isJournal = live?.source === "journal snapshot";
  const isDemo = live?.source === "demo";
  const isFileBased = isJournal;

  const loginCount = Number(live.login_count ?? summaryData.login_events ?? rows.filter((r) => r.event === "login").length);
  const logoutCount = Number(live.logout_count ?? summaryData.logout_events ?? rows.filter((r) => r.event === "logout").length);
  const activeCount = Number(live.active_count ?? summaryData.active_sessions ?? rows.filter((r) => r.active).length);
  const journalEvents = Number(live.journal_events ?? summaryData.journal_events ?? 0);
  const uniqueUsers = Number(summaryData.unique_users ?? new Set(rows.map((r) => r.user_id)).size);

  const filteredRows = useMemo(() => {
    const base = filterRows(rows, {
      query,
      from: fromDate ? fromUtcDateInput(fromDate) : "",
      to: toDate ? toUtcDateEnd(toDate) : "",
      timeKey: "time",
      facets: eventFilter ? { event: eventFilter } : undefined,
    });
    return base;
  }, [rows, query, fromDate, toDate, eventFilter]);

  const activeFilters =
    Number(Boolean(query)) + Number(Boolean(fromDate || toDate)) + Number(Boolean(eventFilter));

  function resetFilters() {
    setQuery("");
    setFromDate("");
    setToDate("");
    setEventFilter("");
  }

  const metaLine = isFileBased
    ? `${fmt(loginCount)} login + ${fmt(logoutCount)} logout events · ${fmt(journalEvents)} ordupd total · ${journalWindowLabel(live.from, live.to)} · Uploaded history, not a live feed`
    : isDemo
      ? `${fmt(rows.length)} session events loaded · Elasticsearch not connected`
      : `${fmt(activeCount)} active sessions · ${fmt(uniqueUsers)} unique users · operational Elasticsearch read path`;

  return (
    <div className="sessions-page">
      <section className="dashboard-head sessions-head">
        <div>
          <div className="sessions-title-row">
            <h1>Users &amp; Sessions</h1>
            {isFileBased ? (
              <span className="source-badge file-based">FILE-BASED</span>
            ) : (
              <span className={`source-badge ${isDemo ? "warn" : "live"}`}>
                {isDemo ? "OFFLINE" : "LIVE"}
              </span>
            )}
          </div>
          <p>Historical observations do not prove a session is currently active.</p>
          <p className="sessions-meta">{metaLine}</p>
        </div>
        <div className="time-controls">
          <RefreshButton />
        </div>
      </section>

      <section className="kpi-grid four sessions-kpis">
        <KpiCard
          label="Session events"
          value={fmt(rows.length)}
          delta={isFileBased ? "Login + logout rows in journal" : "Events in current window"}
          tone="blue"
          icon={<Layers size={18} />}
        />
        <KpiCard
          label="Logins"
          value={fmt(loginCount)}
          delta={`${fmt(activeCount)} successful active`}
          deltaTone="up"
          tone="green"
          icon={<LogIn size={18} />}
        />
        <KpiCard
          label="Logouts"
          value={fmt(logoutCount)}
          delta={logoutCount ? "Recorded logout events" : "No logout rows"}
          tone="amber"
          icon={<LogOut size={18} />}
        />
        <KpiCard
          label="Unique users"
          value={fmt(uniqueUsers)}
          delta={isFileBased ? `${fmt(journalEvents)} ordupd in upload` : "Distinct user identifiers"}
          tone="purple"
          icon={<Users size={18} />}
        />
      </section>

      <section className="panel sessions-toolbar-panel">
        <div className="sessions-toolbar">
          <label className="sessions-search" htmlFor="sessions-search">
            <Search size={15} aria-hidden />
            <input
              id="sessions-search"
              type="search"
              value={query}
              placeholder="Search user, event, result, source row…"
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <label htmlFor="sessions-event">
            Event
            <select
              id="sessions-event"
              value={eventFilter}
              onChange={(e) => setEventFilter(e.target.value)}
            >
              <option value="">All events</option>
              <option value="login">login</option>
              <option value="logout">logout</option>
            </select>
          </label>
          <label htmlFor="sessions-from">
            From (UTC)
            <input
              id="sessions-from"
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </label>
          <label htmlFor="sessions-to">
            To (UTC)
            <input
              id="sessions-to"
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
            />
          </label>
          {activeFilters > 0 && (
            <button type="button" className="link-btn sessions-reset" onClick={resetFilters}>
              <X size={14} aria-hidden />
              Reset filters
            </button>
          )}
        </div>
      </section>

      <section className="panel sessions-table-panel">
        <div className="panel-head">
          <div>
            <b>Session register</b>
            <p className="sub">Every row retains its journal source-row reference and reported login/logout result.</p>
          </div>
          <span className="source-tag">
            {fmt(filteredRows.length)} of {fmt(rows.length)} rows
          </span>
        </div>
        {rows.length === 0 ? (
          <EmptyState title="No session events" body="No login or logout rows were returned for this source." />
        ) : (
          <div className="table-scroll" tabIndex={0} aria-label="Sessions table">
            <table className="orders-table sessions-table">
              <thead>
                <tr>
                  <th>User identifier</th>
                  <th>Event</th>
                  <th>Reported result</th>
                  <th>Time · IST</th>
                  <th>Source row</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row: any, i: number) => (
                  <tr key={`${row.user_id}-${row.source_row ?? i}-${row.time}`}>
                    <td><b>{row.user_id || "—"}</b></td>
                    <td className="mono">{row.event || "—"}</td>
                    <td>{sessionResult(row)}</td>
                    <td className="mono">{timeIstStamp(row.time)}</td>
                    <td className="mono">{row.source_row ?? "—"}</td>
                  </tr>
                ))}
                {!filteredRows.length && (
                  <tr>
                    <td colSpan={5}>
                      <EmptyState
                        title="No matching sessions"
                        body="Try clearing filters or widening the UTC date range."
                      />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        {isFileBased && (
          <p className="sessions-footnote">
            <FileText size={13} aria-hidden />
            Journal snapshot mode — user identifiers are shown as recorded in the uploaded journal file.
          </p>
        )}
      </section>
    </div>
  );
}
