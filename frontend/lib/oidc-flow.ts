/**
 * Pure pieces of the Keycloak PKCE flow, kept out of `oidc.ts` (which touches
 * window and sessionStorage) so they can be unit-tested.
 */

/** Email-shaped and short: anything else is dropped rather than sent to the IdP. */
const HINT = /^[^\s@]{1,64}@[^\s@]{1,190}$/;

/** Query for the authorization request. `loginHint` pre-fills Keycloak's username box. */
export function authorizeParams(opts: {
  clientId: string; redirectUri: string; state: string; challenge: string; loginHint?: string;
}): URLSearchParams {
  const params = new URLSearchParams({
    client_id: opts.clientId,
    redirect_uri: opts.redirectUri,
    response_type: "code",
    scope: "openid profile email",
    state: opts.state,
    code_challenge: opts.challenge,
    code_challenge_method: "S256",
  });
  const hint = (opts.loginHint ?? "").trim();
  if (HINT.test(hint)) params.set("login_hint", hint);
  return params;
}

/**
 * A readable reason for a failed code exchange. Keycloak explains itself in the
 * JSON body; a bare "HTTP 401" hides the one misconfiguration that causes it most.
 */
export function tokenErrorMessage(status: number, body: string, clientId: string): string {
  let error = "", description = "";
  try {
    const parsed = JSON.parse(body);
    error = String(parsed?.error ?? "");
    description = String(parsed?.error_description ?? "");
  } catch {
    // Not JSON (a proxy error page, an empty body): fall back to the status.
  }
  if (!error) return `Token exchange failed (HTTP ${status})`;
  const reason = description || error;
  if (error === "unauthorized_client") {
    return `Keycloak refused the client: ${reason}. The "${clientId}" client must be public ` +
      `(Client authentication OFF) because this browser app uses PKCE and holds no secret.`;
  }
  return `Keycloak rejected the sign-in: ${reason}`;
}
