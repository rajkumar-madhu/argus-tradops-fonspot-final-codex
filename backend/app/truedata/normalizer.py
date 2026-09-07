from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from app.truedata.symbols import SymbolSpec


def _as_dict(tick: Any) -> dict[str, Any]:
    if tick is None:
        return {}
    if isinstance(tick, dict):
        return tick
    if hasattr(tick, "to_dict"):
        try:
            return tick.to_dict()
        except Exception:
            pass
    if hasattr(tick, "__dict__"):
        return {k: v for k, v in vars(tick).items() if not k.startswith("_")}
    return {}


def _num(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _spread_bps(bid: float, ask: float) -> float:
    if bid <= 0 or ask <= 0:
        return 0.0
    mid = (bid + ask) / 2
    if mid <= 0:
        return 0.0
    return round((ask - bid) / mid * 10_000, 2)


def normalize_tick(tick: Any, spec: SymbolSpec) -> dict[str, Any]:
    """Map a TrueData live tick object to the TradeOps market-data contract."""
    data = _as_dict(tick)
    ltp = _num(data.get("ltp"))
    bid = _num(data.get("best_bid_price") or data.get("bid"), ltp)
    ask = _num(data.get("best_ask_price") or data.get("ask"), ltp)
    bid_qty = int(_num(data.get("best_bid_qty") or data.get("total_bid")))
    ask_qty = int(_num(data.get("best_ask_qty") or data.get("total_ask")))
    return {
        "symbol": str(data.get("symbol") or spec.symbol),
        "exchange": spec.exchange,
        "segment": spec.segment,
        "ltp": ltp,
        "change_pct": round(_num(data.get("change_perc")), 3),
        "bid": bid,
        "ask": ask,
        "bid_qty": bid_qty,
        "ask_qty": ask_qty,
        "spread_bps": _spread_bps(bid, ask),
        "volume": int(_num(data.get("ttq") or data.get("volume"))),
        "open": _num(data.get("day_open") or data.get("open")),
        "high": _num(data.get("day_high") or data.get("high")),
        "low": _num(data.get("day_low") or data.get("low")),
        "oi": int(_num(data.get("oi"))),
        "tick_time": data.get("timestamp"),
        "source": "truedata",
    }


def build_feed_health(
    *,
    connected: bool,
    packets: int,
    flush_interval: float,
    segment_counts: dict[str, int],
    segment_lags: dict[str, float],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Derive feed + segment cards from worker telemetry."""
    pps = round(packets / max(flush_interval, 1), 1)
    feeds = [
        {
            "name": "TrueData NSE CM",
            "status": "Live" if connected else "Disconnected",
            "lag_ms": int(segment_lags.get("NSE EQ", 0)),
            "packets_per_sec": pps,
            "last_tick": datetime.now(timezone.utc).strftime("%H:%M:%S"),
        },
        {
            "name": "TrueData NFO",
            "status": "Live" if connected else "Disconnected",
            "lag_ms": int(segment_lags.get("NFO", 0)),
            "packets_per_sec": pps,
            "last_tick": datetime.now(timezone.utc).strftime("%H:%M:%S"),
        },
        {
            "name": "TrueData BSE CM",
            "status": "Live" if connected else "Disconnected",
            "lag_ms": int(segment_lags.get("BSE EQ", 0)),
            "packets_per_sec": pps,
            "last_tick": datetime.now(timezone.utc).strftime("%H:%M:%S"),
        },
    ]
    segments = [
        {
            "name": name,
            "symbols": segment_counts.get(name, 0),
            "status": "Live" if connected and segment_counts.get(name, 0) else "No ticks",
            "lag_ms": int(segment_lags.get(name, 0)),
        }
        for name in sorted(segment_counts)
    ]
    return feeds, segments


def segment_key(exchange: str, segment: str) -> str:
    if exchange == "NFO":
        return "NFO"
    return f"{exchange} {segment}"
