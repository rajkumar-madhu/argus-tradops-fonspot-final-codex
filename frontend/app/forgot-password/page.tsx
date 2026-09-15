'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { ArrowLeft, ArrowRight, KeyRound, Shield } from 'lucide-react';
import AuthModeTabs from '@/components/AuthModeTabs';
import AuthShell from '@/components/AuthShell';
import { login } from '@/lib/oidc';

export default function Forgot() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');

  async function start(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login('/dashboard', email);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed');
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Recover access"
      subtitle="Password reset is handled by your identity provider, not by Argus TradeOps."
    >
      <div className="auth-card auth-card-v2 compact">
        <AuthModeTabs active="signin" />
        <div className="auth-card-head">
          <span className="auth-icon">
            <KeyRound size={22} />
          </span>
          <div>
            <h2>Forgot password?</h2>
            <p>
              Continue with SSO and use your identity provider’s own reset flow. This app never
              stores a password.
            </p>
          </div>
        </div>
        <form onSubmit={start}>
          <label className="auth-field">
            Work email
            <input
              type="email"
              placeholder="name@company.com"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <span className="auth-hint">Pre-fills the identity provider when supported</span>
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="primary auth-cta" disabled={busy}>
            <Shield size={16} />
            {busy ? 'Opening secure sign-in…' : 'Continue with SSO'}
            {!busy && <ArrowRight size={16} />}
          </button>
        </form>
        <p className="auth-foot">
          <Link href="/signin">
            <ArrowLeft size={14} /> Back to sign in
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}
