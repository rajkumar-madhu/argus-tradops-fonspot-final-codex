"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { KeyRound, LockKeyhole } from "lucide-react";
import AuthShell from "@/components/AuthShell";
import { fetchAuthConfig, login } from "@/lib/oidc";

export default function SignIn() {
  const [busy, setBusy] = useState(false);
  const [authDisabled, setAuthDisabled] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAuthConfig()
      .then((cfg) => setAuthDisabled(cfg.auth_disabled))
      .catch((err) => setError(err instanceof Error ? err.message : "Cannot reach the API"));
  }, []);

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
    <AuthShell title="Sign in to TradeOps" subtitle="Access your trading observability workspace securely.">
      <div className="auth-card compact">
        <span className="auth-icon"><LockKeyhole size={22} /></span>
        <h2>Welcome back</h2>
        {/* Identity is owned by Keycloak. There is deliberately no local password
            form: this app never holds credentials, only a short-lived access token. */}
        <p>
          {authDisabled === true
            ? "Authentication is disabled on this environment. Continue straight to the dashboard."
            : "Continue with your organisation's single sign-on."}
        </p>
        {error && <p className="form-error">{error}</p>}
        {authDisabled === true ? (
          <button className="primary" onClick={() => (window.location.href = "/dashboard")}>
            Continue to dashboard →
          </button>
        ) : (
          <button className="primary" disabled={busy || authDisabled === null} onClick={start}>
            <KeyRound size={16} />
            {busy ? "Redirecting…" : authDisabled === null ? "Checking…" : "Sign in with Keycloak (SSO)"}
          </button>
        )}
        <div className="auth-or"><span>secure access</span></div>
        <ul className="auth-bullets">
          <li>Authorization Code + PKCE, no passwords stored here</li>
          <li>Access is granted by role: trading ops, risk, SRE, auditor</li>
          <li>Sessions expire automatically with your identity provider</li>
        </ul>
        <p className="auth-foot">
          New to TradeOps? <Link href="/signup">Create an account</Link> · <Link href="/forgot-password">Need help signing in?</Link>
        </p>
      </div>
    </AuthShell>
  );
}
