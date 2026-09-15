'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { ArrowRight, Shield, UserPlus } from 'lucide-react';
import AuthModeTabs from '@/components/AuthModeTabs';
import AuthShell from '@/components/AuthShell';
import { fetchAuthConfig, login, register, registrationUrl, type AuthConfig } from '@/lib/oidc';

export default function SignUp() {
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cfg, setCfg] = useState<AuthConfig | null>(null);
  const [email, setEmail] = useState('');

  const load = useCallback(async () => {
    setChecking(true);
    setError(null);
    try {
      setCfg(await fetchAuthConfig());
    } catch (err) {
      setCfg(null);
      setError(err instanceof Error ? err.message : 'Cannot reach the API');
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const registrationOpen = Boolean(cfg && registrationUrl(cfg));
  const ssoReady = cfg?.auth_disabled === false;

  async function startSso() {
    setBusy(true);
    setError(null);
    try {
      await login('/dashboard', email);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed');
      setBusy(false);
    }
  }

  async function startRegistration() {
    if (!cfg) return;
    const target = registrationUrl(cfg);
    if (!target) {
      setError('Self-registration is not enabled on this identity provider.');
      return;
    }
    setBusy(true);
    try {
      await register('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration could not be started');
      setBusy(false);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy || checking) return;
    if (cfg?.auth_disabled) {
      window.location.href = '/dashboard';
      return;
    }
    if (checking || !cfg) {
      void load();
      return;
    }
    if (registrationOpen) void startRegistration();
    else void startSso();
  }

  return (
    <AuthShell
      title="Join Argus TradeOps"
      subtitle="Bring your operations team into one read-only view of orders, rejections, and exchange health."
    >
      <div className="auth-card auth-card-v2 compact">
        <AuthModeTabs active="signup" />

        <div className="auth-card-head">
          <span className="auth-icon">
            <UserPlus size={22} />
          </span>
          <div>
            <h2>{registrationOpen ? 'Create your access' : 'Request access'}</h2>
            <p>
              {registrationOpen
                ? 'Finish account creation with your organisation’s identity provider.'
                : 'Argus TradeOps uses organisation SSO. An administrator grants a TradeOps role; you then sign in with that identity.'}
            </p>
          </div>
        </div>

        {!registrationOpen && !checking && (
          <ol className="auth-steps">
            <li className="auth-step done">
              <span>1</span>
              <b>Ask your administrator</b>
            </li>
            <li className="auth-step active">
              <span>2</span>
              <b>Receive a TradeOps role</b>
            </li>
            <li className="auth-step">
              <span>3</span>
              <b>Sign in with SSO</b>
            </li>
          </ol>
        )}

        {ssoReady && !registrationOpen && !checking && (
          <div className="auth-chip sso">
            <Shield size={14} />
            Self-registration is closed on this identity provider
          </div>
        )}

        <form onSubmit={onSubmit}>
          {(registrationOpen || ssoReady) && (
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
                {registrationOpen
                  ? 'Used when your identity provider supports a pre-filled registration'
                  : 'Used only to pre-fill sign-in when supported'}
              </span>
            </label>
          )}

          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}

          {cfg?.auth_disabled ? (
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
                  ? 'Checking access…'
                  : !cfg
                    ? 'Retry connection'
                    : registrationOpen
                      ? 'Continue to registration'
                      : 'Continue to sign in'}
              {!busy && !checking && cfg && <ArrowRight size={16} />}
            </button>
          )}
        </form>

        <p className="auth-foot">
          Already have access? <Link href="/signin">Sign in with SSO</Link>
        </p>

        <ul className="auth-bullets compact">
          <li>Read-only — this app never places or cancels orders</li>
          <li>Access is a Keycloak role, not a local password</li>
          <li>Same SSO as the rest of the Finspot tools</li>
        </ul>
      </div>
    </AuthShell>
  );
}
