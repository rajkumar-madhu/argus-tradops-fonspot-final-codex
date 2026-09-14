"""Tenant discovery and administration.

``GET /api/tenants`` lists what the caller may switch to. It takes ``current_user``
rather than ``require()`` so a stale tenant cookie cannot lock a user out of the
list they need to recover.

The ``/api/admin/tenants`` routes are super_admin only (``tenants:admin``, held via
the ``*`` wildcard). They write TradeOps' own tables -- never a client's cluster or
database -- and they never accept or return a credential: a tenant names a
``credentials_ref`` whose key files live in the mounted secret directory.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Body, Depends, HTTPException, Request
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError

from app import tenancy
from app.auth import current_user, require

LOG = logging.getLogger("tradeops.tenants")

router = APIRouter(tags=["Tenants"])
_admin = require(tenancy.ADMIN_PERMISSION, tenant_scoped=False)


def header_token_required(request: Request) -> None:
    """CSRF guard for admin writes.

    The API also accepts the token from the ``tradeops_token`` cookie, which is
    SameSite=None on HTTPS, so another site could otherwise make a signed-in
    admin's browser POST here. Browsers never attach an Authorization header or
    a JSON content type to a cross-site form, so requiring both closes that path.
    """
    from app.config import settings

    if settings.auth_disabled:
        return
    if not request.headers.get("authorization", "").lower().startswith("bearer "):
        raise HTTPException(403, "Admin changes require the Authorization header")
    if request.method in {"POST", "PUT", "PATCH"} and not request.headers.get("content-type", "").lower().startswith("application/json"):
        raise HTTPException(415, "Admin changes must be sent as application/json")


_admin_write = [Depends(header_token_required)]


def _audit(event: str, user: dict, **fields) -> None:
    # Principal ids only; never payload values that could hold a URL with secrets.
    LOG.info({"event": event, "by": user.get("preferred_username") or user.get("sub"), **fields})


@router.get("/api/tenants")
def my_tenants(user=Depends(current_user)):
    registry = tenancy.tenants()
    items = [registry[i].public() for i in tenancy.allowed_ids(user)]
    requested = tenancy.current_id()
    return {
        "multi_tenant": tenancy.enabled(),
        "current": requested if any(t["id"] == requested for t in items) else (items[0]["id"] if items else None),
        "items": items,
    }


def _journal_readable(path: str | None) -> bool:
    confined = tenancy.confined_journal(path)
    try:
        return bool(confined and confined.is_file())
    except OSError:
        return False


def _record_out(record, grants: int | None = None) -> dict:
    creds = tenancy.es_credentials(record.credentials_ref)
    return {
        "id": record.id,
        "name": record.name,
        "es_url": record.es_url,
        "es_verify_certs": record.es_verify_certs,
        "credentials_ref": record.credentials_ref,
        "credentials_present": bool(creds),
        "journal_path": record.journal_path,
        "journal_available": _journal_readable(record.journal_path),
        "enabled": record.enabled,
        "grants": grants,
        "created_at": record.created_at.isoformat() if record.created_at else None,
        "updated_at": record.updated_at.isoformat() if record.updated_at else None,
    }


def _clean(value) -> str | None:
    if value is None:
        return None
    value = str(value).strip()
    return value or None


def _require_multi_tenant() -> None:
    if not tenancy.enabled():
        raise HTTPException(409, "Multi-tenancy is not enabled. Set TRADEOPS_MULTI_TENANT=true and restart the API.")


@router.get("/api/admin/tenants")
def list_tenants(user=Depends(_admin)):
    from app.db import SessionLocal
    from app.models import TenantGrant, TenantRecord

    default = tenancy.default_tenant()
    items = [{**default.public(), "enabled": True, "builtin": True}]
    if not tenancy.enabled():
        return {"multi_tenant": False, "items": items}
    with SessionLocal() as session:
        records = session.execute(select(TenantRecord).order_by(TenantRecord.id)).scalars().all()
        counts: dict[str, int] = {}
        for tid in session.execute(select(TenantGrant.tenant_id)).scalars():
            counts[tid] = counts.get(tid, 0) + 1
    items[0]["grants"] = counts.get(tenancy.DEFAULT_ID, 0)
    items.extend(_record_out(r, counts.get(r.id, 0)) for r in records)
    return {"multi_tenant": True, "items": items}


@router.post("/api/admin/tenants", status_code=201, dependencies=_admin_write)
def create_tenant(payload: dict = Body(...), user=Depends(_admin)):
    _require_multi_tenant()
    from app.db import db_session
    from app.models import TenantRecord

    fields = {
        "tenant_id": _clean(payload.get("id")) or "",
        "name": _clean(payload.get("name")) or "",
        "es_url": _clean(payload.get("es_url")),
        "credentials_ref": _clean(payload.get("credentials_ref")),
        "journal_path": _clean(payload.get("journal_path")),
    }
    errors = tenancy.validate_tenant_fields(**fields)
    if not fields["es_url"] and not fields["journal_path"]:
        errors.append("a tenant needs es_url or journal_path")
    if errors:
        raise HTTPException(422, {"message": "Invalid tenant", "errors": errors})
    try:
        with db_session() as session:
            record = TenantRecord(
                id=fields["tenant_id"], name=fields["name"], es_url=fields["es_url"],
                es_verify_certs=bool(payload.get("es_verify_certs", True)),
                credentials_ref=fields["credentials_ref"], journal_path=fields["journal_path"], enabled=True,
            )
            session.add(record)
            session.flush()
            out = _record_out(record, 0)
    except IntegrityError:
        raise HTTPException(409, "A tenant with this id already exists") from None
    tenancy.invalidate()
    _audit("tenant_created", user, tenant=fields["tenant_id"])
    return out


@router.patch("/api/admin/tenants/{tenant_id}", dependencies=_admin_write)
def update_tenant(tenant_id: str, payload: dict = Body(...), user=Depends(_admin)):
    _require_multi_tenant()
    from app.db import db_session
    from app.models import TenantRecord

    updates: dict = {}
    for key in ("name", "es_url", "credentials_ref", "journal_path"):
        if key in payload:
            updates[key] = _clean(payload[key])
    errors = tenancy.validate_tenant_fields(
        name=updates.get("name") if "name" in updates else None,
        es_url=updates.get("es_url"), credentials_ref=updates.get("credentials_ref"), journal_path=updates.get("journal_path"),
    )
    if "name" in updates and not updates["name"]:
        errors.append("name must be 1-128 characters")
    if errors:
        raise HTTPException(422, {"message": "Invalid tenant", "errors": errors})
    with db_session() as session:
        record = session.get(TenantRecord, tenant_id)
        if record is None:
            raise HTTPException(404, "Tenant not found")
        for key, value in updates.items():
            setattr(record, key, value)
        if "es_verify_certs" in payload:
            record.es_verify_certs = bool(payload["es_verify_certs"])
        if "enabled" in payload:
            record.enabled = bool(payload["enabled"])
        if not record.es_url and not record.journal_path:
            raise HTTPException(422, {"message": "Invalid tenant", "errors": ["a tenant needs es_url or journal_path"]})
        session.flush()
        out = _record_out(record)
    tenancy.invalidate()
    _audit("tenant_updated", user, tenant=tenant_id, fields=sorted(set(updates) | ({"enabled"} & set(payload))))
    return out


@router.post("/api/admin/tenants/{tenant_id}/test", dependencies=_admin_write)
def test_tenant(tenant_id: str, user=Depends(_admin)):
    """Probe the tenant's sources as the API will read them. Never returns exception
    text: client errors carry the cluster URL and sometimes the auth scheme."""
    registry = tenancy.tenants()
    if tenant_id not in registry:
        tenancy.invalidate()
        registry = tenancy.tenants()
    tenant = registry.get(tenant_id)
    if tenant is None:
        raise HTTPException(404, "Tenant not found or disabled")
    from app.elastic.client import get_es

    token = tenancy.bind(tenant_id)
    try:
        result: dict = {"tenant": tenant_id, "elasticsearch": None, "journal": None}
        if tenant.es_url:
            es_result = {"configured": True, "credentials_present": bool(tenancy.es_credentials(tenant.credentials_ref)) or tenant.is_default}
            try:
                info = get_es().info()
                es_result |= {"connected": True, "cluster": info.get("cluster_name"), "version": (info.get("version") or {}).get("number")}
            except Exception:
                es_result |= {"connected": False, "error": "Elasticsearch unavailable"}
            result["elasticsearch"] = es_result
        if tenant.journal_path:
            result["journal"] = {"configured": True, "readable": bool(tenancy.journal_path())}
        return result
    finally:
        tenancy.unbind(token)


@router.get("/api/admin/tenants/{tenant_id}/grants")
def list_grants(tenant_id: str, user=Depends(_admin)):
    _require_multi_tenant()
    if tenant_id != tenancy.DEFAULT_ID and not tenancy.SLUG.match(tenant_id):
        raise HTTPException(404, "Tenant not found")
    return {"tenant": tenant_id, "principals": tenancy.grants_for_tenant(tenant_id)}


@router.put("/api/admin/tenants/{tenant_id}/grants", dependencies=_admin_write)
def add_grant(tenant_id: str, payload: dict = Body(...), user=Depends(_admin)):
    _require_multi_tenant()
    from app.db import SessionLocal, db_session
    from app.models import TenantGrant, TenantRecord

    principal = tenancy.normalize_principal(str(payload.get("principal") or ""))
    if not principal:
        raise HTTPException(422, "principal must be a Keycloak username, email or subject id")
    if tenant_id != tenancy.DEFAULT_ID:
        with SessionLocal() as session:
            if session.get(TenantRecord, tenant_id) is None:
                raise HTTPException(404, "Tenant not found")
    try:
        with db_session() as session:
            session.add(TenantGrant(tenant_id=tenant_id, principal=principal))
    except IntegrityError:
        pass  # idempotent
    tenancy.invalidate()
    _audit("tenant_grant_added", user, tenant=tenant_id, principal=principal)
    return {"tenant": tenant_id, "principals": tenancy.grants_for_tenant(tenant_id)}


@router.delete("/api/admin/tenants/{tenant_id}/grants/{principal}", dependencies=_admin_write)
def remove_grant(tenant_id: str, principal: str, user=Depends(_admin)):
    _require_multi_tenant()
    from app.db import db_session
    from app.models import TenantGrant

    normalized = tenancy.normalize_principal(principal)
    if not normalized:
        raise HTTPException(422, "Invalid principal")
    with db_session() as session:
        session.execute(delete(TenantGrant).where(TenantGrant.tenant_id == tenant_id, TenantGrant.principal == normalized))
    tenancy.invalidate()
    _audit("tenant_grant_removed", user, tenant=tenant_id, principal=normalized)
    return {"tenant": tenant_id, "principals": tenancy.grants_for_tenant(tenant_id)}
