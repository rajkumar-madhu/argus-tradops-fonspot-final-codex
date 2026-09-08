"""Explicit local journal snapshots. No polling, trading writes, or ES access."""
from __future__ import annotations

import csv
import json
from collections import Counter
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path
from typing import Any

from app.config import settings
from app.elastic.normalizer import (
    mask_account,
    mask_id,
    mask_ip,
    normalize_order,
    normalize_session_event,
    rejection_category,
    rejection_code,
)

ORDER_JOURNAL_FIELDS = (
    "Record No.",
    "Event Time (UTC)",
    "NorenOrdNum",
    "NorenTimeStamp",
    "msg_type",
    "ReportType",
    "OrdStatus",
    "AcctId",
    "UserId",
    "BrokerId",
    "TradingSymbol",
    "ExchSeg",
    "Token",
    "TransType",
    "PriceType",
    "Product",
    "OrdDuration",
    "QtyToFill",
    "PriceToFill",
    "FillQty",
    "TotalFillQty",
    "FillPrice",
    "FillAvgPrice",
    "RejReason",
    "IpAddr",
    "Amo",
    "BrokerGroup",
    "CancelledQty",
    "DiscQty",
    "ExchOrdNum",
    "ExchTimeStamp",
    "ExchUserId",
    "FillId",
    "FillTime",
    "OrdRemarks",
    "OrdSrc",
    "PanNum",
    "RejBy",
    "RejOrdSrc",
    "RejPriceType",
    "RejQty",
    "TriggerPrice",
    "SrcUserId",
    "StreamId",
)
MASKED_ORDER_JOURNAL_FIELDS = ("AcctId", "UserId", "IpAddr", "PanNum", "ExchUserId", "SrcUserId")
_PRICE_FIELDS = {"PriceToFill", "FillPrice", "FillAvgPrice", "TriggerPrice"}


def _timestamp(value: Any, nsecs: Any = 0) -> str:
    if value in (None, ""):
        return ""
    try:
        return datetime.fromtimestamp(
            int(value) + int(nsecs or 0) / 1_000_000_000,
            tz=timezone.utc,
        ).isoformat()
    except (TypeError, ValueError, OverflowError):
        return str(value)


def _price(value: Any) -> float | None:
    if value in (None, ""):
        return None
    try:
        return round(float(value) / settings.noren_price_divisor, 4)
    except (TypeError, ValueError, ZeroDivisionError):
        return None


def _project_order_fields(
    doc: dict[str, Any],
    normalized: dict[str, Any],
    source_row: int,
) -> dict[str, Any]:
    """Allowlist and mask the exact ord-updated evidence fields exposed to the UI."""
    projected = {field: doc.get(field) for field in ORDER_JOURNAL_FIELDS}
    projected["Record No."] = source_row
    projected["Event Time (UTC)"] = normalized.get("time") or ""
    projected["NorenTimeStamp"] = normalized.get("time") or ""
    projected["ExchTimeStamp"] = normalized.get("exchange_time") or ""
    projected["FillTime"] = _timestamp(doc.get("FillTime"), doc.get("FillNsecs"))
    for field in _PRICE_FIELDS:
        projected[field] = _price(doc.get(field))
    projected["AcctId"] = mask_account(str(doc.get("AcctId") or ""))
    projected["UserId"] = mask_id(str(doc.get("UserId") or ""), 4)
    projected["ExchUserId"] = mask_id(str(doc.get("ExchUserId") or ""), 4)
    projected["SrcUserId"] = mask_id(str(doc.get("SrcUserId") or ""), 4)
    projected["IpAddr"] = mask_ip(str(doc.get("IpAddr") or ""))
    projected["PanNum"] = mask_id(str(doc.get("PanNum") or ""), 4)
    if normalized.get("status") != "REJECTED":
        projected["RejReason"] = ""
    return projected


def _project_order_row(row: dict[str, Any]) -> dict[str, Any]:
    # Preserve recorded rejection text for investigations; mask on non-rejected rows.
    row = dict(row)
    if row.get("status") != "REJECTED":
        row["reason"] = ""
        if isinstance(row.get("journal_fields"), dict):
            row["journal_fields"] = dict(row["journal_fields"], RejReason="")
    return row


def _withhold_reason(row: dict[str, Any]) -> dict[str, Any]:
    row = dict(row)
    row["reason"] = ""
    if isinstance(row.get("journal_fields"), dict):
        row["journal_fields"] = dict(row["journal_fields"], RejReason="")
    return row


