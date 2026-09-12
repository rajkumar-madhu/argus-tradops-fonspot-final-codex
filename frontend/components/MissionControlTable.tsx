"use client";

import Link from "next/link";
import type { FormEvent, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, RotateCcw, Search } from "lucide-react";
import { DataTable } from "@/components/UI";
import {
  MISSION_TABS,
  applyMissionFacets,
  facetOptions,
  filterOrdersByTab,
  isLiveSource,
  type MissionFacets,
  type MissionTab,
} from "@/lib/mission-control";
import { apiUrl } from "@/lib/runtime";
import { authHeaders } from "@/lib/session";
import { openAuthenticatedEventSource } from "@/lib/stream";
import { time24 } from "@/lib/format";
import { journalFieldText } from "@/lib/order-journal-fields";

const MAX_ROWS = 200;
const EMPTY_FACETS: MissionFacets = {};

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

function Status({ value }: { value: string }) {
  return <span className={`order-status ${String(value || "").toLowerCase()}`}>{value}</span>;
}

function Side({ value }: { value: string }) {
  const side = String(value || "").toUpperCase();
  return <span className={`order-side ${side === "SELL" ? "sell" : "buy"}`}>{side || "—"}</span>;
}

/**
 * Inline record view for one order: the allow-listed, masked journal projection
 * the API already returned with the row, so expanding needs no second fetch.
 */
