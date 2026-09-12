from __future__ import annotations
import json
import logging
from datetime import datetime
from typing import Any
from prometheus_client import start_http_server
from app.config import settings
from app.event_bus import get_redis, publish
from app.elastic.noren_service import live_orders, rejection_summary, yel_health
from app.leader import RedisLeaderLease
from app.logging_setup import configure_logging
from app.metrics import COLLECTOR_LEADER, COLLECTOR_PUBLISHED, COLLECTOR_RUNS, COLLECTOR_RUN_SECONDS, ES_INGEST_LAG, ES_LATEST_EVENT
from app.workers.shutdown import GracefulShutdown

log = logging.getLogger("tradeops.collector")

def _fingerprint(obj: Any) -> str:
    return json.dumps(obj, sort_keys=True, default=str, separators=(",", ":"))

def _publish_if_changed(key: str, kind: str, payload: dict[str, Any], ttl: int = 86400) -> bool:
    """Publish `payload` unless an identical one was already published.

    The dedupe marker is written *after* a successful publish. Writing it first
    means a failed publish suppresses that order for the whole marker TTL — the
    event is lost rather than retried. Publishing first can at worst duplicate a
    message, which downstream consumers already absorb (incident and RCA writes
    are upserts keyed by fingerprint / order id).
    """
    r = get_redis()
    marker = _fingerprint(payload)
    if r.get(key) == marker:
        return False
    publish(kind, payload)
    COLLECTOR_PUBLISHED.labels(kind=kind).inc()
    r.set(key, marker, ex=ttl)
    return True

def _epoch(value: Any) -> float | None:
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).timestamp() if value else None
    except ValueError:
        return None


def observe_freshness(items: list[dict[str, Any]]) -> tuple[float | None, float | None]:
    """(newest event epoch, worst ingest lag) over one collector batch; sets the gauges."""
    newest: float | None = None
    lag: float | None = None
    for order in items:
        event = _epoch(order.get("time"))
        if event is None:
            continue
        newest = event if newest is None else max(newest, event)
        ingested = _epoch(order.get("ingested_at"))
        if ingested is not None:
            lag = max(lag or 0.0, ingested - event)
    if newest is not None:
        ES_LATEST_EVENT.set(newest)
    if lag is not None:
        ES_INGEST_LAG.set(lag)
    return newest, lag


def collect_once() -> dict[str, int]:
    counts = {"orders": 0, "rejections": 0, "exchange": 0}
    with COLLECTOR_RUN_SECONDS.time():
        orders = live_orders(size=settings.collector_order_batch, lookback=settings.collector_lookback)
        observe_freshness(orders.get("items") or [])
        for order in reversed(orders.get("items") or []):
            oid = str(order.get("order_id") or "")
            if not oid:
                continue
            if _publish_if_changed(f"tradeops:dedupe:order:{oid}", "orders", order):
                counts["orders"] += 1

        rejections = rejection_summary(
            lookback=settings.collector_lookback,
            scan_limit=settings.collector_rejection_scan_limit,
            max_orders=None,  # every unique rejection must reach the event bus
        )
        for order in reversed(rejections.get("orders") or []):
            oid = str(order.get("order_id") or "")
            if oid and _publish_if_changed(f"tradeops:dedupe:rejection:{oid}", "rejections", order):
                counts["rejections"] += 1

        exchange = yel_health()
        if _publish_if_changed("tradeops:dedupe:exchange:yel", "exchange", exchange, ttl=7 * 86400):
            counts["exchange"] += 1
    return counts

def main() -> None:
    configure_logging("collector")
    shutdown = GracefulShutdown().install()
    if settings.metrics_enabled:
        start_http_server(settings.worker_metrics_port)
    lease = RedisLeaderLease(settings.collector_leader_key, settings.collector_leader_ttl_seconds)
    is_leader = False
    log.info("starting collector interval=%ss lookback=%s", settings.collector_interval_seconds, settings.collector_lookback)
    try:
        while not shutdown.requested:
            try:
                if not is_leader:
                    is_leader = lease.acquire()
                    COLLECTOR_LEADER.set(1 if is_leader else 0)
                    if is_leader:
                        log.info("acquired collector leader lease")
                else:
                    is_leader = lease.renew()
                    COLLECTOR_LEADER.set(1 if is_leader else 0)
                    if not is_leader:
                        log.warning("lost collector leader lease")

                if is_leader:
                    counts = collect_once()
                    COLLECTOR_RUNS.labels(result="ok").inc()
                    if any(counts.values()):
                        log.info("published %s", counts)
            except Exception:
                COLLECTOR_RUNS.labels(result="error").inc()
                log.exception("collector iteration failed")
            shutdown.wait(settings.collector_interval_seconds)
    finally:
        COLLECTOR_LEADER.set(0)
        if is_leader:
            try:
                lease.release()
                log.info("released collector leader lease")
            except Exception:
                log.warning("lease release failed; standby takes over when the TTL expires")

if __name__ == "__main__":
    main()
