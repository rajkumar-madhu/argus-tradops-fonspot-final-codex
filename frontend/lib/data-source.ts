/** UI labels for API `source` fields — never surface the word "demo" to operators. */

export function isSnapshotSource(source?: string | null): boolean {
  return source === "demo" || source === "csv snapshot" || source === "journal snapshot";
}

export function isJournalSource(source?: string | null): boolean {
  return source === "journal snapshot";
}

export function sourceBadgeText(source?: string | null, connected = true): string {
  if (isJournalSource(source) || source === "csv snapshot") return "FILE-BASED";
  if (source === "demo") return "OFFLINE";
  if (!connected) return "OFFLINE";
  // No source means the API did not answer, or answered without naming one.
  // That is an absence of evidence, not evidence of a live feed — defaulting it
  // to LIVE put a green badge above a page whose data call had 401'd.
  if (!source) return "OFFLINE";
  return "LIVE";
}

export function sourceBadgeTone(
  source?: string | null,
  connected = true,
): "file-based" | "live" | "warn" {
  if (isJournalSource(source) || source === "csv snapshot") return "file-based";
  if (source === "demo" || !connected || !source) return "warn";
  return "live";
}

/** Operator-facing label for the data source field (never "demo"). */
export function sourceDisplayName(source?: string | null): string {
  if (isJournalSource(source)) return "Journal file";
  if (source === "csv snapshot") return "CSV snapshot";
  if (source === "demo") return "Offline";
  if (source === "unconfigured") return "Not configured";
  if (!source) return "—";
  return source.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function hasLiveMarketFeed(source?: string | null, symbolCount = 0): boolean {
  if (!symbolCount) return false;
  if (!source || source === "demo" || source === "csv snapshot" || source === "journal snapshot" || source === "unconfigured") {
    return false;
  }
  return true;
}

export type SourceChip = { text: string; tone: string; detail?: string } | null;

export type FreshnessState = "live" | "delayed" | "stale" | "closed" | "batch" | "unavailable";
export type Freshness = { state?: FreshnessState | string; as_of?: string | null; age_seconds?: number | null; ingest_lag_seconds?: number | null };

/** "2026-06-30 03:53 UTC" from an ISO stamp, or the value itself for a bare date. */
export function stampText(value: string | null | undefined): string {
  if (!value) return "";
  const t = Date.parse(value);
  if (!Number.isFinite(t) || !value.includes("T")) return value;
  return `${new Date(t).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

/** "4 s", "3 min", "2 h 10 min" — for badges, not tables. */
export function ageText(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(Number(seconds))) return "";
  const s = Math.max(0, Math.round(Number(seconds)));
  if (s < 90) return `${s} s`;
  const m = Math.round(s / 60);
  if (m < 90) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h} h ${m - h * 60} min`;
}

/**
 * Badge for what the operator is looking at. Five states, not three: LIVE is
 * only claimed while the newest event is within the live threshold; DELAYED and
 * STALE say how far behind; CLOSED is a quiet stream outside trading hours;
 * FILE-BASED is a journal or CSV batch. A live→journal fallback is DELAYED, never
 * LIVE, however fresh the file is.
 */
export function freshnessBadge(
  primary: Freshness | null | undefined,
  dataSource?: string | null,
  fallback?: { reason?: string } | null,
): { text: string; tone: string; detail: string } {
  if (fallback) return { text: "DELAYED", tone: "delayed", detail: `Live source unavailable (${fallback.reason || "fallback"}); showing the journal file` };
  if (isJournalSource(dataSource) || dataSource === "csv snapshot") {
    return { text: "FILE-BASED", tone: "file-based", detail: primary?.as_of ? `File window to ${stampText(primary.as_of)}` : "Uploaded history, not a live feed" };
  }
  if (dataSource === "demo") return { text: "OFFLINE", tone: "warn", detail: "No live or file source connected" };
  const age = ageText(primary?.age_seconds);
  const lag = primary?.ingest_lag_seconds;
  const lagText = lag === null || lag === undefined ? "" : ` · ingest lag ${ageText(lag)}`;
  switch (primary?.state) {
    case "live": return { text: "LIVE", tone: "live", detail: `Newest event ${age} ago${lagText}` };
    case "delayed": return { text: "DELAYED", tone: "delayed", detail: `Newest event ${age} ago${lagText}` };
    case "stale": return { text: "STALE", tone: "stale", detail: `No event for ${age} during trading hours` };
    case "closed": return { text: "CLOSED", tone: "closed", detail: `Market closed · last event ${age} ago` };
    case "batch": return { text: "FILE-BASED", tone: "file-based", detail: primary?.as_of ? `Batch as of ${stampText(primary.as_of)}` : "Daily batch" };
    default: return { text: "OFFLINE", tone: "warn", detail: "Freshness unavailable" };
  }
}

/**
 * Sidebar rail chip built from `/api/config`.
 *
 * Lives here so the rail can never disagree with the badge on the page — and
 * can never say "demo" to an operator. Returns null for a missing or failed
 * config so the caller can say "unreported" instead of guessing a state.
 * With a /api/freshness payload the chip carries the age-based state.
 */
export function sourceChip(config: unknown, freshness?: unknown): SourceChip {
  if (!config || typeof config !== "object") return null;
  const body = config as Record<string, unknown>;
  if (typeof body._error === "string") return null;
  const source = body.data_source;
  if (typeof source !== "string" || !source) return null;
  const fresh = freshness && typeof freshness === "object" && !("_error" in (freshness as object)) ? (freshness as { primary?: Freshness }) : null;
  if (fresh?.primary) {
    const badge = freshnessBadge(fresh.primary, source);
    return { text: badge.text, tone: badge.tone, detail: badge.detail };
  }
  return { text: sourceBadgeText(source), tone: sourceBadgeTone(source) };
}
