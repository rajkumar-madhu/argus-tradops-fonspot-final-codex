export type FilterState = {
  query?: string;
  facets?: Record<string, string>;
  timeKey?: string;
  from?: string;
  to?: string;
};

function text(value: unknown): string {
  if (value == null) return '';
  if (Array.isArray(value)) return value.map(text).join(' ');
  if (typeof value === 'object') return Object.values(value).map(text).join(' ');
  return String(value);
}

/** Works only on the supplied, already-masked snapshot. Never fetches more data. */
export function filterRows<T extends Record<string, any>>(rows: T[], state: FilterState): T[] {
  const query = (state.query || '').trim().toLocaleLowerCase();
  const from = state.from ? Date.parse(state.from) : -Infinity;
  const to = state.to ? Date.parse(state.to) : Infinity;
  if (Number.isNaN(from) || Number.isNaN(to) || from > to) return [];
  return rows.filter(row => {
    if (query && !text(row).toLocaleLowerCase().includes(query)) return false;
    for (const [key, value] of Object.entries(state.facets || {})) {
      if (!value) continue;
      const choices = Array.isArray(row[key]) ? row[key] : [row[key]];
      if (!choices.some((v: unknown) => text(v) === value)) return false;
    }
    if (state.timeKey && (state.from || state.to)) {
      const value = row[state.timeKey];
      const time = value == null ? NaN : Date.parse(String(value));
      if (!Number.isFinite(time) || time < from || time > to) return false;
    }
    return true;
  });
}

export function sortRows<T extends Record<string, any>>(rows: T[], key: string, direction: 'asc' | 'desc'): T[] {
  if (!key) return [...rows];
  return [...rows].sort((a, b) => {
    const x = a[key], y = b[key];
    if (x == null && y == null) return 0;
    if (x == null) return 1;
    if (y == null) return -1;
    const result = typeof x === 'number' && typeof y === 'number'
      ? x - y : text(x).localeCompare(text(y), undefined, { numeric: true });
    return direction === 'asc' ? result : -result;
  });
}

/** Quote all fields and neutralize spreadsheet formulas in untrusted strings. */
export function csvCell(value: unknown): string {
  let result = text(value);
  if (typeof value !== 'number' && (/^\s*[=+\-@]/.test(result) || /^[\t\r\n]/.test(result))) result = "'" + result;
  return '"' + result.replace(/"/g, '""') + '"';
}
