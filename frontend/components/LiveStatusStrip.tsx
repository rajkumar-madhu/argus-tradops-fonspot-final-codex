"use client";

import type { SourceChip } from "@/lib/data-source";

/**
 * Compact honesty strip for Overview + Live Orders.
 * Never invents LIVE when the config chip is file/offline.
 */
export default function LiveStatusStrip({
  chip,
  venues = [],
}: {
  chip: SourceChip;
  venues?: string[];
}) {
  const text = chip?.text || "Source unreported";
  const tone = chip?.tone || "unknown";
  const live = text === "LIVE";

  return (
    <div className={`live-status-strip tone-${tone}`} role="status" aria-live="polite">
      <span className={`source-badge ${tone === "file-based" ? "file-based" : tone === "live" ? "live" : "warn"}`}>
        {text}
      </span>
      <b>{live ? "Live monitoring" : "Snapshot monitoring"}</b>
      <span>
        {live
          ? "SSE on the Live tab when the collector is publishing"
          : "Uploaded observations — not a live feed"}
      </span>
      {venues.length > 0 && (
        <ul className="live-status-venues" aria-label="Observed venues">
          {venues.map((v) => (
            <li key={v}>{v}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
