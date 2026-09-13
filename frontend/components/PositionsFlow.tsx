import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Boxes, Layers, ShieldAlert } from "lucide-react";
import { Donut, StackedBars } from "@/components/Charts";
import { EmptyState, KpiCard } from "@/components/UI";
import { fmt } from "@/lib/format";
import { istTime } from "@/lib/journal-explore";
import { flowKpis, flowTrend, instrumentFlow, segmentFlow } from "@/lib/positions-flow";

const SLICE = ["seg-blue", "seg-green", "seg-amber", "seg-purple", "seg-red", "seg-muted"];
const px = (v: number | null) => (v === null ? "—" : v.toLocaleString("en-IN", { maximumFractionDigits: 2 }));

/**
 * Positions in the reference layout (mockup 01_18_45) when no RMS position
 * feed exists: filled flow from journal fills, across all accounts, as fill
 * counts and quantities. No rupee figures are shown on this screen; VWAPs are
 * per-unit prices. Positions and margin panels state the feed they need.
 */
export default function PositionsFlow({ trades, note }: { trades: any; note?: string }) {
  const fills: any[] = trades?.items || [];
  const k = flowKpis(fills);
  const instruments = instrumentFlow(fills);
  const segments = segmentFlow(fills);
  const trend = flowTrend(fills);
  const recent = [...fills].sort((a, b) => Date.parse(b.time) - Date.parse(a.time)).slice(0, 8);
  const denied = trades?._status === 401 || trades?._status === 403;

  return (
    <>
      <div className="ref-banner">
        <ShieldAlert size={16} aria-hidden="true" />
        <span>{(note || "No RMS position snapshot is connected").replace(/\.?$/, ".")} Below is <b>filled flow</b> from journal fills across all accounts — counts and quantities, not account positions.</span>
      </div>

      <section className="kpi-grid ref-kpis four">
        <KpiCard label="Fills" value={denied ? "—" : fmt(k.fills)} delta="Completed fills in the window" tone="blue" icon={<Layers size={18} />} />
        <KpiCard label="Buy Fills" value={denied ? "—" : fmt(k.buyFills)} delta={`${fmt(k.buyQty)} qty filled`} deltaTone="up" tone="green" icon={<ArrowUpRight size={18} />} />
        <KpiCard label="Sell Fills" value={denied ? "—" : fmt(k.sellFills)} delta={`${fmt(k.sellQty)} qty filled`} deltaTone="down" tone="red" icon={<ArrowDownRight size={18} />} />
        <KpiCard label="Instruments Traded" value={denied ? "—" : fmt(k.instruments)} delta={`${fmt(segments.length)} segments`} tone="amber" icon={<Boxes size={18} />} />
      </section>

      {denied ? (
        <EmptyState title="Access limited" body="Fills need trade access for this role." />
      ) : (
        <>
          <section className="ref-grid three">
            <div className="panel">
              <div className="panel-head">
                <b>Fills per Minute</b>
                <span className="legend"><span><i className="lg" style={{ background: "#16a34a" }} /> Buy</span><span><i className="lg" style={{ background: "#e5383b" }} /> Sell</span></span>
              </div>
              {trend.length ? (
                <div className="ref-chart">
                  <StackedBars series={["Buy", "Sell"]} colors={["#16a34a", "#e5383b"]} bins={trend.map((b) => ({ label: istTime(new Date(b.start).toISOString()).slice(0, 5), values: [b.buy, b.sell] }))} />
                  <p className="ref-note">Completed fills per minute.</p>
                </div>
              ) : (
                <EmptyState title="No fills" body="No completed order in the window." />
              )}
            </div>
            <div className="panel">
              <div className="panel-head"><b>Fills by Segment</b></div>
              {segments.length ? (
                <div className="ref-donut">
                  <Donut centerLabel="Fills" centerValue={fmt(k.fills)} slices={segments.map((s, i) => ({ label: s.name, value: s.fills, cls: SLICE[i % SLICE.length], pct: `${s.share.toFixed(1)}%` }))} />
                </div>
              ) : (
                <EmptyState title="No fills" body="No completed order in the window." />
              )}
            </div>
            <div className="panel">
              <div className="panel-head"><b>Top Instruments by Fills</b></div>
              {instruments.length ? (
                <table className="compact ref-table">
                  <thead><tr><th>#</th><th>Symbol</th><th className="num">Fills</th><th className="num">Net Qty</th></tr></thead>
                  <tbody>
                    {instruments.slice(0, 6).map((r, i) => (
                      <tr key={`${r.exchange}:${r.symbol}`}><td>{i + 1}</td><td><b>{r.symbol}</b></td><td className="num">{fmt(r.fills)}</td><td className={`num ${r.netQty > 0 ? "text-green" : r.netQty < 0 ? "text-red" : ""}`}>{r.netQty > 0 ? "+" : ""}{fmt(r.netQty)}</td></tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <EmptyState title="No fills" body="No completed order in the window." />
              )}
            </div>
          </section>

          <section className="panel">
            <div className="panel-head"><b>Filled Flow by Instrument ({fmt(instruments.length)})</b><Link href="/trades">Trades ›</Link></div>
            {instruments.length ? (
              <div className="table-scroll">
                <table className="compact ref-table">
                  <thead><tr><th>#</th><th>Symbol</th><th>Exchange</th><th className="num">Buy Qty</th><th className="num">Buy Avg</th><th className="num">Sell Qty</th><th className="num">Sell Avg</th><th className="num">Net Qty</th><th className="num">Fills</th></tr></thead>
                  <tbody>
                    {instruments.slice(0, 12).map((r, i) => (
                      <tr key={`${r.exchange}:${r.symbol}`}>
                        <td>{i + 1}</td>
                        <td><b>{r.symbol}</b></td>
                        <td className="text-amber">{r.exchange}</td>
                        <td className="num">{fmt(r.buyQty)}</td>
                        <td className="num">{px(r.buyAvg)}</td>
                        <td className="num">{fmt(r.sellQty)}</td>
                        <td className="num">{px(r.sellAvg)}</td>
                        <td className={`num ${r.netQty > 0 ? "text-green" : r.netQty < 0 ? "text-red" : ""}`}>{r.netQty > 0 ? "+" : ""}{fmt(r.netQty)}</td>
                        <td className="num">{fmt(r.fills)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="ref-note ref-note-pad">Net qty is buys minus sells filled in the window across all accounts; it is not any account&apos;s position. Buy/Sell Avg are per-unit fill prices in the segment&apos;s own scale.</p>
              </div>
            ) : (
              <EmptyState title="No fills" body="No completed order in the window." />
            )}
          </section>

          <section className="ref-grid three">
            <div className="panel">
              <div className="panel-head"><b>Account Positions</b></div>
              <EmptyState title="Needs an RMS feed" body="Per-account positions come from RMS/back-office, not from the journal." />
            </div>
            <div className="panel">
              <div className="panel-head"><b>Risk Metrics</b><Link href="/risk">Risk ›</Link></div>
              <EmptyState title="No margin feed" body="Margin and exposure come from the RMS." />
            </div>
            <div className="panel">
              <div className="panel-head"><b>Recent Fills</b></div>
              {recent.length ? (
                <table className="compact ref-table">
                  <thead><tr><th>Time</th><th>Symbol</th><th>Side</th><th className="num">Qty</th></tr></thead>
                  <tbody>
                    {recent.map((r) => (
                      <tr key={r.trade_id}><td className="mono">{istTime(r.time)}</td><td>{r.symbol}</td><td className={r.side === "BUY" ? "text-green" : "text-red"}>{r.side}</td><td className="num">{fmt(r.qty)}</td></tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <EmptyState title="No fills" body="No completed order in the window." />
              )}
            </div>
          </section>
        </>
      )}
    </>
  );
}
