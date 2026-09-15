export type DeskBriefingInput = {
  total: number;
  rejected: number;
  open: number;
  pending: number;
  yelConnected: boolean;
  hasYelObservation: boolean;
  categories?: { name?: string; count?: number }[];
  groups?: { code?: string; reason?: string; category?: string; count?: number }[];
  brokers?: { broker?: string; rejected?: number; rejectPct?: number; aboveAvg?: boolean }[];
  activeSessions?: number | null;
};

export type DeskBriefingItem = {
  tone: 'critical' | 'watch' | 'clear';
  title: string;
  detail: string;
  href: string;
};

/**
 * Ranked ops findings from the loaded window. Counts and rates only — never
 * rupees or a live-health assertion. Extra RMS / broker / session cards follow
 * the original reject → queue → YEL order so the desk still sees exceptions first.
 */
export function deskBriefing(input: DeskBriefingInput): DeskBriefingItem[] {
  const rejectionRate = input.total ? (input.rejected / input.total) * 100 : 0;
  const items: DeskBriefingItem[] = [];

  if (input.rejected > 0) {
    items.push({
      tone: rejectionRate > 5 ? 'critical' : 'watch',
      title: `${input.rejected.toLocaleString()} rejected order${input.rejected === 1 ? '' : 's'}`,
      detail: `${rejectionRate.toFixed(2)}% of the loaded order universe. Review reason and order evidence.`,
      href: '/rejections',
    });
  }

  const rmsCats = (input.categories || [])
    .filter((c) => String(c.name || '').startsWith('RMS /') && Number(c.count) > 0)
    .sort((a, b) => Number(b.count) - Number(a.count));
  for (const cat of rmsCats.slice(0, 2)) {
    const count = Number(cat.count);
    items.push({
      tone: count >= 50 ? 'critical' : 'watch',
      title: `${count.toLocaleString()} ${cat.name} hits`,
      detail: `${count.toLocaleString()} unique rejected orders in this RMS rule. Open Risk for the rule list.`,
      href: '/risk',
    });
  }

  const otherCat = (input.categories || [])
    .filter((c) => !String(c.name || '').startsWith('RMS /') && Number(c.count) > 0)
    .sort((a, b) => Number(b.count) - Number(a.count))[0];
  if (otherCat) {
    const count = Number(otherCat.count);
    items.push({
      tone: 'watch',
      title: `${count.toLocaleString()} ${otherCat.name} rejections`,
      detail: `Top non-RMS category in this window.`,
      href: '/rejections',
    });
  }

  const group = (input.groups || []).find((g) => Number(g.count) > 0);
  if (group) {
    const count = Number(group.count);
    const reason = String(group.reason || group.category || '').slice(0, 80);
    items.push({
      tone: 'watch',
      title: `${count.toLocaleString()} with code ${group.code || '—'}`,
      detail: reason || 'Top rejection code in this window.',
      href: '/rejections',
    });
  }

  for (const broker of (input.brokers || [])
    .filter((b) => b.aboveAvg && Number(b.rejected) > 0)
    .slice(0, 2)) {
    const rejected = Number(broker.rejected);
    const pct = Number(broker.rejectPct);
    items.push({
      tone: pct > 20 ? 'critical' : 'watch',
      title: `${broker.broker} reject rate above desk`,
      detail: `${rejected.toLocaleString()} rejected · ${pct.toFixed(1)}% of that broker's orders in the loaded rows.`,
      href: '/rejections',
    });
  }

  if (input.open + input.pending > 0) {
    items.push({
      tone: 'watch',
      title: `${(input.open + input.pending).toLocaleString()} order${input.open + input.pending === 1 ? '' : 's'} awaiting closure`,
      detail: `${input.open.toLocaleString()} open and ${input.pending.toLocaleString()} pending or trigger-pending in this snapshot.`,
      href: '/orders',
    });
  }
  if (input.hasYelObservation && !input.yelConnected) {
    items.push({
      tone: 'critical',
      title: 'YEL connectivity is disconnected',
      detail:
        'The latest yel_connected observation is disconnected; inspect venue and infrastructure evidence.',
      href: '/exchange',
    });
  }
  if (input.activeSessions === 0 && input.total > 0) {
    items.push({
      tone: 'watch',
      title: 'No active sessions in this window',
      detail:
        'No active sessions were returned for the loaded window. This is not a connectivity outage.',
      href: '/sessions',
    });
  }
  if (items.length === 0) {
    items.push({
      tone: 'clear',
      title: 'No exception signal in loaded observations',
      detail:
        'No rejected, open, or pending orders were returned. This is not a live-health assertion.',
      href: '/orders',
    });
  }
  return items.slice(0, 8);
}
