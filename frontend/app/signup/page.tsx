"use client";

import Link from "next/link";
import { useState } from "react";
import { UserPlus } from "lucide-react";
import AuthShell from "@/components/AuthShell";
import { fetchAuthConfig, registrationUrl } from "@/lib/oidc";

/**
 * Registration is owned by Keycloak. This form only collects intent locally;
 * nothing typed here is posted anywhere. On submit we hand off to the realm's
 * registration page, or to /verify when auth is disabled or unreachable.
 */
export default function SignUp() {
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    let target = "/verify";
    try {
      const cfg = await fetchAuthConfig();
      target = registrationUrl(cfg) ?? "/verify";
    } catch {
      target = "/verify";
    }
    window.location.href = target;
  }

  return (
    <AuthShell title="Create your workspace" subtitle="Join TradeOps and get full visibility across trading operations.">
      <div className="auth-card">
        <span className="auth-icon"><UserPlus size={22} /></span>
        <h2>Get started free</h2>
        <p>No card required. Your workspace is provisioned through your organisation&apos;s identity provider.</p>
        <form onSubmit={submit}>
          <div className="form-grid">
            <label>Full Name<input required autoComplete="name" placeholder="Your full name" /></label>
            <label>Work Email<input required type="email" autoComplete="email" placeholder="name@company.com" /></label>
            <label>Company<input required autoComplete="organization" placeholder="Company name" /></label>
            <label>Phone Number<input autoComplete="tel" placeholder="+91 ·····" /></label>
            <label>Password<input required type="password" autoComplete="new-password" placeholder="Create password" /></label>
            <label>Confirm Password<input required type="password" autoComplete="new-password" placeholder="Confirm password" /></label>
          </div>
          <label className="check"><input required type="checkbox" /> I agree to the <a href="#terms">Terms</a> and <a href="#privacy">Privacy Policy</a></label>
          <button className="primary" disabled={busy}>{busy ? "Redirecting…" : "Create Account →"}</button>
        </form>
        <div className="auth-or"><span>what you get</span></div>
        <div className="auth-perks">
          <div><b>Live orders</b><span>Streamed from the Noren journal</span></div>
          <div><b>Rejection RCA</b><span>Evidence-backed root cause</span></div>
          <div><b>Exchange health</b><span>Latency and connectivity</span></div>
        </div>
        <p className="auth-foot">Already have an account? <Link href="/signin">Sign in</Link></p>
      </div>
    </AuthShell>
  );
}
