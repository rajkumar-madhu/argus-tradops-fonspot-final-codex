export const ROLLING_WINDOWS = ['1h', '4h', '7d', '30d'] as const;
export const QUERY_WINDOWS = ['today', ...ROLLING_WINDOWS, 'custom'] as const;

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** IST calendar date (UTC+5:30), YYYY-MM-DD. */
export function istToday(now = Date.now()): string {
  const ist = new Date(now + (5 * 60 + 30) * 60 * 1000);
  return ist.toISOString().slice(0, 10);
}

export function queryDay(value?: string): string | null {
  return DAY.test(value || '') ? value! : null;
}

export function queryWindow(value?: string): string {
  return QUERY_WINDOWS.includes((value || '') as (typeof QUERY_WINDOWS)[number]) ? value! : 'today';
}

/**
 * Query string for live ES routes. Default is IST today.
 * Rolling windows (7d, …) ignore a leftover date field on the form.
 */
export function apiWindowQuery(lookback?: string, day?: string): string {
  if (lookback && (ROLLING_WINDOWS as readonly string[]).includes(lookback))
    return `lookback=${lookback}`;
  if (lookback === 'custom') return `day=${queryDay(day) || istToday()}`;
  if (lookback === 'today') return `day=${istToday()}`;
  if (queryDay(day)) return `day=${day}`;
  return `day=${istToday()}`;
}

export function windowSelectValue(lookback?: string, day?: string): string {
  if (lookback && (ROLLING_WINDOWS as readonly string[]).includes(lookback)) return lookback;
  if (lookback === 'custom') return 'custom';
  const d = queryDay(day);
  if (d && d !== istToday() && lookback !== 'today') return 'custom';
  return 'today';
}

export function windowLabel(lookback?: string, day?: string): string {
  if (lookback && (ROLLING_WINDOWS as readonly string[]).includes(lookback)) return lookback;
  const d = lookback === 'today' ? istToday() : queryDay(day) || istToday();
  return d === istToday() ? 'Today' : d;
}
