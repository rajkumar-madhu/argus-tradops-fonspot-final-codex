from elasticsearch import Elasticsearch
from app.config import settings

_client: Elasticsearch | None = None


def get_es() -> Elasticsearch | None:
    global _client
    if settings.demo_mode:
        return None
    if _client is not None:
        return _client

    # Budget: the UI's server-side fetch gives up at 15 s, so 30 s x 4 attempts
    # only ever produced a blank page after 2 minutes of retries. One retry on
    # a connection error, none on a timeout, inside the page budget.
    kwargs: dict = {
        "hosts": [settings.es_url],
        "verify_certs": settings.es_verify_certs,
        "request_timeout": settings.es_request_timeout_seconds,
        "retry_on_timeout": False,
        "max_retries": 1,
    }
    if settings.es_api_key:
        kwargs["api_key"] = settings.es_api_key
    elif settings.es_username and settings.es_password:
        kwargs["basic_auth"] = (settings.es_username, settings.es_password)
    if settings.es_ca_certs:
        kwargs["ca_certs"] = settings.es_ca_certs

    _client = Elasticsearch(**kwargs)
    return _client
