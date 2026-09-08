"use client";

import Link from "next/link";

export default function AuthModeTabs({ active }: { active: "signin" | "signup" }) {
  return (
    <nav className="auth-mode-tabs" aria-label="Authentication mode">
      <Link href="/signin" className={active === "signin" ? "active" : undefined} aria-current={active === "signin" ? "page" : undefined}>
        Sign in
      </Link>
      <Link href="/signup" className={active === "signup" ? "active" : undefined} aria-current={active === "signup" ? "page" : undefined}>
        Create account
      </Link>
    </nav>
  );
}
