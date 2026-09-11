import RefreshButton from "@/components/RefreshButton";
import Link from "next/link";
import { Activity, Gauge, Layers, LineChart, PieChart, TrendingUp, Wallet } from "lucide-react";
import Shell from "@/components/Shell";
import { Donut, HBarList, VBarChart } from "@/components/Charts";
import { DataTable, EmptyState, KpiCard } from "@/components/UI";
import { mtmDistribution } from "@/lib/chart-data";
import { apiError, getJSON } from "@/lib/api";
import { fmt } from "@/lib/format";
import { SEGMENTS, allocation, cash, holding, movers, signedCash, signedPct, summary, tone, type Holding } from "@/lib/holdings";

export const dynamic = "force-dynamic";

type Params = { segment?: string; exchange?: string; account?: string; trader?: string };
const SLICE_CLS = ["seg-blue", "seg-green", "seg-amber", "seg-purple"];
const uniq = (rows: Holding[], key: keyof Holding) => Array.from(new Set(rows.map((r) => String(r[key] || "")).filter(Boolean))).sort();

function MoverTable({ rows, empty }: { rows: Holding[]; empty: string }) {
  if (!rows.length) return <EmptyState title="Nothing to rank" body={empty} />;
  return (
    <div className="table-scroll">
      <table className="orders-table stage-table">
        <thead><tr><th>#</th><th>Symbol</th><th>LTP</th><th>P&amp;L %</th><th>Day P&amp;L</th></tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.symbol}-${r.exchange}`}>
              <td>{i + 1}</td><td><b>{r.symbol}</b></td><td className="num">{cash(r.ltp)}</td>
              <td className={`num ${tone(r.pnl_pct)}`}>{signedPct(r.pnl_pct)}</td>
              <td className={`num ${tone(r.day_pnl)}`}>{signedCash(r.day_pnl)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function Page({ searchParams }: { searchParams: Promise<Params> }) {
  const d: any = await getJSON("/api/holdings");
  const err = apiError(d);
  const params = await searchParams;
  const segment = SEGMENTS.find((s) => s === params.segment) ?? "Equity";
  const all: Holding[] = (d.items || []).map(holding);
  const inSegment = all.filter((r) => r.segment === segment);
  const rows = inSegment.filter((r) =>
    (!params.exchange || r.exchange === params.exchange) &&
    (!params.account || r.account === params.account) &&
    (!params.trader || r.trader === params.trader));
  const s = summary(rows);
  const has = rows.length > 0;
  const missing = has ? "Not supplied by source" : "No holdings source";
  const bySegment = allocation(rows, "segment").length > 1 ? allocation(rows, "segment") : allocation(rows, "exchange");
  const sectors = allocation(rows, "sector");
  const { gainers, losers } = movers(rows);
  const tabHref = (seg: string) => `/holdings?${new URLSearchParams({ ...Object.fromEntries(Object.entries(params).filter(([, v]) => v)), segment: seg })}`;
  const noSource = d.note || "No back-office holdings integration is configured. Journal order events do not establish authoritative inventory, cost basis or P&L.";

  return (
    <Shell>
      <section className="dashboard-head overview-head">
        <div>
          <h1>Holdings</h1>
          <p>Holdings, MTM and portfolio view across traders and accounts</p>
        </div>
        <div className="time-controls"><RefreshButton/>
          <span className="source-tag">{rows.length}{rows.length !== all.length ? ` of ${all.length}` : ""} holdings · {d.source || "—"}</span>
        </div>
      </section>

      {err ? <EmptyState title="Unable to load holdings" body={err} /> : (
        <>
          <form className="holdings-filter-rail panel" method="get" aria-label="Holdings filters">
            <input type="hidden" name="segment" value={segment} />
            <div className="filter-tabs" role="list" aria-label="Segment">
              {SEGMENTS.map((seg) => <a key={seg} className={seg === segment ? "active" : ""} href={tabHref(seg)}>{seg}</a>)}
            </div>
            <label>Exchange<select name="exchange" defaultValue={params.exchange || ""}><option value="">All exchanges</option>{uniq(inSegment, "exchange").map((v) => <option key={v}>{v}</option>)}</select></label>
            <label>Client<select name="account" defaultValue={params.account || ""}><option value="">All clients</option>{uniq(inSegment, "account").map((v) => <option key={v}>{v}</option>)}</select></label>
            <label>Trader<select name="trader" defaultValue={params.trader || ""}><option value="">All traders</option>{uniq(inSegment, "trader").map((v) => <option key={v}>{v}</option>)}</select></label>
            <button className="btn" type="submit">Apply</button>
            {(params.exchange || params.account || params.trader) && <a className="link-btn" href={`/holdings?segment=${encodeURIComponent(segment)}`}>Clear filters</a>}
          </form>

          {!has && <div className="notice-strip" role="status"><b>Holdings snapshot unavailable.</b> {noSource}</div>}

          <section className="kpi-grid six">
            <KpiCard label="Total Investment" value={cash(s.investment)} delta={s.investment === null ? missing : "Cost basis"} tone="blue" icon={<Wallet size={18} />} />
            <KpiCard label="Current Value" value={cash(s.value)} delta={s.value === null ? missing : signedPct(s.unrealizedPct)} deltaTone={s.unrealized === null ? "" : s.unrealized >= 0 ? "up" : "down"} tone="green" icon={<TrendingUp size={18} />} />
            <KpiCard label="Realized P&L (Today)" value={signedCash(s.realized)} delta={s.realized === null ? missing : "Booked today"} deltaTone={s.realized === null ? "" : s.realized >= 0 ? "up" : "down"} tone="teal" icon={<Activity size={18} />} />
            <KpiCard label="Unrealized P&L (MTM)" value={signedCash(s.unrealized)} delta={s.unrealized === null ? missing : signedPct(s.unrealizedPct)} deltaTone={s.unrealized === null ? "" : s.unrealized >= 0 ? "up" : "down"} tone="amber" icon={<LineChart size={18} />} />
            <KpiCard label="Total Holdings" value={has ? fmt(s.count) : "—"} delta={has ? "Scrips" : missing} tone="purple" icon={<Layers size={18} />} />
            <KpiCard label="Exposure" value={cash(s.exposure)} delta={s.exposure === null ? missing : "Gross market value"} tone="red" icon={<Gauge size={18} />} />
          </section>

          <section className="viz-row-3">
            <div className="panel">
              <div className="panel-head"><b>Portfolio Value Trend</b><span>Investment vs current value</span></div>
              <EmptyState title="History unavailable" body="The source supplies a point-in-time holdings snapshot, not a historical portfolio series." />
            </div>
            <div className="panel">
              <div className="panel-head"><b>Holdings Allocation</b><span>Current value</span></div>
              {bySegment.length
                ? <Donut centerLabel="Current Value" centerValue={cash(s.value)} slices={bySegment.map((a, i) => ({ label: a.label, value: Math.abs(a.value), cls: SLICE_CLS[i % SLICE_CLS.length], pct: `${a.pct.toFixed(1)}%` }))} />
                : <EmptyState title="No allocation" body={has ? "Holdings carry no current value." : "No holdings to allocate."} />}
            </div>
            <div className="panel">
              <div className="panel-head"><b>Top Sectors</b><span>Share of current value</span></div>
              {sectors.length
                ? <HBarList valueFirst rows={sectors.slice(0, 8).map((a) => ({ label: a.label, value: cash(a.value), pct: a.pct, cls: "bar-teal" }))} />
                : <EmptyState title="Sector mapping unavailable" body="The holdings source carries no sector classification." />}
            </div>
          </section>

          <section className="panel">
            <div className="panel-head"><b>Holdings ({rows.length})</b><Link href="/positions">Positions ›</Link></div>
            {has ? (
              <DataTable
                className="compact"
                rows={rows.map((r, i) => ({ ...r, rank: i + 1 }))}
                rowKey={(r) => `${r.symbol}-${r.exchange}-${r.account}`}
                columns={[
                  { key: "rank", label: "#" },
                  { key: "symbol", label: "Symbol", render: (r) => <b>{r.symbol}</b> },
                  { key: "exchange", label: "Exchange" },
                  { key: "product", label: "Product", render: (r) => r.product || "—" },
                  { key: "qty", label: "Qty", render: (r) => (r.qty === null ? "—" : fmt(r.qty)) },
                  { key: "avg_price", label: "Avg. Price", render: (r) => cash(r.avg_price) },
                  { key: "ltp", label: "LTP", render: (r) => cash(r.ltp) },
                  { key: "value", label: "Current Value", render: (r) => cash(r.value) },
                  { key: "investment", label: "Investment", render: (r) => cash(r.investment) },
                  { key: "unrealized", label: "Unrealized P&L", render: (r) => <span className={tone(r.unrealized)}>{signedCash(r.unrealized)}</span> },
                  { key: "pnl_pct", label: "P&L %", render: (r) => <span className={tone(r.pnl_pct)}>{signedPct(r.pnl_pct)}</span> },
                  { key: "day_pnl", label: "Day P&L", render: (r) => <span className={tone(r.day_pnl)}>{signedCash(r.day_pnl)}</span> },
                ]}
              />
            ) : <EmptyState title={`No ${segment} holdings`} body={all.length ? "No holdings match these filters." : noSource} />}
          </section>

          <section className="viz-row-3">
            <div className="panel">
              <div className="panel-head"><b>MTM Distribution</b><span>No. of scrips by P&amp;L %</span></div>
              {rows.some((r) => r.pnl_pct !== null)
                ? <VBarChart bars={mtmDistribution(rows.filter((r) => r.pnl_pct !== null) as { pnl_pct: number }[])} showValues />
                : <EmptyState title="No MTM data" body="No holding carries a P&L percentage." />}
            </div>
            <div className="panel">
              <div className="panel-head"><b>Top Gainers</b></div>
              <MoverTable rows={gainers} empty="No holding is at or above cost." />
            </div>
            <div className="panel">
              <div className="panel-head"><b>Top Losers</b></div>
              <MoverTable rows={losers} empty="No holding is below cost." />
            </div>
          </section>
        </>
      )}
    </Shell>
  );
}
