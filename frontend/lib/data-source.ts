/** UI labels for API `source` fields — never surface the word "demo" to operators. */

export function isSnapshotSource(source?: string | null): boolean {
  return source === "demo" || source === "journal snapshot";
}

export function isJournalSource(source?: string | null): boolean {
  return source === "journal snapshot";
}

export function sourceBadgeText(source?: string | null, connected = true): string {
  if (isJournalSource(source)) return "FILE-BASED";
  if (source === "demo") return "OFFLINE";
  if (!connected) return "OFFLINE";
  return "LIVE";
}

export function sourceBadgeTone(
  source?: string | null,
  connected = true,
): "file-based" | "live" | "warn" {
  if (isJournalSource(source)) return "file-based";
  if (source === "demo" || !connected) return "warn";
  return "live";
}

/** Operator-facing label for the data source field (never "demo"). */
export function sourceDisplayName(source?: string | null): string {
  if (isJournalSource(source)) return "Journal file";
  if (source === "demo") return "Offline";
  if (source === "unconfigured") return "Not configured";
  if (!source) return "—";
  return source.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function hasLiveMarketFeed(source?: string | null, symbolCount = 0): boolean {
  if (!symbolCount) return false;
  if (!source || source === "demo" || source === "journal snapshot" || source === "unconfigured") {
    return false;
  }
  return true;
}
