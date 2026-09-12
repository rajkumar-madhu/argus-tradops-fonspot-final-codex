"""Data freshness: how old is what each screen is showing, and is that normal?

Every source gets the same shape so the UI can render one badge:

    {"state": "live" | "delayed" | "stale" | "closed" | "batch" | "unavailable",
     "as_of": ISO-8601 | None, "age_seconds": float | None, ...detail}

Thresholds are deliberately plain seconds, configurable by environment. Outside
the configured trading window a quiet order stream is reported as ``closed``,
not ``stale``: a two-hour-old event at 18:00 IST is expected, at 11:00 it is an
outage. The window defaults to the NSE/BSE equity and F&O session; MCX trades
until 23:30, so widen ``TRADEOPS_TRADING_HOURS`` where commodities matter.
"""
from __future__ import annotations

import os
import re
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path
from typing import Any

IST = timezone(timedelta(hours=5, minutes=30))

LIVE_SECONDS = float(os.getenv("TRADEOPS_FRESH_LIVE_SECONDS", "60"))
DELAYED_SECONDS = float(os.getenv("TRADEOPS_FRESH_DELAYED_SECONDS", "300"))
TRADING_HOURS = os.getenv("TRADEOPS_TRADING_HOURS", "09:00-15:30")
TRADING_DAYS = os.getenv("TRADEOPS_TRADING_DAYS", "1-5")  # ISO weekday range, Mon=1
# The daily CSV drop lands around 18:20 IST; after this clock time a missing
# file for today is "delayed", before it the newest day is expected to be D-1.
BATCH_EXPECTED_BY = os.getenv("TRADEOPS_CSV_BATCH_EXPECTED_BY", "18:40")

_FILE_DATE = re.compile(r"(\d{2}-[A-Za-z]{3}-\d{4})")


def _parse_clock(text: str) -> time:
    hh, mm = text.strip().split(":")
    return time(int(hh), int(mm))


def _parse_days(text: str) -> set[int]:
    lo, _, hi = text.partition("-")
    lo_i = int(lo)
    hi_i = int(hi) if hi else lo_i
    return set(range(lo_i, hi_i + 1))


def trading_open(now: datetime, *, hours: str = TRADING_HOURS, days: str = TRADING_DAYS) -> bool:
    """True inside the configured session (IST). Holidays are not modelled."""
    local = now.astimezone(IST)
    if local.isoweekday() not in _parse_days(days):
        return False
    start, _, end = hours.partition("-")
    return _parse_clock(start) <= local.time() <= _parse_clock(end)


def assess(as_of: datetime | float | None, now: datetime, *, session_aware: bool = False,
           live: float = LIVE_SECONDS, delayed: float = DELAYED_SECONDS) -> dict[str, Any]:
    """Classify an observation time. ``as_of`` may be a datetime or epoch seconds."""
    if as_of is None:
        return {"state": "unavailable", "as_of": None, "age_seconds": None}
    stamp = datetime.fromtimestamp(as_of, tz=timezone.utc) if isinstance(as_of, (int, float)) else as_of
    if stamp.tzinfo is None:
        stamp = stamp.replace(tzinfo=timezone.utc)
    age = max(0.0, (now - stamp).total_seconds())
    if age <= live:
        state = "live"
    elif age <= delayed:
        state = "delayed"
    elif session_aware and not trading_open(now):
        state = "closed"
    else:
        state = "stale"
    return {"state": state, "as_of": stamp.isoformat(), "age_seconds": round(age, 1)}


def _epoch(value: Any) -> float | None:
    if value in (None, ""):
        return None
    try:
        if isinstance(value, (int, float)):
            return float(value) / (1000 if value > 1e11 else 1)
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).timestamp()
    except (TypeError, ValueError):
        return None


def elasticsearch_freshness(now: datetime) -> dict[str, Any]:
    """Newest event and ingest clocks in the order index; one size:0 query."""
    from app.config import settings
    from app.elastic.client import get_es
    es = get_es()
    if es is None:
        return {"state": "unavailable", "as_of": None, "age_seconds": None, "reason": "not configured"}
    try:
        result = es.options(request_timeout=3, max_retries=0).search(
            index=settings.noren_order_index, size=0,
            aggs={"event": {"max": {"field": settings.noren_timestamp_field}},
                  "ingest": {"max": {"field": settings.noren_ingest_timestamp_field}}})
    except Exception:  # noqa: BLE001 — never echo the client error (carries the URL)
        return {"state": "unavailable", "as_of": None, "age_seconds": None, "reason": "query failed"}
    aggs = result.get("aggregations", {})
    event = _epoch(aggs.get("event", {}).get("value"))
    ingest = _epoch(aggs.get("ingest", {}).get("value"))
    out = assess(event, now, session_aware=True)
    out["ingested_at"] = datetime.fromtimestamp(ingest, tz=timezone.utc).isoformat() if ingest else None
    # Pipeline lag of the newest document: harvest/receive clock minus event clock.
    out["ingest_lag_seconds"] = round(max(0.0, ingest - event), 1) if event and ingest else None
    out["index"] = settings.noren_order_index
    return out


