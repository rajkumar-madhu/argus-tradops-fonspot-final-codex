export type FileQuery = Record<string, string | string[] | undefined>;
const keys = ['segment', 'q', 'start', 'end', 'status', 'limit', 'offset', 'sort', 'direction', 'instance', 'prefix'];
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

/** IST cash-session windows. End is inclusive of the stated minute, stored as an offset instant. */
export const SESSION_WINDOWS = [
  { id: 'pre-open', label: 'Pre-Open', start: '08:45', end: '09:15' },
  { id: 'opening-rush', label: 'Opening rush', start: '09:15', end: '09:20' },
  { id: 'morning', label: 'Morning', start: '09:15', end: '12:00' },
  { id: 'afternoon', label: 'Afternoon', start: '12:00', end: '15:00' },
  { id: 'square-off', label: 'Square-off', start: '15:15', end: '15:20' },
  { id: 'close', label: 'Close', start: '15:20', end: '15:30' },
] as const;

export const KNOWN_QUEUE_PREFIXES = ['NSE', 'NFO', 'BSE', 'BFO'] as const;

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

function pad(value: number) {
  return String(value).padStart(2, '0');
}

/** Calendar date in Asia/Kolkata for an instant. IST has no daylight-saving shift. */
export function istDate(value?: string | null): string {
  if (!value) return '';
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return '';
  const ist = new Date(ms + IST_OFFSET_MS);
  return `${ist.getUTCFullYear()}-${pad(ist.getUTCMonth() + 1)}-${pad(ist.getUTCDate())}`;
}

/** Earliest valid instant, as an IST calendar date. Empty when nothing parses. */
export function suggestedSessionDate(times: Array<string | null | undefined>): string {
  let earliest = Infinity;
  for (const time of times) {
    const ms = time ? Date.parse(time) : NaN;
    if (Number.isFinite(ms) && ms < earliest) earliest = ms;
  }
  if (!Number.isFinite(earliest)) return '';
  return istDate(new Date(earliest).toISOString());
}

export function sessionRange(date: string, windowId: string): { start: string; end: string } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const window = SESSION_WINDOWS.find((item) => item.id === windowId);
  if (!window) return null;
  return {
    start: `${date}T${window.start}:00+05:30`,
    end: `${date}T${window.end}:00+05:30`,
  };
}

export function sameInstant(left?: string | null, right?: string | null): boolean {
  const a = left ? Date.parse(left) : NaN;
  const b = right ? Date.parse(right) : NaN;
  return Number.isFinite(a) && a === b;
}

/** UTC wall time for a datetime-local input. Charts and those inputs stay labeled UTC. */
export function utcDateTimeLocal(value?: string | null): string {
  if (!value) return '';
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return '';
  return new Date(ms).toISOString().slice(0, 16);
}

export function activeSession(start?: string | null, end?: string | null, date?: string | null): string {
  const day = date || istDate(start);
  if (!day) return '';
  const match = SESSION_WINDOWS.find((window) => {
    const range = sessionRange(day, window.id);
    return !!range && sameInstant(start, range.start) && sameInstant(end, range.end);
  });
  return match?.id ?? '';
}

/** Leading token of a queue instance: NSE-5864 and BSE both group under their exchange. */
export function instancePrefix(instance: string): string {
  return instance.split('-')[0]?.trim() ?? '';
}

/** NSE, NFO, BSE and BFO always, then any other prefix present on the loaded files. */
export function queuePrefixes(instances: string[]): string[] {
  const present = new Set(instances.map(instancePrefix).filter(Boolean));
  const extras = [...present].filter((prefix) => !(KNOWN_QUEUE_PREFIXES as readonly string[]).includes(prefix)).sort();
  return [...KNOWN_QUEUE_PREFIXES, ...extras];
}

export function isKnownSegment(prefix: string): boolean {
  return (KNOWN_QUEUE_PREFIXES as readonly string[]).includes(prefix);
}

/** True when positive samples cover at least one order of magnitude. */
export function spansOrdersOfMagnitude(values: Array<number | null | undefined>): boolean {
  const positive = values.filter((value): value is number => value != null && Number.isFinite(value) && value > 0);
  if (positive.length < 2) return false;
  return Math.max(...positive) / Math.min(...positive) >= 10;
}

/**
 * Early-window spike: the maximum in the first 15% of the span is at least
 * 10× the median of the later bucket values. Returns null when the series
 * is too short or the early window is not extreme.
 */
export function earlyWindowSpike(points: Array<{ time?: string | null; value?: number | null }>): { earlyMax: number; laterMedian: number } | null {
  const usable = points.filter((point): point is { time: string; value: number } => {
    return !!point.time && Number.isFinite(Date.parse(point.time)) && point.value != null && Number.isFinite(point.value);
  });
  if (usable.length < 4) return null;
  const times = usable.map((point) => Date.parse(point.time));
  const start = Math.min(...times);
  const span = Math.max(...times) - start;
  if (span <= 0) return null;
  const cut = start + span * 0.15;
  const early = usable.filter((point) => Date.parse(point.time) <= cut);
  const later = usable.filter((point) => Date.parse(point.time) > cut);
  if (!early.length || later.length < 3) return null;
  const laterValues = later.map((point) => point.value).sort((a, b) => a - b);
  const mid = Math.floor(laterValues.length / 2);
  const laterMedian = laterValues.length % 2 === 1 ? laterValues[mid] : (laterValues[mid - 1] + laterValues[mid]) / 2;
  const earlyMax = Math.max(...early.map((point) => point.value));
  if (!(laterMedian > 0) || earlyMax < laterMedian * 10) return null;
  return { earlyMax, laterMedian };
}
