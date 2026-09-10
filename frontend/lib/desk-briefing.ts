export type DeskBriefingInput = {
  total: number;
  rejected: number;
  open: number;
  pending: number;
  yelConnected: boolean;
  hasYelObservation: boolean;
};

/**
 * Builds a source-bound desk briefing. It intentionally does not pronounce a
 * system healthy: a journal or partial API response is only an observation.
 */
export function deskBriefing(input: DeskBriefingInput) {
  const rejectionRate = input.total ? (input.rejected / input.total) * 100 : 0;
  const items: { tone: "critical" | "watch" | "clear"; title: string; detail: string; href: string }[] = [];

  if (input.rejected > 0) {
    items.push({
      tone: rejectionRate > 5 ? "critical" : "watch",
      title: `${input.rejected.toLocaleString()} rejected order${input.rejected === 1 ? "" : "s"}`,
      detail: `${rejectionRate.toFixed(2)}% of the loaded order universe. Review reason and order evidence.`,
      href: "/rejections",
    });
  }
  if (input.open + input.pending > 0) {
    items.push({
      tone: "watch",
      title: `${(input.open + input.pending).toLocaleString()} order${input.open + input.pending === 1 ? "" : "s"} awaiting closure`,
      detail: `${input.open.toLocaleString()} open and ${input.pending.toLocaleString()} pending or trigger-pending in this snapshot.`,
      href: "/orders",
    });
  }
  if (input.hasYelObservation && !input.yelConnected) {
    items.push({
      tone: "critical",
      title: "YEL connectivity is disconnected",
      detail: "The latest yel_connected observation is disconnected; inspect venue and infrastructure evidence.",
      href: "/exchange",
    });
  }
  if (items.length === 0) {
    items.push({
      tone: "clear",
      title: "No exception signal in loaded observations",
      detail: "No rejected, open, or pending orders were returned. This is not a live-health assertion.",
      href: "/orders",
    });
  }
  return items.slice(0, 3);
}
