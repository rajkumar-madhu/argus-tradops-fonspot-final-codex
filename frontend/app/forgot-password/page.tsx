"use client";

import Link from "next/link";
import { ArrowLeft, Mail } from "lucide-react";
import AuthModeTabs from "@/components/AuthModeTabs";
import AuthShell from "@/components/AuthShell";

export default function Forgot() {
  return (
    <AuthShell title="Recover access" subtitle="Reset access through your verified enterprise identity.">
      <div className="auth-card auth-card-v2 compact">
        <AuthModeTabs active="signin" />
        <div className="auth-card-head">
          <span className="auth-icon"><Mail size={22} /></span>
          <div>
            <h2>Forgot password?</h2>
            <p>Enter your work email and we&apos;ll start the recovery flow with your identity provider.</p>
          </div>
        </div>
        <form onSubmit={(e) => e.preventDefault()}>
          <label className="auth-field">
            Work email
            <input required type="email" placeholder="name@company.com" autoComplete="email" />
          </label>
          <button type="submit" className="primary auth-cta">Send reset link</button>
        </form>
        <p className="auth-foot">
          <Link href="/signin"><ArrowLeft size={14} /> Back to sign in</Link>
        </p>
      </div>
    </AuthShell>
  );
}
