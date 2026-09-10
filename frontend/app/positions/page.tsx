import RefreshButton from "@/components/RefreshButton";
import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, LineChart, RefreshCw, Scale, Wallet } from "lucide-react";
import Shell from "@/components/Shell";
import PositionsFlow from "@/components/PositionsFlow";
import { Donut, HBarList, VBarChart } from "@/components/Charts";
import { DataTable, EmptyState, KpiCard } from "@/components/UI";
import { apiError, getJSON } from "@/lib/api";
import { dateShort, fmt, money } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Page() {
  const [d, trades]: any[] = await Promise.all([getJSON("/api/positions"), getJSON("/api/trades?size=10000")]);
  const err = apiError(d);
  const rows = d.items || [];
  const netMtm = rows.reduce((s: number, r: any) => s + Number(r.mtm || 0), 0);
  const longs = rows.filter((r: any) => Number(r.net_qty) > 0);
  const shorts = rows.filter((r: any) => Number(r.net_qty) < 0);
  const byExchange: Record<string, number> = {};
  rows.forEach((r: any) => {
    byExchange[r.exchange] = (byExchange[r.exchange] || 0) + 1;
  });
  const exchRows = Object.entries(byExchange).map(([name, count]) => ({ name, count }));
  const maxExch = Math.max(1, ...exchRows.map((x) => x.count));
  const mtmBars = rows
    .map((r: any) => ({ label: String(r.symbol).slice(0, 10), value: Math.abs(Number(r.mtm || 0)), cls: Number(r.mtm) >= 0 ? "bar-green" : "bar-red" }))
    .sort((a: any, b: any) => b.value - a.value)
    .slice(0, 8);

  return (
    <Shell>
      <section className="dashboard-head overview-head">
        <div>
          <h1>Positions</h1>
          <p>Positions and filled flow across segments and exchanges</p>
        </div>
        <div className="time-controls"><RefreshButton/>
          <span className="source-tag">{d.count || rows.length} positions · {d.source || "—"}</span>
        </div>
      </section>

      {err ? (
        <EmptyState title="Unable to load positions" body={err} />
      ) : rows.length === 0 ? (
        <div className="ref-page"><PositionsFlow trades={trades} note={d.note} /></div>
      ) : (
        <>
          <section className="kpi-grid four">
            <KpiCard label="Open Positions" value={fmt(rows.length)} delta="Net intraday book" tone="blue" icon={<Wallet size={18} />} />
            <KpiCard label="Long Legs" value={fmt(longs.length)} delta={`${fmt(longs.reduce((s: number, r: any) => s + Number(r.net_qty), 0))} net qty`} deltaTone="up" tone="green" icon={<ArrowUpRight size={18} />} />
            <KpiCard label="Short Legs" value={fmt(shorts.length)} delta={`${fmt(shorts.reduce((s: number, r: any) => s + Math.abs(Number(r.net_qty)), 0))} net qty`} deltaTone="down" tone="red" icon={<ArrowDownRight size={18} />} />
            <KpiCard label="Total MTM" value={money(netMtm)} delta={netMtm >= 0 ? "▲ Mark-to-market" : "▼ Mark-to-market"} deltaTone={netMtm >= 0 ? "up" : "down"} tone="amber" icon={<LineChart size={18} />} />
          </section>

          <section className="viz-row-3">
            <div className="panel">
              <div className="panel-head"><b>Intraday MTM Trend</b></div>
              <EmptyState title="History unavailable" body="The current source supplies a point-in-time position snapshot, not an intraday MTM series." />
            </div>
            <div className="panel">
              <div className="panel-head"><b>MTM by Symbol</b></div>
              <VBarChart bars={mtmBars} />
            </div>
            <div className="panel">
              <div className="panel-head"><b>Exposure Mix</b></div>
              <Donut
                centerLabel="Positions"
                centerValue={fmt(rows.length)}
                slices={[
                  { label: "Long", value: longs.length, cls: "seg-green", pct: rows.length ? `${((longs.length / rows.length) * 100).toFixed(0)}%` : "0%" },
                  { label: "Short", value: shorts.length, cls: "seg-red", pct: rows.length ? `${((shorts.length / rows.length) * 100).toFixed(0)}%` : "0%" },
                  { label: "Flat", value: Math.max(0, rows.length - longs.length - shorts.length), cls: "seg-blue", pct: "—" },
                ]}
              />
            </div>
          </section>

          <section className="overview-row-4">
            <div className="panel">
              <div className="panel-head"><b>By Exchange</b></div>
              {exchRows.length === 0 ? (
                <EmptyState title="No exchange split" body="Position rows did not include exchange metadata." />
              ) : (
                <HBarList
                  rows={exchRows.map((x, i) => ({
                    label: x.name,
                    value: fmt(x.count),
                    pct: (x.count / maxExch) * 100,
                    cls: ["bar-blue", "bar-purple", "bar-teal", "bar-amber"][i % 4],
                  }))}
                />
              )}
            </div>
            <div className="panel span-3">
              <div className="panel-head"><b>Position Book</b><Link href="/risk">Risk limits ›</Link></div>
              <DataTable
                className="compact"
                rows={rows}
                rowKey={(r) => `${r.symbol}-${r.exchange}`}
                columns={[
                  { key: "date", label: "Date", render: (r) => dateShort(r.date || r.as_of || r.event_time || r.time) },
                  { key: "symbol", label: "Symbol", render: (r) => <b>{r.symbol}</b> },
                  { key: "exchange", label: "Exch" },
                  { key: "product", label: "Product" },
                  { key: "account", label: "Account", render: (r) => r.account || r.account_id || "—" },
                  { key: "net_qty", label: "Net Qty", render: (r) => <span className={Number(r.net_qty) >= 0 ? "text-green" : "text-red"}>{r.net_qty}</span> },
                  { key: "avg_price", label: "Avg", render: (r) => money(r.avg_price) },
                  { key: "ltp", label: "LTP", render: (r) => money(r.ltp) },
                  { key: "mtm", label: "MTM", render: (r) => <span className={Number(r.mtm) >= 0 ? "text-green" : "text-red"}>{money(r.mtm)}</span> },
                  { key: "day_pnl", label: "Day P&L", render: (r) => r.day_pnl == null ? "—" : money(r.day_pnl) },
                  { key: "broker", label: "Broker" },
                ]}
              />
            </div>
          </section>

          <section className="bottom-grid overview-bottom">
            <div className="panel">
              <div className="panel-head"><b>RMS integration</b><Scale size={14} /></div>
              <ul className="config-list">
                <li><span>Correlation key</span><b>Symbol + Product + Account</b></li>
                <li><span>Refresh cadence</span><b>Event-driven via collector</b></li>
                <li><span>Privacy</span><b>Account masked in UI</b></li>
              </ul>
            </div>
            <div className="panel span-3">
              <div className="panel-head"><b>Position notes</b></div>
              <div className="empty-state">
                <b>No positions feed</b>
                <p>Live positions are sourced from RMS/back-office in production. Connect your back-office integration to populate this view.</p>
              </div>
            </div>
          </section>
        </>
      )}
    </Shell>
  );
}
