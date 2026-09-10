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
  return "LIVE";
}

export function sourceBadgeTone(
  source?: string | null,
  connected = true,
): "file-based" | "live" | "warn" {
  if (isJournalSource(source) || source === "csv snapshot") return "file-based";
  if (source === "demo" || !connected) return "warn";
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

export type SourceChip = { text: string; tone: string } | null;

/**
 * Sidebar rail chip built from `/api/config`.
 *
 * Lives here so the rail can never disagree with the badge on the page — and
 * can never say "demo" to an operator. Returns null for a missing or failed
 * config so the caller can say "unreported" instead of guessing a state.
 */
export function sourceChip(config: unknown): SourceChip {
  if (!config || typeof config !== "object") return null;
  const body = config as Record<string, unknown>;
  if (typeof body._error === "string") return null;
  const source = body.data_source;
  if (typeof source !== "string" || !source) return null;
  return { text: sourceBadgeText(source), tone: sourceBadgeTone(source) };
}
