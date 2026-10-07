export type FileQuery = Record<string, string | string[] | undefined>;
const keys = ['segment', 'q', 'start', 'end', 'status', 'limit', 'offset', 'sort', 'direction', 'instance'];
export function fileQuery(input: FileQuery, extras: Record<string, string> = {}) {
  const params = new URLSearchParams();
  for (const key of keys) {
    const value = input[key];
    if (typeof value === 'string' && value) params.set(key, value);
  }
  for (const [key, value] of Object.entries(extras)) value ? params.set(key, value) : params.delete(key);
  return params.toString();
}
export function metric(value: number | null | undefined, unit = '') {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${value.toLocaleString('en-US', {maximumFractionDigits: 2})}${unit ? ` ${unit}` : ''}`;
}

export function sessionQuery(query: FileQuery, date: string, start: string, end: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(start) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(end) || start > end) throw new Error('Select a valid date and time range.');
  const a = new Date(`${date}T${start}:00+05:30`), b = new Date(`${date}T${end}:59.999+05:30`);
  if (!Number.isFinite(a.getTime()) || !Number.isFinite(b.getTime()) || istParts(a.toISOString())?.date !== date) throw new Error('Select a valid date and time range.');
  return fileQuery(query, { start: a.toISOString(), end: b.toISOString(), offset: '' });
}
export function istParts(value?: string | string[]) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) return null;
  const shifted = new Date(Date.parse(value) + 330 * 60000).toISOString();
  return { date: shifted.slice(0, 10), time: shifted.slice(11, 16) };
}
