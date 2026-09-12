import { cookies } from "next/headers";
import { TOKEN_COOKIE } from "@/lib/session-shared";
import { serverRuntimeConfig } from "@/lib/runtime";

import { forbiddenDetail, type ForbiddenDetail } from "@/lib/api-result";
export { apiError } from "@/lib/api-result";

export type ApiResult<T> = T & { _error?: string; _status?: number; _forbidden?: ForbiddenDetail };

/**
 * Server-component fetch helper.
 *
 * Never throws: pages render an <EmptyState> from `_error` instead of crashing the
 * route. `_status` is surfaced so a page can distinguish "not signed in" (401/403)
 * from a genuine backend failure.
 */
export async function getJSON<T>(path: string): Promise<ApiResult<T>> {
  const { apiUrl } = serverRuntimeConfig();
  const serverApiUrl = process.env.INTERNAL_API_URL || apiUrl;
  try {
    const token = (await cookies()).get(TOKEN_COOKIE)?.value;
    const res = await fetch(`${serverApiUrl}${path}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    if (!res.ok) {
      const hint =
        res.status === 401
          ? "Not signed in"
          : res.status === 403
            ? "Your role does not grant access to this view"
            : `API ${res.status}`;
      const _forbidden = res.status === 403 ? forbiddenDetail(await res.json().catch(() => null)) : undefined;
      return { _error: `${hint} (${path})`, _status: res.status, ...(_forbidden && { _forbidden }) } as ApiResult<T>;
    }
    return res.json();
  } catch (err) {
    return { _error: err instanceof Error ? err.message : "Network error" } as ApiResult<T>;
  }
}

export function isAuthError(data: { _status?: number } | null | undefined): boolean {
  return data?._status === 401 || data?._status === 403;
}
