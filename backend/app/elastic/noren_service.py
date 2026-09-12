from __future__ import annotations
from collections import Counter
from datetime import datetime, timezone
from typing import Any

from app.config import settings
from app.elastic.client import get_es
from app.elastic.normalizer import mask_reason, normalize_order, normalize_session_event, rejection_category, rejection_code




# Resolved field names are memoized manually rather than with lru_cache: a cached
# *failure* would pin every filter to a non-existent sub-field for the lifetime of
# the process. Only successful resolutions are stored.
_FIELD_CACHE: dict[tuple[str, str], str] = {}


def _field(index: str, field: str) -> str:
    """Return an aggregatable exact field for both legacy dynamic mappings and the new template."""
    es = get_es()
    if es is None:
        return field
    key = (index, field)
    cached = _FIELD_CACHE.get(key)
    if cached is not None:
        return cached
    try:
        caps = es.field_caps(index=index, fields=[field, f"{field}.keyword"], ignore_unavailable=True).get("fields", {})
    except Exception:
        # Transient failure. Fall back to the bare field (how the shipped index
        # template maps these) and deliberately do not cache, so the next call retries.
        return field
    kw = f"{field}.keyword"
    if kw in caps and any(t == "keyword" for t in caps[kw]):
        resolved = kw
    elif field in caps and any(t in {"keyword", "long", "integer", "short", "byte", "date", "ip", "boolean"} for t in caps[field]):
        # keyword/numeric/date fields are directly aggregatable.
        resolved = field
    else:
        resolved = kw
    _FIELD_CACHE[key] = resolved
    return resolved


def reset_field_cache() -> None:
    """Drop resolved field names, e.g. after an index template change."""
    _FIELD_CACHE.clear()

def _range(field: str, lookback: str) -> dict[str, Any]:
    return {"range": {field: {"gte": f"now-{lookback}"}}}


def _order_sort(desc: bool = True) -> list[dict[str, Any]]:
    order = "desc" if desc else "asc"
    return [
        {settings.noren_timestamp_field: {"order": order, "unmapped_type": "date"}},
        {"NorenNsecs": {"order": order, "unmapped_type": "long"}},
    ]


def _status_codes(status: str | None) -> list[int] | None:
    if not status:
        return None
    s = status.upper()
    return {
        "REJECTED": [56, 65],
        "CANCELLED": [52],
        "COMPLETE": [50],
        "OPEN": [48],
        "TRIGGER_PENDING": [54],
        "PENDING": [109, 110, 115],
    }.get(s)


def live_orders(*, size: int = 100, lookback: str = "24h", exchange: str | None = None,
                status: str | None = None, broker: str | None = None, user_id: str | None = None,
                symbol: str | None = None, q: str | None = None) -> dict[str, Any]:
    es = get_es()
    if es is None:
        return {"items": [], "count": 0, "source": "demo"}

    filters: list[dict[str, Any]] = [_range(settings.noren_timestamp_field, lookback)]
    must: list[dict[str, Any]] = []
    if exchange:
        filters.append({"term": {_field(settings.noren_order_index, "ExchSeg"): exchange}})
    if broker:
        filters.append({"term": {_field(settings.noren_order_index, "BrokerId"): broker}})
    if user_id:
        filters.append({"term": {_field(settings.noren_order_index, "UserId"): user_id}})
    if symbol:
        filters.append({"term": {_field(settings.noren_order_index, "TradingSymbol"): symbol}})
    codes = _status_codes(status)
    if codes:
        filters.append({"terms": {"OrdStatus": codes}})
    if q:
        must.append({"query_string": {"query": q, "fields": ["TradingSymbol*", "UserId*", "AcctId*", "BrokerId*", "RejReason*", "NorenOrdNum"], "lenient": True}})

    body: dict[str, Any] = {
        "size": min(max(size, 1), 500),
        "track_total_hits": True,
        "query": {"bool": {"filter": filters, "must": must}},
        "sort": _order_sort(True),
        "collapse": {"field": "NorenOrdNum"},
        "_source": {"excludes": ["PanNum", "IpAddr", "ExchUserInfo", "ParticId"]},
        "aggs": {"unique_orders": {"cardinality": {"field": "NorenOrdNum", "precision_threshold": 40000}}},
    }
    result = es.search(index=settings.noren_order_index, body=body)
    hits = result.get("hits", {}).get("hits", [])
    return {
        "items": [normalize_order(h.get("_source", {})) for h in hits],
        "count": result.get("aggregations", {}).get("unique_orders", {}).get("value", len(hits)),
        "returned": len(hits),
        "source": "elasticsearch",
        "index": settings.noren_order_index,
    }


