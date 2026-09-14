"use client";

import { useCallback, useEffect, useState } from "react";
import { apiUrl } from "@/lib/runtime";
import { authHeaders } from "@/lib/session";
import { adminErrorText, type AdminTenant, type TenantDraft, draftPayload } from "@/lib/tenant-admin";

type TestResult = {
  elasticsearch: null | { connected?: boolean; cluster?: string; version?: string; credentials_present?: boolean; error?: string };
  journal: null | { readable: boolean };
};

const EMPTY: TenantDraft = { id: "", name: "", es_url: "", credentials_ref: "", journal_path: "", es_verify_certs: true };

async function call(method: string, path: string, body?: unknown) {
  const res = await fetch(`${apiUrl()}${path}`, {
    method,
    credentials: "include",
    cache: "no-store",
    headers: { ...authHeaders(), ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(adminErrorText(res.status, data));
  return data;
}

/**
 * Tenant onboarding for super_admin. A tenant is a data source (Elasticsearch
 * and/or a journal file) plus the users granted to it. Credentials are never
 * entered here: the form takes a reference to a key file in the mounted secret.
 */
export default function TenantAdmin() {
  const [items, setItems] = useState<AdminTenant[]>([]);
  const [multi, setMulti] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<TenantDraft>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [tests, setTests] = useState<Record<string, TestResult | string>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [grants, setGrants] = useState<string[]>([]);
  const [principal, setPrincipal] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await call("GET", "/api/admin/tenants");
      setItems(data.items || []);
      setMulti(!!data.multi_tenant);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    setBusy(true);
    try {
      await call("POST", "/api/admin/tenants", draftPayload(draft));
      setDraft(EMPTY);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const test = async (id: string) => {
    setTests((t) => ({ ...t, [id]: "Testing…" }));
    try {
      const result = await call("POST", `/api/admin/tenants/${encodeURIComponent(id)}/test`);
      setTests((t) => ({ ...t, [id]: result }));
    } catch (e) {
      setTests((t) => ({ ...t, [id]: (e as Error).message }));
    }
  };

  const toggle = async (t: AdminTenant) => {
    try {
      await call("PATCH", `/api/admin/tenants/${encodeURIComponent(t.id)}`, { enabled: !t.enabled });
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const openGrants = async (id: string) => {
    if (open === id) { setOpen(null); return; }
    setOpen(id);
    setGrants([]);
    try {
      setGrants((await call("GET", `/api/admin/tenants/${encodeURIComponent(id)}/grants`)).principals || []);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const addGrant = async (id: string) => {
    if (!principal.trim()) return;
    try {
      setGrants((await call("PUT", `/api/admin/tenants/${encodeURIComponent(id)}/grants`, { principal })).principals || []);
      setPrincipal("");
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const removeGrant = async (id: string, p: string) => {
    try {
      setGrants((await call("DELETE", `/api/admin/tenants/${encodeURIComponent(id)}/grants/${encodeURIComponent(p)}`)).principals || []);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const field = (key: keyof TenantDraft, label: string, placeholder: string, hint?: string) => (
    <label className="tn-field">
      <span>{label}</span>
      <input value={String(draft[key])} placeholder={placeholder} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} autoComplete="off" spellCheck={false} />
      {hint && <small>{hint}</small>}
    </label>
  );

  return (
    <>
      <section className="dashboard-head overview-head">
        <div>
          <h1>Clients</h1>
          <p>Tenants whose Elasticsearch or journal this console reads, and who may see each one</p>
        </div>
      </section>

      {error && <div className="notice-strip" role="alert"><b>Could not complete that.</b> {error}</div>}
      {multi === false && (
        <div className="notice-strip"><b>Multi-tenancy is off.</b> This deployment serves one client from its environment settings. Set <code>TRADEOPS_MULTI_TENANT=true</code> (with demo mode off) and restart the API to add clients.</div>
      )}

      <section className="panel">
        <div className="panel-head"><b>Clients ({items.length})</b></div>
        <div className="table-scroll">
          <table className="orders-table compact">
            <thead><tr><th>Client</th><th>Elasticsearch</th><th>Credentials</th><th>Journal</th><th className="num">Users</th><th>Status</th><th /></tr></thead>
            <tbody>
              {items.map((t) => {
                const result = tests[t.id];
                return (
                  <tr key={t.id}>
                    <td><b>{t.name}</b><div className="tn-muted mono">{t.id}{t.builtin ? " · built-in" : ""}</div></td>
                    <td className="mono">{t.es_url || (t.sources?.elasticsearch ? "environment" : "—")}</td>
                    <td>{t.builtin ? "environment" : t.credentials_ref ? <span className={t.credentials_present ? "tn-ok" : "tn-warn"}>{t.credentials_ref}{t.credentials_present ? "" : " · file missing"}</span> : "—"}</td>
                    <td>{t.builtin ? (t.sources?.journal ? "environment" : "—") : t.journal_path ? <span className={t.journal_available ? "tn-ok" : "tn-warn"}>{t.journal_path}</span> : "—"}</td>
                    <td className="num">{t.grants ?? "—"}</td>
                    <td>{t.enabled ? "Enabled" : "Disabled"}</td>
                    <td className="tn-actions">
                      {multi && <button type="button" className="link-btn" onClick={() => openGrants(t.id)} aria-expanded={open === t.id}>Users</button>}
                      {!t.builtin && t.enabled && <button type="button" className="link-btn" onClick={() => test(t.id)}>Test</button>}
                      {!t.builtin && <button type="button" className="link-btn" onClick={() => toggle(t)}>{t.enabled ? "Disable" : "Enable"}</button>}
                      {result && <div className="tn-result" role="status">{typeof result === "string" ? result : testSummary(result)}</div>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {open && (
          <div className="tn-grants">
            <b>Users with access to {items.find((t) => t.id === open)?.name}</b>
            <p className="tn-muted">Keycloak username, email or subject id. super_admin sees every client without a grant.</p>
            <ul>
              {grants.length === 0 && <li className="tn-muted">No users granted yet.</li>}
              {grants.map((p) => (
                <li key={p}><span className="mono">{p}</span><button type="button" className="link-btn" onClick={() => removeGrant(open, p)}>Remove</button></li>
              ))}
            </ul>
            <div className="tn-row">
              <input value={principal} onChange={(e) => setPrincipal(e.target.value)} placeholder="user@finspot.in" aria-label="User to grant" autoComplete="off" />
              <button type="button" className="link-btn" onClick={() => addGrant(open)}>Grant access</button>
            </div>
          </div>
        )}
      </section>

      {multi && (
        <section className="panel">
          <div className="panel-head"><b>Add a client</b></div>
          <div className="tn-form">
            {field("id", "Client id", "acme-broking", "Lower-case letters, digits and hyphens. Cannot change later.")}
            {field("name", "Display name", "Acme Broking")}
            {field("es_url", "Elasticsearch URL", "https://es.acme.example:9200", "No username or password in the URL.")}
            {field("credentials_ref", "Credentials reference", "acme-broking", "Name of the key file in the tenant secret, e.g. acme-broking.es_api_key. Use a read-only API key.")}
            {field("journal_path", "Journal file (optional)", "acme-broking/Journal.log", "Relative to the tenant journal directory.")}
            <label className="tn-check">
              <input type="checkbox" checked={draft.es_verify_certs} onChange={(e) => setDraft({ ...draft, es_verify_certs: e.target.checked })} />
              <span>Verify TLS certificates</span>
            </label>
            <div className="tn-row">
              <button type="button" className="link-btn" onClick={create} disabled={busy || !draft.id || !draft.name}>{busy ? "Saving…" : "Add client"}</button>
            </div>
          </div>
          <p className="tn-muted tn-pad">
            Credentials are never typed into this page. Add the key to the tenant secret, for example
            <code> kubectl -n &lt;namespace&gt; create secret generic tradeops-tenant-credentials --from-file=acme-broking.es_api_key=./key</code>,
            mounted at <code>TRADEOPS_TENANT_SECRETS_DIR</code>. Live streams, persisted incidents and CSV analytics stay with the built-in client for now.
          </p>
        </section>
      )}
    </>
  );
}

function testSummary(r: TestResult): string {
  const parts: string[] = [];
  if (r.elasticsearch) {
    parts.push(r.elasticsearch.connected ? `ES connected${r.elasticsearch.cluster ? ` · ${r.elasticsearch.cluster}` : ""}${r.elasticsearch.version ? ` ${r.elasticsearch.version}` : ""}` : `ES unavailable${r.elasticsearch.credentials_present === false ? " · no credentials file" : ""}`);
  }
  if (r.journal) parts.push(r.journal.readable ? "Journal readable" : "Journal not found");
  return parts.join(" · ") || "Nothing configured";
}
