import RefreshButton from "@/components/RefreshButton";
import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, LineChart, PieChart, RefreshCw, TrendingUp, Wallet } from "lucide-react";
import Shell from "@/components/Shell";
import { Donut, HBarList, VBarChart } from "@/components/Charts";
import { DataTable, EmptyState, KpiCard } from "@/components/UI";
import { mtmDistribution } from "@/lib/chart-data";
import { apiError, getJSON } from "@/lib/api";
import { dateShort, fmt, money } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ exchange?: string; product?: string }> }) {
  const d: any = await getJSON("/api/holdings");
  const err = apiError(d);
  const params = await searchParams;
  const sourceRows = d.items || [];
  const exchanges: string[] = Array.from(new Set<string>(sourceRows.map((r: any) => String(r.exchange || "").trim()).filter(Boolean))).sort();
  const products: string[] = Array.from(new Set<string>(sourceRows.map((r: any) => String(r.product || "").trim()).filter(Boolean))).sort();
  const rows = sourceRows.filter((r: any) => (!params.exchange || params.exchange === "all" || String(r.exchange) === params.exchange) && (!params.product || params.product === "all" || String(r.product) === params.product));
  const portfolioValue = rows.reduce((s: number, r: any) => s + Number(r.value || 0), 0);
  const investment = rows.reduce((s: number, r: any) => s + Number(r.avg_price || 0) * Number(r.qty || 0), 0);
  const unrealized = portfolioValue - investment;
  const gainers = rows.filter((r: any) => Number(r.pnl_pct) >= 0);
  const losers = rows.filter((r: any) => Number(r.pnl_pct) < 0);
  const mtm = mtmDistribution(rows);
  const exchangeValueMap: Record<string, number> = rows.reduce(
    (acc: Record<string, number>, row: any) => {
        const exchange = String(row.exchange || "Unknown");
        acc[exchange] = (acc[exchange] || 0) + Number(row.value || 0);
        return acc;
      },
    {},
  );
  const exchangeValues = Object.entries(exchangeValueMap).sort((a, b) => b[1] - a[1]);
  const allocationTotal = Math.max(1, exchangeValues.reduce((sum, [, value]) => sum + value, 0));
  const exchangeSlices = exchangeValues.map(([label, value], index) => ({
    label,
    value,
    cls: ["seg-blue", "seg-green", "seg-amber", "seg-purple"][index % 4],
    pct: `${((value / allocationTotal) * 100).toFixed(1)}%`,
  }));

  return (
    <Shell>
      <section className="dashboard-head overview-head">
        <div>
          <h1>Holdings</h1>
          <p>Delivery holdings, average cost, portfolio valuation and sector exposure</p>
        </div>
        <div className="time-controls"><RefreshButton/>
          <span className="source-tag">{rows.length}{rows.length !== sourceRows.length ? ` of ${sourceRows.length}` : ""} holdings · {d.source || "—"}</span>
        </div>
      </section>

      {err ? (
        <EmptyState title="Unable to load holdings" body={err} />
      ) : rows.length === 0 ? (
        <EmptyState
          title="Holdings snapshot unavailable"
          body={d.note || "No back-office holdings integration is configured. Journal order events do not establish authoritative inventory, cost basis or P&L."}
        />
      ) : (
        <>
          <form className="holdings-filter-rail panel" method="get" aria-label="Holdings filters">
            <div className="filter-tabs" role="list" aria-label="Product filter">
              <a className={!params.product || params.product === "all" ? "active" : ""} href={`/holdings?exchange=${encodeURIComponent(params.exchange || "all")}&product=all`}>All products</a>
              {products.map((product) => <a key={product} className={params.product === product ? "active" : ""} href={`/holdings?exchange=${encodeURIComponent(params.exchange || "all")}&product=${encodeURIComponent(product)}`}>{product}</a>)}
            </div>
            <label>Exchange<select name="exchange" defaultValue={params.exchange || "all"}><option value="all">All exchanges</option>{exchanges.map((exchange) => <option key={exchange} value={exchange}>{exchange}</option>)}</select></label>
            <label>Product<select name="product" defaultValue={params.product || "all"}><option value="all">All products</option>{products.map((product) => <option key={product} value={product}>{product}</option>)}</select></label>
            <button className="btn" type="submit">Apply</button>
            {(params.exchange || params.product) && <a className="link-btn" href="/holdings">Clear filters</a>}
          </form>
          <section className="kpi-grid six">
            <KpiCard label="Total Investment" value={money(investment)} delta="Cost basis" tone="blue" icon={<Wallet size={18} />} />
            <KpiCard label="Current Value" value={money(portfolioValue)} delta={`${investment ? ((unrealized / investment) * 100).toFixed(1) : "0"}%`} deltaTone={unrealized >= 0 ? "up" : "down"} tone="green" icon={<TrendingUp size={18} />} />
            <KpiCard label="Unrealized P&L" value={money(unrealized)} delta="Mark-to-market" deltaTone={unrealized >= 0 ? "up" : "down"} tone="amber" icon={<LineChart size={18} />} />
            <KpiCard label="Total Holdings" value={fmt(rows.length)} delta="Delivery scrips" tone="purple" icon={<PieChart size={18} />} />
            <KpiCard label="Gainers" value={fmt(gainers.length)} delta="Positive PnL %" deltaTone="up" tone="green" icon={<ArrowUpRight size={18} />} />
            <KpiCard label="Losers" value={fmt(losers.length)} delta="Negative PnL %" deltaTone="down" tone="red" icon={<ArrowDownRight size={18} />} />
          </section>

          <section className="viz-row-3">
            <div className="panel">
              <div className="panel-head">
                <b>Portfolio Value Trend</b>
              </div>
              <EmptyState title="History unavailable" body="The current source supplies a point-in-time holdings snapshot, not a historical portfolio series." />
            </div>
            <div className="panel">
              <div className="panel-head"><b>Allocation by Exchange</b></div>
              <Donut centerLabel="Current Value" centerValue={money(portfolioValue)} slices={exchangeSlices} />
            </div>
            <div className="panel">
              <div className="panel-head"><b>Exchange Values</b></div>
              <HBarList
                rows={exchangeValues.map(([label, value], index) => ({
                  label,
                  value: money(value),
                  pct: (value / allocationTotal) * 100,
                  cls: ["bar-blue", "bar-purple", "bar-teal", "bar-amber"][index % 4],
                }))}
              />
            </div>
          </section>

          <section className="overview-row-4">
            <div className="panel">
              <div className="panel-head"><b>MTM Distribution</b></div>
              <VBarChart bars={mtm} showValues />
            </div>
            <div className="panel span-3">
              <div className="panel-head"><b>Holdings Register ({rows.length})</b><Link href="/positions">Positions ›</Link></div>
              <DataTable
                className="compact"
                rows={rows}
                rowKey={(r) => `${r.symbol}-${r.exchange}`}
                columns={[
                  { key: "date", label: "Date", render: (r) => dateShort(r.date || r.as_of || r.event_time || r.time) },
                  { key: "symbol", label: "Symbol", render: (r) => <b>{r.symbol}</b> },
                  { key: "exchange", label: "Exch" },
                  { key: "qty", label: "Qty" },
                  { key: "avg_price", label: "Avg Cost", render: (r) => money(r.avg_price) },
                  { key: "ltp", label: "LTP", render: (r) => money(r.ltp) },
                  { key: "value", label: "Market Value", render: (r) => money(r.value) },
                  { key: "pnl_pct", label: "PnL %", render: (r) => <span className={Number(r.pnl_pct) >= 0 ? "text-green" : "text-red"}>{r.pnl_pct}%</span> },
                  { key: "broker", label: "Broker" },
                ]}
              />
            </div>
          </section>
        </>
      )}
    </Shell>
  );
}