def _rejection_row(snapshot: dict[str, Any], row: dict[str, Any]) -> dict[str, Any]:
    enriched = dict(row)
    if str(enriched.get("reason") or "").strip():
        return enriched
    for event in reversed(snapshot["events"]):
        if event.get("order_id") != enriched.get("order_id"):
            continue
        reason = str(event.get("reason") or "").strip()
        if not reason:
            continue
        enriched["reason"] = reason
        enriched["code"] = event.get("code") or enriched.get("code")
        enriched["rejection_category"] = event.get("rejection_category") or enriched.get("rejection_category")
        break
    return enriched


@lru_cache(maxsize=1)
def load_journal(path: str) -> dict[str, Any]:
    order_events: list[dict[str, Any]] = []
    session_events: list[dict[str, Any]] = []
    yel_docs: list[dict[str, Any]] = []
    records = 0

    with Path(path).open(encoding="utf-8") as stream:
        for source_row, line in enumerate(stream, start=1):
            if not line.strip():
                continue
            doc = json.loads(line)
            if not isinstance(doc, dict):
                raise ValueError("Journal record must be an object")
            records += 1
            msg_type = str(doc.get("msg_type") or "")
            if msg_type == "ordupd":
                normalized = normalize_order(doc, mask_sensitive=True)
                normalized["source_row"] = source_row
                normalized["journal_fields"] = _project_order_fields(doc, normalized, source_row)
                normalized["masked_fields"] = list(MASKED_ORDER_JOURNAL_FIELDS)
                order_events.append(_project_order_row(normalized))
            elif msg_type in {"login", "logout"}:
                session_events.append(
                    normalize_session_event(doc, mask_sensitive=False, source_row=source_row)
                )
            elif msg_type == "yel_connected":
                yel_docs.append(doc)

    order_events.sort(key=lambda row: row["time"])
    latest = {row["order_id"]: row for row in order_events if row["order_id"]}
    items = sorted(latest.values(), key=lambda row: row["time"], reverse=True)

    session_events.sort(key=lambda row: row["time"], reverse=True)
    active_sessions = [row for row in session_events if row.get("active")]
    session_times = [row["time"] for row in session_events if row.get("time")]

    exchanges = Counter(row.get("exchange") or "Unknown" for row in items)
    rejected = [row for row in items if row.get("status") == "REJECTED"]
    complete = [row for row in items if row.get("status") == "COMPLETE"]
    open_orders = [row for row in items if row.get("status") in {"OPEN", "PENDING", "TRIGGER_PENDING"}]

    return {
        "items": items,
        "events": order_events,
        "sessions": session_events,
        "active_sessions": active_sessions,
        "yel_docs": yel_docs,
        "rejected": rejected,
        "complete": complete,
        "open_orders": open_orders,
        "exchange_counts": exchanges,
        "records": records,
        "count": len(latest),
        "source": "journal snapshot",
        "from": order_events[0]["time"] if order_events else None,
        "to": order_events[-1]["time"] if order_events else None,
        "session_from": min(session_times) if session_times else None,
        "session_to": max(session_times) if session_times else None,
    }


def journal_orders(
    path: str,
    *,
    size: int = 100,
    status: str | None = None,
    exchange: str | None = None,
    symbol: str | None = None,
    q: str | None = None,
) -> dict[str, Any]:
    snapshot = load_journal(path)
    items = snapshot["items"]
    if status:
        items = [row for row in items if str(row.get("status", "")).lower() == status.lower()]
    if exchange:
        items = [row for row in items if str(row.get("exchange", "")).lower() == exchange.lower()]
    if symbol:
        items = [row for row in items if str(row.get("symbol", "")).lower() == symbol.lower()]
    if q:
        needle = q.lower()
        items = [row for row in items if needle in str(row).lower()]
    return {
        "items": [_withhold_reason(row) for row in items[:size]],
        "count": len(items),
        "returned": min(size, len(items)),
        "source": snapshot["source"],
        "from": snapshot["from"],
        "to": snapshot["to"],
    }


def journal_order_lifecycle(path: str, order_id: str) -> dict[str, Any]:
    snapshot = load_journal(path)
    events = [row for row in snapshot["events"] if row["order_id"] == order_id]
    return {"order_id": order_id, "events": events, "count": len(events), "source": snapshot["source"]}


