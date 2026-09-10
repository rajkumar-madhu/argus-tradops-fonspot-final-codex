"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import {
  cellText, columnHeader, displayValue, isUntranslated, istStamp, istTime, lifecycleSteps,
  statusTone, summaryColumns, timeHint,
} from "@/lib/journal-explore";
import { apiUrl } from "@/lib/runtime";
import { authHeaders } from "@/lib/session";

type Row = { source_line: number; fields: Record<string, unknown> };

/**
 * The log stream. Rows collapse to a summary line and expand in place to the
 * full masked record — 152 columns for an order event, which is why expansion
 * happens client-side from data already on the page rather than a second fetch.
 * Order events additionally load the order's lifecycle when opened.
 */
export default function JournalStream({ rows, columns, msgType }: {
  rows: Row[];
  columns: string[];
  msgType: string;
}) {
  const [open, setOpen] = useState<number | null>(null);
  const summary = summaryColumns(msgType, columns);

  return (
    <div
      className="jx-stream"
      role="table"
      aria-label="Journal records"
      style={{ ["--jx-cols" as string]: String(summary.length) }}
    >
      <div className="jx-row jx-head" role="row">
        <span className="jx-caret" aria-hidden="true" />
        {summary.map((column) => (
          <span key={column} role="columnheader">{columnHeader(column)}</span>
        ))}
      </div>
      {rows.map((row) => {
        const line = row.source_line;
        const expanded = open === line;
        const tone = msgType === "ordupd" ? statusTone(row.fields.OrdStatus) : "";
        return (
          <div key={line} className={`jx-entry${expanded ? " open" : ""}`}>
            <button
              type="button"
              className={`jx-row jx-body${tone ? ` tone-${tone}` : ""}`}
              aria-expanded={expanded}
              onClick={() => setOpen(expanded ? null : line)}
            >
              <span className="jx-caret"><ChevronRight size={13} /></span>
              {summary.map((column) => (
                <span
                  key={column}
                  className={column === "Event Time (UTC)" ? "jx-mono" : undefined}
                  title={column === "Event Time (UTC)" ? `${cellText(row.fields[column])} (UTC)` : undefined}
                >
                  {renderCell(column, row.fields[column])}
                </span>
              ))}
            </button>
            {expanded && (
              <div className="jx-detail">
                {msgType === "ordupd" && <OrderOverview fields={row.fields} />}
                <div className="jx-detail-head">
                  Source line {line} · {columns.length} fields · masked at projection · times shown with their IST reading
                </div>
                <dl className="jx-fields">
                  {columns.map((column) => {
                    const value = row.fields[column];
                    if (value === null || value === undefined || value === "") return null;
                    const hint = timeHint(column, value);
                    return (
                      <div key={column} className="jx-field">
                        <dt>{column}</dt>
                        <dd>
                          {cellText(value)}
                          {hint && <small className="jx-hint">{hint}</small>}
                        </dd>
                      </div>
                    );
                  })}
                </dl>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

type Lifecycle = { state: "loading" } | { state: "error"; message: string } | { state: "ready"; events: any[] };

/**
 * Plain-language summary of one order event plus its journal lifecycle. The
 * reason comes from this row's masked projection; the lifecycle payload is used
 * for status, quantities and normalised prices only (its reasons are unmasked).
 */
function OrderOverview({ fields }: { fields: Record<string, unknown> }) {
  const orderId = String(fields.NorenOrdNum ?? "");
  const [lifecycle, setLifecycle] = useState<Lifecycle>({ state: "loading" });
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (!orderId) {
      setLifecycle({ state: "error", message: "No order number on this event." });
      return;
    }
    const controller = new AbortController();
    fetch(`${apiUrl()}/api/journal/orders/${encodeURIComponent(orderId)}/lifecycle`, {
      cache: "no-store",
      credentials: "include",
      headers: authHeaders(),
      signal: controller.signal,
    })
      .then(async (res) => {
        if (res.status === 401 || res.status === 403) throw new Error("Your role does not include order lifecycles.");
        if (!res.ok) throw new Error(`Lifecycle unavailable (API ${res.status}).`);
        const body = await res.json();
        setLifecycle({ state: "ready", events: Array.isArray(body?.events) ? body.events : [] });
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setLifecycle({ state: "error", message: err instanceof Error ? err.message : "Lifecycle unavailable." });
      });
    return () => controller.abort();
  }, [orderId]);

  const steps = lifecycle.state === "ready" ? lifecycleSteps(lifecycle.events) : [];
  // Partial fills produce dozens of Open (48) events; keep the ends in view.
  const HEAD = 4;
  const TAIL = 3;
  const collapsed = !showAll && steps.length > HEAD + TAIL + 1;
  const shownSteps = collapsed ? [...steps.slice(0, HEAD), null, ...steps.slice(-TAIL)] : steps;
  const last = steps[steps.length - 1];
  const code = cellText(fields.OrdStatus);
  const side = String(fields.TransType ?? "") === "S" ? "SELL" : String(fields.TransType ?? "") === "B" ? "BUY" : cellText(fields.TransType);
  const qty = cellText(fields.QtyToFill);
  const filled = fields.TotalFillQty ?? fields.FillQty;
  const reason = String(fields.RejReason ?? "").trim();
  const price = last?.price ?? null;

  return (
    <section className="jx-order" aria-label={`Order ${orderId} summary`}>
      <div className="jx-order-head">
        <div>
          <span className={`jx-order-status tone-${statusTone(fields.OrdStatus) || "neutral"}`} title="Status on this journal event">
            This event: {code === "—" ? "—" : displayValue("OrdStatus", code)}
          </span>
          <b>
            {side} {qty} × {cellText(fields.TradingSymbol)}
          </b>
          <span className="jx-order-meta">
            {cellText(fields.ExchSeg)} · {cellText(fields.Product)} · {cellText(fields.PriceType)} · {cellText(fields.OrdDuration)}
          </span>
        </div>
        <span className="jx-order-links">
          {orderId && <Link href={`/orders?order=${encodeURIComponent(orderId)}`}>Lifecycle view ›</Link>}
          {orderId && <Link href={`/rca?order_id=${encodeURIComponent(orderId)}`}>RCA ›</Link>}
        </span>
      </div>

      <dl className="jx-order-facts">
        <div><dt>Order no.</dt><dd className="jx-mono">{orderId || "—"}</dd></div>
        <div><dt>Exchange order no.</dt><dd className="jx-mono">{cellText(fields.ExchOrdNum)}</dd></div>
        <div><dt>Event time</dt><dd>{istStamp(fields["Event Time (UTC)"])}</dd></div>
        <div>
          <dt>Price</dt>
          <dd>
            {price !== null ? `₹${Number(price).toLocaleString("en-IN", { maximumFractionDigits: 2 })}` : `${cellText(fields.PriceToFill)} (raw)`}
          </dd>
        </div>
        <div><dt>Filled</dt><dd>{cellText(filled ?? 0)} / {qty}</dd></div>
        <div><dt>Rejected by</dt><dd>{cellText(fields.RejBy)}</dd></div>
        <div>
          <dt>Latest status in journal</dt>
          <dd>{last ? `${last.status} · ${last.filled ?? 0}/${last.qty ?? "—"} filled` : lifecycle.state === "loading" ? "Loading…" : "—"}</dd>
        </div>
      </dl>

      {reason && (
        <p className="jx-order-reason">
          <span>Reason</span>
          {reason}
          <small>Client codes, balances and holdings are masked.</small>
        </p>
      )}

      <div className="jx-lifecycle">
        <b>Lifecycle</b>
        {lifecycle.state === "loading" && <p className="jx-lifecycle-note">Loading journal events for this order…</p>}
        {lifecycle.state === "error" && <p className="jx-lifecycle-note">{lifecycle.message}</p>}
        {lifecycle.state === "ready" && !steps.length && <p className="jx-lifecycle-note">No other journal events for this order.</p>}
        {steps.length > 0 && (
          <ol>
            {shownSteps.map((s, i) => s === null ? (
              <li key="more" className="jx-lifecycle-more">
                <i aria-hidden="true" />
                <button type="button" onClick={() => setShowAll(true)}>
                  Show all {steps.length} events ({steps.length - HEAD - TAIL} more)
                </button>
              </li>
            ) : (
              <li key={`${s.time}-${i}`} className={s.tone ? `tone-${s.tone}` : undefined}>
                <i aria-hidden="true" />
                <span className="jx-mono">{s.time}</span>
                <b>{s.status}</b>
                <span>
                  {s.filled ?? 0}/{s.qty ?? "—"} filled
                  {s.price !== null ? ` · ₹${Number(s.price).toLocaleString("en-IN", { maximumFractionDigits: 2 })}` : ""}
                  {s.fillPrice !== null ? ` · fill ₹${Number(s.fillPrice).toLocaleString("en-IN", { maximumFractionDigits: 2 })}` : ""}
                </span>
                <small>{s.gap}</small>
              </li>
            ))}
          </ol>
        )}
        {steps.length > 0 && <p className="jx-lifecycle-note">{steps.length} journal event{steps.length === 1 ? "" : "s"} · times IST · gaps between consecutive journal events, not network latency.</p>}
      </div>
    </section>
  );
}

function renderCell(column: string, value: unknown) {
  const text = cellText(value);
  // The stream spans a single session, so the date is redundant on every row —
  // the scope line and histogram carry it. Time-only (IST) keeps it readable.
  if (column === "Event Time (UTC)") return istTime(value);
  if (isUntranslated(column, text)) {
    return (
      <span className="jx-code untranslated" title={`${column} ${text} has no documented meaning`}>
        {text}<sup>?</sup>
      </span>
    );
  }
  const shown = displayValue(column, text);
  return shown === text ? text : <span className="jx-code">{shown}</span>;
}
