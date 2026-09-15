"""Operator query windows: IST calendar day by default, or a rolling lookback.

Live pages mean "today's orders" unless the operator picks another window or date.
``day`` is a calendar date in Asia/Kolkata (IST, UTC+5:30), not a rolling 24h.
"""
from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from typing import Any

IST = timezone(timedelta(hours=5, minutes=30))
LOOKBACK_RE = re.compile(r"^[0-9]+[mhdw]$")
DAY_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
# FastAPI Query pattern for lookback: rolling window, today, or custom date.
LOOKBACK_QUERY_PATTERN = r"^([0-9]+[mhdw]|today|custom)$"
DAY_QUERY_PATTERN = r"^\d{4}-\d{2}-\d{2}$"


def ist_today(now: datetime | None = None) -> str:
    return (now or datetime.now(IST)).astimezone(IST).date().isoformat()


def resolve_window(lookback: str | None, day: str | None) -> tuple[str | None, str | None]:
    """Return ``(lookback, day)``. Day wins for custom dates; default is IST today.

    ``lookback=today`` always means the current IST calendar day, even if a stale
    ``day`` field is still on the form. A rolling window (``7d``) ignores ``day``.
    """
    if lookback == "today":
        return None, ist_today()
    if lookback and LOOKBACK_RE.match(lookback):
        return lookback, None
    if day and DAY_RE.match(day):
        return None, day
    return None, ist_today()


def ist_day_bounds(day: str) -> tuple[str, str]:
    """Half-open UTC interval ``[start, end)`` covering one IST calendar day."""
    if not DAY_RE.match(day):
        raise ValueError("day must be YYYY-MM-DD")
    start = datetime.strptime(day, "%Y-%m-%d").replace(tzinfo=IST)
    end = start + timedelta(days=1)
    return (
        start.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        end.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    )


def es_range(field: str, lookback: str | None = None, day: str | None = None) -> dict[str, Any]:
    lb, calendar_day = resolve_window(lookback, day)
    if calendar_day:
        gte, lt = ist_day_bounds(calendar_day)
        return {"range": {field: {"gte": gte, "lt": lt}}}
    return {"range": {field: {"gte": f"now-{lb}"}}}
