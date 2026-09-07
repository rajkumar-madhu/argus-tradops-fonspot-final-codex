"use client";

import { apiUrl } from "@/lib/runtime";
import { getToken } from "@/lib/session";

export type StreamKind = "orders" | "rejections" | "exchange" | "market";

/**
 * Open an authenticated SSE connection to the API.
 *
 * EventSource cannot set Authorization headers. The access token is therefore
 * passed as `access_token` (backend accepts cookie + query param). Cookies are
 * only sent cross-origin when the API shares the site; for localhost:3000 →
 * localhost:8001 the query param is what actually authenticates the stream.
 */
export function openAuthenticatedEventSource(
  kind: StreamKind,
  params: Record<string, string | number> = {},
): EventSource {
  const url = new URL(`${apiUrl()}/api/stream/${kind}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }
  const token = getToken();
  if (token) url.searchParams.set("access_token", token);
  return new EventSource(url.toString(), { withCredentials: true });
}
