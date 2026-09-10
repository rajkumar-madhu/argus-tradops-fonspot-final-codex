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
