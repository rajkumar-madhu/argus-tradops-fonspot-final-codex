import hashlib
import threading

from elasticsearch import Elasticsearch
from app.config import settings

_client: Elasticsearch | None = None
_tenant_clients: dict[tuple, Elasticsearch] = {}
_lock = threading.Lock()


def _base_kwargs(url: str, verify_certs: bool) -> dict:
    # Budget: the UI's server-side fetch gives up at 15 s, so 30 s x 4 attempts
    # only ever produced a blank page after 2 minutes of retries. One retry on
    # a connection error, none on a timeout, inside the page budget.
    return {
        "hosts": [url],
        "verify_certs": verify_certs,
        "request_timeout": settings.es_request_timeout_seconds,
        "retry_on_timeout": False,
        "max_retries": 1,
    }


def _default_client() -> Elasticsearch | None:
    global _client
    if settings.demo_mode:
        return None
    if _client is not None:
        return _client
    kwargs = _base_kwargs(settings.es_url, settings.es_verify_certs)
    if settings.es_api_key:
        kwargs["api_key"] = settings.es_api_key
    elif settings.es_username and settings.es_password:
        kwargs["basic_auth"] = (settings.es_username, settings.es_password)
    if settings.es_ca_certs:
        kwargs["ca_certs"] = settings.es_ca_certs
    _client = Elasticsearch(**kwargs)
    return _client


def get_es() -> Elasticsearch | None:
    """The Elasticsearch client for the tenant bound to this request.

    Clients are keyed by tenant, URL and a hash of the credentials, so a rotated
    secret file yields a fresh client and one tenant's client is never reused for
    another. A tenant without a cluster gets None, as demo mode does.
    """
    from app import tenancy

    tenant = tenancy.current()
    if tenant.is_default:
        return _default_client()
    if not tenant.es_url:
        return None
    creds = tenancy.es_credentials(tenant.credentials_ref)
    fingerprint = hashlib.sha256(repr(sorted(creds.items())).encode()).hexdigest()
    key = (tenant.id, tenant.es_url, tenant.es_verify_certs, fingerprint)
    with _lock:
        client = _tenant_clients.get(key)
        if client is not None:
            return client
        for stale in [k for k in _tenant_clients if k[0] == tenant.id]:
            _tenant_clients.pop(stale, None)
        kwargs = _base_kwargs(tenant.es_url, tenant.es_verify_certs)
        if "api_key" in creds:
            kwargs["api_key"] = creds["api_key"]
        elif "username" in creds:
            kwargs["basic_auth"] = (creds["username"], creds["password"])
        if settings.es_ca_certs:
            kwargs["ca_certs"] = settings.es_ca_certs
        client = Elasticsearch(**kwargs)
        _tenant_clients[key] = client
        return client
