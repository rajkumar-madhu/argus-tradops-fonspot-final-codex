import Link from 'next/link';
import { Activity, Bell, SearchCheck, Timer } from 'lucide-react';
import { APP_NAME, APP_TAGLINE, LOGIN_FEATURES } from '@/lib/brand';

function BrandMark() {
  return (
    <Link href="/" className="brand">
      <div className="brand-bars" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <span>
        <b>{APP_NAME}</b>
        <small>{APP_TAGLINE}</small>
      </span>
    </Link>
  );
}

/**
 * Split layout for /signin.
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
            {subtitle && <p>{subtitle}</p>}
            <ul>
              {LOGIN_FEATURES.map((feature, index) => {
                const Icon = [Activity, SearchCheck, Timer, Bell][index] ?? Activity;
                return (
                  <li key={feature.title}>
                    <Icon aria-hidden="true" />
                    <span>
                      <b>{feature.title}</b>
                      {feature.body}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
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
