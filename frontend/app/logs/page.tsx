import Link from "next/link";
import { Download, Filter, Search, X } from "lucide-react";
import Shell from "@/components/Shell";
import JournalStream from "@/components/JournalStream";
import { EmptyState, PageHead } from "@/components/UI";
import { apiError, getJSON } from "@/lib/api";
import { fmt } from "@/lib/format";
import {
  clearFacets, displayValue, fieldLabel, histogramHeights, isUntranslated, pageBounds,
  selectedFacets, shortTime, toggleFacet, withOffset,
  type Facet, type HistogramBucket,
} from "@/lib/journal-explore";

const MSG_TYPES = [
  { value: "ordupd", label: "Order updates" },
  { value: "login", label: "Logins" },
  { value: "logout", label: "Logouts" },
  { value: "yel_connected", label: "Exchange connect" },
];

type Explore = {
  source?: string; msg_type?: string; columns?: string[]; facets?: Facet[];
  histogram?: { buckets?: HistogramBucket[]; start?: string | null; end?: string | null; undated?: number };
  total?: number; count?: number; limit?: number; offset?: number;
  items?: { source_line: number; fields: Record<string, unknown> }[];
  search_fields?: string[];
};

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
  const heights = histogramHeights(buckets);
  const active = selectedFacets(params);
  const bounds = pageBounds(count, limit, offset);

  const exportParams = new URLSearchParams({ msg_type: msgType });
  if (q) exportParams.set("q", q);

  return (
    <Shell>
      <PageHead
        title="Journal Explorer"
        subtitle="Faceted search across the masked Noren journal snapshot"
        badge={`Source: ${d.source || "unavailable"}`}
      />

      {err ? (
        <EmptyState title="Unable to load journal records" body={err} />
      ) : (
        <>
          <section className="jx-tabs">
            {MSG_TYPES.map((type) => {
              const next = new URLSearchParams(params);
              next.set("msg_type", type.value);
              next.delete("facet");
              next.delete("offset");
              return (
                <Link key={type.value} href={`/logs?${next}`}
                      className={`jx-tab${type.value === msgType ? " active" : ""}`}>
                  {type.label}
                </Link>
              );
            })}
          </section>

          <section className="panel jx-search">
            <form action="/logs" className="jx-search-form">
              <input type="hidden" name="msg_type" value={msgType} />
              {params.getAll("facet").map((token) => (
                <input key={token} type="hidden" name="facet" value={token} />
              ))}
              <div className="jx-search-field">
                <Search size={14} aria-hidden="true" />
                <input name="q" defaultValue={q}
                       placeholder={`Search ${(d.search_fields ?? []).join(", ") || "records"}`} />
              </div>
              <button className="primary" type="submit">Search</button>
              <a className="jx-export" href={`/api/journal/records/export?${exportParams}`}>
                <Download size={14} aria-hidden="true" /> Export CSV
              </a>
            </form>
            <div className="jx-scope">
              Matching {fmt(count)} of {fmt(d.total ?? 0)} {msgType} records
              {d.histogram?.start && <> · {shortTime(d.histogram.start)}–{shortTime(d.histogram.end)} UTC</>}
              {(d.histogram?.undated ?? 0) > 0 && <> · {fmt(d.histogram!.undated!)} without a timestamp</>}
            </div>
          </section>

          {active.length > 0 && (
            <section className="jx-active">
              <Filter size={13} aria-hidden="true" />
              {active.map(({ field, value }) => (
                <Link key={`${field}:${value}`} className="jx-pill"
                      href={`/logs?${toggleFacet(params, field, value)}`}>
                  {fieldLabel(field)}: {displayValue(field, value)} <X size={11} />
                </Link>
              ))}
              <Link className="jx-clear" href={`/logs?${clearFacets(params)}`}>Clear all</Link>
            </section>
          )}

          <div className="jx-layout">
            <aside className="panel jx-facets">
              <div className="panel-head"><b>Facets</b><span>{facets.length} dimensions</span></div>
              {facets.length === 0 ? (
                <p className="jx-none">No facet dimensions for this message type.</p>
              ) : facets.map((facet) => (
                <div key={facet.field} className="jx-facet">
                  <h3>{fieldLabel(facet.field)}</h3>
                  {facet.values.length === 0 ? (
                    <p className="jx-none">No values in range</p>
                  ) : facet.values.map((item) => (
                    <Link key={item.value}
                          className={`jx-facet-row${item.selected ? " selected" : ""}`}
                          href={`/logs?${toggleFacet(params, facet.field, item.value)}`}>
                      <span className="jx-facet-value">
                        {displayValue(facet.field, item.value, item.label)}
                        {isUntranslated(facet.field, item.value, item.label) && (
                          <sup title="No documented meaning for this code">?</sup>
                        )}
                      </span>
                      <span className="jx-facet-count">{fmt(item.count)}</span>
                    </Link>
                  ))}
                  {facet.truncated && <p className="jx-none">More values not shown</p>}
                </div>
              ))}
            </aside>

            <div className="jx-main">
              <section className="panel">
                <div className="panel-head">
                  <b>Events over time</b>
                  <span>{buckets.length} buckets</span>
                </div>
                {buckets.length === 0 ? (
                  <p className="jx-none">No timestamped records in this selection.</p>
                ) : (
                  <div className="jx-histogram" aria-hidden="true">
                    {buckets.map((bucket, index) => (
                      <span key={bucket.start} className="jx-bar"
                            style={{ height: `${Math.max(heights[index], bucket.count ? 2 : 0)}%` }}
                            title={`${shortTime(bucket.start)} · ${bucket.count}`} />
                    ))}
                  </div>
                )}
              </section>

              <section className="panel">
                <div className="panel-head">
                  <b>Records</b>
                  <span>{count === 0 ? "none" : `${fmt(bounds.first)}–${fmt(bounds.end)} of ${fmt(count)}`}</span>
                </div>
                {rows.length === 0 ? (
                  <EmptyState title="No matching records"
                              body="No journal records match the current search and facet selection." />
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
              </section>
            </div>
          </div>
        </>
      )}
    </Shell>
  );
}
