export function apiError(data: { _error?: string } | null | undefined): string | null {
  return data?._error || null;
}

export type ApiErrorGuidance = { kind: "signed-out" | "forbidden" | "failed"; body: string };

/**
 * What an operator should do about a failed read. Signed-out and missing-role are
 * the common cases in a deployed environment; "check the API on port 8001" was only
 * ever true on a developer laptop and sent signed-out users hunting for an outage.
 */
export function apiErrorGuidance(data: { _error?: string; _status?: number } | null | undefined): ApiErrorGuidance | null {
  const error = apiError(data);
  if (!error) return null;
  if (data?._status === 401) {
    return { kind: "signed-out", body: "You're signed out. Sign in to load this view." };
  }
  if (data?._status === 403) {
    return {
      kind: "forbidden",
      body: "Your account's role doesn't include this view. Ask a Keycloak admin to assign trading_ops or auditor.",
    };
  }
  return { kind: "failed", body: `${error}. The API could not return data; retry shortly, and check the backend service if it persists.` };
}
