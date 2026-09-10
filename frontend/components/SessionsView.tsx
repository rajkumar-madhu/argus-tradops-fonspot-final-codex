"use client";

import { useMemo, useState } from "react";
import { Download, FileText, Layers, LogIn, LogOut, Printer, Search, Users, X } from "lucide-react";
import RefreshButton from "@/components/RefreshButton";
import { DataTable, EmptyState, KpiCard } from "@/components/UI";
import { fmt, journalWindowLabel, timeIstStamp } from "@/lib/format";
import { SESSION_JOURNAL_FIELDS, LOGOUT_JOURNAL_FIELDS, sessionFieldText } from "@/lib/session-journal-fields";
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

export default function SessionsView({ data, summary, embedded = false }: { data: any; summary?: any; embedded?: boolean }) {
  const [query, setQuery] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [eventFilter, setEventFilter] = useState("");
  const [reportSearch, setReportSearch] = useState<Record<string, string>>({});
  const [selectedRow, setSelectedRow] = useState<Record<string, string> | null>(null);

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

  const journalColumns = eventFilter === "logout" ? LOGOUT_JOURNAL_FIELDS : SESSION_JOURNAL_FIELDS;
  const tableRows = filteredRows.map((row: any) => Object.fromEntries(journalColumns.map(key => [key, sessionFieldText(row.journal_fields?.[key])]))) as Record<string, string>[];
  const detailKeys = ["Event Time (UTC)", "msg_type", "UserId", "AccessType", "DevicePinFlag", "LastAttemptCount", "ReqStatus", "UiDevCode", "UserPrivilege", "Userdetails.BrokerId", "Userdetails.Products", "Userdetails.Region", "Userdetails.UserAccessGrp", "Userdetails.UserAccessTypes", "Userdetails.UserExchDetails", "Userdetails.NorenAppVersion"];
  const reportColumns = [
    ["Userdetails.UserId", "Client Id"], ["Userdetails.UserName", "UserName"], ["Userdetails.BrokerId", "Brk Id"],
    ["Event Time (UTC)", "Login time"], ["ReqStatus", "Login attempt"], ["AccessType", "Platform"],
    ["Userdetails.UserIpAddr", "IP Address"], ["Userdetails.UserMacAddr", "MAC Address"],
  ] as const;
  const reportRows = filteredRows
    .map((row: any) => reportColumns.map(([key]) => sessionFieldText(row.journal_fields?.[key])))
    .filter((reportRow) => reportColumns.every(([, label], index) => !reportSearch[label] || reportRow[index].toLowerCase().includes(reportSearch[label].toLowerCase())));

  function reportTableHtml() {
    const esc = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
    return `<table><thead><tr>${reportColumns.map(([, label]) => `<th>${esc(label)}</th>`).join("")}</tr></thead><tbody>${reportRows.map((row) => `<tr>${row.map((cell) => `<td>${esc(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
  }

  function downloadExcel() {
    const blob = new Blob([`<html><head><meta charset="utf-8"></head><body><h2>Argus TradeOps session report</h2>${reportTableHtml()}</body></html>`], { type: "application/vnd.ms-excel" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a"); link.href = url; link.download = "tradeops-session-report.xls"; link.click(); URL.revokeObjectURL(url);
  }

  function printPdf() {
    const popup = window.open("", "tradeops-session-report", "noopener,noreferrer,width=1200,height=800");
    if (!popup) return;
    popup.document.write(`<html><head><title>Argus TradeOps session report</title><style>body{font:12px Arial;color:#111;padding:24px}h2{margin:0 0 14px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #d5d3cb;padding:7px;text-align:left}th{background:#faf1e3}</style></head><body><h2>Argus TradeOps session report</h2><p>${reportRows.length} rows · ${isFileBased ? "FILE-BASED journal snapshot" : "source: " + (live.source || "—")}</p>${reportTableHtml()}</body></html>`);
    popup.document.close(); popup.focus(); popup.print();
  }

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
      {/* The Overview tab owns the page header and KPIs when embedded. */}
      {!embedded && (
        <>
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
        </>
      )}

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
            <p className="sub">Requested journal columns in source order · timestamps in UTC · CSV export retains these headers.</p>
          </div>
          <span className="source-tag">
            {fmt(filteredRows.length)} of {fmt(rows.length)} rows
          </span>
        </div>
        <div className="session-report-toolbar">
          <b>Session report</b>
          <span className="sub">Client, broker, platform and masked network details for the selected range</span>
          <div className="session-report-actions">
            <button type="button" className="secondary-btn" onClick={downloadExcel} disabled={!reportRows.length}><Download size={14} /> Excel</button>
            <button type="button" className="secondary-btn" onClick={printPdf} disabled={!reportRows.length}><Printer size={14} /> PDF / Print</button>
          </div>
        </div>
        <div className="session-report-preview table-scroll">
          <table><thead><tr>{reportColumns.map(([, label]) => <th key={label}>{label}<input aria-label={`Search ${label}`} placeholder="Search" value={reportSearch[label] || ""} onChange={(e) => setReportSearch((current) => ({ ...current, [label]: e.target.value }))} /></th>)}</tr></thead>
            <tbody>{reportRows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody>
          </table>
        </div>
        {rows.length === 0 ? (
          <EmptyState title="No session events" body="No login or logout rows were returned for this source." />
        ) : (
          <>
          <div className="session-detail-strip panel" aria-live="polite">
            <div className="panel-head"><div><b>Selected event details</b><p className="sub">Click a row to inspect operational fields without scrolling the full register.</p></div></div>
            {selectedRow ? <dl className="session-detail-grid">{detailKeys.map((key) => <div key={key}><dt>{key}</dt><dd>{selectedRow[key] || "—"}</dd></div>)}</dl> : <p className="sub session-detail-empty">Select a login or logout row to view its details.</p>}
          </div>
          <DataTable
            columns={journalColumns.map(key => ({key, label: key}))}
            rows={filteredRows.map((row: any) => Object.fromEntries(journalColumns.map(key => [key, sessionFieldText(row.journal_fields?.[key])])))}
            onRowClick={(row) => setSelectedRow(row)}
            rowKey={(row, index) => `${row['Record No.']}-${index}`}
          />
          </>
        )}
        {isFileBased && (
          <p className="sessions-footnote">
            <FileText size={13} aria-hidden />
            Journal snapshot mode — identifiers are masked; authentication, password, session and DPIN values are withheld. Missing fields display —.
          </p>
        )}
      </section>
    </div>
  );
}
