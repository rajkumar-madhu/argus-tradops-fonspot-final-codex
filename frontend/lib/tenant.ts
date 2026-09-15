/**
 * Tenant selection, shared by server components, route handlers and the browser.
 * Kept free of "use client" and next/* imports so node --test can load it.
 *
 * The API reads the tenant from the `X-TradeOps-Tenant` header, then the `tenant`
 * query parameter (EventSource), then the `tradeops_tenant` cookie; with none it
 * uses "default". Must match TENANT_HEADER / TENANT_COOKIE in backend/app/tenancy.py.
 */
export const TENANT_COOKIE = 'tradeops_tenant';
export const TENANT_HEADER = 'X-TradeOps-Tenant';

const SLUG = /^[a-z0-9][a-z0-9-]{0,62}$/;

export function normalizeTenant(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim().toLowerCase();
  return SLUG.test(v) ? v : null;
}

/** Header to forward; empty when there is no valid selection (the API then uses "default"). */
export function tenantHeaders(value: unknown): Record<string, string> {
  const id = normalizeTenant(value);
  return id ? { [TENANT_HEADER]: id } : {};
}

export function readTenantCookie(cookieString: string | undefined | null): string | null {
  const hit = (cookieString || '').split('; ').find((c) => c.startsWith(`${TENANT_COOKIE}=`));
  return hit ? normalizeTenant(decodeURIComponent(hit.slice(TENANT_COOKIE.length + 1))) : null;
}

export function tenantCookie(id: string, secure: boolean): string {
  const safe = normalizeTenant(id);
  if (!safe) throw new Error('invalid tenant id');
  return `${TENANT_COOKIE}=${safe}; Path=/; Max-Age=31536000; SameSite=Lax${secure ? '; Secure' : ''}`;
}

export type TenantItem = {
  id: string;
  name: string;
  is_default: boolean;
  journal_primary?: boolean;
  sources?: { elasticsearch: boolean; journal: boolean };
};
export type TenantsPayload = {
  multi_tenant?: boolean;
  current?: string | null;
  items?: TenantItem[];
};

/** First granted client that reads Elasticsearch rather than a journal file. */
export function liveTenantId(items: TenantItem[]): string | null {
  const live = items.find(
    (t) => normalizeTenant(t?.id) && t.sources?.elasticsearch && t.journal_primary !== true,
  );
  return live?.id ?? null;
}

/**
 * What the switcher should do with GET /api/tenants.
 *
 * The API cannot pick a user's tenant on its own (it only knows "default" when
 * nothing is requested), so a user granted only `acme` would see 403 on first
 * load. `adopt` tells the browser to store the tenant the API reports as current
 * and reload once; it is only set when that differs from the cookie, so it cannot loop.
 *
 * When there is no valid cookie yet (first visit, or a stale id), prefer a live
 * Elasticsearch client over a journal-primary default so Live Orders is not a
 * historical file. An explicit cookie for the journal client is left alone.
 */
export function switcherModel(payload: TenantsPayload | null | undefined, cookie: string | null) {
  const items = Array.isArray(payload?.items)
    ? payload!.items.filter((t) => normalizeTenant(t?.id))
    : [];
  const multi = !!payload?.multi_tenant;
  const current = normalizeTenant(payload?.current) ?? null;
  const cookieOk = !!normalizeTenant(cookie) && items.some((t) => t.id === cookie);
  const preferred = !cookieOk ? liveTenantId(items) : null;
  const adoptTo = cookieOk ? null : preferred || current;
  return {
    show: multi && items.length > 1,
    noAccess: multi && items.length === 0,
    current: cookieOk ? cookie : preferred || current,
    items,
    adopt: multi && adoptTo !== null && cookie !== adoptTo ? adoptTo : null,
  };
}
