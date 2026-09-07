/**
 * Values shared between the server (`lib/api.ts`) and the browser (`lib/session.ts`).
 * Kept free of a "use client" directive so server components can import it.
 * Must match `TOKEN_COOKIE` in backend/app/auth.py.
 */
export const TOKEN_COOKIE = "tradeops_token";
