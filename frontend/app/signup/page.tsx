"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Shield, UserPlus } from "lucide-react";
import AuthModeTabs from "@/components/AuthModeTabs";
import AuthShell from "@/components/AuthShell";
import { fetchAuthConfig, login, registrationUrl, type AuthConfig } from "@/lib/oidc";

export default function SignUp() {
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cfg, setCfg] = useState<AuthConfig | null>(null);

  const load = useCallback(async () => {
    setChecking(true);
    setError(null);
    try {
      setCfg(await fetchAuthConfig());
    } catch (err) {
      setCfg(null);
      setError(err instanceof Error ? err.message : "Cannot reach the API");
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function startSso() {
    setBusy(true);
    setError(null);
    try {
      await login("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
      setBusy(false);
    }
  }

  async function startRegistration() {
    if (!cfg) return;
    const target = registrationUrl(cfg);
    if (!target) {
      setError("Self-registration is not enabled on this identity provider.");
      return;
    }
    setBusy(true);
    window.location.href = target;
  }

  const registrationOpen = Boolean(cfg && registrationUrl(cfg));
  const ssoReady = cfg?.auth_disabled === false;

  return (
    <AuthShell
      title="Request an Argus TradeOps workspace"
      subtitle="Bring your operations team into one read-only view of orders, rejections, and exchange health."
    >
      <div className="auth-card auth-card-v2 compact">
        <AuthModeTabs active="signup" />

        <div className="auth-card-head">
          <span className="auth-icon"><UserPlus size={22} /></span>
          <div>
            <h2>{registrationOpen ? "Create your access" : "Access is provisioned"}</h2>
            <p>
              {registrationOpen
                ? "Finish account creation with your organisation’s identity provider."
                : "Argus TradeOps uses organisation SSO. This identity provider does not allow self-registration."}
            </p>
          </div>
        </div>

        {ssoReady && !registrationOpen && !checking && (
          <div className="auth-chip sso">
            <Shield size={14} />
            Ask an administrator to grant you access, then sign in with SSO
          </div>
        )}

        {error && <p className="form-error" role="alert">{error}</p>}

        {cfg?.auth_disabled ? (
          <button type="button" className="primary auth-cta" onClick={() => (window.location.href = "/dashboard")}>
            Continue to dashboard
            <ArrowRight size={16} />
          </button>
        ) : (
          <button
            type="button"
            className="primary auth-cta"
            disabled={busy || checking}
            onClick={checking || !cfg ? load : registrationOpen ? startRegistration : startSso}
          >
            <Shield size={16} />
            {busy
              ? "Opening secure sign-in…"
              : checking
                ? "Checking access…"
                : !cfg
                  ? "Retry connection"
                  : registrationOpen
                    ? "Continue to registration"
                    : "Sign in with SSO"}
            {!busy && !checking && cfg && <ArrowRight size={16} />}
          </button>
        )}

        <p className="auth-foot">
          Already have access? <Link href="/signin">Sign in with SSO</Link>
        </p>
      </div>
    </AuthShell>
  );
}
