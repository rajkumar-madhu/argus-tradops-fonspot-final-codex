"""Multi-tenancy: which client's data a request reads, and whether the caller may.

A tenant is a data source -- an Elasticsearch cluster and/or a journal file -- plus
a list of users granted to it. With ``TRADEOPS_MULTI_TENANT`` off there is exactly
one tenant, ``default``, built from the existing settings, so single-tenant
deployments behave as they did before this module existed.

Request flow
------------
1. ``bind_request_tenant`` (an app-wide *async* dependency) reads the requested
   tenant from the ``X-TradeOps-Tenant`` header, the ``tenant`` query parameter
   (EventSource cannot set headers) or the ``tradeops_tenant`` cookie, and stores
   it in a ContextVar. It must be async: FastAPI runs sync dependencies in a copied
   context, so a value set there would never reach the endpoint.
2. ``auth.require()`` calls ``assert_access(user)`` after its permission check, so
   no data route runs for a tenant the caller is not granted.
3. Data code asks ``current()`` / ``journal_path()``; ``elastic.client.get_es()``
   and ``cache.ttl_cache`` key on ``current_id()`` so nothing is shared across
   tenants.

Credentials never touch the database. A tenant row names a ``credentials_ref``;
the key is read from ``<TRADEOPS_TENANT_SECRETS_DIR>/<ref>.es_api_key`` (or
``.es_username`` + ``.es_password``), which is a mounted Kubernetes Secret.
Keys must be read-only, as for the default tenant.
"""
from __future__ import annotations

import logging
import re
import threading
import time
from contextvars import ContextVar, Token
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Iterable
from urllib.parse import urlsplit

from fastapi import HTTPException, Request, status

from app.config import settings

LOG = logging.getLogger("tradeops.tenancy")

DEFAULT_ID = "default"
TENANT_HEADER = "x-tradeops-tenant"
TENANT_COOKIE = "tradeops_tenant"
TENANT_QUERY = "tenant"
ADMIN_PERMISSION = "tenants:admin"

SLUG = re.compile(r"^[a-z0-9][a-z0-9-]{0,62}$")
_INVALID = "!invalid"
_REGISTRY_TTL = 10.0

_requested: ContextVar[str] = ContextVar("tradeops_tenant", default=DEFAULT_ID)


@dataclass(frozen=True)
class Tenant:
    id: str
    name: str
    es_url: str | None = None
    es_verify_certs: bool = True
    credentials_ref: str | None = None
    journal_path: str | None = None
    is_default: bool = False

    @property
    def journal_primary(self) -> bool:
        """Serve from the journal rather than Elasticsearch.

        The default tenant keeps its setting. Another tenant reads its journal only
        when it has no cluster: with both, ES is live and the journal is the fallback.
        """
        if self.is_default:
            return settings.journal_primary
        return bool(self.journal_path) and not self.es_url

    def public(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "is_default": self.is_default,
            "sources": {"elasticsearch": bool(self.es_url), "journal": bool(self.journal_path)},
        }


def default_tenant() -> Tenant:
    return Tenant(
        id=DEFAULT_ID,
        name=settings.default_tenant_name,
        es_url=None if settings.demo_mode else settings.es_url,
        es_verify_certs=settings.es_verify_certs,
        journal_path=settings.journal_path or None,
        is_default=True,
    )


def enabled() -> bool:
    return settings.multi_tenant


# --- registry ---------------------------------------------------------------

def _db_rows() -> list[Tenant]:
    from sqlalchemy import select
    from app.db import SessionLocal
    from app.models import TenantRecord

    with SessionLocal() as session:
        rows = session.execute(select(TenantRecord).where(TenantRecord.enabled.is_(True))).scalars().all()
        return [
            Tenant(id=r.id, name=r.name, es_url=r.es_url, es_verify_certs=r.es_verify_certs,
                   credentials_ref=r.credentials_ref, journal_path=r.journal_path)
            for r in rows
            if r.id != DEFAULT_ID and SLUG.match(r.id)
        ]


def _db_grants(principals: tuple[str, ...]) -> set[str]:
    from sqlalchemy import select
    from app.db import SessionLocal
    from app.models import TenantGrant

    if not principals:
        return set()
    with SessionLocal() as session:
        rows = session.execute(select(TenantGrant.tenant_id).where(TenantGrant.principal.in_(principals))).scalars().all()
        return set(rows)


