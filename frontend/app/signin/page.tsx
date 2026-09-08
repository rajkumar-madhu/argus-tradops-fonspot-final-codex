"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowRight, KeyRound, LayoutDashboard, Shield } from "lucide-react";
import AuthModeTabs from "@/components/AuthModeTabs";
import AuthShell from "@/components/AuthShell";
import { fetchAuthConfig, login } from "@/lib/oidc";

export default function SignIn() {
  const [busy, setBusy] = useState(false);
  const [authDisabled, setAuthDisabled] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState("");

  const checkConfig = useCallback(async () => {
    setChecking(true);
    setError(null);
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const cfg = await Promise.race([
        fetchAuthConfig(),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => reject(new Error("The API did not respond. Please retry.")), 10000);
        }),
      ]);
      setAuthDisabled(cfg.auth_disabled);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cannot reach the API");
    } finally {
      clearTimeout(timeout);
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    void checkConfig();
  }, [checkConfig]);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      await login("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Sign in to TradeOps"
      subtitle="One secure entry point for orders, rejections, sessions, and RCA — no passwords stored in this app."
    >
      <div className="auth-card auth-card-v2 compact">
        <AuthModeTabs active="signin" />

        <div className="auth-card-head">
          <span className="auth-icon"><KeyRound size={22} /></span>
          <div>
            <h2>Welcome back</h2>
            <p>Use your organisation SSO. We never store credentials here.</p>
          </div>
        </div>

        {authDisabled === true && (
          <div className="auth-chip ok">
            <LayoutDashboard size={14} />
            Auth disabled — you can continue straight to the dashboard on this environment
          </div>
        )}

        <label className="auth-field">
          Work email
          <input
            type="email"
            autoComplete="email"
            placeholder="name@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <span className="auth-hint">Used only to pre-fill your identity provider when supported</span>
        </label>

        {error && <p className="form-error" role="alert">{error}</p>}

        {authDisabled === true ? (
          <button type="button" className="primary auth-cta" onClick={() => (window.location.href = "/dashboard")}>
            Continue to dashboard
            <ArrowRight size={16} />
          </button>
        ) : (
          <button
            type="button"
            className="primary auth-cta"
            disabled={busy || checking}
            onClick={authDisabled === null ? checkConfig : start}
          >
            <Shield size={16} />
            {busy ? "Redirecting to SSO…" : checking ? "Checking connection…" : authDisabled === null ? "Retry connection" : "Continue with Keycloak SSO"}
            {!busy && !checking && authDisabled !== null && <ArrowRight size={16} />}
          </button>
        )}

        <div className="auth-quick-links">
          <Link href="/forgot-password">Forgot access?</Link>
          <Link href="/dashboard">Preview dashboard</Link>
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
