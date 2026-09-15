"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import AuthShell from "@/components/AuthShell";
import { completeLogin } from "@/lib/oidc";

export default function Callback() {
  const [error, setError] = useState<string | null>(null);
  const completion = useRef<Promise<string> | null>(null);

  useEffect(() => {
    // React Strict Mode replays effects in development. Authorization codes
    // are single-use, so both effect subscriptions must share one exchange.
    completion.current ??= completeLogin(new URLSearchParams(window.location.search));
    completion.current
      .then((returnTo) => {
        // Full navigation, not router.push: server components must re-render with
        // the freshly set cookie.
        window.location.replace(returnTo);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Sign-in failed"));
  }, []);

  return (
    <AuthShell
      title={error ? "Sign-in failed" : "Completing sign-in…"}
      subtitle={error ? "The authorization code could not be exchanged." : "Exchanging your authorization code with Keycloak."}
    >
      <div className="auth-card">
        {error ? (
          <>
            <h2>Something went wrong</h2>
            <p>{error}</p>
            <Link className="primary" href="/signin">Back to sign in</Link>
          </>
        ) : (
          <>
            <h2>Just a moment</h2>
            <p>Verifying your session…</p>
          </>
        )}
      </div>
    </AuthShell>
  );
}