# Replaceable in tests; production reads PostgreSQL.
load_rows: Callable[[], list[Tenant]] = _db_rows
load_grants: Callable[[tuple[str, ...]], set[str]] = _db_grants

_lock = threading.Lock()
_registry: tuple[float, dict[str, Tenant]] | None = None
_grant_cache: dict[tuple[str, ...], tuple[float, set[str]]] = {}


def invalidate() -> None:
    global _registry
    with _lock:
        _registry = None
        _grant_cache.clear()


def tenants() -> dict[str, Tenant]:
    """All usable tenants, ``default`` first. Refreshed every few seconds.

    A failed refresh keeps the last good registry rather than dropping tenants: a
    database blip must not turn every non-default request into "unknown tenant".
    With no good registry yet, only ``default`` exists -- which fails closed.
    """
    global _registry
    base = {DEFAULT_ID: default_tenant()}
    if not enabled():
        return base
    now = time.monotonic()
    with _lock:
        if _registry and now - _registry[0] < _REGISTRY_TTL:
            return _registry[1]
        previous = _registry[1] if _registry else None
    try:
        loaded = dict(base)
        for tenant in load_rows():
            loaded[tenant.id] = tenant
    except Exception:
        LOG.warning('{"event": "tenant_registry_refresh_failed"}')
        return previous or base
    with _lock:
        _registry = (now, loaded)
    return loaded


def principals(user: dict) -> tuple[str, ...]:
    values = {str(user.get(k) or "").strip().lower() for k in ("sub", "preferred_username", "email")}
    return tuple(sorted(v for v in values if v))


def granted_ids(user: dict) -> set[str]:
    key = principals(user)
    now = time.monotonic()
    with _lock:
        hit = _grant_cache.get(key)
        if hit and now - hit[0] < _REGISTRY_TTL:
            return hit[1]
    try:
        ids = set(load_grants(key))
    except Exception:
        LOG.warning('{"event": "tenant_grants_lookup_failed"}')
        return set()  # fail closed
    with _lock:
        _grant_cache[key] = (now, ids)
    return ids


def allowed_ids(user: dict) -> list[str]:
    """Tenant ids the user may read, ``default`` first when present."""
    registry = tenants()
    if not enabled():
        return [DEFAULT_ID]
    if "*" in set(user.get("permissions") or []):
        ids = set(registry)
    else:
        ids = granted_ids(user) & set(registry)
    return sorted(ids, key=lambda t: (t != DEFAULT_ID, t))


# --- per-request binding ----------------------------------------------------

def normalize(value: str | None) -> str | None:
    if value is None:
        return None
    value = value.strip().lower()
    if not value:
        return None
    return value if SLUG.match(value) else _INVALID


async def bind_request_tenant(request: Request) -> None:
    """App-wide dependency. Only /api routes are tenant-scoped; /health, /metrics
    and the like always read the default tenant."""
    if not request.url.path.startswith("/api/"):
        _requested.set(DEFAULT_ID)
        return
    requested = (
        normalize(request.headers.get(TENANT_HEADER))
        or normalize(request.query_params.get(TENANT_QUERY))
        or normalize(request.cookies.get(TENANT_COOKIE))
        or DEFAULT_ID
    )
    _requested.set(requested)


def bind(tenant_id: str) -> Token:
    """Bind a tenant outside a request (tests, admin connection checks)."""
    return _requested.set(tenant_id)


def unbind(token: Token) -> None:
    _requested.reset(token)


def current_id() -> str:
    return _requested.get()


def current() -> Tenant:
    tenant = tenants().get(_requested.get())
    if tenant is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail={"message": "Unknown tenant", "tenant": _requested.get()})
    return tenant


def assert_access(user: dict) -> Tenant:
    requested = _requested.get()
    if not enabled():
        if requested != DEFAULT_ID:
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail={"message": "Multi-tenancy is not enabled", "tenant": requested, "available": [DEFAULT_ID]})
        return default_tenant()
    available = allowed_ids(user)
    if requested not in available:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            detail={"message": "No access to this tenant", "tenant": requested if requested != _INVALID else None, "available": available},
        )
    return tenants()[requested]


