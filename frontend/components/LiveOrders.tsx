"use client";
import { useEffect, useRef, useState } from "react";
import { time24 } from "@/lib/format";
import { apiUrl } from "@/lib/runtime";
import { authHeaders } from "@/lib/session";
import { openAuthenticatedEventSource } from "@/lib/stream";
import { DataTable, KPI } from "@/components/UI";
function Status({ value }: { value: string }) { return <span className={`order-status ${String(value || "").toLowerCase()}`}>{value}</span> }

const MAX_ROWS = 500;

/**
 * The `orders` stream carries ONE normalised order per event (the collector
 * publishes per order id), not a snapshot envelope. Replacing state with the
 * event payload would leave `data.items` undefined and blank the table on the
 * first tick, so each event is merged into the existing list by order id.
 */
function mergeOrder(prev: any, incoming: any) {
  const items = [...(prev?.items || [])];
  const idx = items.findIndex((x: any) => x.order_id === incoming.order_id);
  let count = Number(prev?.count || items.length);
  if (idx >= 0) {
    items[idx] = { ...items[idx], ...incoming };
  } else {
    items.unshift(incoming);
    count += 1;
  }
  const trimmed = items.slice(0, MAX_ROWS);
  return {
    ...prev,
    items: trimmed,
    count,
    returned: trimmed.length,
    streamed_at: incoming.streamed_at || prev?.streamed_at,
  };
}

