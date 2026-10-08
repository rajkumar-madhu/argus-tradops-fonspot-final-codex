export type CalendarRow = Record<string, any>;
export type CalendarSource = { items?: CalendarRow[]; count?: number; source?: string; fallback?: unknown; _error?: string; _status?: number };
export type CalendarQuery = { start?: string; end?: string; date?: string; exchange?: string };
export type CalendarDay = { date: string; orders: CalendarRow[]; incidents: CalendarRow[]; complete: number; pending: number; rejected: number };

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
export function validDate(value: string): boolean {
  return datePattern.test(value) && Number.isFinite(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
}
export function shiftDate(value: string, days: number): string {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
export function istDay(value: unknown): string | null {
  // A timezone is required: never interpret an ambiguous source timestamp in the host zone.
  if (typeof value !== 'string' || !/(Z|[+-]\d{2}:\d{2})$/i.test(value)) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time + 330 * 60000).toISOString().slice(0, 10) : null;
}
export function dateLabel(value: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat('en-IN', { ...options, timeZone: 'UTC' }).format(new Date(`${value}T12:00:00Z`));
}
export function calendarData(orders: CalendarSource, incidents: CalendarSource, query: CalendarQuery = {}, now = new Date()) {
  const available = (data: CalendarSource) => !data._error && Array.isArray(data.items) && !!data.source && !['unavailable', 'unconfigured', 'demo'].includes(data.source);
  const ordersAvailable = available(orders);
  const incidentsAvailable = available(incidents);
  const rows = ordersAvailable ? orders.items! : [];
  const alerts = incidentsAvailable ? incidents.items! : [];
  const today = istDay(now.toISOString())!;
  const latest = [...rows.map(row => istDay(row.time)), ...alerts.map(row => istDay(row.first_seen))].filter((day): day is string => !!day && day <= today).sort().at(-1) || today;
  const end = query.end || latest;
  const start = query.start || (validDate(end) ? shiftDate(end, -29) : '');
  if (!validDate(start) || !validDate(end) || start > end || end > today || (Date.parse(end) - Date.parse(start)) / 86400000 > 30) {
    throw new Error('Choose a valid range of up to 31 days, ending today or earlier.');
  }
  const days: CalendarDay[] = [];
  for (let day = start; day <= end; day = shiftDate(day, 1)) days.push({ date: day, orders: [], incidents: [], complete: 0, pending: 0, rejected: 0 });
  const byDate = new Map(days.map(day => [day.date, day]));
  // A source can return repeated observations; count each order once at its latest timestamp.
  const unique = new Map<string, CalendarRow>();
  for (const [index, row] of rows.entries()) {
    const key = String(row.order_id || `row-${index}`);
    const previous = unique.get(key);
    if (!previous || (Date.parse(row.time) || 0) > (Date.parse(previous.time) || 0)) unique.set(key, row);
  }
  let undated = 0;
  for (const row of unique.values()) {
    const date = istDay(row.time);
    if (!date) { undated++; continue; }
    const day = byDate.get(date);
    if (!day || (query.exchange && row.exchange !== query.exchange)) continue;
    day.orders.push(row);
    const status = String(row.status).toLowerCase();
    day.complete += Number(status === 'complete');
    day.pending += Number(['open', 'pending', 'trigger_pending', 'partial'].includes(status));
    day.rejected += Number(status === 'rejected');
  }
  for (const row of alerts) {
    const date = istDay(row.first_seen);
    if (!date) { undated++; continue; }
    byDate.get(date)?.incidents.push(row);
  }
  const total = typeof orders.count === 'number' && Number.isFinite(orders.count) ? orders.count : null;
  const complete = ordersAvailable && total !== null && total <= unique.size && undated === 0;
  return {
    days, start, end, today, latest, ordersAvailable, incidentsAvailable, complete, undated,
    loaded: unique.size, total, source: orders.source, fallback: Boolean(orders.fallback),
    exchange: query.exchange || '', exchanges: [...new Set(rows.map(row => String(row.exchange || '')).filter(Boolean))].sort(),
    orderError: orders._status === 403 ? 'Your role does not include order access.' : orders._error || (!ordersAvailable ? 'Order source unavailable.' : ''),
    incidentError: incidents._status === 403 ? 'Your role does not include incident access.' : incidents._error || (!incidentsAvailable ? 'Incident source unavailable.' : ''),
    selected: days.some(day => day.date === query.date) ? query.date! : '',
    incidentLimit: 500,
  };
}
export type CalendarData = ReturnType<typeof calendarData>;
