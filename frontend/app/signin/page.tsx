'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { ArrowRight, KeyRound, LayoutDashboard, Shield } from 'lucide-react';
import AuthModeTabs from '@/components/AuthModeTabs';
import AuthShell from '@/components/AuthShell';
import { fetchAuthConfig, login } from '@/lib/oidc';
import { safeReturnTo } from '@/lib/auth-routing';

export default function SignIn() {
  const [busy, setBusy] = useState(false);
  const [authDisabled, setAuthDisabled] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState('');
  const [expired, setExpired] = useState(false);

  const checkConfig = useCallback(async () => {
    setChecking(true);
    setError(null);
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const cfg = await Promise.race([
        fetchAuthConfig(),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () => reject(new Error('The API did not respond. Please retry.')),
            10000,
          );
        }),
      ]);
      setAuthDisabled(cfg.auth_disabled);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cannot reach the API');
    } finally {
      clearTimeout(timeout);
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    setExpired(new URLSearchParams(window.location.search).get('reason') === 'expired');
    void checkConfig();
  }, [checkConfig]);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      await login(safeReturnTo(new URLSearchParams(window.location.search).get('returnTo')), email);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed');
      setBusy(false);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy || checking) return;
    if (authDisabled === true) {
      window.location.href = '/dashboard';
      return;
    }
    if (authDisabled === null) {
      void checkConfig();
      return;
    }
    void start();
  }

  return (
    <AuthShell
      title="Sign in to Argus TradeOps"
      subtitle="One secure entry point for orders, rejections, sessions, and RCA — no passwords stored in this app."
    >
      <div className="auth-card auth-card-v2 compact">
        <AuthModeTabs active="signin" />

        <div className="auth-card-head">
          <span className="auth-icon">
            <KeyRound size={22} />
          </span>
          <div>
            <h2>Welcome back</h2>
            <p>Use your organisation SSO. Argus TradeOps never stores your password.</p>
          </div>
        </div>

        {authDisabled === true && (
          <div className="auth-chip ok">
            <LayoutDashboard size={14} />
            Auth disabled — you can continue straight to the dashboard on this environment
          </div>
        )}

        {authDisabled === false && !checking && (
          <div className="auth-chip sso">
            <Shield size={14} />
            SSO is ready · access is managed by your organisation
          </div>
        )}

        <form onSubmit={onSubmit}>
          <label className="auth-field">
            Work email
            <input
              type="email"
              autoComplete="email"
              placeholder="name@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <span className="auth-hint">
              Used only to pre-fill your identity provider when supported
            </span>
          </label>

          {expired && <p role="status">Your session has expired. Sign in again to continue.</p>}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}

          {authDisabled === true ? (
            <button type="submit" className="primary auth-cta">
              Continue to dashboard
              <ArrowRight size={16} />
            </button>
          ) : (
            <button type="submit" className="primary auth-cta" disabled={busy || checking}>
              <Shield size={16} />
              {busy
                ? 'Opening secure sign-in…'
                : checking
                  ? 'Checking secure sign-in…'
                  : authDisabled === null
                    ? 'Retry connection'
                    : 'Continue with SSO'}
              {!busy && !checking && authDisabled !== null && <ArrowRight size={16} />}
            </button>
          )}
        </form>

        <div className="auth-quick-links">
          <Link href="/forgot-password">Need help signing in?</Link>
          <Link href="/">Back to home</Link>
        </div>

        <ul className="auth-bullets compact">
          <li>Authorization Code + PKCE</li>
          <li>Role-based access for ops, risk, SRE, audit</li>
          <li>Sessions follow your identity provider policy</li>
        </ul>
      </div>
    </AuthShell>
  );
}
