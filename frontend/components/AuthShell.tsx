import Link from "next/link";
import { Activity, ShieldCheck, BarChart3 } from "lucide-react";
import MarketTicker from "@/components/MarketTicker";
import { MiniBars } from "@/components/Charts";

/**
 * Split layout shared by /signin, /signup, /verify and /forgot-password:
 * ticker strip, dark brand panel with a KPI preview, and a white card column.
 */
export default function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <main className="auth-page">
      <MarketTicker variant="strip" />
      <div className="auth-grid">
        <section className="auth-brand">
          <Link href="/" className="brand">
            <div className="brand-bars"><i /><i /><i /></div>
            <span><b>TradeOps</b><small>Trading Observability Platform</small></span>
          </Link>
          <div className="auth-copy">
            <h1>{title}</h1>
            <p>{subtitle}</p>
            <ul>
              <li><Activity />Real-time order, rejection and exchange visibility</li>
              <li><ShieldCheck />Keycloak SSO, role-based access and audit trail</li>
              <li><BarChart3 />ELK-powered root cause analysis with evidence</li>
            </ul>
          </div>
          <div className="auth-preview" aria-hidden="true">
            <div className="auth-preview-head"><span>Trading Operations · Today</span><b>● LIVE</b></div>
            <div className="auth-preview-kpis">
              <div><span>Orders</span><b>25,790</b><em className="up">▲ 12%</em></div>
              <div><span>Executed</span><b>94.3%</b><em className="up">▲ 1.2%</em></div>
              <div><span>Rejected</span><b>5.7%</b><em className="down">▼ 0.4%</em></div>
            </div>
            <div className="auth-preview-chart"><MiniBars values={[22, 28, 24, 36, 30, 44, 38, 52, 47, 58, 54, 66, 60, 72, 68, 80]} cls="bar-blue" /></div>
          </div>
          <p className="auth-legal">© {new Date().getFullYear()} TradeOps · Read-only observability. No orders are ever placed from this platform.</p>
        </section>
        <section className="auth-form-wrap">{children}</section>
      </div>
    </main>
  );
}