export default function LiveOrders({ initial, snapshot = false, requestedOrder }: { initial: any; snapshot?: boolean; requestedOrder?: string }) {
  const [data, setData] = useState<any>(initial || {});
  const [connected, setConnected] = useState(false);
  const latestData = useRef<any>(initial || {});
  const pausedRef = useRef(false);
  useEffect(() => {
    latestData.current = initial || {};
    if (!pausedRef.current) setData(latestData.current);
  }, [initial]);
  const [selectedId, setSelectedId] = useState<string>(requestedOrder || initial?.items?.[0]?.order_id || "");
  const [events, setEvents] = useState<any[]>([]);
  const [evidenceState, setEvidenceState] = useState<'loading'|'ready'|'error'>('loading');
  const [evidenceRetry, setEvidenceRetry] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => { if (requestedOrder) setSelectedId(requestedOrder); }, [requestedOrder]);

  useEffect(() => {
    if (snapshot || initial?.source === "demo") {setConnected(false); return;}
    const es = openAuthenticatedEventSource("orders", { interval: 2 });

    es.addEventListener("orders", (e: MessageEvent) => {
      setConnected(true);
      try {
        const order = JSON.parse(e.data);
        if (!order?.order_id || (requestedOrder && order.order_id !== requestedOrder)) return;
        latestData.current = mergeOrder(latestData.current, order);
        if (!pausedRef.current) setData(latestData.current);
      } catch {
        /* malformed frame — keep the last good state */
      }
    });
    es.addEventListener("error", () => setConnected(false));
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    return () => es.close();
  }, [snapshot, initial?.source, requestedOrder]);

  const rows = data.items || [];
  const selected = rows.find((row: any) => row.order_id === selectedId) || {};
  useEffect(() => {
    if (!selectedId && rows[0]) setSelectedId(rows[0].order_id);
  }, [rows, selectedId]);
  useEffect(() => {
    if (!selectedId) {
      setEvents([]);
      setEvidenceState("ready");
      return;
    }
    const controller = new AbortController();
    setEvents([]);
    setEvidenceState("loading");
    fetch(`${apiUrl()}/api/${snapshot ? "journal/" : ""}orders/${encodeURIComponent(selectedId)}/lifecycle`, {
      cache: "no-store", credentials: "include", headers: authHeaders(), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
    }).then(r => {if (!r.ok) throw new Error("Evidence unavailable"); return r.json();})
      .then(d => { if (!controller.signal.aborted) {setEvents(d.events || []); setEvidenceState("ready");} })
      .catch(() => { if (!controller.signal.aborted) setEvidenceState("error"); });
    return () => controller.abort();
  }, [selectedId, selected.time, selected.status, selected.filled_qty, snapshot, evidenceRetry]);

  return <>
    <section className="kpi-grid four">
      <KPI label="Loaded orders" value={rows.length} sub={snapshot ? "Historical snapshot" : "Current loaded window"}/>
      <KPI label="Executed" value={rows.filter((r:any)=>r.status === 'COMPLETE').length}/>
      <KPI label="Rejected" value={rows.filter((r:any)=>r.status === 'REJECTED').length} tone="down"/>
      <KPI label="Open / Pending" value={rows.filter((r:any)=>['OPEN','PENDING','TRIGGER_PENDING','PARTIAL'].includes(r.status)).length}/>
    </section>
    {!snapshot && initial?.source !== "demo" && <div className="query-window"><button type="button" onClick={() => {
      pausedRef.current = !pausedRef.current;
      setPaused(pausedRef.current);
      if (!pausedRef.current) setData(latestData.current);
    }}>{paused ? "Resume updates" : "Pause updates"}</button></div>}
    <section className="orders-layout"><div className="panel orders-main"><div className="panel-head"><b>Order Feed ({data.returned ?? rows.length})</b><span className="source-tag">{snapshot ? "Historical snapshot · no live stream" : initial?.source === "demo" ? "Demo snapshot · no live stream" : paused ? "Display paused · stream continues" : connected ? "Stream connected" : "Stream disconnected · last snapshot"}</span></div>
      <DataTable selectedId={selectedId} rows={rows} rowKey={r => r.order_id} onRowClick={r => setSelectedId(r.order_id)} columns={[
        {key:'time',label:'Time (IST)',render:r=>time24(r.time)},
        {key:'order_id',label:'Order'}, {key:'user',label:'User'}, {key:'broker',label:'Broker'},
        {key:'exchange',label:'Exchange'}, {key:'symbol',label:'Symbol'}, {key:'side',label:'Side'},
        {key:'qty',label:'Qty'}, {key:'price',label:'Price'},
        {key:'status',label:'Status',render:r=><Status value={r.status}/>},
        {key:'latency_ms',label:'Event interval',render:r=>r.latency_ms == null ? '—' : `${r.latency_ms} ms`},
      ]}/></div>
      <aside className="panel order-detail"><div className="panel-head"><b>Selected Order</b>{selected.status && <Status value={selected.status} />}</div><dl>{[["Order", selected.order_id], ["Eref", selected.eref], ["Exchange Order", selected.exchange_order_id || "—"], ["Exchange", selected.exchange], ["Symbol", selected.symbol], ["Broker", selected.broker], ["Product", selected.product], ["Type", selected.type], ["Side", selected.side], ["Qty", selected.qty], ["Filled", selected.filled_qty], ["Price", selected.price ?? "—"], ["Status Code", selected.status_code]].map(([k, v]) => <div key={String(k)}><dt>{k}</dt><dd>{String(v ?? "—")}</dd></div>)}</dl>{(selected.reason || selected.status === "REJECTED") && <div className="rejection-box"><b>{selected.code || "Reject"} · {selected.rejection_category}</b><span>{selected.reason || (snapshot ? "Free-text reason withheld in local snapshot" : "Reason not supplied")}</span></div>}</aside></section>
    <section className="order-evidence-grid" aria-label="Order investigation">
      <section className="panel"><div className="panel-head"><b>Order Lifecycle</b><span>{events.length} events</span></div>
        {evidenceState === 'loading' && <p className="evidence-note" role="status">Loading order evidence…</p>}
        {evidenceState === 'error' && <div className="empty-state" role="alert"><b>Evidence unavailable</b><p>The source did not return a usable response.</p><button onClick={() => setEvidenceRetry(n=>n+1)}>Retry evidence</button></div>}
        {evidenceState === 'ready' && !events.length && <p className="evidence-note">{selectedId ? "No lifecycle events were returned for this order." : "Select an order to inspect its lifecycle."}</p>}
        <ol className="evidence-timeline">{events.slice(-8).map((event:any,index:number)=><li key={`${event.time}-${index}`}><Status value={event.status}/><time>{time24(event.time)} IST</time><span>Report {event.report_type ?? '—'} · filled {event.filled_qty ?? 0}</span></li>)}</ol>
        {events.length > 8 && <p className="evidence-note">Latest 8 events shown; complete evidence is below.</p>}
      </section>
      <section className="panel"><div className="panel-head"><b>Related Journal Evidence</b><span>{snapshot ? 'Same historical source' : 'Same order lifecycle'}</span></div>
        <div className="table-scroll"><table className="orders-table"><thead><tr><th>Time (IST)</th><th>Report</th><th>Code / category</th></tr></thead><tbody>{events.slice(-8).map((event:any,index:number)=><tr key={index}><td>{time24(event.time)}</td><td>{event.report_type ?? '—'}</td><td>{event.code || event.rejection_category || event.status || '—'}</td></tr>)}</tbody></table></div>
        <p className="evidence-note">{snapshot ? 'Raw free-text messages are withheld to protect sensitive fields.' : 'Additional service logs can be searched separately.'}</p>
        {!snapshot && selectedId && <div className="query-window"><a href={`/logs?q=${encodeURIComponent(selectedId)}`}>Search service logs</a><a href={`/rca?order_id=${encodeURIComponent(selectedId)}`}>Investigate RCA</a></div>}
      </section>
      <section className="panel"><div className="panel-head"><b>Market Context</b><span>{selected.symbol || 'No symbol selected'}</span></div><div className="empty-state"><b>Depth unavailable for this order</b><p>{snapshot ? 'The historical journal does not include contemporaneous bid/ask depth.' : 'Order events do not include a correlated market-depth snapshot.'}</p><a href="/market-data">Open current market data</a></div></section>
    </section>
    <details className="panel evidence-details"><summary>Complete lifecycle evidence · {selectedId || 'No order selected'}</summary><div className="table-scroll"><table className="orders-table"><thead><tr><th>Time (IST)</th><th>Status</th><th>Code</th><th>Report</th><th>Exchange Order</th><th>Filled</th><th>Evidence</th></tr></thead><tbody>{events.map((event:any,index:number)=><tr key={index}><td>{time24(event.time)}</td><td><Status value={event.status}/></td><td>{event.status_code}</td><td>{event.report_type}</td><td>{event.exchange_order_id || '—'}</td><td>{event.filled_qty ?? 0}</td><td>{event.reason || event.rejection_category || '—'}</td></tr>)}</tbody></table></div></details>
  </>
}
