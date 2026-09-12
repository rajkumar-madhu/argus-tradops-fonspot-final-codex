from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any

from prometheus_client import start_http_server

from app.config import settings
from app.event_bus import publish
from app.leader import RedisLeaderLease
from app.logging_setup import configure_logging
from app.market_cache import save_snapshot
from app.metrics import MARKET_CONNECTED, MARKET_FLUSH_SECONDS, MARKET_LEADER, MARKET_PUBLISHED, MARKET_TICKS
from app.truedata.normalizer import build_feed_health, normalize_tick, segment_key
from app.truedata.symbols import parse_symbol_specs
from app.workers.shutdown import GracefulShutdown

log = logging.getLogger("tradeops.market")


def _fingerprint(obj: Any) -> str:
    return json.dumps(obj, sort_keys=True, default=str, separators=(",", ":"))


class MarketDataSession:
    """Thin wrapper around the optional TrueData SDK."""

    def __init__(self) -> None:
        self._client: Any = None
        self._symbols: list[str] = []

    @property
    def connected(self) -> bool:
        return self._client is not None

    def connect(self, symbols: list[str]) -> None:
        from truedata import TD_live  # optional dependency

        kwargs: dict[str, Any] = {}
        if settings.truedata_ws_url:
            kwargs["url"] = settings.truedata_ws_url
        if settings.truedata_ws_port:
            kwargs["live_port"] = settings.truedata_ws_port
        self._client = TD_live(settings.truedata_username, settings.truedata_password, **kwargs)
        self._symbols = symbols
        self._client.start_live_data(symbols)
        log.info("subscribed to %s symbols via TrueData", len(symbols))

    def disconnect(self) -> None:
        if not self._client:
            return
        try:
            if self._symbols:
                self._client.stop_live_data(self._symbols)
            self._client.disconnect()
        except Exception:
            log.exception("truedata disconnect failed")
        finally:
            self._client = None
            self._symbols = []

    def live_tick(self, symbol: str) -> Any:
        if not self._client:
            return None
        return self._client.live_data.get(symbol)


def _segment_lag(tick: dict[str, Any]) -> float | None:
    ts = tick.get("tick_time")
    if not ts:
        return None
    try:
        if isinstance(ts, datetime):
            tick_at = ts if ts.tzinfo else ts.replace(tzinfo=timezone.utc)
        else:
            tick_at = datetime.fromisoformat(str(ts).replace("Z", "+00:00"))
        return max(0.0, (datetime.now(timezone.utc) - tick_at).total_seconds() * 1000)
    except Exception:
        return None  # an unparsable tick time is not zero lag


def flush_once(session: MarketDataSession, specs: list) -> dict[str, Any]:
    symbols: list[dict[str, Any]] = []
    segment_counts: dict[str, int] = {}
    segment_lags: dict[str, float] = {}
    for spec in specs:
        raw = session.live_tick(spec.symbol)
        if raw is None:
            continue
        row = normalize_tick(raw, spec)
        symbols.append(row)
        key = segment_key(spec.exchange, spec.segment)
        segment_counts[key] = segment_counts.get(key, 0) + 1
        lag = _segment_lag(row)
        if lag is not None:
            segment_lags[key] = max(segment_lags.get(key, 0.0), lag)
    feeds, segments = build_feed_health(
        connected=session.connected,
        packets=len(symbols),
        flush_interval=settings.market_flush_interval_seconds,
        segment_counts=segment_counts,
        segment_lags=segment_lags,
    )
    return {
        "symbols": symbols,
        "feeds": feeds,
        "segments": segments,
        "source": "truedata",
        "provider": "truedata",
    }


def _publish_symbol_updates(snapshot: dict[str, Any], seen: dict[str, str]) -> int:
    published = 0
    for row in snapshot.get("symbols") or []:
        key = f"{row.get('exchange')}:{row.get('symbol')}"
        marker = _fingerprint(row)
        if seen.get(key) == marker:
            continue
        seen[key] = marker
        publish("market", row)
        MARKET_PUBLISHED.inc()
        published += 1
    return published


def _hold_idle(shutdown: GracefulShutdown) -> None:
    """Keep the process up (so a restart policy does not thrash it) until SIGTERM."""
    if settings.metrics_enabled:
        start_http_server(settings.worker_metrics_port)
    while not shutdown.wait(3600):
        pass


def main() -> None:
    configure_logging("market")
    shutdown = GracefulShutdown().install()
    if not settings.truedata_enabled:
        log.info("TRUEDATA_ENABLED=false — market worker idle (holding process)")
        _hold_idle(shutdown)
        return
    if not settings.truedata_username or not settings.truedata_password:
        log.error("TRUEDATA_USERNAME/TRUEDATA_PASSWORD required when TRUEDATA_ENABLED=true")
        _hold_idle(shutdown)
        return
    specs = parse_symbol_specs(settings.truedata_symbols)
    if not specs:
        log.error("TRUEDATA_SYMBOLS is empty")
        _hold_idle(shutdown)
        return

    if settings.metrics_enabled:
        start_http_server(settings.worker_metrics_port)

    lease = RedisLeaderLease(settings.market_leader_key, settings.market_leader_ttl_seconds)
    session = MarketDataSession()
    is_leader = False
    dedupe: dict[str, str] = {}

    log.info(
        "starting market worker symbols=%s flush=%ss",
        len(specs),
        settings.market_flush_interval_seconds,
    )
    try:
        while not shutdown.requested:
            try:
                if not is_leader:
                    is_leader = lease.acquire()
                    MARKET_LEADER.set(1 if is_leader else 0)
                    if is_leader:
                        log.info("acquired market-data leader lease")
                else:
                    is_leader = lease.renew()
                    MARKET_LEADER.set(1 if is_leader else 0)
                    if not is_leader:
                        log.warning("lost market-data leader lease")
                        session.disconnect()
                        MARKET_CONNECTED.set(0)

                if is_leader:
                    if not session.connected:
                        session.connect([s.symbol for s in specs])
                        MARKET_CONNECTED.set(1)
                    with MARKET_FLUSH_SECONDS.time():
                        snapshot = flush_once(session, specs)
                        MARKET_TICKS.inc(len(snapshot.get("symbols") or []))
                        save_snapshot(snapshot)
                        _publish_symbol_updates(snapshot, dedupe)
                elif session.connected:
                    session.disconnect()
                    MARKET_CONNECTED.set(0)
            except Exception:
                MARKET_CONNECTED.set(0)
                session.disconnect()
                log.exception("market worker iteration failed")
            shutdown.wait(settings.market_flush_interval_seconds)
    finally:
        MARKET_LEADER.set(0)
        MARKET_CONNECTED.set(0)
        session.disconnect()
        if is_leader:
            try:
                lease.release()
                log.info("released market-data leader lease")
            except Exception:
                log.warning("lease release failed; standby takes over when the TTL expires")


if __name__ == "__main__":
    main()