def journal_freshness(now: datetime) -> dict[str, Any]:
    from app.config import settings
    path = (settings.journal_path or "").strip()
    if not path or not Path(path).is_file():
        return {"state": "unavailable", "as_of": None, "age_seconds": None}
    from app.journal_snapshot import load_journal
    snap = load_journal(path)
    mtime = Path(path).stat().st_mtime
    loaded = snap.get("loaded_at")
    return {
        "state": "batch",
        "as_of": snap.get("to"),
        "age_seconds": round((now - datetime.fromisoformat(snap["to"])).total_seconds(), 1) if snap.get("to") else None,
        "window": {"from": snap.get("from"), "to": snap.get("to")},
        "loaded_at": loaded,
        "file_modified_at": datetime.fromtimestamp(mtime, tz=timezone.utc).isoformat(),
        # A file replaced on disk keeps serving the old parse until restart.
        "file_changed_since_load": bool(loaded and mtime > datetime.fromisoformat(loaded).timestamp()),
    }


def newest_file_date(names: list[str]) -> date | None:
    dates = []
    for name in names:
        m = _FILE_DATE.search(name)
        if m:
            try:
                dates.append(datetime.strptime(m.group(1), "%d-%b-%Y").date())
            except ValueError:
                continue
    return max(dates) if dates else None


def batch_state(newest: date | None, now: datetime, *, expected_by: str = BATCH_EXPECTED_BY,
                days: str = TRADING_DAYS) -> str:
    """``batch`` when the newest day is what the schedule predicts, else ``delayed``."""
    if newest is None:
        return "unavailable"
    local = now.astimezone(IST)
    expected = local.date()
    if local.time() < _parse_clock(expected_by):
        expected -= timedelta(days=1)
    while expected.isoweekday() not in _parse_days(days):
        expected -= timedelta(days=1)
    return "batch" if newest >= expected else "delayed"


def csv_freshness(now: datetime) -> dict[str, Any]:
    from app import file_routes
    store = file_routes._store
    if store is None:
        return {"state": "unavailable", "as_of": None, "age_seconds": None, "reason": "not configured"}
    sources = store.sources()
    names = [f["name"] for f in sources.get("items", [])]
    newest = newest_file_date(names)
    imported = max((f.get("generation") or 0) for f in sources.get("items", [])) if names else 0
    imported_at = datetime.fromtimestamp(imported / 1e9, tz=timezone.utc) if imported else None
    return {
        "state": batch_state(newest, now),
        "as_of": newest.isoformat() if newest else None,
        "age_seconds": None,
        "newest_file_date": newest.isoformat() if newest else None,
        "imported_at": imported_at.isoformat() if imported_at else None,
        "files": len(names),
        "expected_by_ist": BATCH_EXPECTED_BY,
    }


def market_freshness(now: datetime) -> dict[str, Any]:
    from app.config import settings
    if not settings.truedata_enabled:
        return {"state": "unavailable", "as_of": None, "age_seconds": None, "reason": "not configured"}
    try:
        from app.market_cache import load_snapshot
        snap = load_snapshot()
    except Exception:  # noqa: BLE001
        return {"state": "unavailable", "as_of": None, "age_seconds": None, "reason": "cache unreachable"}
    if not snap:
        return {"state": "unavailable", "as_of": None, "age_seconds": None, "reason": "no snapshot"}
    return assess(_epoch(snap.get("updated_at")), now, session_aware=True, live=15, delayed=60)


def summary(*, data_source: str, now: datetime | None = None) -> dict[str, Any]:
    now = now or datetime.now(timezone.utc)
    sources: dict[str, Any] = {}
    if data_source == "elasticsearch":
        sources["elasticsearch"] = elasticsearch_freshness(now)
    sources["journal"] = journal_freshness(now)
    sources["csv"] = csv_freshness(now)
    sources["market"] = market_freshness(now)
    primary = sources.get("elasticsearch") if data_source == "elasticsearch" else sources["journal"]
    if data_source == "demo":
        primary = {"state": "unavailable", "as_of": None, "age_seconds": None, "reason": "offline"}
    return {
        "data_source": data_source,
        "primary": primary,
        "sources": sources,
        "thresholds": {"live_seconds": LIVE_SECONDS, "delayed_seconds": DELAYED_SECONDS,
                       "trading_hours_ist": TRADING_HOURS, "trading_days": TRADING_DAYS},
        "trading_open": trading_open(now),
        "generated_at": now.isoformat(),
        "source": "runtime",
    }
