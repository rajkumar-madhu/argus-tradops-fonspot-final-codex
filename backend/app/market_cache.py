from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from app.config import settings
from app.event_bus import get_redis


def save_snapshot(payload: dict[str, Any]) -> None:
    body = {
        **payload,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    get_redis().set(
        settings.market_snapshot_key,
        json.dumps(body, default=str, separators=(",", ":")),
        ex=settings.market_snapshot_ttl_seconds,
    )


def load_snapshot() -> dict[str, Any] | None:
    raw = get_redis().get(settings.market_snapshot_key)
    if not raw:
        return None
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return None
