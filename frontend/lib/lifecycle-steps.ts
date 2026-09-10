// Self-contained (no `@/` imports) so node --test can load it directly.

export type LifecycleStep = {
  key: string;
  label: string;
  state: "done" | "failed" | "pending";
  time?: string;
};

/**
 * One step per recorded journal event, oldest first. Consecutive events with
 * the same status (partial-fill updates) fold into one step with a count, and
 * nothing is inferred: the journal records statuses, not validation or RMS
 * hops, so no such step is drawn.
 */
export function buildLifecycleSteps(events: any[]): LifecycleStep[] {
  const sorted = [...events].sort((a, b) => Date.parse(a?.time || "") - Date.parse(b?.time || ""));
  const steps: (LifecycleStep & { count: number })[] = [];
  for (const e of sorted) {
    const status = String(e?.status || "").toUpperCase() || "UNKNOWN";
    const code = e?.status_code == null ? "" : ` (${e.status_code})`;
    const label = `${status.charAt(0)}${status.slice(1).toLowerCase().replace(/_/g, " ")}${code}`;
    const prev = steps[steps.length - 1];
    if (prev && prev.label === label) {
      prev.count += 1;
      prev.time = e?.time || prev.time;
      continue;
    }
    steps.push({ key: `${steps.length}-${label}`, label, state: status === "REJECTED" ? "failed" : "done", time: e?.time, count: 1 });
  }
  return steps.map(({ count, ...step }) => (count > 1 ? { ...step, label: `${step.label} ×${count}` } : step));
}

