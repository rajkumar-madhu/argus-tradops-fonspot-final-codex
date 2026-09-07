from __future__ import annotations
import json
from datetime import datetime, timezone
from functools import lru_cache
from typing import Any
import redis
from app.config import settings

STREAMS = {
    "orders": settings.redis_orders_stream,
    "rejections": settings.redis_rejections_stream,
    "exchange": settings.redis_exchange_stream,
    "incidents": settings.redis_incidents_stream,
    "rca": settings.redis_rca_stream,
    "market": settings.redis_market_stream,
    "dlq": settings.redis_dlq_stream,
}

# A blocking XREAD/XREADGROUP must return before the socket read timeout, or the
# client raises TimeoutError on every idle poll. Keep BLOCK_MS strictly below
# SOCKET_TIMEOUT_SECONDS and use it for every blocking stream read.
SOCKET_TIMEOUT_SECONDS = 10
BLOCK_MS = 5000


@lru_cache(maxsize=1)
def get_redis() -> redis.Redis:
    return redis.Redis.from_url(
        settings.redis_url,
        decode_responses=True,
        socket_timeout=SOCKET_TIMEOUT_SECONDS,
        socket_connect_timeout=5,
        health_check_interval=30,
    )

def redis_status() -> dict[str, Any]:
    try:
        r = get_redis()
        ok = bool(r.ping())
        stream_info: dict[str, Any] = {}
        for kind, stream in STREAMS.items():
            try:
                stream_info[kind] = {"name": stream, "length": int(r.xlen(stream))}
            except Exception:
                stream_info[kind] = {"name": stream, "length": None}
        return {"connected": ok, "url": settings.redis_public_label, "streams": stream_info}
    except Exception as exc:
        return {"connected": False, "error": str(exc)[:200], "streams": STREAMS}

def publish(kind: str, payload: dict[str, Any], *, maxlen: int | None = None) -> str:
    stream = STREAMS[kind]
    envelope = {
        "kind": kind,
        "published_at": datetime.now(timezone.utc).isoformat(),
        "payload": payload,
    }
    return get_redis().xadd(
        stream,
        {"json": json.dumps(envelope, default=str, separators=(",", ":"))},
        maxlen=maxlen or settings.redis_stream_maxlen,
        approximate=True,
    )

def dead_letter(*, source_stream: str, message_id: str, envelope: dict[str, Any], error: str, attempts: int) -> str:
    payload = {
        "source_stream": source_stream,
        "message_id": message_id,
        "attempts": attempts,
        "error": error[:1000],
        "failed_at": datetime.now(timezone.utc).isoformat(),
        "envelope": envelope,
    }
    return publish("dlq", payload)

def ensure_group(kind: str, group: str) -> None:
    r = get_redis()
    try:
        r.xgroup_create(STREAMS[kind], group, id="0-0", mkstream=True)
    except redis.ResponseError as exc:
        if "BUSYGROUP" not in str(exc):
            raise

def decode_message(fields: dict[str, str]) -> dict[str, Any]:
    raw = fields.get("json", "{}")
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {"kind": "unknown", "payload": {"raw": raw}}
