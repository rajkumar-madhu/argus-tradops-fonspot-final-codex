from elasticsearch import Elasticsearch
from app.config import settings

_client: Elasticsearch | None = None


def get_es() -> Elasticsearch | None:
    global _client
    if settings.demo_mode:
        return None
    if _client is not None:
        return _client

    kwargs: dict = {
        "hosts": [settings.es_url],
        "verify_certs": settings.es_verify_certs,
        "request_timeout": 30,
        "retry_on_timeout": True,
        "max_retries": 3,
    }
    if settings.es_api_key:
        kwargs["api_key"] = settings.es_api_key
    elif settings.es_username and settings.es_password:
        kwargs["basic_auth"] = (settings.es_username, settings.es_password)
    if settings.es_ca_certs:
        kwargs["ca_certs"] = settings.es_ca_certs

    _client = Elasticsearch(**kwargs)
    return _client
