"use client";

/**
 * Access-token storage for the browser.
 *
 * The token lives in a readable (non-HttpOnly) cookie rather than memory or
 * localStorage because it has to be visible in three places:
 *   - `fetch` from client components, as an Authorization header;
 *   - `EventSource`, which cannot set headers at all and only sends cookies;
 *   - server components, which read the same cookie via `next/headers`.
 *
 * The trade-off is that script on the page can read it, so treat XSS in this app
 * as token compromise. An HttpOnly cookie would need the Next.js server to proxy
 * every API call including SSE.
 */

export { TOKEN_COOKIE } from "@/lib/session-shared";
import { TOKEN_COOKIE, tokenRoles } from "@/lib/session-shared";

export type SessionUser = {
  sub?: string;
  username?: string;
  email?: string;
  roles: string[];
  expiresAt: number;
};

function isSecureContext(): boolean {
  return typeof window !== "undefined" && window.location.protocol === "https:";
}

export function setToken(token: string, expiresInSeconds: number): void {
  const maxAge = Math.max(0, Math.floor(expiresInSeconds));
  // SameSite=None is required when the API is on a different site than the UI,
  // which is the deployed topology; it is only honoured alongside Secure.
  const sameSite = isSecureContext() ? "None" : "Lax";
  const secure = isSecureContext() ? "; Secure" : "";
  document.cookie = `${TOKEN_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAge}; SameSite=${sameSite}${secure}`;
}

export function getToken(): string | null {
  if (typeof document === "undefined") return null;
  const hit = document.cookie.split("; ").find((c) => c.startsWith(`${TOKEN_COOKIE}=`));
  return hit ? decodeURIComponent(hit.slice(TOKEN_COOKIE.length + 1)) : null;
}

export function clearToken(): void {
  if (typeof document === "undefined") return;
  document.cookie = `${TOKEN_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}

/** Decodes claims for display/nav only. The backend is what actually verifies the signature. */
export function decodeSession(token: string | null): SessionUser | null {
  if (!token) return null;
  try {
    const [, payload] = token.split(".");
    if (!payload) return null;
    const json = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    return {
      sub: json.sub,
      username: json.preferred_username,
      email: json.email,
      roles: tokenRoles(json),
      expiresAt: Number(json.exp || 0) * 1000,
    };
  } catch {
    return null;
  }
}

export function isExpired(session: SessionUser | null): boolean {
  return !session || !session.expiresAt || session.expiresAt <= Date.now();
}

export function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
