"use client";
import { useCallback, useEffect, useState } from "react";
import { time24 } from "@/lib/format";
import { apiUrl } from "@/lib/runtime";
import { authHeaders } from "@/lib/session";
import { openAuthenticatedEventSource } from "@/lib/stream";
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

export default function LiveOrders({ initial }: { initial: any }) {
  const [data, setData] = useState<any>(initial || {});
  const [connected, setConnected] = useState(false);
  const [selected, setSelected] = useState<any>((initial?.items || [])[0] || {});
  const [events, setEvents] = useState<any[]>([]);

  useEffect(() => {
    const es = openAuthenticatedEventSource("orders", { interval: 2 });

    es.addEventListener("orders", (e: MessageEvent) => {
      setConnected(true);
      try {
        const order = JSON.parse(e.data);
        if (!order?.order_id) return;
        setData((prev: any) => mergeOrder(prev, order));
      } catch {
        /* malformed frame — keep the last good state */
      }
    });
    es.addEventListener("error", () => setConnected(false));
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    return () => es.close();
  }, []);

  const rows = data.items || [];
  useEffect(() => { if (!selected?.order_id && rows[0]) setSelected(rows[0]) }, [rows, selected]);

  const loadLifecycle = useCallback((orderId: string) => {
    fetch(`${apiUrl()}/api/orders/${encodeURIComponent(orderId)}/lifecycle`, {
      cache: "no-store",
      credentials: "include",
      headers: authHeaders(),
    })
      .then((r) => (r.ok ? r.json() : { events: [] }))
      .then((d) => setEvents(d.events || []))
      .catch(() => setEvents([]));
  }, []);

  useEffect(() => {
    if (!selected?.order_id) return;
    loadLifecycle(selected.order_id);
  }, [selected?.order_id, data.streamed_at, loadLifecycle]);

  return <>
    <section className="dashboard-head"><div><h1>Live Orders</h1><p>Real-time Noren order state from <b>{data.index || "Noren ELK"}</b></p></div><span className={`pill ${connected ? "ok" : "warn"}`}>{connected ? "● LIVE SSE" : "○ reconnecting"} · {data.count || 0} orders</span></section>
    <section className="orders-layout"><div className="panel orders-main"><div className="panel-head"><b>Live Order Feed ({data.returned ?? rows.length})</b><span>{data.streamed_at ? time24(data.streamed_at) : "initial snapshot"}</span></div><div className="table-scroll"><table className="orders-table"><thead><tr><th>Time</th><th>Order</th><th>User</th><th>Broker</th><th>Exch</th><th>Symbol</th><th>Side</th><th>Qty</th><th>Price</th><th>Status</th><th>Latency</th></tr></thead><tbody>{rows.map((r: any, i: number) => <tr onClick={() => setSelected(r)} style={{ cursor: "pointer" }} key={`${r.order_id}-${i}`}><td>{time24(r.time)}</td><td className="text-blue">{r.order_id}</td><td>{r.user}</td><td>{r.broker}</td><td>{r.exchange}</td><td><b>{r.symbol}</b></td><td className={r.side === "BUY" ? "text-green" : "text-red"}>{r.side}</td><td>{r.qty}</td><td>{r.price ?? "—"}</td><td><Status value={r.status} /></td><td>{r.latency_ms == null ? "—" : `${r.latency_ms} ms`}</td></tr>)}</tbody></table></div></div>
      <aside className="panel order-detail"><div className="panel-head"><b>Selected Order</b>{selected.status && <Status value={selected.status} />}</div><dl>{[["Order", selected.order_id], ["Eref", selected.eref], ["Exchange Order", selected.exchange_order_id || "—"], ["Exchange", selected.exchange], ["Symbol", selected.symbol], ["Broker", selected.broker], ["Product", selected.product], ["Type", selected.type], ["Side", selected.side], ["Qty", selected.qty], ["Filled", selected.filled_qty], ["Price", selected.price ?? "—"], ["Status Code", selected.status_code]].map(([k, v]) => <div key={String(k)}><dt>{k}</dt><dd>{String(v ?? "—")}</dd></div>)}</dl>{selected.reason && <div className="rejection-box"><b>{selected.code || "Reject"} · {selected.rejection_category}</b><span>{selected.reason}</span></div>}</aside></section>
    <section className="panel"><div className="panel-head"><b>Live Lifecycle — {selected.order_id || "—"}</b><span>{events.length} evidence events</span></div><div className="table-scroll"><table className="orders-table"><thead><tr><th>Time</th><th>Status</th><th>Code</th><th>Report</th><th>Exchange Order</th><th>Filled</th><th>Evidence</th></tr></thead><tbody>{events.map((e: any, i: number) => <tr key={i}><td>{time24(e.time)}</td><td><Status value={e.status} /></td><td>{e.status_code}</td><td>{e.report_type}</td><td>{e.exchange_order_id || "—"}</td><td>{e.filled_qty || 0}</td><td>{e.reason || "—"}</td></tr>)}</tbody></table></div></section>
  </>
}
