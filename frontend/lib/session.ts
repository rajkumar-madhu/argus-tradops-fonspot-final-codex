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
import { readTenantCookie, tenantCookie, tenantHeaders } from "@/lib/tenant";

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
  // Browsers silently reject blocked or oversized cookies. Never call that a
  // successful login: SSR would immediately request data without a token.
  if (getToken() !== token) {
    clearToken();
    throw new Error("Your session could not be saved. Allow cookies for this site and restart sign-in. If this continues, ask an administrator to check the token size.");
  }
}

export function getToken(): string | null {
  if (typeof document === "undefined") return null;
  const hit = document.cookie.split("; ").find((c) => c.startsWith(`${TOKEN_COOKIE}=`));
  try { return hit ? decodeURIComponent(hit.slice(TOKEN_COOKIE.length + 1)) : null; }
  catch { return null; }
}

export function clearToken(): void {
  if (typeof document === "undefined") return;
  document.cookie = `${TOKEN_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${isSecureContext() ? '; Secure' : ''}`;
}

function tokenClaims(token: string | null): any {
  if (!token) return null;
  try {
    const [, payload] = token.split(".");
    if (!payload) return null;
    return JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
  } catch {
    return null;
  }
}

const CLOCK_SKEW_KEY = "tradeops.clock_skew_ms";

/**
 * `exp` is written by the identity provider's clock, so comparing it with this
 * browser's clock logs a user out early (or keeps them late) by however far the
 * two disagree. Call this once the API has accepted a freshly issued token: its
 * `iat` is then "now" on the IdP clock, and the difference is the local offset.
 */
export function recordClockSkew(token: string): void {
  const iat = Number(tokenClaims(token)?.iat);
  try {
    if (Number.isFinite(iat) && iat > 0) localStorage.setItem(CLOCK_SKEW_KEY, String(Date.now() - iat * 1000));
    else localStorage.removeItem(CLOCK_SKEW_KEY);
  } catch { /* storage blocked: fall back to the unadjusted local clock */ }
}

function clockSkewMs(): number {
  try {
    const skew = Number(localStorage.getItem(CLOCK_SKEW_KEY));
    return Number.isFinite(skew) ? skew : 0;
  } catch {
    return 0;
  }
}

/**
 * Decodes claims for display/nav only. The backend is what actually verifies the signature.
 * `expiresAt` is on the local clock (adjusted by `recordClockSkew`), so it can be compared
 * with `Date.now()` directly.
 */
export function decodeSession(token: string | null): SessionUser | null {
  const json = tokenClaims(token);
  if (!json || typeof json !== "object") return null;
  const exp = Number(json.exp || 0);
  return {
    sub: json.sub,
    username: json.preferred_username,
    email: json.email,
    roles: tokenRoles(json),
    expiresAt: Number.isFinite(exp) && exp > 0 ? exp * 1000 + clockSkewMs() : 0,
  };
}

export function isExpired(session: SessionUser | null): boolean {
  return !session || !session.expiresAt || session.expiresAt <= Date.now();
}

export function authHeaders(): Record<string, string> {
  const token = getToken();
  return { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...tenantHeaders(getTenant()) };
}

export function getTenant(): string | null {
  return typeof document === "undefined" ? null : readTenantCookie(document.cookie);
}

/** Select a tenant for this browser. Callers reload so server components refetch. */
export function setTenant(id: string): void {
  if (typeof document === "undefined") return;
  document.cookie = tenantCookie(id, isSecureContext());
}
