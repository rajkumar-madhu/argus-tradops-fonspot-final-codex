"""Bounded, read-only readiness checks. Responses never include exception text."""
from collections.abc import Callable


def evaluate_checks(checks: dict[str, Callable[[], bool]]) -> dict:
    states = {}
    for name, check in checks.items():
        try:
            states[name] = "ready" if check() else "unavailable"
        except Exception:
            states[name] = "unavailable"
    return {"status": "ready" if all(v == "ready" for v in states.values()) else "unavailable", "dependencies": states}


def readiness() -> dict:
    from app.config import settings
    if settings.demo_mode:
        return {"status": "ready", "mode": "demo", "dependencies": {}}
    from app.elastic.client import get_es
    from app.db import engine
    from redis import Redis
    from sqlalchemy import text

    def elastic():
        client = get_es()
        if client is None:
            return False
        client.options(request_timeout=2, max_retries=0).search(index=settings.noren_order_index, size=0, query={"match_all": {}})
        return True

    def redis():
        with Redis.from_url(settings.redis_url, socket_timeout=2, socket_connect_timeout=2) as client:
            return bool(client.ping())

    def database():
        with engine.connect() as connection:
            return connection.execute(text("SELECT to_regclass('public.incidents') IS NOT NULL")).scalar() is True

    return evaluate_checks({"elasticsearch": elastic, "redis": redis, "database_schema": database}) | {"mode": "live"}
