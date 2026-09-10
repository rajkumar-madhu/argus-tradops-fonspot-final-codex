from __future__ import annotations
from datetime import datetime, timezone
from typing import Any

from app.config import settings
from app.elastic.client import get_es
from app.elastic.normalizer import normalize_log
from app.elastic.noren_service import active_sessions, _field


def elk_status() -> dict[str, Any]:
    es = get_es()
    if es is None:
        return {"connected": False, "mode": "demo", "cluster": None}
    try:
        info = es.info()
        return {"connected": True, "mode": "elasticsearch", "cluster": info.get("cluster_name"), "version": info.get("version", {}).get("number")}
    except Exception as exc:
        return {"connected": False, "mode": "elasticsearch", "error": "Elasticsearch unavailable"}


# Free-text search is restricted to these fields. `query_string` would let a
# `logs:read` user target fields the API deliberately masks or excludes
# (PanNum, IpAddr, UserSessOtp, ...) and confirm values by hit count, so
# `simple_query_string` over an explicit allowlist is used instead: it has no
# `field:value` syntax that can escape the list.
LOG_SEARCH_FIELDS = [
    "NorenOrdNum", "Eref", "ExchOrdNum", "TradingSymbol", "Token",
    "UserId", "AcctId", "BrokerId", "Region", "ExchSeg",
    "TransType", "PriceType", "Product", "RejReason", "RejBy",
    "ReqStatus", "AccessType", "msg_type",
]


def search_logs(q: str = "", size: int = 50, index: str | None = None) -> dict[str, Any]:
    es = get_es()
    if es is None:
        return {"items": [], "count": 0, "source": "demo"}
    query: dict[str, Any]
    if q and q.strip() and q.strip() != "*":
        query = {"simple_query_string": {
            "query": q,
            "fields": LOG_SEARCH_FIELDS,
            "default_operator": "and",
            "analyze_wildcard": False,
            "lenient": True,
        }}
    else:
        query = {"match_all": {}}
    body = {
        "size": size,
        # Bounded: an exact total over a `noren-*` wildcard is an expensive scan.
        "track_total_hits": 10000,
        "query": query,
        "sort": [{settings.timestamp_field: {"order": "desc", "unmapped_type": "date"}}],
        "_source": {"excludes": ["PanNum", "IpAddr", "Userdetails.Dob", "Userdetails.UserName", "Userdetails.LastLoginIp", "Userdetails.LastLoginMac", "Userdetails.UserSessOtp", "UserSessId", "Question2fas"]},
    }
    result = es.search(index=index or settings.all_index, body=body, ignore_unavailable=True)
    hits = result.get("hits", {})
    total = hits.get("total", {})
    return {"items": [normalize_log(h.get("_source", {})) for h in hits.get("hits", [])], "count": total.get("value", len(hits.get("hits", []))) if isinstance(total, dict) else total, "source": "elasticsearch"}


def latest_sessions(size: int = 200) -> dict[str, Any]:
    return active_sessions(size=max(size * 10, 1000))


def login_trend(interval: str = "30m") -> dict[str, Any]:
    es = get_es()
    if es is None:
        return {"buckets": [], "source": "demo"}
    body = {"size": 0, "query": {"range": {settings.noren_timestamp_field: {"gte": "now-24h"}}}, "aggs": {"timeline": {"date_histogram": {"field": settings.noren_timestamp_field, "fixed_interval": interval, "min_doc_count": 0}}}}
    result = es.search(index=settings.noren_login_index, body=body, ignore_unavailable=True)
    buckets = [{"time": b.get("key_as_string"), "count": b.get("doc_count", 0)} for b in result.get("aggregations", {}).get("timeline", {}).get("buckets", [])]
    return {"buckets": buckets, "source": "elasticsearch"}


def log_level_trend(interval: str = "5m") -> dict[str, Any]:
    # Noren Journal does not carry a canonical level field. Rejected orders are treated as ERROR for this operational view.
    es = get_es()
    if es is None:
        return {"buckets": [], "source": "demo"}
    body = {"size": 0, "query": {"range": {settings.noren_timestamp_field: {"gte": "now-1h"}}}, "aggs": {"timeline": {"date_histogram": {"field": settings.noren_timestamp_field, "fixed_interval": interval, "min_doc_count": 0}, "aggs": {"rejected": {"filter": {"terms": {"OrdStatus": [56, 65]}}}}}}}
    result = es.search(index=settings.noren_order_index, body=body, ignore_unavailable=True)
    buckets = [{"time": b.get("key_as_string"), "total": b.get("doc_count", 0), "levels": {"ERROR": b.get("rejected", {}).get("doc_count", 0), "INFO": max(0, b.get("doc_count", 0) - b.get("rejected", {}).get("doc_count", 0))}} for b in result.get("aggregations", {}).get("timeline", {}).get("buckets", [])]
    return {"buckets": buckets, "source": "elasticsearch"}


def service_breakdown() -> dict[str, Any]:
    es = get_es()
    if es is None:
        return {"items": [], "source": "demo"}
    body = {"size": 0, "query": {"range": {settings.timestamp_field: {"gte": "now-1h"}}}, "aggs": {"services": {"terms": {"field": _field(settings.noren_all_index, "msg_type"), "size": 20}}}}
    result = es.search(index=settings.noren_all_index, body=body, ignore_unavailable=True)
    items = [{"service": b.get("key"), "count": b.get("doc_count", 0)} for b in result.get("aggregations", {}).get("services", {}).get("buckets", [])]
    return {"items": items, "source": "elasticsearch", "generated_at": datetime.now(timezone.utc).isoformat()}
