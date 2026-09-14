// Pure helpers for the tenant admin page (components/TenantAdmin.tsx).

export type AdminTenant = {
  id: string;
  name: string;
  builtin?: boolean;
  is_default?: boolean;
  sources?: { elasticsearch: boolean; journal: boolean };
  es_url?: string | null;
  credentials_ref?: string | null;
  credentials_present?: boolean;
  journal_path?: string | null;
  journal_available?: boolean;
  enabled: boolean;
  grants?: number | null;
};

export type TenantDraft = { id: string; name: string; es_url: string; credentials_ref: string; journal_path: string; es_verify_certs: boolean };

/** Trimmed payload; empty optional fields are omitted rather than sent as "". */
export function draftPayload(d: TenantDraft) {
  const out: Record<string, unknown> = { id: d.id.trim().toLowerCase(), name: d.name.trim(), es_verify_certs: d.es_verify_certs };
  for (const k of ["es_url", "credentials_ref", "journal_path"] as const) {
    const v = d[k].trim();
    if (v) out[k] = k === "credentials_ref" ? v.toLowerCase() : v;
  }
  return out;
}

/** An operator-readable message for an admin API failure. Never echoes a URL back. */
export function adminErrorText(status: number, body: any): string {
  const detail = body?.detail;
  if (status === 401) return "Your session has expired. Sign in again.";
  if (status === 403) return "Only super_admin can manage clients.";
  if (detail && typeof detail === "object" && Array.isArray(detail.errors) && detail.errors.length) return detail.errors.join("; ");
  if (typeof detail === "string" && detail) return detail;
  return `The API returned ${status}.`;
}
