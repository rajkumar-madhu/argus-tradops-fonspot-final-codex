import RefreshButton from '@/components/RefreshButton';
import { queryDay, istToday, windowSelectValue } from '@/lib/query-window';

export {
  QUERY_WINDOWS,
  ROLLING_WINDOWS,
  apiWindowQuery,
  istToday,
  queryDay,
  queryWindow,
  windowLabel,
  windowSelectValue,
} from '@/lib/query-window';

const WINDOW_OPTIONS: { value: string; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: '1h', label: '1 hour' },
  { value: '4h', label: '4 hours' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: 'custom', label: 'Custom date' },
];

export default function QueryWindow({
  value,
  day,
  source,
  label = 'Query window',
}: {
  value: string;
  day?: string | null;
  source?: string;
  label?: string;
}) {
  const snapshot = source === 'demo' || source === 'journal snapshot';
  const selectValue = windowSelectValue(value, day || undefined);
  return (
    <form method="get" className="query-window">
      {snapshot ? (
        <span className="source-tag">FILE-BASED · historical query windows unavailable</span>
      ) : (
        <>
          <label>
            {label}
            <select name="lookback" defaultValue={selectValue} aria-label={label}>
              {WINDOW_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Date
            <input
              type="date"
              name="day"
              defaultValue={queryDay(day || undefined) || istToday()}
              aria-label="Custom date (IST)"
            />
          </label>
          <button type="submit">Apply window</button>
        </>
      )}
      <RefreshButton />
    </form>
  );
}
