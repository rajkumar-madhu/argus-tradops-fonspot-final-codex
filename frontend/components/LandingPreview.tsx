const NAV = ["Dashboard", "Live Orders", "Order Book", "Positions", "Rejections", "RCA & Analysis", "Exchange Health", "Users & Sessions", "Infrastructure", "Alerts & Incidents"];
const KPIS = ["Total Orders", "Complete", "Rejected", "Open / Pending", "Reject Rate"];
const PANELS = ["Order flow", "Orders by exchange", "Platform health"];
const COLUMNS = ["Time", "Symbol", "Side", "Qty", "Price", "Status"];

/**
 * Wireframe of the dashboard for the public landing hero. It shows layout only:
 * the page is served before sign-in, so it can carry neither real order data
 * nor invented figures — every value slot is a neutral placeholder block.
 */
export default function LandingPreview() {
  return (
    <div className="preview" aria-hidden="true">
      <aside className="preview-side">
        <div className="preview-brand"><i /><i /><i /><b>Argus TradeOps</b></div>
        {NAV.map((n, i) => <span key={n} className={i === 0 ? "active" : ""}>{n}</span>)}
      </aside>
      <div className="preview-main">
        <div className="preview-top"><b>Mission Control</b><span>Orders, rejections and exchange observations</span></div>
        <div className="preview-kpis">
          {KPIS.map((k) => (
            <div key={k}><span>{k}</span><i className="preview-skel preview-skel-value" /><i className="preview-skel preview-skel-line" /></div>
          ))}
        </div>
        <div className="preview-mid">
          {PANELS.map((p) => (
            <div key={p} className="preview-card">
              <b>{p}</b>
              <div className="preview-skel-stack">
                <i className="preview-skel" /><i className="preview-skel" /><i className="preview-skel" /><i className="preview-skel" />
              </div>
            </div>
          ))}
        </div>
        <div className="preview-card preview-table">
          <b>Live Orders</b>
          <table>
            <thead><tr>{COLUMNS.map((c) => <th key={c}>{c}</th>)}</tr></thead>
            <tbody>
              {[0, 1, 2, 3, 4].map((r) => (
                <tr key={r}>{COLUMNS.map((c) => <td key={c}><i className="preview-skel preview-skel-cell" /></td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
