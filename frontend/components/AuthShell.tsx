import Link from 'next/link';
import { Activity, ShieldCheck, BarChart3 } from 'lucide-react';
import { SkeletonBars } from '@/components/Charts';

function BrandMark() {
  return (
    <Link href="/" className="brand">
      <div className="brand-bars" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <span>
        <b>Argus TradeOps</b>
        <small>Trading Observability Platform</small>
      </span>
    </Link>
  );
}

/**
 * Split layout shared by /signin, /signup, /verify and /forgot-password.
 * Public: a static strip only — never the live market feed, which would call protected APIs.
 */
export default function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <main className="auth-page">
      <p className="auth-banner">
        <span>Read-only observability</span>
        <span>Organisation SSO</span>
        <span>No orders are placed from this platform</span>
      </p>
      <div className="auth-grid">
        <section className="auth-brand">
          <BrandMark />
          <div className="auth-copy">
            <h1>{title}</h1>
            <p>{subtitle}</p>
            <ul>
              <li>
                <Activity aria-hidden="true" />
                Real-time order, rejection and exchange visibility
              </li>
              <li>
                <ShieldCheck aria-hidden="true" />
                Keycloak SSO, role-based access and audit trail
              </li>
              <li>
                <BarChart3 aria-hidden="true" />
                ELK-powered root cause analysis with evidence
              </li>
            </ul>
          </div>
          <div className="auth-preview" aria-hidden="true">
            <div className="auth-preview-head">
              <span>Trading Operations</span>
              <b>Preview</b>
            </div>
            <div className="auth-preview-kpis">
              {['Orders', 'Executed', 'Rejected'].map((k) => (
                <div key={k}>
                  <span>{k}</span>
                  <i className="preview-skel preview-skel-value" />
                  <i className="preview-skel preview-skel-line" />
                </div>
              ))}
            </div>
            <div className="auth-preview-chart">
              <SkeletonBars count={16} />
            </div>
            <p className="auth-preview-note">Live counts appear after you sign in</p>
          </div>
          <p className="auth-legal">
            © {new Date().getFullYear()} Argus TradeOps · Read-only observability. No orders are
            ever placed from this platform.
          </p>
        </section>
        <section className="auth-form-wrap">
          <div className="auth-mobile-brand">
            <BrandMark />
          </div>
          {children}
        </section>
      </div>
    </main>
  );
}
