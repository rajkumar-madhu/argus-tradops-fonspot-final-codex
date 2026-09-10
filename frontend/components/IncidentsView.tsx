"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Bell,
  Brain,
  Calendar,
  CheckCircle2,
  CircleAlert,
  Clock3,
  FileText,
  RefreshCw,
  Timer,
} from "lucide-react";
import RefreshButton from "@/components/RefreshButton";
import { AreaChart, Donut, HBarList } from "@/components/Charts";
import { EmptyState, KpiCard, Severity } from "@/components/UI";
import { apiError } from "@/lib/api-result";
import {
  aiInsights,
  alertSourceBars,
  alertsTrendSeries,
  buildAlerts,
  buildIncidents,
  incidentStatusDonut,
  incidentTimeline,
  severityDonut,
  type AlertRow,
  type IncidentRow,
} from "@/lib/incidents-data";
import { fmt, journalWindowLabel, timeIstStamp } from "@/lib/format";

export type IncidentsPayload = {
  persisted: any;
  derived: any;
  rejections: any;
  yel: any;
};

function severityClass(sev: string) {
  const s = sev.toLowerCase();
  if (s.includes("critical") || s.startsWith("p1")) return "sev-critical";
  if (s.includes("major") || s.startsWith("p2")) return "sev-major";
  if (s.includes("minor") || s.startsWith("p3")) return "sev-minor";
  return "sev-info";
}

function alertStatusClass(status: string) {
  const s = status.toLowerCase();
  if (s === "open") return "alert-open";
  if (s.includes("progress")) return "alert-progress";
  if (s === "acknowledged") return "alert-ack";
  return "alert-resolved";
}

