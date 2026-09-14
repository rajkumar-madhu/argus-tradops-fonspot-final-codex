"use client";

import { useEffect, useState } from "react";
import { Building2 } from "lucide-react";
import { apiUrl } from "@/lib/runtime";
import { authHeaders, getTenant, setTenant } from "@/lib/session";
import { switcherModel, type TenantItem } from "@/lib/tenant";

/**
 * Tenant picker in the top bar. Renders nothing on a single-tenant deployment.
 *
 * On first load it adopts the tenant the API reports as current (see
 * `switcherModel`), because the API alone can only fall back to "default".
 * Switching sets the cookie and reloads: server components fetched with the old
 * tenant must not stay on screen next to the new selection.
 */
export default function TenantSwitcher() {
  const [items, setItems] = useState<TenantItem[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const [show, setShow] = useState(false);
  const [noAccess, setNoAccess] = useState(false);

  useEffect(() => {
    const abort = new AbortController();
    (async () => {
      try {
        const res = await fetch(`${apiUrl()}/api/tenants`, { headers: authHeaders(), credentials: "include", cache: "no-store", signal: abort.signal });
        if (!res.ok) return;
        const model = switcherModel(await res.json(), getTenant());
        if (model.adopt) {
          setTenant(model.adopt);
          window.location.reload();
          return;
        }
        setItems(model.items);
        setCurrent(model.current);
        setShow(model.show);
        setNoAccess(model.noAccess);
      } catch {
        /* no switcher is the safe failure: the API still enforces access */
      }
    })();
    return () => abort.abort();
  }, []);

  if (noAccess) return <span className="tn-switch tn-none" role="status">No client access</span>;
  if (!show) return null;
  return (
    <label className="tn-switch" title="Client whose data this console shows">
      <Building2 size={14} aria-hidden="true" />
      <span className="sr-only">Client</span>
      <select
        value={current ?? ""}
        onChange={(e) => {
          setTenant(e.target.value);
          window.location.reload();
        }}
        aria-label="Select client"
      >
        {items.map((t) => (
          <option key={t.id} value={t.id}>{t.name}</option>
        ))}
      </select>
    </label>
  );
}
