"use client";

import { useMemo, useState } from "react";
import { DataTable, KPI, OrderDetailPanel, PageHead, StatusBadge } from "@/components/UI";
import { money, timeShort } from "@/lib/format";

export default function OrderBookView({ initial }: { initial: any }) {
  const rows = initial?.items || [];
  const [selected, setSelected] = useState<any>(rows[0] || {});

  const totals = useMemo(() => {
    const buy = rows.filter((r: any) => r.side === "BUY").length;
    const sell = rows.filter((r: any) => r.side === "SELL").length;
    const exchanges = new Set(rows.map((r: any) => r.exchange)).size;
    return { buy, sell, exchanges };
  }, [rows]);

  return (
    <>
      <PageHead
        title="Order Book"
        subtitle="Open and pending Noren orders with full correlation context"
        badge={`${initial?.count || rows.length} open · ${initial?.source || "—"}`}
        badgeTone="ok"
      />
      <section className="kpi-grid four">
        <KPI label="Open Orders" value={rows.length} sub="Status 48 / pending" />
        <KPI label="Buy Side" value={totals.buy} sub="Bid interest" tone="up" />
        <KPI label="Sell Side" value={totals.sell} sub="Offer interest" tone="down" />
        <KPI label="Exchanges" value={totals.exchanges} sub="noren-ordupd-intraday" />
      </section>
      <section className="orders-layout">
        <div className="panel orders-main">
          <div className="panel-head">
            <b>Depth by symbol</b>
            <span className="source-tag">{initial?.index || "noren-ordupd-intraday"}</span>
          </div>
          <DataTable
            rows={rows}
            rowKey={(r, i) => `${r.order_id}-${i}`}
            onRowClick={setSelected}
            columns={[
              { key: "time", label: "Time", render: (r) => timeShort(r.time) },
              { key: "order_id", label: "Order", render: (r) => <span className="text-blue">{r.order_id}</span> },
              { key: "exchange", label: "Exch" },
              { key: "symbol", label: "Symbol", render: (r) => <b>{r.symbol}</b> },
              { key: "side", label: "Side", render: (r) => <span className={r.side === "BUY" ? "text-green" : "text-red"}>{r.side}</span> },
              { key: "qty", label: "Qty" },
              { key: "price", label: "Price", render: (r) => money(r.price) },
              { key: "product", label: "Product" },
              { key: "type", label: "Type" },
              { key: "status", label: "Status", render: (r) => <StatusBadge value={r.status} /> },
              { key: "broker", label: "Broker" },
            ]}
          />
        </div>
        <aside className="panel order-detail">
          <div className="panel-head">
            <b>Order detail</b>
            {selected?.status && <StatusBadge value={selected.status} />}
          </div>
          <OrderDetailPanel order={selected} />
        </aside>
      </section>
    </>
  );
}