def order_lifecycle(order_id: str, *, lookback: str = "30d") -> dict[str, Any]:
    es = get_es()
    if es is None:
        return {"order_id": order_id, "events": [], "source": "demo"}
    body = {
        "size": 500,
        "query": {"bool": {"filter": [
            {"term": {"NorenOrdNum": order_id}},
            _range(settings.noren_timestamp_field, lookback),
        ]}},
        "sort": _order_sort(False),
        "_source": {"excludes": ["PanNum", "IpAddr", "ExchUserInfo", "ParticId"]},
    }
    result = es.search(index=settings.noren_order_index, body=body)
    events = [normalize_order(h.get("_source", {})) for h in result.get("hits", {}).get("hits", [])]
    return {"order_id": order_id, "events": events, "count": len(events), "source": "elasticsearch"}


def rejection_summary(*, lookback: str = "24h", scan_limit: int | None = None,
                      max_orders: int | None = 200) -> dict[str, Any]:
    """Summarise rejected orders.

    ``max_orders`` caps the ``orders`` list for API/UI payload size. Pass ``None``
    (the collector does) to receive every unique rejected order, otherwise a
    rejection spike is truncated exactly when incidents matter most.
    """
    es = get_es()
    if es is None:
        return {"groups": [], "orders": [], "source": "demo"}
    limit = min(scan_limit or settings.noren_query_scan_limit, 10000)
    body = {
        "size": limit,
        "query": {"bool": {"filter": [
            _range(settings.noren_timestamp_field, lookback),
            {"terms": {"OrdStatus": [56, 65]}},
        ]}},
        "sort": _order_sort(True),
        "_source": ["NorenOrdNum", "NorenTimeStamp", "NorenNsecs", "NorenOrgTimeStamp", "NorenOrgNsecs", "Eref", "OrdStatus", "ReportType", "AcctId", "UserId", "TradingSymbol", "ExchSeg", "TransType", "PriceType", "Product", "BrokerId", "Region", "QtyToFill", "PriceToFill", "RejReason", "RejBy", "ExchOrdNum", "Scripupdate.PriceMultiplier"],
    }
    result = es.search(index=settings.noren_order_index, body=body)
    docs = [h.get("_source", {}) for h in result.get("hits", {}).get("hits", [])]
    normalized = [normalize_order(d) for d in docs]
    # Keep latest rejected record per order for the table, while grouping every observed rejected order once.
    latest_by_order: dict[str, dict[str, Any]] = {}
    for o in normalized:
        if o["order_id"] and o["order_id"] not in latest_by_order:
            latest_by_order[o["order_id"]] = o
    unique = list(latest_by_order.values())
    # Code and category are read from the raw reason, then the text is masked:
    # reasons carry client codes and balances, and this payload also feeds the
    # event bus (incident titles) and every rejection view.
    for o in unique:
        raw = o.get("reason") or ""
        o["code"] = o.get("code") or rejection_code(raw) or "RMS"
        o["rejection_category"] = o.get("rejection_category") or rejection_category(raw) or "Other"
        o["reason"] = mask_reason(raw)

    groups: dict[tuple[str, str, str], dict[str, Any]] = {}
    for o in unique:
        reason = o.get("reason") or "Unknown rejection"
        code = o["code"]
        category = o["rejection_category"]
        key = (code, reason, category)
        if key not in groups:
            groups[key] = {"code": code, "reason": reason, "category": category, "count": 0, "trend": "—"}
        groups[key]["count"] += 1
    ranked = sorted(groups.values(), key=lambda x: x["count"], reverse=True)[:30]
    categories = Counter(o["rejection_category"] or "Uncategorized" for o in unique)
    return {
        "groups": ranked,
        "orders": unique if max_orders is None else unique[:max_orders],
        "rejected_unique_orders": len(unique),
        "truncated": max_orders is not None and len(unique) > max_orders,
        "categories": [{"name": k, "count": v} for k, v in categories.most_common()],
        "reject_rate": _reject_rate(len(unique), lookback=lookback),
        "scanned_events": len(docs),
        "scan_limit": limit,
        "scan_limit_reached": len(docs) >= limit,
        "source": "elasticsearch",
        "index": settings.noren_order_index,
    }


