import Link from "next/link";
import type { ReactNode } from "react";
import { Activity, AlertTriangle, CheckCircle2, Database, ShieldAlert, Users } from "lucide-react";
import { MiniBars } from "@/components/Charts";
import { EmptyState } from "@/components/UI";
import { apiError } from "@/lib/api-result";
import { fmt } from "@/lib/format";
import { freshnessBadge } from "@/lib/data-source";
import { buildAlerts } from "@/lib/incidents-data";
import {
  type Percentiles,
  type Tone,
  clientImpact,
  dataQuality,
  isDenied,
  istDate,
  measured,
  orderBurst,
  platformHealth,
  queueInstances,
  readiness,
  rejectRateTrend,
  sample,
  sessionRail,
  venueStates,
  slowestHop,
  sourceChips,
} from "@/lib/command-center";

export type CommandCenterProps = {
  overview: any;
  orders: any;
  rejections: any;
  yel: any;
  /** /api/freshness payload; optional so older callers keep working. */
  freshness?: any;
  latency: any;
  queues: any;
  infra: any;
  ready: any;
  fileSources: any;
};

function num(v: unknown, digits = 2): string {
  const n = Number(v);
  if (v === null || v === undefined || !Number.isFinite(n)) return "—";
  return Number.isInteger(n) ? fmt(n) : n.toLocaleString("en-IN", { maximumFractionDigits: digits });
}

function Sparkline({ points, tone }: { points: number[]; tone: "green" | "red" | "amber" | "blue" }) {
  if (points.length < 2) return null;
  const w = 240;
  const h = 56;
  const max = Math.max(...points);
  const min = Math.min(...points);
  const span = max - min || 1;
  const pts = points
    .map((v, i) => `${((i / (points.length - 1)) * w).toFixed(1)},${(h - 4 - ((v - min) / span) * (h - 8)).toFixed(1)}`)
    .join(" ");
  return (
    <svg className={`cc-spark cc-spark-${tone}`} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label="Trend">
      <polygon points={`0,${h} ${pts} ${w},${h}`} />
      <polyline points={pts} />
    </svg>
  );
}

function Tile({ label, tone, icon, value, detail, foot }: { label: string; tone: Tone; icon: ReactNode; value: ReactNode; detail: ReactNode; foot: ReactNode }) {
  return (
    <div className={`cc-tile cc-${tone}`}>
      <span className="cc-tile-label">{label}</span>
      <div className="cc-tile-main">
        <span className="cc-tile-icon">{icon}</span>
        <div>
          <b>{value}</b>
          <small>{detail}</small>
        </div>
      </div>
      <span className="cc-tile-foot">{foot}</span>
    </div>
  );
}

const NO_ACCESS = "Your role does not include this data. Ask an administrator for the permission.";

function LatencyCard({ title, stats, trend, tone, unit, denied, error }: { title: string; stats?: Percentiles; trend: number[]; tone: "green" | "red"; unit: string; denied: boolean; error: string | null }) {
  return (
    <div className="panel cc-metric">
      <div className="cc-metric-head">
        <b>{title}</b>
        <span className="cc-unit">{unit}</span>
      </div>
      {denied ? (
        <EmptyState title="Access limited" body={NO_ACCESS} />
      ) : error ? (
        // A timeout or server error is not "no file": the first summary after an
        // API restart scans the whole CSV and can outlast the page's fetch.
        <EmptyState title="Latency not loaded" body={`${error}. Refresh once the API has summarised the latency file.`} />
      ) : stats && stats.samples ? (
        <>
          <div className="cc-metric-value">
            <b>{num(stats.p50)}</b>
            <span>p50 (median) · {fmt(stats.samples)} samples</span>
          </div>
          <Sparkline points={sample(trend)} tone={tone} />
          <dl className="cc-stats">
            <div><dt>p90</dt><dd>{num(stats.p90, 0)}</dd></div>
            <div><dt>p95</dt><dd>{num(stats.p95, 0)}</dd></div>
            <div><dt>p99</dt><dd>{num(stats.p99, 0)}</dd></div>
            <div><dt>Max</dt><dd>{num(stats.max, 0)}</dd></div>
          </dl>
        </>
      ) : (
        <EmptyState title="No latency samples" body="No ORDERLATENCY file is ingested for this hop." />
      )}
    </div>
  );
}