def journal_rejections(path: str) -> dict[str, Any]:
    snapshot = load_journal(path)
    unique = [_rejection_row(snapshot, row) for row in snapshot["rejected"]]
    groups: dict[str, dict[str, Any]] = {}
    for row in unique:
        reason = str(row.get("reason") or "").strip() or "No recorded reason"
        code = row.get("code") or rejection_code(reason) or "RMS"
        category = row.get("rejection_category") or rejection_category(reason) or "Uncategorized"
        if reason not in groups:
            groups[reason] = {"code": code, "reason": reason, "category": category, "count": 0, "trend": "—"}
        groups[reason]["count"] += 1
    ranked = sorted(groups.values(), key=lambda row: row["count"], reverse=True)
    categories = Counter(row.get("rejection_category") or "Uncategorized" for row in unique)
    total_orders = snapshot["count"] or 1
    return {
        "groups": ranked,
        "orders": unique,
        "rejected_unique_orders": len(unique),
        "truncated": False,
        "categories": [{"name": name, "count": count} for name, count in categories.most_common()],
        "reject_rate": round(len(unique) / total_orders * 100, 3),
        "total": len(unique),
        "count": len(unique),
        "journal_events": len(snapshot["events"]),
        "records": snapshot["records"],
        "source": snapshot["source"],
        "from": snapshot["from"],
        "to": snapshot["to"],
    }


def journal_sessions(path: str) -> dict[str, Any]:
    snapshot = load_journal(path)
    items = snapshot["sessions"]
    login_count = sum(1 for row in items if row.get("event") == "login")
    logout_count = sum(1 for row in items if row.get("event") == "logout")
    return {
        "items": items,
        "count": len(items),
        "login_count": login_count,
        "logout_count": logout_count,
        "active_count": len(snapshot["active_sessions"]),
        "journal_events": len(snapshot["events"]),
        "records": snapshot["records"],
        "from": snapshot.get("session_from") or snapshot["from"],
        "to": snapshot.get("session_to") or snapshot["to"],
        "source": snapshot["source"],
    }


def journal_session_summary(path: str) -> dict[str, Any]:
    snapshot = load_journal(path)
    all_events = snapshot["sessions"]
    items = snapshot["active_sessions"]
    brokers = Counter(row.get("broker") or "Unknown" for row in items)
    access = Counter(row.get("access_type") or "Unknown" for row in items)
    segments: Counter[str] = Counter()
    versions = Counter(row.get("app_version") or "Unknown" for row in items)
    for row in items:
        for seg in row.get("segments") or []:
            segments[str(seg)] += 1
    return {
        "active_sessions": len(items),
        "login_events": sum(1 for row in all_events if row.get("event") == "login"),
        "logout_events": sum(1 for row in all_events if row.get("event") == "logout"),
        "total_events": len(all_events),
        "unique_users": len({row.get("user_id") for row in all_events if row.get("user_id")}),
        "unique_brokers": len({row.get("broker") for row in items if row.get("broker")}),
        "brokers": [{"name": name, "count": count} for name, count in brokers.most_common(20)],
        "access_types": [{"name": name, "count": count} for name, count in access.most_common()],
        "segments": [{"name": name, "count": count} for name, count in segments.most_common()],
        "versions": [{"name": name, "count": count} for name, count in versions.most_common()],
        "journal_events": len(snapshot["events"]),
        "records": snapshot["records"],
        "source": snapshot["source"],
        "from": snapshot.get("session_from") or snapshot["from"],
        "to": snapshot.get("session_to") or snapshot["to"],
    }


def journal_login_trend(path: str) -> dict[str, Any]:
    snapshot = load_journal(path)
    buckets = Counter()
    for row in snapshot["sessions"]:
        if row.get("event") != "login":
            continue
        time = str(row.get("time") or "")
        if not time:
            continue
        buckets[time[:16]] += 1
    return {
        "buckets": [{"key": key, "count": count} for key, count in sorted(buckets.items())],
        "source": snapshot["source"],
    }


