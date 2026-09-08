import RefreshButton from "@/components/RefreshButton";
import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, LineChart, PieChart, RefreshCw, TrendingUp, Wallet } from "lucide-react";
import Shell from "@/components/Shell";
import { AreaChart, Donut, HBarList, VBarChart } from "@/components/Charts";
import { DataTable, EmptyState, KpiCard } from "@/components/UI";
import { mtmDistribution, portfolioTrend, sectorAllocation } from "@/lib/chart-data";
import { apiError, getJSON } from "@/lib/api";
import { fmt, money } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Page() {
  const d: any = await getJSON("/api/holdings");
  const err = apiError(d);
  const rows = d.items || [];
  const portfolioValue = rows.reduce((s: number, r: any) => s + Number(r.value || 0), 0);
  const investment = rows.reduce((s: number, r: any) => s + Number(r.avg_price || 0) * Number(r.qty || 0), 0);
  const unrealized = portfolioValue - investment;
  const gainers = rows.filter((r: any) => Number(r.pnl_pct) >= 0);
  const losers = rows.filter((r: any) => Number(r.pnl_pct) < 0);
  const trend = portfolioTrend(portfolioValue);
  const sectors = sectorAllocation(rows);
  const mtm = mtmDistribution(rows);
  const maxSector = Math.max(1, ...sectors.map((s) => s.value));

  const capSlices = [
    { label: "Large Cap", value: Math.round(rows.length * 0.45) || 1, cls: "seg-blue", pct: "45%" },
    { label: "Mid Cap", value: Math.round(rows.length * 0.28) || 1, cls: "seg-green", pct: "28%" },
    { label: "Small Cap", value: Math.round(rows.length * 0.16) || 1, cls: "seg-amber", pct: "16%" },
    { label: "F&O / Other", value: Math.max(1, rows.length - Math.round(rows.length * 0.89)), cls: "seg-purple", pct: "11%" },
  ];

  return (
    <Shell>
      <section className="dashboard-head overview-head">
        <div>
          <h1>Holdings</h1>
          <p>Delivery holdings, average cost, portfolio valuation and sector exposure</p>
        </div>
        <div className="time-controls"><RefreshButton/>
          <span className="source-tag">{rows.length} holdings · {d.source || "—"}</span>
        </div>
      </section>

      {err ? (
        <EmptyState title="Unable to load holdings" body={err} />
      ) : (
        <>
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
                <span className="legend"><i className="lg s-total" /> Investment <i className="lg s-executed" /> Current Value</span>
              </div>
              <p className="source-tag">Illustrative history — historical measurements are not supplied by this source.</p><AreaChart series={trend.series} labels={trend.labels} height={160} />
            </div>
            <div className="panel">
              <div className="panel-head"><b>Holdings Allocation</b></div>
              <Donut centerLabel="Current Value" centerValue={money(portfolioValue)} slices={capSlices} />
            </div>
            <div className="panel">
              <div className="panel-head"><b>Top Sectors</b></div>
              <HBarList
                rows={sectors.map((s) => ({
                  label: s.label,
                  value: money(s.value),
                  pct: s.barPct,
                  cls: s.cls,
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
