export function apiError(data: { _error?: string } | null | undefined): string | null {
  return data?._error || null;
}

export type ApiErrorGuidance = { kind: "signed-out" | "forbidden" | "failed"; body: string };

/** The API's 403 detail (`auth.forbidden_detail`): what a Keycloak admin needs to grant. */
export type ForbiddenDetail = { permission: string; granted_by: string[]; app_roles: string[]; client_id: string };

const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string");

/** Reads a 403 response body. An older API sends `detail: "Insufficient permission"`, which yields nothing. */
export function forbiddenDetail(body: unknown): ForbiddenDetail | undefined {
  const d = (body as { detail?: any } | null)?.detail;
  if (!d || typeof d !== "object") return undefined;
  if (typeof d.permission !== "string" || typeof d.client_id !== "string" || !strings(d.granted_by) || !strings(d.app_roles)) return undefined;
  return { permission: d.permission, granted_by: d.granted_by, app_roles: d.app_roles, client_id: d.client_id };
}

const orList = (items: string[]) => (items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} or ${items[items.length - 1]}`);

function forbiddenBody(f: ForbiddenDetail): string {
  const held = f.app_roles.length
    ? `Your token has ${f.app_roles.join(", ")}, which doesn't include it.`
    : "Your token carries no TradeOps role.";
  return `This view needs ${f.permission}, granted by ${orList(f.granted_by)}. ${held} Ask a Keycloak admin to assign one as a ${f.client_id} client role, then sign in again.`;
}

/**
 * What an operator should do about a failed read. Signed-out and missing-role are
 * the common cases in a deployed environment; "check the API on port 8001" was only
 * ever true on a developer laptop and sent signed-out users hunting for an outage.
 */
export function apiErrorGuidance(data: { _error?: string; _status?: number; _forbidden?: ForbiddenDetail } | null | undefined): ApiErrorGuidance | null {
  const error = apiError(data);
  if (!error) return null;
  if (data?._status === 401) {
    return { kind: "signed-out", body: "You're signed out. Sign in to load this view." };
  }
  if (data?._status === 403) {
    if (data._forbidden) return { kind: "forbidden", body: forbiddenBody(data._forbidden) };
    return {
      kind: "forbidden",
      body: "Your account's role doesn't include this view. Ask a Keycloak admin to assign trading_ops or auditor.",
    };
  }
  return { kind: "failed", body: `${error}. The API could not return data; retry shortly, and check the backend service if it persists.` };
}