def journal_exchanges(path: str) -> dict[str, Any]:
    snapshot = load_journal(path)
    total_events = sum(snapshot["exchange_counts"].values()) or 1
    rejected = len(snapshot["rejected"])
    reject_rate = round(rejected / (snapshot["count"] or 1) * 100, 2)
    items = []
    for name, events in snapshot["exchange_counts"].most_common():
        share = events / total_events
        items.append(
            {
                "name": name,
                "status": "Live",
                "events": events,
                "reject_rate": round(reject_rate * share, 2),
                "lag_ms": None,
                "packets_per_sec": None,
                "last_tick": snapshot["to"],
                "source": snapshot["source"],
            }
        )
    return {"items": items, "count": len(items), "source": snapshot["source"]}


def journal_yel_health(path: str) -> dict[str, Any]:
    snapshot = load_journal(path)
    keys: list[str] = []
    for doc in snapshot["yel_docs"]:
        for key in doc.get("Keys") or []:
            keys.append(str(key))
    return {
        "connected": bool(keys),
        "keys": sorted(set(keys)),
        "source": snapshot["source"],
        "from": snapshot["from"],
        "to": snapshot["to"],
    }


def journal_overview(path: str) -> dict[str, Any]:
    snapshot = load_journal(path)
    total = snapshot["count"] or 0
    rejected = len(snapshot["rejected"])
    complete = len(snapshot["complete"])
    exchanges = [
        {"name": name, "events": count}
        for name, count in snapshot["exchange_counts"].most_common()
    ]
    symbols = len({row.get("symbol") for row in snapshot["items"] if row.get("symbol")})
    brokers = len({row.get("broker") for row in snapshot["items"] if row.get("broker")})
    order_items = snapshot["items"]
    open_only = [row for row in order_items if row.get("status") == "OPEN"]
    pending_only = [row for row in order_items if row.get("status") in {"PENDING", "TRIGGER_PENDING"}]
    return {
        "orders": total,
        "complete": complete,
        "rejected": rejected,
        "open": len(open_only),
        "pending": len(pending_only),
        "reject_rate": round(rejected / total * 100, 3) if total else 0.0,
        "brokers": brokers,
        "symbols": symbols,
        "exchanges": exchanges,
        "sessions": journal_session_summary(path),
        "yel": journal_yel_health(path),
        "journal_events": len(snapshot["events"]),
        "records": snapshot["records"],
        "source": snapshot["source"],
        "from": snapshot["from"],
        "to": snapshot["to"],
    }


def journal_trades(path: str, *, size: int = 100) -> dict[str, Any]:
    snapshot = load_journal(path)
    items = []
    for row in snapshot["complete"][:size]:
        price = float(row.get("fill_price") or row.get("price") or 0)
        qty = float(row.get("filled_qty") or row.get("qty") or 0)
        items.append(
            {
                "trade_id": f"T-{row.get('order_id')}",
                "order_id": row.get("order_id"),
                "time": row.get("time"),
                "exchange": row.get("exchange"),
                "symbol": row.get("symbol"),
                "side": row.get("side"),
                "qty": row.get("filled_qty") or row.get("qty"),
                "price": row.get("fill_price") or row.get("price"),
                "value": round(price * qty, 2),
                "account": row.get("account"),
                "user": row.get("user"),
                "broker": row.get("broker"),
                "source": snapshot["source"],
            }
        )
    return {"items": items, "count": len(items), "source": snapshot["source"]}


