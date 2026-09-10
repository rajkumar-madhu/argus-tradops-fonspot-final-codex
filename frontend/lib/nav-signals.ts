/**
 * Live signals rendered in the sidebar rail.
 *
 * Two rules govern everything here, and both exist because a navigation badge is
 * read as fact by an operator who has not opened the page yet:
 *
 *  1. A count is rendered only when a real endpoint returned one. Anything else —
 *     a 403 from a role without access, a network failure, a payload that does not
 *     carry a count — yields `null`, and `null` renders nothing at all.
 *  2. Zero renders nothing either. A quiet rail means "nothing was reported"; a
 *     "0" chip would claim the query ran and came back empty, which is a stronger
 *     statement than the shell can honestly make.
 */

/** Routes that can carry a count, mapped to the endpoint that supplies it. */
export const SIGNAL_ROUTES: Record<string, string> = {
  "/incidents": "/api/incidents?status=open&limit=500",
};

export type NavSignals = Record<string, number>;

/**
 * Reads a count out of an API payload.
 *
 * `/api/incidents` returns `{items, count, source}`. `count` is preferred over
 * `items.length` because the list is capped by `limit` while the count is not.
 * Returns null rather than 0 for an unusable payload so the caller can tell
 * "no answer" apart from "nothing to report".
 */
export function parseSignalCount(payload: unknown): number | null {
  if (!payload || typeof payload !== "object") return null;
  const body = payload as Record<string, unknown>;
  if (typeof body._error === "string") return null;
  if (typeof body.count === "number" && Number.isFinite(body.count)) {
    return body.count >= 0 ? body.count : null;
  }
  if (Array.isArray(body.items)) return body.items.length;
  return null;
}

/** True when a count is worth putting in front of an operator. */
export function hasSignal(count: number | null | undefined): boolean {
  return typeof count === "number" && Number.isFinite(count) && count > 0;
}

/** Counts above 99 would widen the rail, so they cap rather than wrap. */
export function formatSignal(count: number): string {
  return count > 99 ? "99+" : String(count);
}