def _reject_rate(rejected_orders: int, *, lookback: str) -> float:
    """Rejected unique orders as a percentage of all unique orders in the window."""
    es = get_es()
    if es is None or not rejected_orders:
        return 0.0
    try:
        body = {
            "size": 0,
            "query": {"bool": {"filter": [_range(settings.noren_timestamp_field, lookback)]}},
            "aggs": {"orders": {"cardinality": {"field": "NorenOrdNum", "precision_threshold": 40000}}},
        }
        total = es.search(index=settings.noren_order_index, body=body).get("aggregations", {}).get("orders", {}).get("value", 0)
        return round(rejected_orders / total * 100, 3) if total else 0.0
    except Exception:
        return 0.0


def rca(order_id: str, *, lookback: str = "30d") -> dict[str, Any]:
    lifecycle = order_lifecycle(order_id, lookback=lookback)
    events = lifecycle.get("events", [])
    if not events:
        return {"order_id": order_id, "found": False, "source": lifecycle.get("source", "elasticsearch")}
    latest = events[-1]
    rejected = [e for e in events if e.get("status") == "REJECTED" or e.get("reason")]
    evidence = rejected[-1] if rejected else latest
    reason = evidence.get("reason") or ""
    category = evidence.get("rejection_category") or rejection_category(reason)
    confidence = 0.96 if reason else 0.65
    probable_cause = reason or f"Order ended in {latest.get('status')} with Noren status {latest.get('status_code')}"
    return {
        "order_id": order_id,
        "found": True,
        "summary": {
            "status": latest.get("status"), "exchange": latest.get("exchange"), "symbol": latest.get("symbol"),
            "broker": latest.get("broker"), "category": category or "Order Lifecycle", "code": evidence.get("code"),
            "probable_cause": probable_cause, "confidence": confidence,
        },
        "correlation": {"eref": latest.get("eref"), "exchange_order_id": latest.get("exchange_order_id")},
        "evidence": events,
        "source": lifecycle.get("source", "elasticsearch"),
    }


def active_sessions(*, lookback: str = "24h", size: int = 2000) -> dict[str, Any]:
    es = get_es()
    if es is None:
        return {"items": [], "count": 0, "source": "demo"}
    index = f"{settings.noren_login_index},{settings.noren_logout_index}"
    body = {
        "size": min(size, 5000),
        "query": {"range": {settings.noren_timestamp_field: {"gte": f"now-{lookback}"}}},
        "sort": _order_sort(True),
        "_source": {"excludes": ["Userdetails.Dob", "Userdetails.UserName", "Userdetails.LastLoginIp", "Userdetails.LastLoginMac", "Userdetails.UserSessOtp", "Question2fas", "LoginProcId"]},
    }
    result = es.search(index=index, body=body, ignore_unavailable=True)
    docs = [h.get("_source", {}) for h in result.get("hits", {}).get("hits", [])]
    # Search is newest-first. First event per raw session id is the current state of that session.
    latest: dict[str, dict[str, Any]] = {}
    for d in docs:
        sid = str(d.get("UserSessId") or (d.get("Userdetails") or {}).get("UserSessId") or "")
        if not sid:
            sid = f"{d.get('UserId','')}|{d.get('AccessType','')}"
        latest.setdefault(sid, d)
    active = [normalize_session_event(d) for d in latest.values() if str(d.get("msg_type")) == "login" and "success" in str(d.get("ReqStatus", "")).lower()]
    # Never return the internal correlation key.
    for s in active:
        s.pop("session_key", None)
    return {"items": active[:500], "count": len(active), "source": "elasticsearch", "index": index}


