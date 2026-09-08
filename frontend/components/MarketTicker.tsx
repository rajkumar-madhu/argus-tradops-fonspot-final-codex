"use client";

import { useEffect, useState } from "react";
import { hasLiveMarketFeed, isJournalSource } from "@/lib/data-source";
import { apiUrl } from "@/lib/runtime";

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
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${apiUrl()}/api/market-data`, { cache: "no-store" });
        if (res.ok) {
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
        const [healthRes, overviewRes] = await Promise.all([
          fetch(`${apiUrl()}/health`, { cache: "no-store" }),
          fetch(`${apiUrl()}/api/overview`, { cache: "no-store" }),
        ]);
        if (cancelled || !healthRes.ok || !overviewRes.ok) return;
        const health = await healthRes.json();
        const overview = await overviewRes.json();
        const source = String(overview?.source || health?.data_source || "");
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
