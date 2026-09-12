"use client";

/**
 * Keycloak Authorization Code flow with PKCE, for a public client.
 *
 * Requires the Keycloak client (`KEYCLOAK_CLIENT_ID`, default `tradeops-web`) to be
 * configured as: Client authentication OFF (public), Standard flow ON,
 * "Proof Key for Code Exchange Code Challenge Method" = S256, and a valid
 * redirect URI of `<web-origin>/auth/callback`.
 */

import { apiUrl } from "@/lib/runtime";
import { clearToken, setToken } from "@/lib/session";
import { keycloakRegistrationUrl } from "@/lib/oidc-registration";
import { authorizeParams, tokenErrorMessage } from "@/lib/oidc-flow";

export type AuthConfig = {
  auth_disabled: boolean;
  registration_allowed?: boolean;
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  end_session_endpoint: string;
  client_id: string;
};

const VERIFIER_KEY = "tradeops.pkce.verifier";
const RETURN_KEY = "tradeops.pkce.return";

export function redirectUri(): string {
  return `${window.location.origin}/auth/callback`;
}

/** The backend owns the Keycloak settings; the browser bootstraps them from there. */
export async function fetchAuthConfig(): Promise<AuthConfig> {
  const res = await fetch(`${apiUrl()}/api/auth/config`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Auth config unavailable (HTTP ${res.status})`);
  return res.json();
}

function randomString(bytes = 32): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return base64Url(buf);
}

function base64Url(bytes: Uint8Array | ArrayBuffer): string {
  const view = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes;
  let binary = "";
  view.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function challengeFor(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64Url(digest);
}

/** Kicks off login. Sends the browser to Keycloak; never returns. `loginHint` pre-fills the username. */
export async function login(returnTo = "/dashboard", loginHint?: string): Promise<void> {
  const cfg = await fetchAuthConfig();
  if (cfg.auth_disabled) {
    window.location.href = returnTo;
    return;
  }
  const verifier = randomString();
  const state = randomString(16);
  sessionStorage.setItem(VERIFIER_KEY, verifier);
  sessionStorage.setItem(RETURN_KEY, returnTo);
  sessionStorage.setItem(`${VERIFIER_KEY}.state`, state);

  const params = authorizeParams({
    clientId: cfg.client_id,
    redirectUri: redirectUri(),
    state,
    challenge: await challengeFor(verifier),
    loginHint,
  });
  window.location.href = `${cfg.authorization_endpoint}?${params.toString()}`;
}

/** Completes login on /auth/callback. Returns where the user should land. */
export async function completeLogin(search: URLSearchParams): Promise<string> {
  const error = search.get("error");
  if (error) throw new Error(search.get("error_description") || error);

  const code = search.get("code");
  if (!code) throw new Error("Authorization code missing from callback");

  const expectedState = sessionStorage.getItem(`${VERIFIER_KEY}.state`);
  if (expectedState && search.get("state") !== expectedState) {
    throw new Error("State mismatch — possible cross-site request forgery");
  }
  const verifier = sessionStorage.getItem(VERIFIER_KEY);
  if (!verifier) throw new Error("PKCE verifier missing — restart sign-in");

  const cfg = await fetchAuthConfig();
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: cfg.client_id,
    redirect_uri: redirectUri(),
    code,
    code_verifier: verifier,
  });
  const res = await fetch(cfg.token_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(tokenErrorMessage(res.status, await res.text().catch(() => ""), cfg.client_id));
  const token = await res.json();
  if (!token.access_token) throw new Error("Token endpoint returned no access_token");

  setToken(token.access_token, Number(token.expires_in || 300));
  const returnTo = sessionStorage.getItem(RETURN_KEY) || "/dashboard";
  sessionStorage.removeItem(VERIFIER_KEY);
  sessionStorage.removeItem(RETURN_KEY);
  sessionStorage.removeItem(`${VERIFIER_KEY}.state`);
  return returnTo;
}

export async function logout(): Promise<void> {
  clearToken();
  try {
    const cfg = await fetchAuthConfig();
    if (!cfg.auth_disabled) {
      const params = new URLSearchParams({
        client_id: cfg.client_id,
        post_logout_redirect_uri: `${window.location.origin}/signin`,
      });
      window.location.href = `${cfg.end_session_endpoint}?${params.toString()}`;
      return;
    }
  } catch {
    // Fall through to a local sign-out if Keycloak is unreachable.
  }
  window.location.href = "/signin";
}

/**
 * Keycloak self-registration URL. Returns null unless the API says the realm
 * allows it — Devops-common-cicd does not, and hitting /registrations yields
 * Keycloak's "We are sorry... Registration not allowed" page.
 */
export function registrationUrl(cfg: AuthConfig, returnTo = "/dashboard"): string | null {
  return keycloakRegistrationUrl(cfg, window.location.origin, returnTo);
}
