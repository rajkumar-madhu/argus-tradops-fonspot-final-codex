"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, ArrowLeft, ArrowRight, CalendarDays, Download,
  FileSpreadsheet, Filter, LoaderCircle, RotateCcw, Search, X, XCircle,
} from "lucide-react";
import TenantSwitcher from "@/components/TenantSwitcher";
import { EmptyState } from "@/components/UI";
import { authHeaders } from "@/lib/session";
import { apiError } from "@/lib/api-result";
import { apiUrl } from "@/lib/runtime";
import {
  calendarQuery, dayLabel, ordersDrilldown, rangeHasActivity, shiftIsoDate, weekdayOffset,
  type CalendarFilters, type CalendarPayload,
} from "@/lib/calendar";


function localClock(value: string, timezone: string) {
  if (!value) return "Time unavailable";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: timezone, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).format(new Date(value));
}

type DetailTab = "timeline" | "rejections" | "alerts";

export default function CalendarDashboard({ initial, initialDetailOpen = false, initialFilters = {} }: { initial: CalendarPayload; initialDetailOpen?: boolean; initialFilters?: Partial<CalendarFilters> }) {
  const requestVersion = useRef(0);
  const modal = useRef<HTMLElement>(null);
  const [data, setData] = useState(initial);
  const [filters, setFilters] = useState<CalendarFilters>({
    account: initialFilters.account || "", exchange: initialFilters.exchange || "", service: initialFilters.service || "", start: initial.window?.start || "", end: initial.window?.end || "",
  });
  const [appliedFilters, setAppliedFilters] = useState(filters);
  const [selected, setSelected] = useState(initial.selected_date || initial.window?.today || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(initial._error || "");
  const [detailError, setDetailError] = useState("");
  const [exporting, setExporting] = useState<"csv" | "xlsx" | "">("");
  const [detailOpen, setDetailOpen] = useState(initialDetailOpen);
  const [detailTab, setDetailTab] = useState<DetailTab>("timeline");

  const syncDateUrl = (date?: string, scope = appliedFilters) => {
    const url = new URL(window.location.href);
    for (const [key, value] of Object.entries(scope)) value ? url.searchParams.set(key, value) : url.searchParams.delete(key);
    if (date) url.searchParams.set("date", date);
    else url.searchParams.delete("date");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  };

  const closeDetail = () => {
    setDetailOpen(false);
    syncDateUrl();
  };

  useEffect(() => {
    if (!detailOpen) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const controls = () => Array.from(modal.current?.querySelectorAll<HTMLElement>("button:not([disabled]), a[href], select, input") || []);
    controls()[0]?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeDetail();
      if (event.key === "Tab") {
        const nodes = controls(), first = nodes[0], last = nodes[nodes.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [detailOpen]);

  const load = async (nextFilters = filters, nextSelected = selected) => {
    const version = ++requestVersion.current;
    setLoading(true);
    setError("");
    setDetailError("");
    try {
      const response = await fetch(`${apiUrl()}/api/calendar?${calendarQuery(nextFilters, nextSelected)}`, {
        headers: authHeaders(), credentials: "include", cache: "no-store",
      });
      const body = await response.json();
      if (!response.ok) throw new Error(apiError({ _error: typeof body.detail === "string" ? body.detail : `Calendar API ${response.status}` }) || "Unable to load calendar");
      if (version !== requestVersion.current) return;
      setData(body);
      setSelected(body.selected_date);
      const applied = { ...nextFilters, start: body.window.start, end: body.window.end };
      setFilters(applied);
      setAppliedFilters(applied);
      syncDateUrl(new URL(window.location.href).searchParams.has("date") ? body.selected_date : undefined, applied);
    } catch (reason) {
      if (version !== requestVersion.current) return;
      const message = reason instanceof Error ? reason.message : "Unable to load calendar data";
      setError(message);
      setDetailError(message);
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  };

  const selectDay = (date: string) => {
    setSelected(date);
    setData((current) => ({ ...current, detail: { orders: [], alerts: [] } }));
    setDetailOpen(true);
    setDetailTab("timeline");
    syncDateUrl(date);
    void load(appliedFilters, date);
  };

  const moveWindow = (direction: -1 | 1) => {
    const nextEnd = shiftIsoDate(filters.end, direction * 30);
    const cappedEnd = nextEnd > data.window.today ? data.window.today : nextEnd;
    const next = { ...filters, start: shiftIsoDate(cappedEnd, -29), end: cappedEnd };
    setFilters(next);
    setSelected(cappedEnd);
    setDetailOpen(false);
    syncDateUrl();
    void load(next, cappedEnd);
  };

  const reset = () => {
    const next = { account: "", exchange: "", service: "", start: shiftIsoDate(data.window.today, -29), end: data.window.today };
    setFilters(next);
    setSelected(data.window.today);
    setDetailOpen(false);
    syncDateUrl();
    void load(next, data.window.today);
  };

  const exportRange = async (format: "csv" | "xlsx") => {
    setExporting(format);
    setError("");
    try {
      const response = await fetch(`${apiUrl()}/api/calendar?${calendarQuery(appliedFilters, selected, format)}`, {
        headers: authHeaders(), credentials: "include", cache: "no-store",
      });
      if (!response.ok) throw new Error(`Export failed with API ${response.status}`);
      const blob = await response.blob();
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.download = `argus-calendar-${filters.start}-${filters.end}.${format}`;
      anchor.click();
      URL.revokeObjectURL(href);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to export calendar data");
    } finally {
      setExporting("");
    }
  };

  const offset = weekdayOffset(data.window.start);
  const selectedDay = data.days.find((day) => day.date === selected);
  const allEmpty = data.days.length > 0 && data.complete && !rangeHasActivity(data.days);
  const timeline = useMemo(() => [
    ...(data.detail?.orders || []).map((item) => ({ ...item, kind: "order", at: item.local_time || item.time })),
    ...(data.detail?.alerts || []).map((item) => ({ ...item, kind: "alert", at: item.local_time || item.first_seen })),
  ].sort((a, b) => String(a.at).localeCompare(String(b.at))), [data.detail]);
  const rejectedOrders = useMemo(
    () => (data.detail?.orders || []).filter((item) => String(item.status).toLowerCase() === "rejected"),
    [data.detail],
  );
  const visibleRecords = detailTab === "rejections"
    ? rejectedOrders.map((item) => ({ ...item, kind: "order", at: item.local_time || item.time }))
    : detailTab === "alerts"
      ? (data.detail?.alerts || []).map((item) => ({ ...item, kind: "alert", at: item.local_time || item.first_seen }))
      : timeline;
  const selectedIndex = data.days.findIndex((day) => day.date === selected);
  const previousDay = selectedIndex > 0 ? data.days[selectedIndex - 1] : undefined;
  const nextDay = selectedIndex >= 0 && selectedIndex < data.days.length - 1 ? data.days[selectedIndex + 1] : undefined;

  return (
    <div className="calendar-page">
      <header className="calendar-head">
        <div>
          <div className="calendar-title"><CalendarDays size={20} /><h1>Operational Calendar</h1></div>
          <p>{data.tenant?.name} · {data.timezone} · {data.window.days} days ending {dayLabel(data.window.end, { day: "numeric", month: "short", year: "numeric" })}</p>
        </div>
        <div className="calendar-head-actions">
          <button type="button" className="btn" onClick={() => void exportRange("csv")} disabled={!!exporting} title="Export CSV"><Download size={15} />{exporting === "csv" ? "Exporting" : "CSV"}</button>
          <button type="button" className="btn" onClick={() => void exportRange("xlsx")} disabled={!!exporting} title="Export Excel"><FileSpreadsheet size={15} />{exporting === "xlsx" ? "Exporting" : "Excel"}</button>
        </div>
      </header>

      {data.sample_data && <div className="calendar-notice sample"><b>Offline sample</b><span>Development-only records are shown and are not a live trading feed.</span></div>}
      {data.freshness?.state === "delayed" && <div className="calendar-notice delayed"><AlertTriangle size={16} /><b>Delayed data</b><span>The calendar is using a journal snapshot. Latest activity may not be present.</span></div>}
      {data.source !== "unavailable" && !data.complete && <div className="calendar-notice partial"><AlertTriangle size={16} /><b>Partial range</b><span>The source contains {data.source_count.toLocaleString()} records; {data.returned.toLocaleString()} were available for aggregation. Counts are lower bounds.</span></div>}
      {data.source === "unavailable" && <div className="calendar-notice">Order records require order access. This role can only see permitted incident activity.</div>}
      {error && <div className="calendar-notice error" role="alert"><XCircle size={16} /><b>Calendar unavailable</b><span>{error}</span><button type="button" onClick={() => void load()}><RotateCcw size={14} />Retry</button></div>}

      <section className="calendar-toolbar" aria-label="Calendar filters">
        <span className="calendar-filter-label"><Filter size={15} />Filters</span>
        <div><span>Customer</span><TenantSwitcher /></div>
        <label><span>Trading account</span><select value={filters.account} onChange={(e) => setFilters({ ...filters, account: e.target.value })}><option value="">All accounts</option>{data.filters.accounts.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label><span>Exchange</span><select value={filters.exchange} onChange={(e) => setFilters({ ...filters, exchange: e.target.value })}><option value="">All exchanges</option>{data.filters.exchanges.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label><span>Service</span><select value={filters.service} onChange={(e) => setFilters({ ...filters, service: e.target.value })}><option value="">All services</option>{data.filters.services.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label><span>From</span><input type="date" value={filters.start} max={filters.end} onChange={(e) => setFilters({ ...filters, start: e.target.value })} /></label>
        <label><span>To</span><input type="date" value={filters.end} min={filters.start} max={data.window.today} onChange={(e) => setFilters({ ...filters, end: e.target.value })} /></label>
        <button type="button" className="btn primary" onClick={() => void load()} disabled={loading}><Search size={15} />Apply</button>
        <button type="button" className="icon-btn" onClick={reset} title="Reset filters" aria-label="Reset filters"><RotateCcw size={15} /></button>
      </section>

      <p className="calendar-note">Counts show the latest recorded order state in this window. Masked account groups may contain multiple trading accounts.</p>
      {data.days.some(day => day.alerts_available) && !data.alerts_complete && <p className="calendar-notice partial">Incident history is limited; alert counts are lower bounds.</p>}
      <section className="calendar-workspace">
        <div className="calendar-panel panel" aria-busy={loading}>
          <div className="calendar-range-head">
            <button type="button" className="icon-btn" onClick={() => moveWindow(-1)} title="Previous 30 days" aria-label="Previous 30 days"><ArrowLeft size={16} /></button>
            <div><b>{dayLabel(data.window.start, { day: "numeric", month: "short" })} – {dayLabel(data.window.end, { day: "numeric", month: "short", year: "numeric" })}</b><span>Customer trading timezone: {data.timezone}</span></div>
            <button type="button" className="icon-btn" onClick={() => moveWindow(1)} disabled={data.window.end >= data.window.today} title="Next 30 days" aria-label="Next 30 days"><ArrowRight size={16} /></button>
          </div>
          <div className="calendar-weekdays" aria-hidden="true">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <span key={day}>{day}</span>)}</div>
          <div className="calendar-grid">
            {Array.from({ length: offset }).map((_, index) => <span className="calendar-spacer" key={`spacer-${index}`} />)}
            {data.days.map((day) => (
              <article className={`calendar-day${day.date === selected ? " selected" : ""}${day.date === data.window.today ? " today" : ""}`} key={day.date}>
                <button type="button" className="calendar-day-main" onClick={() => selectDay(day.date)} aria-label={`Open ${day.date} details`}>
                  <span className="calendar-day-date"><b>{dayLabel(day.date, { day: "numeric" })}</b><small>{dayLabel(day.date, { month: "short" })}</small>{day.date === data.window.today && <em>Today</em>}</span>
                  {day.orders_available ? <span className="calendar-day-total"><b>{day.orders.toLocaleString()}</b> orders{!day.complete && <small>Partial</small>}</span> : <span className="calendar-unavailable">Orders unavailable</span>}
                  <span className="calendar-metrics"><span className="executed"><i />{day.orders_available ? `${day.executed} executed` : "Orders unavailable"}</span><span className="alerts"><i />{day.alerts_available ? `${day.alerts} alerts` : "Alerts unavailable"}</span></span>
                </button>
                {day.orders_available && <div className="calendar-day-links">
                  <Link className="open" href={ordersDrilldown(day, "open_pending", appliedFilters)}>{day.open_pending} open / pending</Link>
                  <Link className="rejected" href={ordersDrilldown(day, "rejected", appliedFilters)}>{day.rejected} rejected</Link>
                </div>}
              </article>
            ))}
            {loading && <div className="calendar-loading"><LoaderCircle className="spin" size={24} /><span>Refreshing calendar</span></div>}
          </div>
          {allEmpty && <EmptyState title="No operational activity in this range" body="The order source returned no recorded orders for these dates and filters. Alert availability is shown separately." />}
        </div>

      </section>

      {detailOpen && (
        <div className="calendar-day-backdrop" onMouseDown={(event) => event.target === event.currentTarget && closeDetail()}>
          <section ref={modal} className="calendar-day-explore" role="dialog" aria-modal="true" aria-labelledby="day-explore-title" aria-busy={loading}>
            <header className="day-explore-head">
              <button type="button" className="icon-btn" onClick={closeDetail} title="Back to calendar" aria-label="Back to calendar"><X size={18} /></button>
              <div className="day-explore-title">
                <span>{selected ? dayLabel(selected, { weekday: "long" }) : "Selected day"}</span>
                <h2 id="day-explore-title">{selected ? dayLabel(selected, { day: "numeric", month: "long", year: "numeric" }) : "Day Explore"}</h2>
                <small>{data.tenant?.name} · Trading timezone {data.timezone}</small>
              </div>
              <div className="day-explore-nav" aria-label="Day navigation">
                <button type="button" className="icon-btn" disabled={!previousDay || loading} onClick={() => previousDay && selectDay(previousDay.date)} title="Previous day" aria-label="Previous day"><ArrowLeft size={16} /></button>
                <span>{selectedIndex + 1} of {data.days.length}</span>
                <button type="button" className="icon-btn" disabled={!nextDay || loading} onClick={() => nextDay && selectDay(nextDay.date)} title="Next day" aria-label="Next day"><ArrowRight size={16} /></button>
              </div>
            </header>

            {data.sample_data && <div className="day-explore-sample"><b>Offline sample</b><span>Development records, not a live trading feed.</span></div>}

            {selectedDay && (
              <div className="day-explore-kpis" aria-label="Selected day totals">
                <button type="button" onClick={() => setDetailTab("timeline")}><span>Orders</span><b>{selectedDay.orders_available ? selectedDay.orders : "—"}</b><small>{selectedDay.orders_available ? "Recorded activity" : "Feed unavailable"}</small></button>
                <button type="button" onClick={() => setDetailTab("timeline")}><span>Executed</span><b>{selectedDay.orders_available ? selectedDay.executed : "—"}</b><small>Completed orders</small></button>
                {selectedDay.orders_available && <><Link href={ordersDrilldown(selectedDay, "open_pending", appliedFilters)}><span>Open / pending</span><b>{selectedDay.orders_available ? selectedDay.open_pending : "—"}</b><small>Open filtered orders</small></Link>
                <Link className="rejected" href={ordersDrilldown(selectedDay, "rejected", appliedFilters)}><span>Rejected</span><b>{selectedDay.orders_available ? selectedDay.rejected : "—"}</b><small>Open filtered orders</small></Link></>}
                <button type="button" onClick={() => setDetailTab("alerts")}><span>Alerts</span><b>{selectedDay.alerts_available ? selectedDay.alerts : "—"}</b><small>{selectedDay.alerts_available ? "Operational alerts" : "Feed unavailable"}</small></button>
              </div>
            )}

            <div className="day-explore-tabs" role="tablist" aria-label="Day records">
              <button type="button" role="tab" aria-selected={detailTab === "timeline"} className={detailTab === "timeline" ? "active" : ""} onClick={() => setDetailTab("timeline")}>Timeline <span>{timeline.length}</span></button>
              <button type="button" role="tab" aria-selected={detailTab === "rejections"} className={detailTab === "rejections" ? "active" : ""} onClick={() => setDetailTab("rejections")}>Rejections <span>{rejectedOrders.length}</span></button>
              <button type="button" role="tab" aria-selected={detailTab === "alerts"} className={detailTab === "alerts" ? "active" : ""} onClick={() => setDetailTab("alerts")}>Alerts <span>{data.detail?.alerts?.length || 0}</span></button>
            </div>

            {data.detail_truncated && <p className="calendar-notice partial">Selected-day records are limited to 5,000 orders. More orders may exist.</p>}
            <div className="day-explore-body">
              <div className="day-explore-list-head" aria-hidden="true"><span>Local time</span><span>Event</span><span>Instrument</span><span>Service / component</span><span>Reason / detail</span><span>Actions</span></div>
              {detailError ? (
                <div className="day-explore-error" role="alert">
                  <XCircle size={20} />
                  <div><b>Selected day unavailable</b><p>{detailError}</p></div>
                  <button type="button" className="btn" onClick={() => void load(filters, selected)}><RotateCcw size={14} />Retry</button>
                </div>
              ) : visibleRecords.length === 0 ? (
                <EmptyState title={detailTab === "rejections" ? "No rejected orders" : detailTab === "alerts" ? "No alerts available" : "No records for this day"} body={data.complete ? "The connected sources returned no matching activity for the selected date." : "No matching records were available in the partial source response."} />
              ) : (
                <ol className="day-explore-records">
                  {visibleRecords.map((item, index) => item.kind === "alert" ? (
                    <li className="is-alert" key={`alert-${item.fingerprint || index}`}>
                      <time><span>Local time</span>{localClock(item.at, data.timezone)}</time>
                      <div className="day-record-event"><span>Event</span><b>Alert · {item.severity || "Unknown"}</b><small>{item.name || "Operational alert"}</small></div>
                      <div><span>Instrument</span><b>Not applicable</b></div>
                      <div><span>Service / component</span><b>{item.component || item.source || "Unavailable"}</b></div>
                      <div className="day-record-detail"><span>Reason / detail</span><p>{item.detail || "No alert detail supplied."}</p></div>
                      <div className="day-record-actions"><span>Actions</span><Link href={`/logs?q=${encodeURIComponent(item.resource || item.source || "")}`}>Infrastructure Logs</Link></div>
                    </li>
                  ) : (
                    <li className={String(item.status).toLowerCase() === "rejected" ? "is-rejected" : ""} key={`order-${item.order_id}-${index}`}>
                      <time><span>Local time</span>{localClock(item.at, data.timezone)}</time>
                      <div className="day-record-event"><span>Event</span><b>{item.status || "Order update"}</b><small>{item.order_id || "Order reference unavailable"}</small></div>
                      <div><span>Instrument</span><b>{item.symbol || "Unknown symbol"}</b><small>{item.exchange || "Exchange unavailable"}</small></div>
                      <div><span>Service / component</span><b>{item.service || "Unavailable"}</b></div>
                      <div className="day-record-detail"><span>Reason / detail</span><p>{item.rejection_reason || "No rejection or exception detail."}</p></div>
                      <div className="day-record-actions"><span>Actions</span><Link href={`/orders?order=${encodeURIComponent(item.order_id || "")}`}>Order Details</Link><Link href={ordersDrilldown(selectedDay!, "all", appliedFilters)}>Orders</Link><Link href={`/logs?q=${encodeURIComponent(item.order_id || "")}`}>Infrastructure Logs</Link></div>
                    </li>
                  ))}
                </ol>
              )}
              {loading && <div className="day-explore-loading"><LoaderCircle className="spin" size={24} /><span>Loading selected day</span></div>}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
