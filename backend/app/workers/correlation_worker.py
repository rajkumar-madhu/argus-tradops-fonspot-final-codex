from __future__ import annotations
import logging
import socket
import time
from prometheus_client import start_http_server
from app.config import settings
from app.db import init_db
from app.event_bus import BLOCK_MS, STREAMS, dead_letter, decode_message, ensure_group, get_redis, publish
from app.elastic.noren_service import rca as build_rca
from app.metrics import REDIS_STREAM_LAG, WORKER_DLQ, WORKER_INCIDENTS, WORKER_MESSAGES, WORKER_RCA
from app.repository import upsert_incident, upsert_rca

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s correlation %(message)s")
log = logging.getLogger("tradeops.correlation")
GROUP = settings.redis_correlation_group
CONSUMER = f"{socket.gethostname()}-{int(time.time())}"

# Categories escalated to P2. These strings must be values that
# `app.elastic.normalizer.rejection_category()` actually returns -- it is the only
# producer of the field -- otherwise the comparison silently never matches.
P2_CATEGORIES = {
    "RMS / Margin",
    "RMS / Risk Block",
    "RMS / Regulatory",
    "Gateway / YEL",
}


def _handle_rejection(payload: dict) -> None:
    order_id = str(payload.get("order_id") or "")
    if not order_id:
        return
    reason = str(payload.get("reason") or "Unknown rejection")
    category = str(payload.get("rejection_category") or "Order Rejection")
    severity = "P2" if category in P2_CATEGORIES else "P3"

    # RCA is built first: it is the step that reaches out to Elasticsearch and so
    # the step that fails. The incident upsert increments occurrence_count, so
    # doing it before a failure-prone call would inflate the count and re-publish
    # the incident once per retry.
    try:
        case = build_rca(order_id, lookback=settings.rca_lookback)
    except Exception:
        WORKER_RCA.labels(result="error").inc()
        raise
    if case.get("found"):
        stored = upsert_rca(case)
        publish("rca", stored)
        WORKER_RCA.labels(result="ok").inc()
    else:
        WORKER_RCA.labels(result="not_found").inc()

    incident = upsert_incident(
        incident_type="ORDER_REJECTION",
        key=f"{order_id}:{category}",
        title=f"{payload.get('exchange') or 'Exchange'} {payload.get('symbol') or ''} order rejected: {reason}"[:512],
        severity=severity,
        evidence={"order": payload},
        source="noren-event-bus",
    )
    WORKER_INCIDENTS.labels(type="ORDER_REJECTION").inc()
    publish("incidents", incident)

def _handle_exchange(payload: dict) -> None:
    if payload.get("connected"):
        return
    incident = upsert_incident(
        incident_type="YEL_CONNECTIVITY",
        key="YEL",
        title="YEL connectivity unavailable",
        severity="P1",
        evidence=payload,
        source="noren-event-bus",
    )
    WORKER_INCIDENTS.labels(type="YEL_CONNECTIVITY").inc()
    publish("incidents", incident)

def _retry_key(stream_name: str, msg_id: str) -> str:
    safe_stream = stream_name.replace(":", "_")
    return f"tradeops:retry:{GROUP}:{safe_stream}:{msg_id}"

def _process(r, stream_name: str, msg_id: str, fields: dict) -> None:
    envelope = decode_message(fields)
    payload = envelope.get("payload") or {}
    label = "rejections" if stream_name == STREAMS["rejections"] else "exchange"
    try:
        if stream_name == STREAMS["rejections"]:
            _handle_rejection(payload)
        elif stream_name == STREAMS["exchange"]:
            _handle_exchange(payload)
        r.xack(stream_name, GROUP, msg_id)
        r.delete(_retry_key(stream_name, msg_id))
        WORKER_MESSAGES.labels(stream=label, result="acked").inc()
    except Exception as exc:
        key = _retry_key(stream_name, msg_id)
        attempts = int(r.incr(key))
        r.expire(key, settings.redis_retry_key_ttl)
        WORKER_MESSAGES.labels(stream=label, result="failed").inc()
        if attempts >= settings.redis_retry_max_attempts:
            dead_letter(source_stream=stream_name, message_id=msg_id, envelope=envelope, error=repr(exc), attempts=attempts)
            r.xack(stream_name, GROUP, msg_id)
            r.delete(key)
            WORKER_DLQ.labels(stream=label).inc()
            log.exception("moved to DLQ stream=%s id=%s attempts=%s", stream_name, msg_id, attempts)
        else:
            log.exception("processing failed stream=%s id=%s attempt=%s", stream_name, msg_id, attempts)

def _reclaim_pending(r, stream_name: str) -> None:
    try:
        result = r.xautoclaim(
            stream_name, GROUP, CONSUMER,
            min_idle_time=settings.redis_retry_idle_ms,
            start_id="0-0", count=50,
        )
        messages = result[1] if isinstance(result, (list, tuple)) and len(result) > 1 else []
        for msg_id, fields in messages:
            _process(r, stream_name, msg_id, fields)
    except Exception:
        log.exception("pending reclaim failed stream=%s", stream_name)

def _update_pending_metrics(r, stream_name: str) -> None:
    try:
        summary = r.xpending(stream_name, GROUP)
        pending = int(summary.get("pending", 0)) if isinstance(summary, dict) else int(summary[0])
        REDIS_STREAM_LAG.labels(stream=stream_name, group=GROUP).set(pending)
    except Exception:
        pass

def main() -> None:
    if settings.auto_create_schema:
        init_db()
    if settings.metrics_enabled:
        start_http_server(settings.worker_metrics_port)
    r = get_redis()
    for kind in ("rejections", "exchange"):
        ensure_group(kind, GROUP)
    streams = {STREAMS["rejections"]: ">", STREAMS["exchange"]: ">"}
    log.info("starting consumer group=%s consumer=%s", GROUP, CONSUMER)
    while True:
        try:
            for stream_name in streams:
                _reclaim_pending(r, stream_name)
                _update_pending_metrics(r, stream_name)
            batches = r.xreadgroup(GROUP, CONSUMER, streams, count=100, block=BLOCK_MS)
            for stream_name, messages in batches or []:
                for msg_id, fields in messages:
                    _process(r, stream_name, msg_id, fields)
        except Exception:
            log.exception("consumer loop failed")
            time.sleep(2)

if __name__ == "__main__":
    main()
