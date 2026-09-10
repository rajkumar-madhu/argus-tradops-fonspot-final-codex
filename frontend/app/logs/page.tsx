import Link from "next/link";
import { ChevronDown, Database, Download, Filter, Search, X } from "lucide-react";
import Shell from "@/components/Shell";
import JournalStream from "@/components/JournalStream";
import { Donut, StackedBars } from "@/components/Charts";
import { EmptyState } from "@/components/UI";
import { apiError, getJSON } from "@/lib/api";
import { sourceBadgeText, sourceBadgeTone } from "@/lib/data-source";
import { fmt } from "@/lib/format";
import {
  displayValue, fieldLabel, isUntranslated, istTime, levelBreakdown, levelColor,
  pageBounds, selectedFacets, toggleFacet, withOffset,
  type Facet, type LevelBucket,
} from "@/lib/journal-explore";

const MSG_TYPES = [
  { value: "ordupd", label: "Order updates" },
  { value: "login", label: "Logins" },
  { value: "logout", label: "Logouts" },
  { value: "yel_connected", label: "Exchange connect" },
];

type Explore = {
  source?: string; msg_type?: string; columns?: string[]; facets?: Facet[];
  histogram?: { buckets?: LevelBucket[]; start?: string | null; end?: string | null; undated?: number; level_field?: string | null };
  total?: number; count?: number; limit?: number; offset?: number;
  items?: { source_line: number; fields: Record<string, unknown> }[];
  search_fields?: string[];
};

/**
 * Logs Explorer in the reference layout (mockup 01_19_54) over the masked
 * journal: message-type tabs, a scoped query bar, events over time stacked by
 * outcome, the record stream and facet Quick Filters. The journal has no log
 * level, so "level" is each record's outcome (order or request status).
 */
