import RefreshButton from '@/components/RefreshButton';
export const QUERY_WINDOWS = ['1h', '4h', '24h', '7d', '30d'];
export function queryWindow(value?: string) { return QUERY_WINDOWS.includes(value || '') ? value! : '24h'; }
export default function QueryWindow({value, source, label = 'Query window'}: {value:string; source?:string; label?:string}) {
 const snapshot = source === 'demo' || source === 'journal snapshot';
 return <form method="get" className="query-window">
  {snapshot ? <span className="source-tag">FILE-BASED · historical query windows unavailable</span> : <>
   <label>{label}<select name="lookback" defaultValue={value} aria-label={label}>{QUERY_WINDOWS.map(option=><option key={option} value={option}>{option}</option>)}</select></label>
   <button type="submit">Apply window</button>
  </>}
  <RefreshButton/>
 </form>;
}
