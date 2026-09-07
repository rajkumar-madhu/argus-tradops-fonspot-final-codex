"use client";

import { useMemo, useState } from "react";
import { Calendar, Download, Filter, Search } from "lucide-react";

const PAGE = 10;

type Filters = { exchange: string; product: string; status: string; side: string; symbol: string; user: string; account: string };
const EMPTY: Filters = { exchange: "", product: "", status: "", side: "", symbol: "", user: "", account: "" };

function options(rows: any[], key: string): string[] {
  return Array.from(new Set(rows.map((r) => String(r[key] || "")).filter(Boolean))).sort();
}

function StatusChip({ value }: { value: string }) {
  return <span className={`order-status ${String(value || "").toLowerCase()}`}>{value}</span>;
}

/**
 * Live Orders panel for the overview page. Rows are fetched once by the server
 * component; filtering and paging happen here so the dashboard adds no ES load.
 * The streaming table with SSE lives on /orders. `time_label` is pre-formatted by the
 * server so SSR and hydration print identical text regardless of browser locale.
 */
export default function OverviewOrders({ rows, today }: { rows: any[]; today: string }) {
  const [draft, setDraft] = useState<Filters>(EMPTY);
  const [applied, setApplied] = useState<Filters>(EMPTY);
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const f = applied;
    const like = (v: unknown, q: string) => !q || String(v || "").toLowerCase().includes(q.toLowerCase());
    return rows.filter(
      (r) =>
        (!f.exchange || r.exchange === f.exchange) &&
        (!f.product || r.product === f.product) &&
        (!f.status || r.status === f.status) &&
        (!f.side || r.side === f.side) &&
        like(r.symbol, f.symbol) &&
        like(r.user, f.user) &&
        like(r.account, f.account),
    );
  }, [rows, applied]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const current = Math.min(page, pages);
  const slice = filtered.slice((current - 1) * PAGE, current * PAGE);
  const set = (k: keyof Filters) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setDraft({ ...draft, [k]: e.target.value });

  return (
    <section className="panel overview-orders">
      <div className="panel-head">
        <b>Live Orders</b>
        <div className="table-actions">
          <label className="switch"><input type="checkbox" defaultChecked readOnly /><i /> Auto Refresh (2s)</label>
          <button type="button"><Filter size={13} /> Filters</button>
          <button type="button"><Download size={13} /> Export</button>
        </div>
      </div>
      <form
        className="ov-filters"
        onSubmit={(e) => { e.preventDefault(); setApplied(draft); setPage(1); }}
        onReset={() => { setDraft(EMPTY); setApplied(EMPTY); setPage(1); }}
      >
        <label>Exchange<select value={draft.exchange} onChange={set("exchange")}><option value="">All</option>{options(rows, "exchange").map((o) => <option key={o}>{o}</option>)}</select></label>
        <label>Product<select value={draft.product} onChange={set("product")}><option value="">All</option>{options(rows, "product").map((o) => <option key={o}>{o}</option>)}</select></label>
        <label>Symbol<input value={draft.symbol} onChange={set("symbol")} placeholder="Search symbol…" /></label>
        <label>User<input value={draft.user} onChange={set("user")} placeholder="Search user…" /></label>
        <label>Account<input value={draft.account} onChange={set("account")} placeholder="Search account…" /></label>
        <label>Status<select value={draft.status} onChange={set("status")}><option value="">All</option>{options(rows, "status").map((o) => <option key={o}>{o}</option>)}</select></label>
        <label>Side<select value={draft.side} onChange={set("side")}><option value="">All</option>{options(rows, "side").map((o) => <option key={o}>{o}</option>)}</select></label>
        <span className="ov-date"><Calendar size={13} /> {today} 00:00 → {today} 23:59</span>
        <button className="primary-btn" type="submit"><Search size={13} /> Search</button>
        <button type="reset">Reset</button>
      </form>
      <div className="table-scroll">
        <table className="orders-table">
          <thead>
            <tr>
              <th>#</th><th>Time</th><th>Order No</th><th>User</th><th>Account</th><th>Exch</th><th>Symbol</th><th>Product</th><th>Type</th><th>Side</th><th>Qty</th><th>Price</th><th>Trig Price</th><th>Filled Qty</th><th>Status</th><th>Latency</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {slice.length === 0 && (
              <tr><td colSpan={17} className="ov-empty">No orders match the current filters.</td></tr>
            )}
            {slice.map((r: any, i: number) => (
              <tr key={`${r.order_id}-${i}`}>
                <td>{(current - 1) * PAGE + i + 1}</td>
                <td>{r.time_label}</td>
                <td className={r.status === "REJECTED" ? "text-red" : "text-blue"}>{r.order_id}</td>
                <td>{r.user}</td>
                <td>{r.account}</td>
                <td className={r.exchange === "NFO" ? "text-red" : "text-blue"}>{r.exchange}</td>
                <td>{r.symbol}</td>
                <td>{r.product}</td>
                <td>{r.type}</td>
                <td className={r.side === "BUY" ? "text-green" : "text-red"}>{r.side}</td>
                <td>{r.qty}</td>
                <td>{r.price == null ? "—" : Number(r.price).toFixed(2)}</td>
                <td>{r.trigger_price == null ? "0.00" : Number(r.trigger_price).toFixed(2)}</td>
                <td>{r.filled_qty ?? 0}</td>
                <td><StatusChip value={r.status} /></td>
                <td>{r.latency_ms == null ? "—" : `${r.latency_ms} ms`}</td>
                <td><a href={`/orders?order=${encodeURIComponent(r.order_id)}`}>View</a> <span className="dots">···</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="table-foot">
        <span>
          Showing {filtered.length === 0 ? 0 : (current - 1) * PAGE + 1} to {Math.min(current * PAGE, filtered.length)} of {filtered.length} live orders
        </span>
        <div className="pager">
          <button type="button" disabled={current === 1} onClick={() => setPage(current - 1)}>‹</button>
          {Array.from({ length: Math.min(pages, 5) }).map((_, i) => (
            <button type="button" key={i} className={current === i + 1 ? "selected" : ""} onClick={() => setPage(i + 1)}>{i + 1}</button>
          ))}
          {pages > 5 && <button type="button" disabled>…</button>}
          <button type="button" disabled={current === pages} onClick={() => setPage(current + 1)}>›</button>
        </div>
      </div>
    </section>
  );
}