export default function CommandCenter({ overview: ov, orders: od, rejections: rj, yel, latency, queues, infra, ready, fileSources, freshness: fresh }: CommandCenterProps) {
  const orders: any[] = od?.items || [];
  const latencyErr = apiError(latency);
  const summary = latencyErr ? undefined : latency?.summary;
  const unit = latency?.unit && latency.unit !== "source units" ? latency.unit : "source units";
  const trendRows: any[] = latencyErr ? [] : latency?.trend || [];

  const ready_ = readiness(ready);
  const hop = slowestHop(summary);
  const impact = clientImpact(orders);
  const burst = orderBurst(orders);
  const rejectTrend = rejectRateTrend(orders);
  const queue = apiError(queues) ? null : queueInstances(queues);
  const quality = apiError(fileSources) ? null : dataQuality(fileSources);
  const dataSource = String(ov?.source || od?.source || "");
  const latencyDenied = isDenied(latency);
  const ordersDenied = isDenied(od);
  const alertsDenied = isDenied(rj);
  const infraDenied = isDenied(infra);
  const chips = sourceChips(apiError(fileSources) ? null : fileSources, apiError(infra) ? null : infra, dataSource);
  const chipsReady = chips.filter((c) => c.tone === "ok").length;
  const health = platformHealth(apiError(infra) ? null : infra, ready);
  const alerts = buildAlerts({ persisted: null, derived: null, rejections: apiError(rj) ? null : rj, yel: apiError(yel) ? null : yel });
  const openAlerts = alerts.filter((a) => a.status !== "Resolved");
  const bySeverity = (s: string) => openAlerts.filter((a) => a.severity === s).length;

  const latencyFrom = trendRows[0]?.time;
  const latencyTo = trendRows[trendRows.length - 1]?.time;
  const rail = sessionRail([
    { label: "Journal", from: ov?.from, to: ov?.to },
    { label: "Latency file", from: latencyFrom, to: latencyTo },
  ]);
  const venues = venueStates(ov?.exchanges, apiError(fresh) ? null : fresh);
  // Age-based, from /api/freshness: LIVE is claimed only while the newest event
  // is within the live threshold. A live→journal fallback on any feed is DELAYED.
  const fallback = [ov, od, rj].map((x) => x?.fallback).find(Boolean) || null;
  const badge = freshnessBadge(apiError(fresh) ? null : fresh?.primary, dataSource, fallback);
  const freshness = badge.text;
  const freshnessTone: Tone = badge.tone === "live" ? "ok" : badge.tone === "delayed" ? "warn" : badge.tone === "stale" ? "bad" : "idle";
  const primary = apiError(fresh) ? null : fresh?.primary;
  const freshnessFoot = primary?.ingest_lag_seconds !== null && primary?.ingest_lag_seconds !== undefined
    ? `Pipeline lag ${Number(primary.ingest_lag_seconds).toFixed(1)} s · thresholds ${fresh?.thresholds?.live_seconds ?? "—"} s / ${fresh?.thresholds?.delayed_seconds ?? "—"} s`
    : ov?.to ? `Journal to ${istDate(ov.to)}` : "No freshness signal";

  return (
    <section className="command-center" aria-label="Command Center detail">
      <div className="cc-section-head">
        <div>
          <h2>Command Center</h2>
          <p>Readiness, latency, queue depth, order flow and source coverage. Every figure is computed from the sources named on its panel.</p>
        </div>
      </div>

      <div className="cc-tiles">
        <Tile
          label="Readiness"
          tone={ready_.ok ? "ok" : "bad"}
          icon={<CheckCircle2 size={22} />}
          value={ready_.label}
          detail={ready_.mode ? `${ready_.mode} mode` : "API readiness probe"}
          foot={ready_.total ? `${ready_.up} / ${ready_.total} dependencies ready` : "No dependency report"}
        />
        <Tile
          label="Bottleneck"
          tone={hop ? "warn" : "idle"}
          icon={<AlertTriangle size={22} />}
          value={hop ? hop.name : latencyDenied ? "Access limited" : latencyErr ? "Not loaded" : "No latency data"}
          detail={hop ? "Largest p99 of the measured hops" : latencyDenied ? "Requires latency access" : latencyErr ? "Latency summary did not load; refresh" : "Needs an ORDERLATENCY file"}
          foot={hop ? `p99 ${num(hop.p99)} ${unit}` : "—"}
        />
        <Tile
          label="Client impact"
          tone={ordersDenied ? "idle" : impact.impacted ? "warn" : impact.brokers ? "ok" : "idle"}
          icon={<Users size={22} />}
          value={ordersDenied ? "—" : fmt(impact.impacted)}
          detail={ordersDenied ? "Requires order access" : "Brokers with rejected orders"}
          foot={ordersDenied ? "Access limited" : impact.brokers ? `Out of ${fmt(impact.brokers)} brokers in loaded orders` : "No broker field in loaded orders"}
        />
        <Tile
          label="Open alerts"
          tone={alertsDenied ? "idle" : bySeverity("Critical") ? "bad" : openAlerts.length ? "warn" : "ok"}
          icon={<ShieldAlert size={22} />}
          value={alertsDenied ? "—" : fmt(openAlerts.length)}
          detail={alertsDenied ? "Requires rejection access" : "Derived from rejections and YEL"}
          foot={alertsDenied ? "Access limited" : `${bySeverity("Critical")} critical · ${bySeverity("Major")} major · ${bySeverity("Minor")} minor`}
        />
        <Tile
          label="Data freshness"
          tone={freshnessTone}
          icon={<Activity size={22} />}
          value={freshness}
          detail={badge.detail}
          foot={freshnessFoot}
        />
        <Tile
          label="Sources"
          tone={chips.length && chipsReady === chips.length ? "ok" : chipsReady ? "warn" : "idle"}
          icon={<Database size={22} />}
          value={`${chipsReady} / ${chips.length}`}
          detail="Sources ingested and ready"
          foot={chips.length - chipsReady ? `${chips.length - chipsReady} without data` : "All sources ready"}
        />
      </div>

      <div className="panel cc-rail">
        <div className="cc-rail-head">
          <div>
            <b>Market session rail</b>
            <span>NSE equity timetable (IST) · shaded phases are covered by an observed data window</span>
          </div>
          <div className="cc-rail-windows">
            {rail.windows.length ? (
              rail.windows.map((w) => (
                <span key={w.label} className="cc-window">
                  {w.label}: <b>{w.date}</b> {w.range}
                </span>
              ))
            ) : (
              <span className="cc-window">No timestamped window</span>
            )}
          </div>
        </div>
        <ol className="cc-phases">
          {rail.phases.map((p) => (
            <li key={p.name} className={p.observedBy.length ? "observed" : ""}>
              <i />
              <b>{p.name}</b>
              <span>{p.window}</span>
              <small>{p.observedBy.length ? p.observedBy.join(" · ") : "Not observed"}</small>
            </li>
          ))}
        </ol>
        {venues.length > 0 && (
          <ul className="cc-venues" aria-label="Venue state from newest event">
            {venues.map((v) => (
              <li key={v.name} className={`venue-${v.state}`} title={v.ageSeconds === null ? "No timestamped event" : `Newest event ${v.ageSeconds} s ago`}>
                <i aria-hidden="true" />
                <b>{v.name}</b>
                <span>{fmt(v.events)} events</span>
                <small>{v.state === "unknown" ? "no timestamp" : `${v.state} · last ${v.lastEvent}`}</small>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="cc-metrics">
        <LatencyCard
          title="OMS latency"
          stats={summary?.oms}
          trend={measured(trendRows.map((t) => t.oms))}
          tone="green"
          unit={unit}
          denied={latencyDenied}
          error={latencyDenied ? null : latencyErr}
        />
        <LatencyCard
          title="Exchange confirmation"
          stats={summary?.confirmation}
          trend={measured(trendRows.map((t) => t.confirmation))}
          tone="red"
          unit={unit}
          denied={latencyDenied}
          error={latencyDenied ? null : latencyErr}
        />
        <div className="panel cc-metric">
          <div className="cc-metric-head">
            <b>Queue depth</b>
            <span className="cc-unit">messages</span>
          </div>
          {isDenied(queues) ? (
            <EmptyState title="Access limited" body={NO_ACCESS} />
          ) : queue && queue.rows.length ? (
            <>
              <div className="cc-metric-value">
                <b>{num(queue.rows[0].maxDepth)}</b>
                <span>Deepest backlog episode · {queue.rows[0].instance}</span>
              </div>
              <table className="cc-mini-table">
                <thead><tr><th>Instance</th><th>Backlogs</th><th>Peak depth</th><th>Rows/s</th><th>Last</th></tr></thead>
                <tbody>
                  {queue.rows.slice(0, 4).map((q) => (
                    <tr key={q.instance}><td>{q.instance}</td><td>{num(q.episodes)}</td><td>{num(q.maxDepth)}</td><td>{num(q.rowsPerSecond)}</td><td>{q.lastObserved}</td></tr>
                  ))}
                </tbody>
              </table>
              <p className="cc-note">{queue.empty ? `${queue.empty} of ${queue.total} instances have no data. ` : ""}Aliases are listed separately, never summed.</p>
            </>
          ) : (
            <EmptyState title="No queue samples" body="No QueSize file with data is ingested." />
          )}
        </div>
        <div className="panel cc-metric">
          <div className="cc-metric-head">
            <b>Order burst</b>
            <span className="cc-unit">orders / min</span>
          </div>
          {ordersDenied ? (
            <EmptyState title="Access limited" body={NO_ACCESS} />
          ) : burst ? (
            <>
              <div className="cc-metric-value">
                <b>{fmt(burst.peak)}</b>
                <span>Peak minute · {burst.peakAt} IST</span>
              </div>
              <div className="cc-bars"><MiniBars values={sample(burst.bars)} cls="bar-blue" /></div>
              <dl className="cc-stats">
                <div><dt>Average</dt><dd>{num(burst.avg, 1)}</dd></div>
                <div><dt>Last min</dt><dd>{fmt(burst.last)}</dd></div>
                <div><dt>Minutes</dt><dd>{fmt(burst.minutes)}</dd></div>
                <div><dt>Window</dt><dd>{burst.from}–{burst.to}</dd></div>
              </dl>
            </>
          ) : (
            <EmptyState title="No order timeline" body="Loaded orders carry no event time." />
          )}
        </div>
        <div className="panel cc-metric">
          <div className="cc-metric-head">
            <b>Rejection rate</b>
            <span className="cc-unit">per minute</span>
          </div>
          {ordersDenied ? (
            <EmptyState title="Access limited" body={NO_ACCESS} />
          ) : rejectTrend ? (
            <>
              <div className="cc-metric-value">
                <b>{num(rejectTrend.overall)}%</b>
                <span>Rejected / total loaded orders</span>
              </div>
              <Sparkline points={sample(rejectTrend.points)} tone="amber" />
              <dl className="cc-stats">
                <div><dt>Rejects</dt><dd>{fmt(rejectTrend.rejected)}</dd></div>
                <div><dt>Orders</dt><dd>{fmt(rejectTrend.total)}</dd></div>
                <div><dt>Peak min</dt><dd>{num(rejectTrend.peak, 1)}%</dd></div>
                <div><dt>At</dt><dd>{rejectTrend.peakAt}</dd></div>
              </dl>
            </>
          ) : (
            <EmptyState title="No order timeline" body="Loaded orders carry no event time." />
          )}
        </div>
      </div>
      {!latencyErr && summary && (
        <p className="cc-footnote">
          Latency comes from the ORDERLATENCY file and is shown in {unit}: the feed does not declare whether values are µs, ms or s, so no SLO or network round-trip is implied. Order burst and rejection rate come from the journal, which may cover a different date.
        </p>
      )}

      <div className="cc-grid-3">
        <div className="panel">
          <div className="panel-head">
            <div><b>Top client impact</b><p className="sub">Brokers ranked by rejected orders</p></div>
            <Link href="/rejections">Rejections ›</Link>
          </div>
          {ordersDenied ? (
            <EmptyState title="Access limited" body={NO_ACCESS} />
          ) : impact.rows.length ? (
            <table className="compact tight cc-table">
              <thead><tr><th>Broker</th><th>Orders</th><th>Rejected</th><th>Reject %</th><th>vs desk</th></tr></thead>
              <tbody>
                {impact.rows.map((r) => (
                  <tr key={r.broker}>
                    <td><b>{r.broker}</b></td>
                    <td>{fmt(r.orders)}</td>
                    <td>{fmt(r.rejected)}</td>
                    <td>{num(r.rejectPct)}%</td>
                    <td><span className={`cc-pill ${r.aboveAvg ? "cc-warn" : "cc-ok"}`}>{r.aboveAvg ? "Above avg" : "At or below"}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyState title="No client impact" body="No broker has a rejected order in the loaded rows." />
          )}
          {impact.rows.length > 0 && <p className="cc-note">Desk average reject rate: {num(impact.deskRate)}% across {fmt(impact.brokers)} brokers.</p>}
        </div>

        <div className="panel">
          <div className="panel-head">
            <div><b>Active alerts</b><p className="sub">Rejection groups and YEL connectivity</p></div>
            <Link href="/incidents">Incidents ›</Link>
          </div>
          {alertsDenied ? (
            <EmptyState title="Access limited" body={NO_ACCESS} />
          ) : openAlerts.length ? (
            <ul className="cc-alerts">
              {openAlerts.slice(0, 4).map((a) => (
                <li key={a.id} className={`cc-alert sev-${a.severity.toLowerCase()}`}>
                  <div><span className="cc-sev">{a.severity}</span><b>{a.name}</b></div>
                  {/* Rejection reasons are free text that can carry client codes and
                      balances; the overview shows the count, /incidents the detail. */}
                  <p>{a.source === "RMS" ? `${fmt(a.raw?.count ?? 0)} rejected orders with this code` : a.message}</p>
                  <small>{a.source} · {a.resource}</small>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No open alerts" body="No rejection group or connectivity signal crosses an alert rule." />
          )}
        </div>

        <div className="panel">
          <div className="panel-head">
            <div><b>Platform health</b><p className="sub">As reported by the API</p></div>
            <Link href="/infra">Infrastructure ›</Link>
          </div>
          {/* A 403 from /api/infra is a permission boundary, not an outage: show
              only the readiness row the user can see. */}
          <ul className="cc-health">
            {(infraDenied ? health.slice(0, 1) : health).map((h) => (
              <li key={h.name}><span>{h.name}</span><span className={`cc-pill cc-${h.tone}`}>{h.state}</span></li>
            ))}
          </ul>
          {infraDenied && <p className="cc-note">Dependency status needs infrastructure access.</p>}
        </div>
      </div>

      <div className="cc-grid-3">
        <div className="panel cc-span-2">
          <div className="panel-head">
            <div><b>Source health</b><p className="sub">{chipsReady} of {chips.length} sources ready</p></div>
            <Link href="/data-quality">Data quality ›</Link>
          </div>
          {chips.length ? (
            <div className="cc-chips">
              {chips.map((c) => (
                <span key={c.name} className={`cc-chip cc-${c.tone}`} title={c.state}><i />{c.name}</span>
              ))}
            </div>
          ) : (
            <EmptyState title="No sources reported" body="The API did not report any journal or CSV source." />
          )}
        </div>
        <div className="panel">
          <div className="panel-head">
            <div><b>Data quality</b><p className="sub">{quality ? `${fmt(quality.files)} CSV files · ${fmt(quality.rows)} rows` : "CSV ingestion"}</p></div>
          </div>
          {quality ? (
            <dl className="cc-quality">
              <div><dt>Rejected rows</dt><dd className={quality.rejected ? "bad" : ""}>{fmt(quality.rejected)}</dd></div>
              <div><dt>Duplicates</dt><dd className={quality.duplicates ? "warn" : ""}>{fmt(quality.duplicates)}</dd></div>
              <div><dt>Invalid values</dt><dd className={quality.invalid ? "warn" : ""}>{fmt(quality.invalid)}</dd></div>
              <div><dt>Time mismatches</dt><dd className={quality.mismatches ? "warn" : ""}>{fmt(quality.mismatches)}</dd></div>
              <div><dt>Missing values</dt><dd>{fmt(quality.missing)}</dd></div>
              <div><dt>Identical files</dt><dd>{fmt(quality.identical)}</dd></div>
            </dl>
          ) : (
            <EmptyState title="No CSV sources" body="No latency or queue file is ingested." />
          )}
        </div>
      </div>
    </section>
  );
}
