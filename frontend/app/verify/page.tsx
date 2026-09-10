"use client";

import Link from "next/link";
import { useRef } from "react";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import AuthModeTabs from "@/components/AuthModeTabs";
import AuthShell from "@/components/AuthShell";

export default function Verify() {
  const inputs = useRef<Array<HTMLInputElement | null>>([]);

  function handleInput(index: number, value: string) {
    const digit = value.replace(/\D/g, "").slice(-1);
    const input = inputs.current[index];
    if (!input) return;
    input.value = digit;
    if (digit && index < 5) inputs.current[index + 1]?.focus();
  }

  function handleKeyDown(index: number, key: string) {
    if (key === "Backspace" && !inputs.current[index]?.value && index > 0) {
      inputs.current[index - 1]?.focus();
    }
  }

  return (
    <AuthShell title="Verify your account" subtitle="Complete secure verification to activate your workspace.">
      <div className="auth-card auth-card-v2 compact">
        <AuthModeTabs active="signup" />
        <div className="auth-card-head">
          <span className="auth-icon"><ShieldCheck size={22} /></span>
          <div>
            <h2>Enter verification code</h2>
            <p>We sent a 6-digit code to your work email. It expires in 10 minutes.</p>
          </div>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            window.location.href = "/dashboard";
          }}
        >
          <div className="otp">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <input
                key={i}
                ref={(el) => {
                  inputs.current[i] = el;
                }}
                inputMode="numeric"
                maxLength={1}
                aria-label={`Digit ${i + 1}`}
                onChange={(e) => handleInput(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e.key)}
              />
            ))}
          </div>
          <button type="submit" className="primary auth-cta">Verify &amp; continue</button>
        </form>
        <button type="button" className="linkbtn">Resend code</button>
        <p className="auth-foot">
          <Link href="/signin"><ArrowLeft size={14} /> Back to sign in</Link>
        </p>
      </div>
    </AuthShell>
  );
}
