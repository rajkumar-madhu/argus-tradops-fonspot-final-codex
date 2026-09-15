import { time24 } from "@/lib/format";

export type AlertRow = {
  id: string;
  time: string;
  severity: "Critical" | "Major" | "Minor" | "Info";
  source: string;
  name: string;
  message: string;
  resource: string;
  status: "Open" | "In Progress" | "Acknowledged" | "Resolved";
  raw?: any;
};

export type IncidentRow = {
  id: string;
  title: string;
  severity: string;
  status: string;
  created: string;
  owner: string;
  type: string;
  raw?: any;
};

function severityFromCode(code: string): AlertRow["severity"] {
  const c = String(code || "").toUpperCase();
  if (c.startsWith("P1") || c === "CRITICAL") return "Critical";
  if (c.startsWith("P2") || c === "MAJOR") return "Major";
  if (c.startsWith("P3") || c === "MINOR") return "Minor";
  return "Info";
}

function alertStatus(status: string): AlertRow["status"] {
  const s = String(status || "OPEN").toUpperCase();
  if (s === "IN_PROGRESS") return "In Progress";
  if (s === "ACKNOWLEDGED") return "Acknowledged";
  if (s === "RESOLVED" || s === "CLOSED") return "Resolved";
  return "Open";
}

/** Build unified alerts from persisted, derived, rejection groups, and YEL health. */
export function buildAlerts(args: {
  persisted: any;
  derived: any;
  rejections: any;
  yel: any;
}): AlertRow[] {
  const { persisted, derived, rejections, yel } = args;
  const alerts: AlertRow[] = [];
  const seen = new Set<string>();

  for (const item of derived?.items || []) {
    const id = String(item.id || item.fingerprint || `derived-${alerts.length}`);
    if (seen.has(id)) continue;
    seen.add(id);
    alerts.push({
      id,
      time: item.last_seen || item.first_seen || new Date().toISOString(),
      severity: severityFromCode(item.severity || "P2"),
      source: item.type === "YEL_CONNECTIVITY" ? "Exchange API" : "Applications",
      name: item.title || item.type || "Operational alert",
      message:
        item.type === "REJECTION_SPIKE"
          ? `Rejection spike detected in ${derived.lookback || "window"}`
          : item.title || "Derived operational incident",
      resource: item.id || "—",
      status: alertStatus(item.status),
      raw: item,
    });
  }

  for (const item of persisted?.items || []) {
    const id = String(item.id || item.fingerprint || `pg-${alerts.length}`);
    if (seen.has(id)) continue;
    seen.add(id);
    alerts.push({
      id,
      time: item.last_seen || item.first_seen || new Date().toISOString(),
      severity: severityFromCode(item.severity || "P2"),
      source: item.source || "Correlation worker",
      name: item.title || item.type || "Persisted incident",
      message: `${item.type || "INCIDENT"} · ${item.occurrence_count ?? 1} occurrence(s)`,
      resource: item.key || item.fingerprint || String(item.id),
      status: alertStatus(item.status),
      raw: item,
    });
  }

  const rejected = Number(rejections?.rejected_unique_orders || 0);
  if (rejected >= 10 && !seen.has("journal-rejection-spike")) {
    seen.add("journal-rejection-spike");
    alerts.push({
      id: "journal-rejection-spike",
      time: rejections?.to || rejections?.from || new Date().toISOString(),
      severity: rejected >= 100 ? "Critical" : "Major",
      source: "Applications",
      name: "Order rejection spike",
      message: `${rejected} rejected orders in journal snapshot`,
      resource: "noren-ordupd",
      status: "Open",
      raw: { rejections },
    });
  }

  for (const g of (rejections?.groups || []).slice(0, 8)) {
    const id = `rej-${g.code || g.reason}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const count = Number(g.count || 0);
    if (count < 3) continue;
    alerts.push({
      id,
      time: rejections?.to || new Date().toISOString(),
      severity: count >= 50 ? "Major" : "Minor",
      source: "RMS",
      name: `Rejection code ${g.code || "—"}`,
      message: String(g.reason || "").replace(/^RED:/, "").slice(0, 120),
      resource: String(g.code || "—"),
      status: "Open",
      raw: g,
    });
  }

  if (yel && yel.connected === false) {
    alerts.push({
      id: "yel-disconnect",
      time: yel.to || new Date().toISOString(),
      severity: "Critical",
      source: "Exchange API",
      name: "YEL connectivity missing",
      message: "No yel_connected keys found in the current data source",
      resource: "yel_connected",
      status: "Open",
      raw: yel,
    });
  }

  return alerts.sort((a, b) => Date.parse(b.time) - Date.parse(a.time));
}

export function buildIncidents(persisted: any, derived: any, alerts: AlertRow[]): IncidentRow[] {
  const rows: IncidentRow[] = [];
  const seen = new Set<string>();

  for (const item of [...(derived?.items || []), ...(persisted?.items || [])]) {
    const id = String(item.id || item.fingerprint || item.incident_key || `inc-${rows.length}`);
    if (seen.has(id)) continue;
    seen.add(id);
    rows.push({
      id,
      title: item.title || item.type || "Incident",
      severity: item.severity || "P2",
      status: item.status || "OPEN",
      created: item.first_seen || item.last_seen || new Date().toISOString(),
      owner: item.owner || "Unassigned",
      type: item.type || item.incident_type || "OPERATIONAL",
      raw: item,
    });
  }

  if (!rows.length && alerts.length) {
    const top = alerts[0];
    rows.push({
      id: top.id,
      title: top.name,
      severity: top.severity === "Critical" ? "P1" : top.severity === "Major" ? "P2" : "P3",
      status: "OPEN",
      created: top.time,
      owner: "Argus TradeOps",
      type: top.source,
      raw: top.raw,
    });
  }

  return rows;
}

export function alertsTrendSeries(alerts: AlertRow[]) {
  const bins = new Map<string, { critical: number; major: number; minor: number; info: number }>();
  for (const a of alerts) {
    const label = time24(a.time).slice(0, 5) || "—";
    const b = bins.get(label) || { critical: 0, major: 0, minor: 0, info: 0 };
    if (a.severity === "Critical") b.critical += 1;
    else if (a.severity === "Major") b.major += 1;
    else if (a.severity === "Minor") b.minor += 1;
    else b.info += 1;
    bins.set(label, b);
  }
  const labels = Array.from(bins.keys());
  const rows = labels.map((l) => bins.get(l)!);
  return {
    labels: labels.length ? labels : ["—"],
    series: [
      { name: "Critical", points: rows.map((r) => r.critical), cls: "s-rejected" },
      { name: "Major", points: rows.map((r) => r.major), cls: "s-pending" },
      { name: "Minor", points: rows.map((r) => r.minor), cls: "s-total" },
      { name: "Info", points: rows.map((r) => r.info), cls: "s-latency-3" },
    ],
  };
}

export function severityDonut(alerts: AlertRow[]) {
  const counts = { Critical: 0, Major: 0, Minor: 0, Info: 0 };
  for (const a of alerts) counts[a.severity] += 1;
  const total = Math.max(1, alerts.length);
  return [
    { label: "Critical", value: counts.Critical, cls: "seg-red", pct: `${((counts.Critical / total) * 100).toFixed(1)}%` },
    { label: "Major", value: counts.Major, cls: "seg-amber", pct: `${((counts.Major / total) * 100).toFixed(1)}%` },
    { label: "Minor", value: counts.Minor, cls: "seg-minor", pct: `${((counts.Minor / total) * 100).toFixed(1)}%` },
    { label: "Info", value: counts.Info, cls: "seg-purple", pct: `${((counts.Info / total) * 100).toFixed(1)}%` },
  ].filter((s) => s.value > 0);
}

export function incidentStatusDonut(incidents: IncidentRow[]) {
  const counts: Record<string, number> = {};
  for (const i of incidents) {
    const s = String(i.status || "OPEN").toUpperCase();
    counts[s] = (counts[s] || 0) + 1;
  }
  const total = Math.max(1, incidents.length);
  const palette: Record<string, string> = {
    OPEN: "seg-red",
    IN_PROGRESS: "seg-amber",
    ON_HOLD: "seg-neutral",
    RESOLVED: "seg-green",
    CLOSED: "seg-green",
  };
  return Object.entries(counts).map(([label, value]) => ({
    label: label.replace(/_/g, " "),
    value,
    cls: palette[label] || "seg-purple",
    pct: `${((value / total) * 100).toFixed(1)}%`,
  }));
}

export function alertSourceBars(alerts: AlertRow[]) {
  const counts: Record<string, number> = {};
  for (const a of alerts) counts[a.source] = (counts[a.source] || 0) + 1;
  const max = Math.max(1, ...Object.values(counts));
  const palette = ["bar-red", "bar-amber", "bar-blue", "bar-purple", "bar-teal", "bar-green"];
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([label, value], i) => ({
      label,
      value: String(value),
      pct: (value / max) * 100,
      cls: palette[i % palette.length],
    }));
}

export function incidentTimeline(incident: IncidentRow | null, alerts: AlertRow[]) {
  if (!incident) return [];
  const related = alerts.find((a) => a.id === incident.id) || alerts[0];
  const steps = [
    { time: incident.created, label: "Incident created", detail: incident.title, tone: "done" },
  ];
  if (related) {
    steps.push({
      time: related.time,
      label: "Alert correlation",
      detail: `${alerts.filter((a) => a.source === related.source).length} related alert(s) grouped`,
      tone: "done",
    });
  }
  if (incident.status === "IN_PROGRESS" || incident.status === "OPEN") {
    steps.push({
      time: incident.created,
      label: "Investigation started",
      detail: `Assigned to ${incident.owner}`,
      tone: incident.status === "IN_PROGRESS" ? "active" : "pending",
    });
  }
  if (String(incident.raw?.type || "").includes("REJECTION")) {
    const evidence = incident.raw?.evidence || [];
    const top = Array.isArray(evidence) ? evidence[0] : null;
    steps.push({
      time: incident.created,
      label: "Rejected by RMS",
      detail: top ? `${top.code || "—"} · ${String(top.reason || "").slice(0, 80)}` : "Rejection evidence attached",
      tone: "failed",
    });
  }
  return steps;
}

export function aiInsights(alerts: AlertRow[], rejections: any, yel: any) {
  const insights: { icon: string; title: string; body: string }[] = [];
  const rejected = Number(rejections?.rejected_unique_orders || 0);
  const total = Number(rejections?.journal_events || rejections?.count || 0);

  if (rejected >= 10) {
    const rate = total ? ((rejected / total) * 100).toFixed(1) : "—";
    insights.push({
      icon: "pattern",
      title: "Rejection spike detected",
      body: `${rejected} rejected orders (${rate}% of journal events). Top reason: ${rejections?.groups?.[0]?.reason?.slice(0, 60) || "see Rejections page"}.`,
    });
  }

  if (yel?.connected === false) {
    insights.push({
      icon: "cause",
      title: "Possible root cause",
      body: "No YEL connectivity keys in snapshot — exchange line may be down or not captured in the uploaded journal.",
    });
    insights.push({
      icon: "action",
      title: "Suggested action",
      body: "Verify yel_connected events in the journal file and exchange adapter health on the Exchange page.",
    });
  }

  const topGroup = rejections?.groups?.[0];
  if (topGroup && Number(topGroup.count) >= 5) {
    insights.push({
      icon: "pattern",
      title: "Similar pattern",
      body: `Code ${topGroup.code || "—"} accounts for ${topGroup.count} rejections — review RMS limits or symbol permissions.`,
    });
  }

  if (!insights.length) {
    insights.push({
      icon: "info",
      title: "No derived insights",
      body: "Connect Elasticsearch incidents or upload a journal with rejection / YEL events for automated analysis.",
    });
  }

  return insights;
}
