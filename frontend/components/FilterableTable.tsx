"use client";

import { Fragment, useId, useMemo, useState, type ReactNode } from 'react';
import { ArrowDownUp, ChevronLeft, ChevronRight, Download, Filter, Search } from 'lucide-react';
import { csvCell, filterRows, sortRows, type FilterState } from '@/lib/table-filters';

/** `cells` may be a thunk: a 10,000-row feed then renders only the page on screen, not every cell up front. */
export type GridRow = { id: string; values: Record<string, any>; cells: ReactNode[] | (() => ReactNode[]) };
const cellsOf = (r: GridRow): ReactNode[] => (typeof r.cells === 'function' ? r.cells() : r.cells);
const FACETS: Record<string, string> = {
  exchange: 'Exchange', product: 'Product', side: 'Side', status: 'Status', broker: 'Broker',
  segment: 'Segment', segments: 'Segments', access_type: 'Access type', region: 'Region',
  level: 'Level', service: 'Service', severity: 'Severity', rejection_category: 'Category',
  sector: 'Sector', type: 'Type', oms_status_label: 'OMS status', confirmed: 'Confirmed',
};

export default function FilterableTable({ rows, columns, className = 'orders-table', onSelect, selectedId, renderDetail, filtersOpen = true }: {
  rows: GridRow[];
  columns: {key: string; label: string}[];
  className?: string;
  onSelect?: (values: Record<string, any>) => void;
  selectedId?: string;
  /** When set, the selected row expands in place to this content. */
  renderDetail?: (values: Record<string, any>) => ReactNode;
  /** Initial state of the filter bar; pages with their own filters start it closed. */
  filtersOpen?: boolean;
}) {
  const id = useId();
  const [draft, setDraft] = useState<FilterState>({});
  const [applied, setApplied] = useState<FilterState>({});
  const [expanded, setExpanded] = useState(filtersOpen);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(10);
  const [sort, setSort] = useState<{key: string; direction: 'asc'|'desc'}>({key:'',direction:'asc'});
  const timeKey = ['time', '@timestamp', 'created_at', 'timestamp'].find(key => rows.some(r => r.values[key]));
  const facets = useMemo(() => Object.entries(FACETS).flatMap(([key, label]) => {
    const values = Array.from(new Set(rows.flatMap(r => {
      const value = r.values[key];
      return (Array.isArray(value) ? value : [value]).filter(v => v != null && v !== '').map(String);
    }))).sort();
    return values.length ? [{key, label, values}] : [];
  }), [rows]);
  const visible = useMemo(() => {
    const rowByValues = new Map(rows.map(r => [r.values, r]));
    return sortRows(filterRows(rows.map(r => r.values), {...applied, timeKey}), sort.key, sort.direction).map(values => rowByValues.get(values)!);
  }, [rows, applied, timeKey, sort]);
  const pages = Math.max(1, Math.ceil(visible.length / size));
  const current = Math.min(page, pages);
  const shown = visible.slice((current - 1) * size, current * size);
  const invalidDate = Boolean(draft.from && draft.to && draft.from > draft.to);
  const activeCount = Number(Boolean(applied.query)) + Object.values(applied.facets || {}).filter(Boolean).length + Number(Boolean(applied.from || applied.to));
  function reset() { setDraft({}); setApplied({}); setPage(1); }
  function exportCSV() {
    const content = [columns.map(c => csvCell(c.label)).join(','), ...visible.map(r => columns.map(c => csvCell(r.values[c.key])).join(','))].join('\r\n');
    const url = URL.createObjectURL(new Blob(['\uFEFF' + content], {type:'text/csv;charset=utf-8'}));
    const link = document.createElement('a'); link.href = url; link.download = 'tradeops-filtered-rows.csv'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <div className="data-explorer">
    <div className="grid-toolbar">
      <span className="grid-scope">Filters apply to {rows.length} loaded rows</span>
      <div className="grid-actions">
        <button type="button" aria-expanded={expanded} aria-controls={`${id}-filters`} onClick={() => setExpanded(!expanded)}><Filter size={14}/> Filters{activeCount ? ` (${activeCount})` : ''}</button>
        <button type="button" disabled={!visible.length} onClick={exportCSV}><Download size={14}/> Export CSV</button>
      </div>
    </div>
    <form id={`${id}-filters`} className="grid-filters" hidden={!expanded} onSubmit={e => {e.preventDefault(); if (!invalidDate) {setApplied(draft);setPage(1);}}} onReset={reset}>
      <label className="grid-search" htmlFor={`${id}-query`}>Search loaded rows<input id={`${id}-query`} type="search" value={draft.query || ''} placeholder="Order, symbol, user, message…" onChange={e => setDraft({...draft, query:e.target.value})}/></label>
      {facets.map(({key,label,values}) => <label key={key} htmlFor={`${id}-${key}`}>{label}<select id={`${id}-${key}`} value={draft.facets?.[key] || ''} onChange={e => setDraft({...draft, facets:{...draft.facets,[key]:e.target.value}})}><option value="">All</option>{values.map(v => <option key={v} value={v}>{v}</option>)}</select></label>)}
      {timeKey && <>
        <label htmlFor={`${id}-from`}>From (UTC)<input id={`${id}-from`} type="datetime-local" value={draft.from?.replace(/Z$/, '') || ''} onChange={e => setDraft({...draft,from:e.target.value ? e.target.value+'Z' : ''})}/></label>
        <label htmlFor={`${id}-to`}>To (UTC)<input id={`${id}-to`} type="datetime-local" value={draft.to?.replace(/Z$/, '') || ''} onChange={e => setDraft({...draft,to:e.target.value ? e.target.value+'Z' : ''})}/></label>
      </>}
      <button type="submit" className="primary-btn" disabled={invalidDate}><Search size={14}/> Apply filters</button><button type="reset">Reset</button>
      {invalidDate && <p role="alert" className="filter-error">From must be before To.</p>}
    </form>
    <div className="table-scroll" tabIndex={0} aria-label="Scrollable results">
      <table className={className}><thead><tr>{columns.map(c => <th key={c.key} aria-sort={sort.key === c.key ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}><button type="button" className="sort-button" onClick={() => {setSort({key:c.key,direction:sort.key===c.key&&sort.direction==='asc'?'desc':'asc'});setPage(1)}}>{c.label}<ArrowDownUp size={11}/></button></th>)}{onSelect && <th>Details</th>}</tr></thead>
        <tbody>{shown.map(r => <Fragment key={r.id}><tr className={selectedId===r.id?'row-selected':undefined} aria-expanded={renderDetail ? selectedId===r.id : undefined} onClick={onSelect ? () => onSelect(r.values) : undefined}>{cellsOf(r).map((cell,index) => <td key={columns[index].key}>{cell}</td>)}{onSelect && <td><button type="button" className="row-view" aria-label={`View ${r.values.order_id || r.values.symbol || r.id}`} onClick={e => {e.stopPropagation();onSelect(r.values)}}>{renderDetail && selectedId===r.id ? 'Hide' : 'View'}</button></td>}</tr>
          {renderDetail && selectedId===r.id && <tr className="row-detail"><td colSpan={columns.length + Number(Boolean(onSelect))}>{renderDetail(r.values)}</td></tr>}</Fragment>)}
        {!shown.length && <tr><td colSpan={columns.length + Number(Boolean(onSelect))}><div className="empty-state"><b>{rows.length ? 'No matching rows' : 'No rows available'}</b><p>{rows.length ? 'Try a wider date range or reset the filters.' : 'No records were returned by this source.'}</p>{activeCount > 0 && <button type="button" onClick={reset}>Reset filters</button>}</div></td></tr>}
        </tbody>
      </table>
    </div>
    <div className="table-foot"><span role="status">Showing {visible.length ? (current-1)*size+1 : 0}–{Math.min(current*size,visible.length)} of {visible.length} matching rows</span><div className="grid-pagination"><label htmlFor={`${id}-size`}>Rows<select id={`${id}-size`} value={size} onChange={e=>{setSize(Number(e.target.value));setPage(1)}}>{[10,25,50,100].map(n=><option key={n}>{n}</option>)}</select></label><button type="button" aria-label="Previous page" disabled={current===1} onClick={()=>setPage(current-1)}><ChevronLeft size={15}/></button><span>{current} / {pages}</span><button type="button" aria-label="Next page" disabled={current===pages} onClick={()=>setPage(current+1)}><ChevronRight size={15}/></button></div></div>
  </div>;
}
