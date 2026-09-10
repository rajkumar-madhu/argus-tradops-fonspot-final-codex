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
  const latestData = useRef<any>(initial || {});
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
  // Journal stays FILE-BASED; elasticsearch uses this as a snapshot backstop beside SSE.
  useEffect(() => {
    if (!autoRefresh || paused) return;
    const path = live
      ? `/api/orders?size=${MAX_ROWS}&lookback=${encodeURIComponent(lookback)}`
      : `/api/journal/orders?size=${MAX_ROWS}`;
    let cancelled = false;
    async function tick() {
      try {
        const res = await fetch(`${apiUrl()}${path}`, {
          cache: "no-store",
          credentials: "include",
          headers: authHeaders(),
        });
        if (!res.ok || cancelled || pausedRef.current) return;
        const body = await res.json();
        if (!body || body._error || !Array.isArray(body.items)) return;
        latestData.current = body;
        setData(body);
        if (live) setConnected(true);
      } catch {
        if (live) setConnected(false);
      }
    }
    tick();
    const id = window.setInterval(tick, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [autoRefresh, paused, live, lookback]);

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
            { key: "latency_ms", label: "Latency" },
            {
              key: "details",
              label: "Actions",
              render: (r) => (
                <span className="mission-row-actions">
                  <Link href={`/orders?order=${encodeURIComponent(r.order_id)}`}>View</Link>
                  <Link href={`/rca?order_id=${encodeURIComponent(r.order_id)}`}>RCA</Link>
                </span>
              ),
            },
          ]}
        />
      )}
      <p className="mission-table-footnote">
        Read-only · View / RCA only · TradeOps never places, cancels, or edits orders.
      </p>
    </section>
  );
}