def require_default_tenant(feature: str) -> None:
    """Features backed by the shared Redis streams or PostgreSQL tables (the collector,
    correlation worker and CSV store run for the default tenant only) must not show
    default-tenant data to anyone else."""
    if _requested.get() != DEFAULT_ID:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail={"message": f"{feature} is not available for this tenant yet", "tenant": _requested.get()})


# --- sources ----------------------------------------------------------------

def _inside(path: Path, base: Path) -> bool:
    try:
        path.relative_to(base)
        return True
    except ValueError:
        return False


def confined_journal(path: str | None) -> Path | None:
    """A non-default tenant's journal must resolve inside TRADEOPS_TENANT_JOURNAL_DIR,
    so a tenant record cannot point the parser at an arbitrary file on the pod."""
    if not path or not settings.tenant_journal_dir:
        return None
    base = Path(settings.tenant_journal_dir).resolve()
    candidate = Path(path)
    resolved = (candidate if candidate.is_absolute() else base / candidate).resolve()
    return resolved if _inside(resolved, base) else None


def journal_path() -> str | None:
    """The current tenant's readable journal file, or None."""
    tenant = current()
    if tenant.is_default:
        raw = (tenant.journal_path or "").strip()
        candidate = Path(raw) if raw else None
    else:
        candidate = confined_journal(tenant.journal_path)
    if candidate is None:
        return None
    try:
        return str(candidate) if candidate.is_file() else None
    except OSError:
        return None


def es_credentials(ref: str | None) -> dict[str, str]:
    """Read a tenant's Elasticsearch credentials from the mounted secret directory."""
    if not ref or not SLUG.match(ref):
        return {}
    base = Path(settings.tenant_secrets_dir)

    def read(suffix: str) -> str | None:
        f = base / f"{ref}.{suffix}"
        try:
            value = f.read_text(encoding="utf-8").strip() if f.is_file() else ""
        except OSError:
            return None
        return value or None

    api_key = read("es_api_key")
    if api_key:
        return {"api_key": api_key}
    username, password = read("es_username"), read("es_password")
    if username and password:
        return {"username": username, "password": password}
    return {}


# --- validation for the admin API ---------------------------------------------

def validate_tenant_fields(*, tenant_id: str | None = None, name: str | None = None, es_url: str | None = None,
                           credentials_ref: str | None = None, journal_path: str | None = None) -> list[str]:
    errors: list[str] = []
    if tenant_id is not None:
        if not SLUG.match(tenant_id):
            errors.append("id must be lower-case letters, digits and hyphens (max 63)")
        elif tenant_id == DEFAULT_ID:
            errors.append('"default" is reserved for the built-in tenant')
    if name is not None and not (1 <= len(name.strip()) <= 128):
        errors.append("name must be 1-128 characters")
    if es_url:
        parts = urlsplit(es_url)
        if parts.scheme not in {"http", "https"} or not parts.hostname:
            errors.append("es_url must be an http(s) URL with a host")
        if parts.username or parts.password:
            errors.append("es_url must not embed credentials; use credentials_ref")
        if parts.query or parts.fragment:
            errors.append("es_url must not carry a query or fragment")
        if settings.environment == "production" and parts.scheme != "https":
            errors.append("es_url must use https in production")
    if credentials_ref and not SLUG.match(credentials_ref):
        errors.append("credentials_ref must be lower-case letters, digits and hyphens (max 63)")
    if journal_path:
        if not settings.tenant_journal_dir:
            errors.append("journal_path needs TRADEOPS_TENANT_JOURNAL_DIR to be configured")
        elif confined_journal(journal_path) is None:
            errors.append("journal_path must be inside TRADEOPS_TENANT_JOURNAL_DIR")
    return errors


def normalize_principal(value: str) -> str | None:
    value = (value or "").strip().lower()
    return value if 1 <= len(value) <= 255 and not any(c.isspace() for c in value) else None


def grants_for_tenant(tenant_id: str) -> list[str]:
    from sqlalchemy import select
    from app.db import SessionLocal
    from app.models import TenantGrant

    with SessionLocal() as session:
        return list(session.execute(select(TenantGrant.principal).where(TenantGrant.tenant_id == tenant_id).order_by(TenantGrant.principal)).scalars())


def ids(items: Iterable[Tenant]) -> list[str]:
    return [t.id for t in items]
