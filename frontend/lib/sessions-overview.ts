// Derivations for the Users & Sessions overview (reference mockup 01_19_20).
// All figures come from /api/sessions events (user ids already masked). The
// journal holds login and logout events only, so session duration exists just
// for users with a login followed by a logout; nothing else is inferred.
// Self-contained so node --test can load it directly.

export type SessionEvent = {
  event?: string; status?: string; result?: string; active?: boolean; time?: string | null;
  user_id?: string; broker?: string; access_type?: string; access_group?: string;
  segments?: string[] | null; app_version?: string | null;
};

const parse = (t: unknown) => {
  const ms = Date.parse(String(t ?? ""));
  return Number.isNaN(ms) ? null : ms;
};
const isLogin = (e: SessionEvent) => e.event === "login";
const failed = (e: SessionEvent) => !/success/i.test(String(e.result || e.status || ""));

/** "DEALER-CSB" → "DEALER": the access group's role part, the journal's user type. */
export function userType(e: SessionEvent): string {
  const group = String(e.access_group || "").split("-")[0].trim();
  return group || "Unspecified";
}

export function sessionKpis(events: SessionEvent[]) {
  const logins = events.filter(isLogin);
  const failures = logins.filter(failed).length;
  const perUser = new Map<string, number>();
  for (const e of logins) if (e.user_id) perUser.set(e.user_id, (perUser.get(e.user_id) || 0) + 1);
  const durations = pairedDurations(events);
  return {
    active: events.filter((e) => e.active).length,
    uniqueUsers: perUser.size,
    loginSuccess: logins.length - failures,
    loginFailures: failures,
    successRate: logins.length ? ((logins.length - failures) / logins.length) * 100 : 0,
    repeatLoginUsers: Array.from(perUser.values()).filter((n) => n > 1).length,
    pairedSessions: durations.length,
    avgDurationMs: durations.length ? durations.reduce((a, d) => a + d.ms, 0) / durations.length : null,
  };
}

/** Durations for users whose login is followed by a logout in the window. */
export function pairedDurations(events: SessionEvent[]) {
  const sorted = [...events].filter((e) => parse(e.time) !== null).sort((a, b) => parse(a.time)! - parse(b.time)!);
  const open = new Map<string, number>();
  const out: { user: string; ms: number }[] = [];
  for (const e of sorted) {
    if (!e.user_id) continue;
    if (e.event === "login" && !failed(e)) open.set(e.user_id, parse(e.time)!);
    else if (e.event === "logout" && open.has(e.user_id)) {
      out.push({ user: e.user_id, ms: parse(e.time)! - open.get(e.user_id)! });
      open.delete(e.user_id);
    }
  }
  return out;
}

/** Logins per minute split into successful and failed. */
export function loginTrend(events: SessionEvent[]) {
  const bins = new Map<number, { ok: number; failed: number }>();
  for (const e of events.filter(isLogin)) {
    const t = parse(e.time);
    if (t === null) continue;
    const k = Math.floor(t / 60_000) * 60_000;
    const b = bins.get(k) || { ok: 0, failed: 0 };
    if (failed(e)) b.failed += 1; else b.ok += 1;
    bins.set(k, b);
  }
  const keys = Array.from(bins.keys()).sort((a, b) => a - b);
  return keys.map((k) => ({ start: k, ...bins.get(k)! }));
}

/** Count of active sessions by a key, largest first, with shares. */
export function activeBy(events: SessionEvent[], key: (e: SessionEvent) => string[] | string) {
  const counts = new Map<string, number>();
  let total = 0;
  for (const e of events) {
    if (!e.active) continue;
    const values = key(e);
    for (const v of Array.isArray(values) ? values : [values]) {
      if (!v) continue;
      counts.set(v, (counts.get(v) || 0) + 1);
      total += 1;
    }
  }
  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count, share: total ? (count / total) * 100 : 0 }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/** Users with more than one login in the window, most logins first. */
export function repeatLogins(events: SessionEvent[], limit = 5) {
  const byUser = new Map<string, SessionEvent[]>();
  for (const e of events.filter(isLogin)) {
    if (!e.user_id) continue;
    byUser.set(e.user_id, [...(byUser.get(e.user_id) || []), e]);
  }
  return Array.from(byUser.entries())
    .filter(([, list]) => list.length > 1)
    .map(([user, list]) => ({
      user,
      logins: list.length,
      last: list.reduce((l, e) => ((parse(e.time) ?? 0) > (parse(l) ?? 0) ? String(e.time) : l), ""),
      broker: list[0].broker || "",
    }))
    .sort((a, b) => b.logins - a.logins || a.user.localeCompare(b.user))
    .slice(0, limit);
}

/** "2h 14m", "14m 05s", "42s". */
export function durationText(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms) || ms < 0) return "—";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
  return `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}m`;
}