export default function IncidentsView({ persisted, derived, rejections, yel }: IncidentsPayload) {
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"alerts" | "incidents">("alerts");

  const source =
    rejections?.source || persisted?.source || derived?.source || yel?.source || "";
  const isJournal = source === "journal snapshot";
  const isFileBased = isJournal;

  const alerts = useMemo(
    () => buildAlerts({ persisted, derived, rejections, yel }),
    [persisted, derived, rejections, yel],
  );
  const incidents = useMemo(
    () => buildIncidents(persisted, derived, alerts),
    [persisted, derived, alerts],
  );

  const selectedIncident =
    incidents.find((i) => i.id === selectedIncidentId) || incidents[0] || null;

  const openAlerts = alerts.filter((a) => a.status === "Open" || a.status === "In Progress").length;
  const openIncidents = incidents.filter((i) => String(i.status).toUpperCase() === "OPEN").length;
  const resolvedToday = incidents.filter((i) =>
    ["RESOLVED", "CLOSED"].includes(String(i.status).toUpperCase()),
  ).length;

  const trend = alertsTrendSeries(alerts);
  const sevDonut = severityDonut(alerts);
  const statusDonut = incidentStatusDonut(incidents);
  const sourceBars = alertSourceBars(alerts);
  const timeline = incidentTimeline(selectedIncident, alerts);
  const insights = aiInsights(alerts, rejections, yel);

  const metaLine = isFileBased
    ? `${fmt(rejections?.journal_events || 0)} journal events · ${journalWindowLabel(rejections?.from, rejections?.to)} · Alerts derived from rejection evidence`
    : `${fmt(alerts.length)} active alerts · ${persisted?.source || "postgresql"} + ${derived?.source || "derived"}`;

  const err = apiError(persisted) && apiError(rejections);

  return (
    <div className="incidents-page">
      <section className="dashboard-head incidents-hero">
        <div>
          <div className="incidents-title-row">
            <h1>Alerts &amp; Incidents</h1>
            {isFileBased ? (
              <span className="source-badge file-based">FILE-BASED</span>
            ) : (
              <span className="source-badge live">LIVE</span>
            )}
          </div>
          <p>Unified Ops Command Center — detect, manage and resolve issues across infrastructure, applications and trading systems.</p>
          <p className="incidents-meta">{metaLine}</p>
        </div>
        <div className="time-controls">
          <RefreshButton />
          <Link href="/rca" className="btn-primary incidents-create-btn">
            Investigate RCA
          </Link>
        </div>
      </section>

      {err ? (
        <EmptyState title="Unable to load incidents" body={`${err}. Confirm the API is running on port 8001.`} />
      ) : (
        <>
          <section className="kpi-grid six incidents-kpis">
            <KpiCard
              label="Active Alerts"
              value={fmt(openAlerts)}
              delta={`${fmt(alerts.length)} total`}
              deltaTone={openAlerts > 5 ? "down" : "up"}
              tone="red"
              icon={<Bell size={18} />}
            />
            <KpiCard
              label="Open Incidents"
              value={fmt(openIncidents)}
              delta="Needs triage"
              deltaTone="warn"
              tone="amber"
              icon={<CircleAlert size={18} />}
            />
            <KpiCard
              label="Resolved Today"
              value={fmt(resolvedToday)}
              delta={resolvedToday ? "Closed in window" : "No ELK incidents"}
              tone="green"
              icon={<CheckCircle2 size={18} />}
            />
            <KpiCard
              label="Avg Resolution Time"
              value={resolvedToday ? "—" : "—"}
              delta="Requires persisted incidents"
              tone="blue"
              icon={<Clock3 size={18} />}
            />
            <KpiCard
              label="MTTR"
              value="—"
              delta="Historical MTTR unavailable"
              tone="purple"
              icon={<Timer size={18} />}
            />
            <KpiCard
              label="SLA Compliance"
              value="—"
              delta="Requires SLA policy history"
              tone="teal"
              icon={<Calendar size={18} />}
            />
          </section>

          <section className="incidents-charts-row">
            <div className="panel span-2">
              <div className="panel-head">
                <div>
                  <b>Alerts Trend</b>
                  <p className="sub">Severity mix over snapshot window</p>
                </div>
                <span className="legend">
                  <i className="lg s-rejected" /> Critical{" "}
                  <i className="lg s-pending" /> Major{" "}
                  <i className="lg s-total" /> Minor
                </span>
              </div>
              {alerts.length ? (
                <AreaChart series={trend.series} labels={trend.labels} height={150} />
              ) : (
                <EmptyState title="No alerts" body="No operational alerts derived from the current data source." />
              )}
            </div>
            <div className="panel">
              <div className="panel-head">
                <div>
                  <b>Alerts by Severity</b>
                  <p className="sub">{fmt(alerts.length)} total alerts</p>
                </div>
              </div>
              {sevDonut.length ? (
                <Donut centerLabel="Alerts" centerValue={fmt(alerts.length)} slices={sevDonut} />
              ) : (
                <EmptyState title="No severity data" body="Upload journal rejections or connect ELK for alert breakdown." />
              )}
            </div>
            <div className="panel">
              <div className="panel-head">
                <div>
                  <b>Incidents by Status</b>
                  <p className="sub">{fmt(incidents.length)} incidents</p>
                </div>
              </div>
              {statusDonut.length ? (
                <Donut centerLabel="Incidents" centerValue={fmt(incidents.length)} slices={statusDonut} />
              ) : (
                <EmptyState title="No persisted incidents" body="Correlation worker incidents appear when Postgres is connected." />
              )}
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <div>
                <b>Top Alert Sources</b>
                <p className="sub">Grouped by originating system</p>
              </div>
            </div>
            {sourceBars.length ? (
              <HBarList rows={sourceBars} />
            ) : (
              <EmptyState title="No sources" body="Alert sources will populate when incidents are detected." />
            )}
          </section>

          <section className="incidents-main-row">
            <div className="panel incidents-table-panel">
              <div className="incidents-tabs">
                <button
                  type="button"
                  className={activeTab === "alerts" ? "active" : ""}
                  onClick={() => setActiveTab("alerts")}
                >
                  Active Alerts ({fmt(openAlerts)})
                </button>
                <button
                  type="button"
                  className={activeTab === "incidents" ? "active" : ""}
                  onClick={() => setActiveTab("incidents")}
                >
                  Incidents ({fmt(incidents.length)})
                </button>
              </div>
              {activeTab === "alerts" ? (
                alerts.length === 0 ? (
                  <EmptyState
                    title="No active alerts"
                    body={
                      isFileBased
                        ? "Journal mode derives alerts from rejection spikes and YEL connectivity. No triggers found in the current snapshot."
                        : "No derived or persisted alerts in the current window."
                    }
                  />
                ) : (
                  <div className="table-scroll">
                    <table className="compact incidents-alerts-table">
                      <thead>
                        <tr>
                          <th>Time</th>
                          <th>Severity</th>
                          <th>Source</th>
                          <th>Alert Name</th>
                          <th>Message</th>
                          <th>Affected Resource</th>
                          <th>Status</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {alerts.slice(0, 25).map((a: AlertRow) => (
                          <tr key={a.id}>
                            <td className="mono">{timeIstStamp(a.time)}</td>
                            <td>
                              <span className={`alert-sev ${severityClass(a.severity)}`}>
                                {a.severity}
                              </span>
                            </td>
                            <td>{a.source}</td>
                            <td><b>{a.name}</b></td>
                            <td className="ellipsis">{a.message}</td>
                            <td className="mono">{a.resource}</td>
                            <td>
                              <span className={`alert-status-pill ${alertStatusClass(a.status)}`}>
                                {a.status}
                              </span>
                            </td>
                            <td>
                              <Link className="link-btn" href={`/rca?order_id=${encodeURIComponent(a.resource)}`}>
                                View
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              ) : incidents.length === 0 ? (
                <EmptyState
                  title="No incidents in Postgres"
                  body="Persisted incidents require the correlation worker and database. Derived alerts are shown in the Active Alerts tab."
                />
              ) : (
                <div className="table-scroll">
                  <table className="compact incidents-alerts-table">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Title</th>
                        <th>Severity</th>
                        <th>Status</th>
                        <th>Created</th>
                        <th>Owner</th>
                      </tr>
                    </thead>
                    <tbody>
                      {incidents.map((inc: IncidentRow) => (
                        <tr
                          key={inc.id}
                          className={selectedIncident?.id === inc.id ? "selected" : ""}
                          onClick={() => setSelectedIncidentId(inc.id)}
                        >
                          <td className="mono"><b>{inc.id}</b></td>
                          <td>{inc.title}</td>
                          <td><Severity value={inc.severity} /></td>
                          <td>{inc.status}</td>
                          <td className="mono">{timeIstStamp(inc.created)}</td>
                          <td>{inc.owner}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="incidents-side-stack">
              <div className="panel">
                <div className="panel-head">
                  <div>
                    <b>Recent Incidents</b>
                    <p className="sub">Select a row to inspect timeline</p>
                  </div>
                </div>
                {incidents.length === 0 ? (
                  <EmptyState title="No incidents" body="Derived from alerts when Postgres is empty." />
                ) : (
                  <table className="compact tight">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Title</th>
                        <th>Sev</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {incidents.slice(0, 5).map((inc) => (
                        <tr
                          key={inc.id}
                          className={selectedIncident?.id === inc.id ? "selected" : ""}
                          onClick={() => setSelectedIncidentId(inc.id)}
                        >
                          <td className="mono">{inc.id.slice(0, 12)}</td>
                          <td className="ellipsis">{inc.title}</td>
                          <td><Severity value={inc.severity} /></td>
                          <td>{inc.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <div className="panel">
                <div className="panel-head">
                  <div>
                    <b>Incident Timeline</b>
                    <p className="sub">{selectedIncident?.id || "—"}</p>
                  </div>
                </div>
                {!selectedIncident ? (
                  <EmptyState title="No incident selected" body="Select an incident to view its timeline." />
                ) : (
                  <ol className="incidents-timeline">
                    {timeline.map((step, i) => (
                      <li key={i} className={step.tone}>
                        <span className="incidents-timeline-dot" />
                        <div>
                          <time className="mono">{timeIstStamp(step.time)}</time>
                          <b>{step.label}</b>
                          <p>{step.detail}</p>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </div>

              <div className="panel incidents-ai-panel">
                <div className="panel-head">
                  <div>
                    <b>AI Insights</b>
                    <p className="sub">Derived from journal rejection / YEL signals</p>
                  </div>
                  <Brain size={16} aria-hidden />
                </div>
                <ul className="incidents-insights">
                  {insights.map((item, i) => (
                    <li key={i}>
                      <AlertTriangle size={14} aria-hidden />
                      <div>
                        <b>{item.title}</b>
                        <p>{item.body}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>

          {isFileBased && (
            <p className="incidents-footnote">
              <FileText size={13} aria-hidden />
              Journal snapshot mode — alerts are derived from rejection evidence and YEL connectivity. Persisted ELK/Postgres incidents require live correlation worker.
            </p>
          )}
        </>
      )}
    </div>
  );
}
