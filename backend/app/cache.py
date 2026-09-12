"""A small per-process TTL cache for read-only aggregations.

The API is a stateless reader and several routes fan out to the same expensive
Elasticsearch scans (``/api/overview`` → ``session_summary`` → ``active_sessions``
fetches 5,000 session docs; ``/api/rejections`` scans up to 5,000 rejection
docs), and dashboards poll them. Re-using a result for a few seconds is what
a NOC screen expects; the ``cached_at`` stamp keeps the age visible.

Per process only — replicas do not share it, which is fine: the goal is to
stop one screen refresh costing four cluster scans, not to be a store.
"""
from __future__ import annotations

import threading
import time
from functools import wraps
from typing import Any, Callable

_LOCK = threading.Lock()
_STORE: dict[tuple, tuple[float, Any]] = {}


def ttl_cache(seconds: float):
    def decorate(fn: Callable[..., Any]) -> Callable[..., Any]:
        @wraps(fn)
        def wrapper(*args: Any, **kwargs: Any) -> Any:
            key = (fn.__module__, fn.__qualname__, args, tuple(sorted(kwargs.items())))
            now = time.monotonic()
            with _LOCK:
                hit = _STORE.get(key)
                if hit and now - hit[0] < seconds:
                    return hit[1]
            value = fn(*args, **kwargs)
            if isinstance(value, dict) and "cached_at" not in value:
                value = {**value, "cached_at": time.strftime("%Y-%m-%dT%H:%M:%S+00:00", time.gmtime())}
            with _LOCK:
                _STORE[key] = (now, value)
                if len(_STORE) > 512:
                    for stale in [k for k, (t, _) in _STORE.items() if now - t >= seconds]:
                        _STORE.pop(stale, None)
            return value

        wrapper.cache_clear = lambda: _STORE.clear()  # type: ignore[attr-defined]
        return wrapper
    return decorate


def clear() -> None:
    with _LOCK:
        _STORE.clear()
