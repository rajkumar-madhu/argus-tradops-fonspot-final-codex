"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Building2, CheckCircle2, Mail, UserPlus } from "lucide-react";
import AuthModeTabs from "@/components/AuthModeTabs";
import AuthShell from "@/components/AuthShell";
import { fetchAuthConfig, registrationUrl } from "@/lib/oidc";

const STEPS = ["Work details", "Your profile"];

export default function SignUp() {
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [agreed, setAgreed] = useState(false);

  async function finish() {
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

  function next(e: React.FormEvent) {
    e.preventDefault();
    if (step === 0) {
      setStep(1);
      return;
    }
    void finish();
  }

  return (
    <AuthShell
      title="Create your workspace"
      subtitle="Start with read-only observability across orders, rejections, and exchange health."
    >
      <div className="auth-card auth-card-v2">
        <AuthModeTabs active="signup" />

        <div className="auth-card-head">
          <span className="auth-icon"><UserPlus size={22} /></span>
          <div>
            <h2>Get started free</h2>
            <p>Two quick steps, then we hand off to your identity provider.</p>
          </div>
        </div>

        <div className="auth-steps" aria-label="Signup progress">
          {STEPS.map((label, index) => (
            <div key={label} className={`auth-step${index === step ? " active" : ""}${index < step ? " done" : ""}`}>
              <span>{index + 1}</span>
              <b>{label}</b>
            </div>
          ))}
        </div>

        <form onSubmit={next}>
          {step === 0 ? (
            <div className="auth-step-panel">
              <label className="auth-field">
                <Mail size={14} aria-hidden />
                Work email
                <input
                  required
                  type="email"
                  autoComplete="email"
                  placeholder="name@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              <label className="auth-field">
                <Building2 size={14} aria-hidden />
                Company
                <input
                  required
                  autoComplete="organization"
                  placeholder="Broker / fund / ops team"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                />
              </label>
            </div>
          ) : (
            <div className="auth-step-panel">
              <label className="auth-field">
                Full name
                <input
                  required
                  autoComplete="name"
                  placeholder="Your full name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <label className="check auth-check">
                <input required type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
                I agree to the <a href="#terms">Terms</a> and <a href="#privacy">Privacy Policy</a>
              </label>
              <div className="auth-perks inline">
                <div><CheckCircle2 size={14} /><b>Live orders</b><span>Journal &amp; ELK evidence</span></div>
                <div><CheckCircle2 size={14} /><b>Rejection RCA</b><span>Traceable reasons</span></div>
                <div><CheckCircle2 size={14} /><b>Exchange health</b><span>Connectivity signals</span></div>
              </div>
            </div>
          )}

          <div className="auth-actions">
            {step > 0 && (
              <button type="button" className="secondary" onClick={() => setStep(0)} disabled={busy}>
                Back
              </button>
            )}
            <button type="submit" className="primary auth-cta" disabled={busy || (step === 1 && !agreed)}>
              {busy ? "Redirecting…" : step === 0 ? "Continue" : "Create account"}
              {!busy && <ArrowRight size={16} />}
            </button>
          </div>
        </form>

        <p className="auth-foot">
          Already have an account? <Link href="/signin">Sign in</Link>
        </p>
      </div>
    </AuthShell>
  );
}
