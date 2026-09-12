/**
 * Values shared between the server (`lib/api.ts`) and the browser (`lib/session.ts`).
 * Kept free of a "use client" directive so server components can import it.
 * Must match `TOKEN_COOKIE` in backend/app/auth.py.
 */
export const TOKEN_COOKIE = "tradeops_token";

/**
 * Roles as the backend counts them (`auth._roles`): realm roles plus roles on the client
 * that requested the token (`azp`, which is `tradeops-web`). Roles on other clients in a
 * shared realm are ignored there, so the rail must ignore them too.
 */
export function tokenRoles(claims: any): string[] {
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  const realm = list(claims?.realm_access?.roles);
  const client = typeof claims?.azp === "string" ? list(claims?.resource_access?.[claims.azp]?.roles) : [];
  return Array.from(new Set([...realm, ...client]));
}