function OrderRecord({ order }: { order: any }) {
  const fields: Record<string, unknown> = order.journal_fields || {};
  const shown = Object.entries(fields).filter(([, v]) => v !== null && v !== undefined && v !== "");
  const masked: string[] = Array.isArray(order.masked_fields) ? order.masked_fields : [];
  return (
    <div className="jx-detail mission-record" onClick={(e) => e.stopPropagation()}>
      <div className="jx-detail-head mission-record-head">
        <span>
          Order <b>{order.order_id}</b>
          {order.source_row ? ` · source line ${order.source_row}` : ""} · {shown.length} of {Object.keys(fields).length} fields populated
          {masked.length ? ` · ${masked.length} masked` : ""} · masked at projection
        </span>
        <span className="mission-row-actions">
          <Link href={`/orders?order=${encodeURIComponent(order.order_id)}`}>Lifecycle ›</Link>
          <Link href={`/rca?order_id=${encodeURIComponent(order.order_id)}`}>RCA ›</Link>
        </span>
      </div>
      {shown.length ? (
        <dl className="jx-fields">
          {shown.map(([k, v]) => (
            <div key={k} className="jx-field">
              <dt>{k}</dt>
              <dd>{typeof v === "object" ? JSON.stringify(v) : journalFieldText(k, v, order.price_scale)}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mission-record-empty">This source returned no journal fields for the order; open the lifecycle view for its events.</p>
      )}
    </div>
  );
}

export default function MissionControlTable({
  initial,
  source,
  lookback = "24h",
}: {
  initial: any;
  source: string;
  lookback?: string;
}) {
  const live = isLiveSource(source);
  const [tab, setTab] = useState<MissionTab>("live");
  const [data, setData] = useState<any>(initial || {});
  const [connected, setConnected] = useState(false);
  const [paused, setPaused] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [facets, setFacets] = useState<MissionFacets>(EMPTY_FACETS);
  const [draft, setDraft] = useState<MissionFacets>(EMPTY_FACETS);
  const [openId, setOpenId] = useState<string | undefined>();
  const latestData = useRef<any>(initial || {});
  const isJournal = source === "journal snapshot";
  const pausedRef = useRef(false);

  useEffect(() => {
    latestData.current = initial || {};
    if (!pausedRef.current) setData(latestData.current);
  }, [initial]);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  // Real LIVE path: Redis SSE from collector. Never subscribe on journal/demo.
  useEffect(() => {
    if (!live) {
      setConnected(false);
      return;
    }
    const es = openAuthenticatedEventSource("orders", { interval: 2 });
    es.addEventListener("orders", (e: MessageEvent) => {
      setConnected(true);
      try {
        const order = JSON.parse(e.data);
        if (!order?.order_id) return;
        latestData.current = mergeOrder(latestData.current, order);
        if (!pausedRef.current) setData(latestData.current);
      } catch {
        /* keep last good state */
      }
    });
    es.addEventListener("error", () => setConnected(false));
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    return () => es.close();
  }, [live]);

  // Auto-refresh poll (reference "Auto Refresh 2s"): reloads list API.
  // Journal stays FILE-BASED; elasticsearch uses this as a snapshot backstop
  // beside SSE. The loop is polite: it aborts an in-flight request on unmount,
  // pauses while the tab is hidden, backs off exponentially on failure, and
  // slows to every 10 s while SSE is delivering (the stream is the fast path).
  useEffect(() => {
    if (!autoRefresh || paused) return;
    const path = live
      ? `/api/orders?size=${MAX_ROWS}&lookback=${encodeURIComponent(lookback)}`  // keeps journal_fields: OrderRecord renders them inline
      : `/api/journal/orders?size=${MAX_ROWS}`;
    let cancelled = false;
    let timer: number | undefined;
    let controller: AbortController | null = null;
    let failures = 0;
    const base = 2000;
    const schedule = () => {
      if (cancelled) return;
      const idle = live && connected ? 10000 : base;
      const delay = Math.min(60000, idle * 2 ** failures);
      timer = window.setTimeout(tick, delay);
    };
    async function tick() {
      if (cancelled) return;
      if (document.visibilityState === "hidden") { schedule(); return; }
      controller?.abort();
      controller = new AbortController();
      try {
        const res = await fetch(`${apiUrl()}${path}`, {
          cache: "no-store",
          credentials: "include",
          headers: authHeaders(),
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
        });
        if (cancelled || pausedRef.current) return;
        if (!res.ok) { failures += 1; schedule(); return; }
        const body = await res.json();
        if (!body || body._error || !Array.isArray(body.items)) { failures += 1; schedule(); return; }
        failures = 0;
        latestData.current = body;
        setData(body);
        if (live) setConnected(true);
      } catch {
        if (cancelled) return;
        failures += 1;
        if (live) setConnected(false);
      }
      schedule();
    }
    const onVisible = () => { if (document.visibilityState === "visible") { window.clearTimeout(timer); tick(); } };
    document.addEventListener("visibilitychange", onVisible);
    tick();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      controller?.abort();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [autoRefresh, paused, live, lookback, connected]);

  const rows = useMemo(
    () =>
      (data.items || []).map((o: any) => ({
        ...o,
        time_label: o.time_label || time24(o.time),
      })),
    [data],
  );

  const exchanges = useMemo(() => facetOptions(rows, "exchange"), [rows]);
  const products = useMemo(() => facetOptions(rows, "product"), [rows]);
  const statuses = useMemo(() => facetOptions(rows, "status"), [rows]);
  const sides = useMemo(() => facetOptions(rows, "side"), [rows]);

  const visible = useMemo(() => {
    const byTab = filterOrdersByTab(rows, tab);
    return applyMissionFacets(byTab, facets).slice(0, 50);
  }, [rows, tab, facets]);

  function applyFilters(e: FormEvent) {
    e.preventDefault();
    setFacets(draft);
  }

  function resetFilters() {
    setDraft(EMPTY_FACETS);
    setFacets(EMPTY_FACETS);
  }

  return (
    <section className="panel mission-table" aria-labelledby="mission-table-title">
      <div className="panel-head mission-table-head">
        <div>
          <b id="mission-table-title">Live orders</b>
          <p className="sub">
            {live
              ? connected
                ? "LIVE · SSE + 2s refresh · collector order events"
                : "Connecting to order stream…"
              : autoRefresh
                ? "FILE-BASED · 2s refresh of journal snapshot (not a live market feed)"
                : "FILE-BASED · snapshot paused"}
          </p>
        </div>
        <div className="mission-table-actions">
          <label className="mission-auto-refresh">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            Auto Refresh (2s)
          </label>
          <button
            type="button"
            className="secondary sm"
            onClick={() => setPaused((p) => !p)}
            aria-pressed={paused}
          >
            {paused ? <Play size={14} /> : <Pause size={14} />}
            {paused ? "Resume" : "Pause"}
          </button>
          <Link href="/orders">Full Live Orders ›</Link>
        </div>
      </div>

      <div className="mission-tabs" role="tablist" aria-label="Order table mode">
        {MISSION_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={tab === t.id ? "active" : undefined}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            <em>{applyMissionFacets(filterOrdersByTab(rows, t.id), facets).length}</em>
          </button>
        ))}
      </div>

      <form className="mission-filters" onSubmit={applyFilters} aria-label="Order filters">
        <label>
          Exchange
          <select
            value={draft.exchange || ""}
            onChange={(e) => setDraft((d) => ({ ...d, exchange: e.target.value || undefined }))}
          >
            <option value="">All</option>
            {exchanges.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        </label>
        <label>
          Product
          <select
            value={draft.product || ""}
            onChange={(e) => setDraft((d) => ({ ...d, product: e.target.value || undefined }))}
          >
            <option value="">All</option>
            {products.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select
            value={draft.status || ""}
            onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value || undefined }))}
          >
            <option value="">All</option>
            {statuses.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        </label>
        <label>
          Side
          <select
            value={draft.side || ""}
            onChange={(e) => setDraft((d) => ({ ...d, side: e.target.value || undefined }))}
          >
            <option value="">All</option>
            {sides.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        </label>
        <label>
          Symbol
          <input
            value={draft.symbol || ""}
            placeholder="Search symbol"
            onChange={(e) => setDraft((d) => ({ ...d, symbol: e.target.value || undefined }))}
          />
        </label>
        <label>
          User
          <input
            value={draft.user || ""}
            placeholder="User"
            onChange={(e) => setDraft((d) => ({ ...d, user: e.target.value || undefined }))}
          />
        </label>
        <label>
          Account
          <input
            value={draft.account || ""}
            placeholder="Account"
            onChange={(e) => setDraft((d) => ({ ...d, account: e.target.value || undefined }))}
          />
        </label>
        <button type="submit" className="primary sm">
          <Search size={14} /> Search
        </button>
        <button type="button" className="secondary sm" onClick={resetFilters}>
          <RotateCcw size={14} /> Reset
        </button>
      </form>

      {visible.length === 0 ? (
        <p className="mission-table-empty">No orders match this tab and filter set.</p>
      ) : (
        <DataTable
          rows={visible}
          rowKey={(r) => r.order_id}
          selectedId={openId}
          onRowClick={(r) => setOpenId((cur) => (cur === r.order_id ? undefined : r.order_id))}
          renderDetail={(r) => <OrderRecord order={r} />}
          filtersOpen={false}
          columns={[
            { key: "time", label: "Time", render: (r) => r.time_label },
            {
              key: "order_id",
              label: "Order No",
              render: (r) => (
                <Link className="link-btn" href={`/orders?order=${encodeURIComponent(r.order_id)}`}>
                  {r.order_id}
                </Link>
              ),
            },
            { key: "user", label: "User" },
            { key: "account", label: "Account" },
            { key: "exchange", label: "Exch" },
            { key: "symbol", label: "Symbol" },
            { key: "product", label: "Product" },
            { key: "type", label: "Type" },
            { key: "side", label: "Side", render: (r) => <Side value={String(r.side || "")} /> },
            { key: "qty", label: "Qty" },
            { key: "price", label: "Price" },
            { key: "filled_qty", label: "Filled" },
            {
              key: "status",
              label: "Status",
              render: (r) => <Status value={String(r.status || "—")} />,
            },
            {
              key: "latency_ms",
              // From the journal this is the gap between the order's original and
              // current Noren timestamps, not a network or OMS latency.
              label: isJournal ? "Event gap" : "Latency",
              render: (r) => (r.latency_ms == null ? "—" : `${Number(r.latency_ms).toLocaleString("en-IN", { maximumFractionDigits: 1 })} ms`),
            },
            {
              key: "details",
              label: "Actions",
              render: (r) => (
                <span className="mission-row-actions">
                  <Link href={`/orders?order=${encodeURIComponent(r.order_id)}`} onClick={(e) => e.stopPropagation()}>Lifecycle</Link>
                  <Link href={`/rca?order_id=${encodeURIComponent(r.order_id)}`} onClick={(e) => e.stopPropagation()}>RCA</Link>
                </span>
              ),
            },
          ]}
        />
      )}
      <p className="mission-table-footnote">
        Read-only · Click a row for its full masked record · Argus TradeOps never places, cancels, or edits orders.
      </p>
    </section>
  );
}
