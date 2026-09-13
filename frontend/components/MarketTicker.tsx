"use client";

import { useEffect, useState } from "react";
import { hasLiveMarketFeed, isJournalSource } from "@/lib/data-source";
import { apiUrl } from "@/lib/runtime";
import { authHeaders, decodeSession, getToken, isExpired } from '@/lib/session';
import { canSee } from '@/lib/auth';

type IndexTick = {
  name: string;
  value: string;
  delta: string;
  pct: string;
  up: boolean;
};

type MarketSymbol = {
  symbol: string;
  ltp?: number;
  change_pct?: number;
};

type JournalStrip = {
  orders: number;
  events: number;
};

function fmtPrice(n: number): string {
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtInt(n: number): string {
  return n.toLocaleString("en-IN");
}

function mapSymbols(symbols: MarketSymbol[], limit: number): IndexTick[] {
  return symbols.slice(0, limit).map((s) => {
    const ltp = Number(s.ltp ?? 0);
    const change = Number(s.change_pct ?? 0);
    const up = change >= 0;
    const delta = `${up ? "+" : ""}${change.toFixed(2)}%`;
    return {
      name: String(s.symbol).replace(/-EQ$/, ""),
      value: fmtPrice(ltp),
      delta,
      pct: delta,
      up,
    };
  });
}

/**
 * Top bar feed: live market quotes when available, otherwise journal snapshot status.
 */
export default function MarketTicker({ variant = "bar" }: { variant?: "bar" | "strip" }) {
  const [items, setItems] = useState<IndexTick[] | null>(null);
  const [journal, setJournal] = useState<JournalStrip | null>(null);

  useEffect(() => {
    const session = decodeSession(getToken());
    // AuthShell also renders this component. Public pages must not request
    // protected data, and cross-origin APIs need the explicit bearer header.
    if (isExpired(session)) return;
    const headers = authHeaders();
    let cancelled = false;
    (async () => {
      try {
        const res = canSee('/market-data', session!.roles)
          ? await fetch(`${apiUrl()}/api/market-data`, { cache: "no-store", headers, credentials: 'include' })
          : null;
        if (res?.ok) {
          const data = await res.json();
          const symbols: MarketSymbol[] = Array.isArray(data?.symbols) ? data.symbols : [];
          if (!cancelled && hasLiveMarketFeed(data?.source, symbols.length)) {
            setItems(mapSymbols(symbols, variant === "bar" ? 3 : 5));
            return;
          }
        }
      } catch {
        /* fall through to journal strip */
      }

      try {
        // /api/overview carries the source itself. The old /health fallback 404'd behind
        // ingresses that route only /api/* to the backend (UAT does).
        const overviewRes = await fetch(`${apiUrl()}/api/overview`, { cache: "no-store", headers, credentials: 'include' });
        if (cancelled || !overviewRes.ok) return;
        const overview = await overviewRes.json();
        const source = String(overview?.source || "");
        if (!isJournalSource(source)) return;
        setJournal({
          orders: Number(overview?.orders ?? 0),
          events: Number(overview?.journal_events ?? overview?.records ?? 0),
        });
      } catch {
        /* no strip */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [variant]);

  if (items?.length) {
    return (
      <div className={`ticker-${variant}`} aria-label="Live market quotes">
        <span className="ticker-tag">MARKETS</span>
        {items.map((i) => (
          <span className="tick" key={i.name}>
            <span className={`tick-dot ${i.up ? "up" : "down"}`} />
            <b>{i.name}</b>
            <strong>{i.value}</strong>
            <em className={i.up ? "up" : "down"}>
              {i.up ? "▲" : "▼"} {i.delta}
            </em>
          </span>
        ))}
      </div>
    );
  }

  if (!journal) return null;

  const ticks =
    variant === "bar"
      ? [
          { label: "Orders", value: fmtInt(journal.orders) },
          { label: "Events", value: fmtInt(journal.events) },
        ]
      : [
          { label: "Orders", value: fmtInt(journal.orders) },
          { label: "Journal events", value: fmtInt(journal.events) },
          { label: "Source", value: "Uploaded file" },
        ];

  return (
    <div className={`ticker-${variant} journal-strip`} aria-label="Journal snapshot status">
      <span className="ticker-tag journal">FILE-BASED</span>
      {ticks.map((t) => (
        <span className="tick" key={t.label}>
          <span className="tick-dot up" />
          <b>{t.label}</b>
          <strong>{t.value}</strong>
        </span>
      ))}
    </div>
  );
}
