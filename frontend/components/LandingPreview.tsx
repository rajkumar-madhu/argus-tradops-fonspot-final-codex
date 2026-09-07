import { MiniBars } from "@/components/Charts";

const NAV = ["Dashboard", "Live Orders", "Order Book", "Positions", "Rejections", "RCA & Analysis", "Exchange Health", "Users & Sessions", "Infrastructure", "Alerts & Incidents"];
const ROWS = [
  ["09:32:11", "RELIANCE", "BUY", "500", "2,934.50", "Completed"],
  ["09:32:08", "HDFCBANK", "SELL", "200", "1,678.90", "Open"],
  ["09:32:05", "INFY", "BUY", "300", "1,872.30", "Rejected"],
  ["09:32:01", "TATAMOTORS", "BUY", "150", "967.00", "Pending"],
  ["09:31:58", "ICICIBANK", "SELL", "250", "1,245.20", "Completed"],
];

/** Static, CSS-built dashboard preview shown in the landing hero. */
export default function LandingPreview() {
  return (
    <div className="preview" aria-hidden="true">
      <aside className="preview-side">
        <div className="preview-brand"><i /><i /><i /><b>TradeOps</b></div>
        {NAV.map((n, i) => <span key={n} className={i === 0 ? "active" : ""}>{n}</span>)}
      </aside>
      <div className="preview-main">
        <div className="preview-top"><b>Dashboard</b><span>Real-time view of your trading ecosystem</span><em>● Live</em></div>
        <div className="preview-kpis">
          <div><span>Total Orders</span><b>1,23,456</b><em className="up">▲ 12%</em></div>
          <div><span>Executed</span><b>1,18,320</b><em className="up">95.8%</em></div>
          <div><span>Rejected</span><b>2,222</b><em className="down">1.8%</em></div>
          <div><span>Active Traders</span><b>186</b><em className="up">▲ 4%</em></div>
          <div><span>Exchange Health</span><b>5/5</b><em className="up">Operational</em></div>
        </div>
        <div className="preview-mid">
          <div className="preview-card">
            <b>Orders Trend</b>
            <div className="preview-chart"><MiniBars values={[24, 30, 27, 38, 34, 46, 41, 52, 48, 58, 55, 66, 61, 72, 69, 80, 74, 84]} cls="bar-blue" /></div>
          </div>
          <div className="preview-card">
            <b>Orders by Exchange</b>
            <div className="preview-bars">
              {[["NSE", 88, "bar-blue"], ["NFO", 64, "bar-green"], ["BSE", 42, "bar-amber"], ["MCX", 28, "bar-purple"], ["CDS", 16, "bar-teal"]].map(([n, w, c]) => (
                <div key={String(n)}><span>{n}</span><i className={String(c)} style={{ width: `${w}%` }} /></div>
              ))}
            </div>
          </div>
          <div className="preview-card">
            <b>System Health</b>
            <ul>
              {["OMS", "RMS", "Market Data", "Exchange", "Kubernetes", "Elasticsearch"].map((s) => <li key={s}><span>{s}</span><em>● Healthy</em></li>)}
            </ul>
          </div>
        </div>
        <div className="preview-card preview-table">
          <b>Live Orders</b>
          <table>
            <thead><tr><th>Time</th><th>Symbol</th><th>Side</th><th>Qty</th><th>Price</th><th>Status</th></tr></thead>
            <tbody>
              {ROWS.map((r) => (
                <tr key={r[0]}>
                  <td>{r[0]}</td><td>{r[1]}</td><td className={r[2] === "BUY" ? "up" : "down"}>{r[2]}</td><td>{r[3]}</td><td>{r[4]}</td>
                  <td><span className={`order-status ${r[5].toLowerCase()}`}>{r[5]}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
