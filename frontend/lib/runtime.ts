/**
 * Runtime configuration.
 *
 * `NEXT_PUBLIC_*` values are inlined into the bundle at *build* time, so a single
 * image cannot be pointed at a different API per environment — a pod env var
 * named NEXT_PUBLIC_API_URL is read by nobody and the deployed UI keeps calling
 * whatever host was set when `next build` ran (localhost, by default).
 *
 * Instead the server reads `API_URL` at request time and the root layout serialises
 * it into `window.__TRADEOPS_CONFIG__`. NEXT_PUBLIC_* is kept only as a fallback so
 * local `npm run dev` keeps working from .env.local.
 */

export type RuntimeConfig = {
  apiUrl: string;
};

export const DEFAULT_API_URL = "http://localhost:8001";

declare global {
  interface Window {
    __TRADEOPS_CONFIG__?: RuntimeConfig;
  }
}

/** Server-side only: reads the pod/process environment on every request. */
export function serverRuntimeConfig(): RuntimeConfig {
  return {
    apiUrl: process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || DEFAULT_API_URL,
  };
}

/** Browser-side: prefers the value injected by the server over the build-time constant. */
export function apiUrl(): string {
  if (typeof window !== "undefined" && window.__TRADEOPS_CONFIG__?.apiUrl) {
    return window.__TRADEOPS_CONFIG__.apiUrl;
  }
  return process.env.NEXT_PUBLIC_API_URL || DEFAULT_API_URL;
}