def session_summary(*, lookback: str = "24h") -> dict[str, Any]:
    data = active_sessions(lookback=lookback)
    items = data.get("items", [])
    brokers = Counter(x.get("broker") or "Unknown" for x in items)
    access = Counter(x.get("access_type") or "Unknown" for x in items)
    segments: Counter[str] = Counter()
    versions = Counter(x.get("app_version") or "Unknown" for x in items)
    for x in items:
        for seg in x.get("segments") or []:
            segments[str(seg)] += 1
    return {
        "active_sessions": len(items),
        "unique_users": len({x.get("user_id") for x in items}),
        "unique_brokers": len({x.get("broker") for x in items if x.get("broker")}),
        "brokers": [{"name": k, "count": v} for k, v in brokers.most_common(20)],
        "access_types": [{"name": k, "count": v} for k, v in access.most_common()],
        "segments": [{"name": k, "count": v} for k, v in segments.most_common()],
        "versions": [{"name": k, "count": v} for k, v in versions.most_common()],
        "source": data.get("source"),
    }


def yel_health() -> dict[str, Any]:
    es = get_es()
    if es is None:
        return {"connected": False, "keys": [], "source": "demo"}
    body = {"size": 1, "sort": [{settings.noren_ingest_timestamp_field: {"order": "desc", "unmapped_type": "date"}}]}
    result = es.search(index=settings.noren_yel_index, body=body, ignore_unavailable=True)
    hits = result.get("hits", {}).get("hits", [])
    if not hits:
        return {"connected": False, "keys": [], "source": "elasticsearch", "index": settings.noren_yel_index}
    src = hits[0].get("_source", {})
    return {"connected": True, "last_event": src.get("@timestamp"), "keys": src.get("Keys") or [], "source": "elasticsearch", "index": settings.noren_yel_index}


def overview(*, lookback: str = "24h") -> dict[str, Any]:
    es = get_es()
    if es is None:
        return {"source": "demo"}
    body = {
        "size": 0,
        "query": {"range": {settings.noren_timestamp_field: {"gte": f"now-{lookback}"}}},
        "aggs": {
            "orders": {"cardinality": {"field": "NorenOrdNum", "precision_threshold": 40000}},
            "rejected": {"filter": {"terms": {"OrdStatus": [56, 65]}}, "aggs": {"orders": {"cardinality": {"field": "NorenOrdNum", "precision_threshold": 40000}}}},
            "complete": {"filter": {"term": {"OrdStatus": 50}}, "aggs": {"orders": {"cardinality": {"field": "NorenOrdNum", "precision_threshold": 40000}}}},
            "exchanges": {"terms": {"field": _field(settings.noren_order_index, "ExchSeg"), "size": 20}},
            "brokers": {"cardinality": {"field": _field(settings.noren_order_index, "BrokerId")}},
            "symbols": {"cardinality": {"field": _field(settings.noren_order_index, "TradingSymbol")}},
        },
    }
    result = es.search(index=settings.noren_order_index, body=body)
    a = result.get("aggregations", {})
    total = a.get("orders", {}).get("value", 0)
    rej = a.get("rejected", {}).get("orders", {}).get("value", 0)
    complete = a.get("complete", {}).get("orders", {}).get("value", 0)
    sessions = session_summary(lookback=lookback)
    yel = yel_health()
    return {
        "orders": total,
        "complete": complete,
        "rejected": rej,
        "reject_rate": round((rej / total * 100), 3) if total else 0,
        "brokers": a.get("brokers", {}).get("value", 0),
        "symbols": a.get("symbols", {}).get("value", 0),
        "exchanges": [{"name": b.get("key"), "events": b.get("doc_count", 0)} for b in a.get("exchanges", {}).get("buckets", [])],
        "sessions": sessions,
        "yel": yel,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": "elasticsearch",
    }


def incident_candidates(*, lookback: str = "15m") -> dict[str, Any]:
    """Derived operational incidents. Read-only: no trade action is performed."""
    rej = rejection_summary(lookback=lookback, scan_limit=2000)
    yel = yel_health()
    incidents=[]
    n=int(rej.get("rejected_unique_orders") or 0)
    if n >= 10:
        incidents.append({"id":f"AUTO-REJ-{lookback}","severity":"P1" if n>=100 else "P2","type":"REJECTION_SPIKE","title":f"{n} rejected orders in {lookback}","status":"OPEN","evidence":rej.get("groups",[])[:5]})
    if not yel.get("connected"):
        incidents.append({"id":"AUTO-YEL-DOWN","severity":"P1","type":"YEL_CONNECTIVITY","title":"No YEL connectivity event available","status":"OPEN","evidence":yel})
    return {"items":incidents,"count":len(incidents),"lookback":lookback,"source":"derived-from-elasticsearch"}