def journal_order_latency(path: str) -> dict[str, Any]:
    """Legacy exchange-bucket summary; prefer journal_order_latency_rows for the latency UI."""
    snapshot = load_journal(path)
    buckets: dict[str, list[float]] = {}
    for row in snapshot["events"]:
        latency = row.get("latency_ms")
        if latency is None:
            continue
        exchange = str(row.get("exchange") or "Unknown")
        buckets.setdefault(exchange, []).append(float(latency))
    items = []
    for exchange, values in sorted(buckets.items()):
        values.sort()
        p50 = values[len(values) // 2]
        p95 = values[int(len(values) * 0.95) - 1] if len(values) > 1 else values[0]
        items.append(
            {
                "exchange": exchange,
                "samples": len(values),
                "p50_ms": round(p50, 3),
                "p95_ms": round(p95, 3),
                "max_ms": round(max(values), 3),
                "source": snapshot["source"],
            }
        )
    return {
        "items": items,
        "count": len(items),
        "source": snapshot["source"],
        "note": "Derived from Noren original vs current event timestamps in the journal snapshot",
    }


def _ms_to_us(ms: float) -> float:
    return round(float(ms) * 1000.0, 2)


def _float_field(value: Any) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def load_order_latency_csv(path: str) -> list[dict[str, Any]]:
    """Parse L_ORDERLATENCY*.csv into rows shaped for _latency_payload."""
    rows: list[dict[str, Any]] = []
    with Path(path).open(encoding="utf-8", newline="") as stream:
        for raw in csv.DictReader(stream):
            rows.append(
                {
                    "NOREN_ORD_NUM": str(raw.get("NOREN_ORD_NUM") or "").strip(),
                    "EXCH_SEG": str(raw.get("EXCH_SEG") or "—").strip(),
                    "EXT_RMKS": str(raw.get("EXT_RMKS") or "").strip(),
                    "OMS_STATUS": raw.get("OMS_STATUS"),
                    "OMS_LATENCY": _float_field(raw.get("OMS_LATENCY")),
                    "EXCH_STATUS": str(raw.get("EXCH_STATUS") or "").strip(),
                    "OMS_EXCH_CONFIRMATION": _float_field(raw.get("OMS_EXCH_CONFIRMATION")),
                    "OMSUPDATETIME": raw.get("OMSUPDATETIME") or 0,
                    "EXCHUPDATETIME": raw.get("EXCHUPDATETIME") or 0,
                }
            )
    return [row for row in rows if row["NOREN_ORD_NUM"]]


def resolve_order_latency_csv() -> str | None:
    """Optional L_ORDERLATENCY CSV beside the journal or at repo root."""
    explicit = settings.order_latency_path.strip()
    if explicit and Path(explicit).is_file():
        return explicit
    if settings.journal_path:
        parent = Path(settings.journal_path).resolve().parent
        matches = sorted(parent.glob("L_ORDERLATENCY*.csv"))
        if matches:
            return str(matches[-1])
    repo_matches = sorted(Path(".").resolve().glob("L_ORDERLATENCY*.csv"))
    if repo_matches:
        return str(repo_matches[-1])
    return None


def journal_order_latency_rows(path: str) -> tuple[list[dict[str, Any]], str]:
    """Build L_ORDERLATENCY-shaped rows from journal OMS intervals, with CSV fallback."""
    snapshot = load_journal(path)
    rows = _journal_latency_rows_from_items(snapshot["items"])
    if rows:
        return rows, snapshot["source"]

    csv_path = resolve_order_latency_csv()
    if csv_path:
        csv_rows = load_order_latency_csv(csv_path)
        if csv_rows:
            return csv_rows, "order-latency csv"
    return [], snapshot["source"]


def _journal_latency_rows_from_items(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for row in items:
        latency_ms = row.get("latency_ms")
        if latency_ms is None:
            continue
        exch_ord = str(row.get("exchange_order_id") or "").strip()
        status_code = row.get("status_code")
        confirmed = bool(exch_ord)
        rows.append(
            {
                "NOREN_ORD_NUM": row.get("order_id"),
                "EXCH_SEG": row.get("exchange") or "—",
                "EXT_RMKS": row.get("eref") or row.get("symbol") or "",
                "OMS_STATUS": status_code if status_code is not None else "",
                "OMS_LATENCY": _ms_to_us(float(latency_ms)),
                "EXCH_STATUS": status_code if confirmed else "",
                "OMS_EXCH_CONFIRMATION": 0.0,
                "OMSUPDATETIME": 0,
                "EXCHUPDATETIME": 0,
            }
        )
    return rows


def journal_rca(path: str, order_id: str) -> dict[str, Any]:
    lifecycle = journal_order_lifecycle(path, order_id)
    events = lifecycle.get("events", [])
    if not events:
        return {"order_id": order_id, "found": False, "source": lifecycle["source"]}
    latest = events[-1]
    rejected = [row for row in events if row.get("status") == "REJECTED" or row.get("rejection_category")]
    evidence = rejected[-1] if rejected else latest
    category = evidence.get("rejection_category") or "Order Lifecycle"
    return {
        "order_id": order_id,
        "found": True,
        "summary": {
            "status": latest.get("status"),
            "exchange": latest.get("exchange"),
            "symbol": latest.get("symbol"),
            "broker": latest.get("broker"),
            "category": category,
            "code": evidence.get("code"),
            "probable_cause": category,
            "confidence": 0.85 if category != "Order Lifecycle" else 0.65,
        },
        "correlation": {"eref": latest.get("eref"), "exchange_order_id": latest.get("exchange_order_id")},
        "evidence": events,
        "source": lifecycle["source"],
    }