export default async function Page({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const submitted = await searchParams;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(submitted)) {
    if (value === undefined) continue;
    for (const item of Array.isArray(value) ? value : [value]) params.append(key, item);
  }

  const msgType = MSG_TYPES.some((t) => t.value === params.get("msg_type"))
    ? params.get("msg_type")! : "ordupd";
  params.set("msg_type", msgType);
  const typeLabel = MSG_TYPES.find((t) => t.value === msgType)!.label;
  const q = params.get("q") ?? "";
  const limit = Number(params.get("limit")) || 50;
  const offset = Number(params.get("offset")) || 0;

  const d = await getJSON<Explore>(`/api/journal/explore?${params.toString()}`);
  const err = apiError(d);

  const rows = d.items ?? [];
  const columns = d.columns ?? [];
  const facets = d.facets ?? [];
  const count = d.count ?? 0;
  const buckets = d.histogram?.buckets ?? [];
  const levelField = d.histogram?.level_field ?? null;
  const levels = levelBreakdown(buckets, levelField);
  const active = selectedFacets(params);
  const bounds = pageBounds(count, limit, offset);
  const tick = (iso: string) => istTime(iso).slice(0, 5);

  const exportParams = new URLSearchParams({ msg_type: msgType });
  if (q) exportParams.set("q", q);
  const denied = (d as { _status?: number })._status === 403 || (d as { _status?: number })._status === 401;

  return (
    <Shell>
      <div className="ref-page logs-page">
        <section className="ref-head">
          <div>
            <div className="ref-title-row">
              <h1>Logs Explorer</h1>
              {!err && <span className={`source-badge ${sourceBadgeTone(d.source)}`}>{sourceBadgeText(d.source)}</span>}
            </div>
            <p>Search, analyze and troubleshoot the masked Noren journal · times in IST</p>
          </div>
          {!err && (
            <div className="ref-controls">
              <a className="lx-btn" href={`/api/exports/journal?${exportParams}`}
                 title="Records matching the search text, masked; facet filters are not applied to the export">
                <Download size={14} aria-hidden="true" /> Export CSV
              </a>
            </div>
          )}
        </section>

        <nav className="ref-tabs lx-tabs" aria-label="Message type">
          {MSG_TYPES.map((type) => {
            const next = new URLSearchParams({ msg_type: type.value });
            if (q) next.set("q", q);
            return (
              <Link key={type.value} href={`/logs?${next}`} aria-current={type.value === msgType ? "page" : undefined}
                    className={type.value === msgType ? "active" : undefined}>
                {type.label}
              </Link>
            );
          })}
        </nav>

        {err ? (
          <EmptyState title={denied ? "Access limited" : "Unable to load journal records"}
                      body={denied ? `Your role cannot read ${typeLabel.toLowerCase()}. Pick another message type.` : err} />
        ) : (
          <>
            <section className="panel lx-query">
              <form action="/logs" className="lx-query-row">
                <input type="hidden" name="msg_type" value={msgType} />
                {params.getAll("facet").map((token) => (
                  <input key={token} type="hidden" name="facet" value={token} />
                ))}
                <span className="lx-source"><Database size={14} aria-hidden="true" /> Journal · {typeLabel}</span>
                <label className="lx-query-field">
                  <Search size={14} aria-hidden="true" />
                  <input name="q" defaultValue={q} aria-label="Search records" spellCheck={false}
                         placeholder={`Search ${(d.search_fields ?? []).join(", ") || "records"}`} />
                </label>
                <button className="primary lx-run" type="submit"><Search size={14} aria-hidden="true" /> Run Query</button>
              </form>
              <div className="lx-filter-row">
                <Filter size={13} aria-hidden="true" />
                {active.length === 0 && !q && <span className="lx-muted">No filters — pick values in Quick Filters</span>}
                {q && (
                  <Link className="lx-pill" href={`/logs?${(() => { const n = new URLSearchParams(params); n.delete("q"); n.delete("offset"); return n; })()}`}>
                    Text: {q} <X size={11} aria-hidden="true" />
                  </Link>
                )}
                {active.map(({ field, value }) => (
                  <Link key={`${field}:${value}`} className="lx-pill" href={`/logs?${toggleFacet(params, field, value)}`}>
                    {fieldLabel(field)}: {displayValue(field, value)} <X size={11} aria-hidden="true" />
                  </Link>
                ))}
                <span className="lx-scope">
                  {fmt(count)} of {fmt(d.total ?? 0)} records
                  {d.histogram?.start && <> · {istTime(d.histogram.start)}–{istTime(d.histogram.end)} IST</>}
                  {(d.histogram?.undated ?? 0) > 0 && <> · {fmt(d.histogram!.undated!)} without a timestamp</>}
                </span>
                {(active.length > 0 || q) && <Link className="lx-reset" href={`/logs?msg_type=${msgType}`}>Reset</Link>}
              </div>
            </section>

            <section className="ref-grid lx-charts">
              <div className="panel">
                <div className="panel-head lx-chart-head">
                  <b>Logs Over Time</b>
                  <span className="lx-total">{fmt(count)} records</span>
                  {levels && (
                    <span className="legend">
                      {levels.groups.map((g) => (
                        <span key={g.key} title={`${g.label}: ${g.codes}`}>
                          <i className="lg" style={{ background: g.color }} /> {g.label} {fmt(g.total)} ({g.share.toFixed(1)}%)
                        </span>
                      ))}
                    </span>
                  )}
                </div>
                {buckets.length === 0 ? (
                  <EmptyState title="No timestamped records" body="Nothing in this selection carries an event time." />
                ) : (
                  <div className="ref-chart">
                    {levels ? (
                      <StackedBars width={1000} height={210} series={levels.groups.map((g) => g.label)} colors={levels.groups.map((g) => g.color)}
                                   bins={levels.bins.map((b) => ({ label: tick(b.start), values: b.values }))} />
                    ) : (
                      <StackedBars width={1000} height={210} series={["Records"]} colors={["#8a5a00"]}
                                   bins={buckets.map((b) => ({ label: tick(b.start), values: [b.count] }))} />
                    )}
                    <p className="ref-note">{buckets.length} equal time buckets across the selection · IST.</p>
                  </div>
                )}
              </div>
              <div className="panel">
                <div className="panel-head"><b>Logs by {levelField === "ReqStatus" ? "Request Status" : "Order Status"}</b></div>
                {levels && levels.total > 0 ? (
                  <div className="ref-donut">
                    <Donut centerLabel="Records" centerValue={fmt(levels.total)}
                           slices={levels.groups.map((g) => ({ label: g.label, value: g.total, cls: g.cls, pct: `${g.share.toFixed(1)}%` }))} />
                  </div>
                ) : (
                  <EmptyState title="No outcome field" body={`${typeLabel} records carry no status to break down.`} />
                )}
              </div>
            </section>

            <section className="lx-main">
              <div className="panel lx-logs">
                <div className="panel-head">
                  <b>Logs ({fmt(count)})</b>
                  <span className="sub">{count === 0 ? "none" : `${fmt(bounds.first)}–${fmt(bounds.end)} of ${fmt(count)} · click a row for every field`}</span>
                </div>
                {rows.length === 0 ? (
                  <EmptyState title="No matching records"
                              body="No journal records match the current search and filters." />
                ) : (
                  <>
                    <JournalStream rows={rows} columns={columns} msgType={msgType} />
                    <div className="jx-pager">
                      {bounds.hasPrev
                        ? <Link href={`/logs?${withOffset(params, bounds.prevOffset)}`}>Previous</Link>
                        : <span className="disabled">Previous</span>}
                      {bounds.hasNext
                        ? <Link href={`/logs?${withOffset(params, bounds.nextOffset)}`}>Next</Link>
                        : <span className="disabled">Next</span>}
                    </div>
                  </>
                )}
              </div>

              <aside className="panel lx-quick" aria-label="Quick filters">
                <div className="panel-head"><b>Quick Filters</b><span className="sub">{facets.length} fields</span></div>
                {facets.length === 0 ? (
                  <p className="jx-none">No filter fields for {typeLabel.toLowerCase()}.</p>
                ) : facets.map((facet, i) => (
                  <details key={facet.field} className="lx-facet" open={i < 3 || facet.values.some((v) => v.selected)}>
                    <summary>{fieldLabel(facet.field)} <ChevronDown size={14} aria-hidden="true" /></summary>
                    {facet.values.length === 0 ? (
                      <p className="jx-none">No values in range</p>
                    ) : facet.values.map((item) => {
                      const dot = levelColor(facet.field, item.value, levelField);
                      return (
                        <Link key={item.value} role="checkbox" aria-checked={item.selected}
                              className={`lx-facet-row${item.selected ? " selected" : ""}`}
                              href={`/logs?${toggleFacet(params, facet.field, item.value)}`}>
                          <i className="lx-check" aria-hidden="true" />
                          {dot && <i className="lx-dot" style={{ background: dot }} aria-hidden="true" />}
                          <span className="lx-facet-value">
                            {displayValue(facet.field, item.value, item.label)}
                            {isUntranslated(facet.field, item.value, item.label) && (
                              <sup title="No documented meaning for this code">?</sup>
                            )}
                          </span>
                          <span className="lx-facet-count">{fmt(item.count)}</span>
                        </Link>
                      );
                    })}
                    {facet.truncated && <p className="jx-none">More values not shown</p>}
                  </details>
                ))}
              </aside>
            </section>
          </>
        )}
      </div>
    </Shell>
  );
}
