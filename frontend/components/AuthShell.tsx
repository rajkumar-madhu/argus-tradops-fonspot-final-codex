import Link from "next/link";
import { Activity, ShieldCheck, BarChart3 } from "lucide-react";
import MarketTicker from "@/components/MarketTicker";
import { SkeletonBars } from "@/components/Charts";

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
            <span><b>Argus TradeOps</b><small>Trading Observability Platform</small></span>
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
            {/* Layout only: this panel renders before sign-in, so it shows no figures. */}
            <div className="auth-preview-head"><span>Trading Operations</span></div>
            <div className="auth-preview-kpis">
              {["Orders", "Executed", "Rejected"].map((k) => (
                <div key={k}><span>{k}</span><i className="preview-skel preview-skel-value" /><i className="preview-skel preview-skel-line" /></div>
              ))}
            </div>
            <div className="auth-preview-chart"><SkeletonBars count={16} /></div>
          </div>
          <p className="auth-legal">© {new Date().getFullYear()} Argus TradeOps · Read-only observability. No orders are ever placed from this platform.</p>
        </section>
        <section className="auth-form-wrap">{children}</section>
      </div>
    </main>
  );
}
