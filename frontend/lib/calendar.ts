export type CalendarDay = {
  date: string;
  orders: number;
  executed: number;
  open_pending: number;
  rejected: number;
  alerts: number;
  from_time: string;
  to_time: string;
  orders_available: boolean;
  alerts_available: boolean;
  complete: boolean;
};

export type CalendarPayload = {
  window: { start: string; end: string; today: string; days: number };
  selected_date: string;
  timezone: string;
  tenant: { id: string; name: string };
  days: CalendarDay[];
  detail: { orders: any[]; alerts: any[] };
  filters: { accounts: string[]; exchanges: string[]; services: string[] };
  source: string;
  source_count: number;
  returned: number;
  complete: boolean;
  detail_truncated?: boolean;
  alerts_complete?: boolean;
  freshness: { state: "live" | "delayed" | "unavailable" | "unknown" | "file"; last_seen?: string | null };
  sample_data?: boolean;
  _error?: string;
};

export type CalendarFilters = {
  account: string;
  exchange: string;
  service: string;
  start: string;
  end: string;
};

export function calendarQuery(filters: CalendarFilters, selectedDate?: string, format?: "csv" | "xlsx") {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
  if (selectedDate) params.set("date", selectedDate);
  if (format) params.set("format", format);
  return params.toString();
}

export function shiftIsoDate(value: string, days: number): string {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function weekdayOffset(value: string): number {
  return new Date(`${value}T12:00:00Z`).getUTCDay();
}

export function dayLabel(value: string, options: Intl.DateTimeFormatOptions = {}): string {
  return new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", ...options }).format(new Date(`${value}T12:00:00Z`));
}

export function ordersDrilldown(day: CalendarDay, status: "rejected" | "open_pending" | "all", filters?: Pick<CalendarFilters, "account" | "exchange" | "service">): string {
  const params = new URLSearchParams({ status, calendar_date: day.date, from_time: day.from_time, to_time: day.to_time });
  if (filters?.account) params.set("account", filters.account);
  if (filters?.exchange) params.set("exchange", filters.exchange);
  if (filters?.service) params.set("service", filters.service);
  return `/orders?${params.toString()}`;
}

export function rangeHasActivity(days: CalendarDay[]): boolean {
  return days.some((day) => day.orders > 0 || day.alerts > 0);
}
