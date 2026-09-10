#!/usr/bin/env python3
"""Verify API routes report journal/elasticsearch/demo sources and basic counts."""
from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8001"

ROUTES = [
    ("/health", None),
    ("/api/overview", "dashboard:read"),
    ("/api/orders?size=5", "orders:read"),
    ("/api/rejections", "rejections:read"),
    ("/api/sessions", "sessions:read"),
    ("/api/sessions/summary", "sessions:read"),
    ("/api/exchanges", "exchange:read"),
    ("/api/exchanges/yel", "exchange:read"),
    ("/api/trades?size=5", "trades:read"),
    ("/api/order-book?size=5", "orders:read"),
    ("/api/journal/orders?size=5", "orders:read"),
    ("/api/positions", "positions:read"),
    ("/api/holdings", "holdings:read"),
    ("/api/order-latency", "latency:read"),
    ("/api/infra", "infra:read"),
    ("/api/market-data", "market:read"),
    ("/api/risk", "risk:read"),
    ("/api/config", "dashboard:read"),
    ("/api/elk/status", "logs:read"),
]


def fetch(path: str) -> tuple[int, dict]:
    req = urllib.request.Request(f"{BASE}{path}")
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return resp.status, json.loads(resp.read().decode())
    except urllib.error.HTTPError as exc:
        body = exc.read().decode()
        try:
            payload = json.loads(body)
        except json.JSONDecodeError:
            payload = {"error": body[:200]}
        return exc.code, payload


def main() -> int:
    print(f"Verifying {BASE}\n")
    ok = 0
    for path, _scope in ROUTES:
        status, data = fetch(path)
        source = data.get("source") or data.get("data_source") or ("ok" if path == "/health" else "—")
        count = data.get("count")
        if count is None and isinstance(data.get("orders"), int):
            count = data.get("orders")
        extra = ""
        if path == "/health":
            extra = f" data_source={data.get('data_source')} journal={data.get('journal_path')}"
        elif path == "/api/overview":
            extra = f" orders={data.get('orders')} rejected={data.get('rejected')}"
        line = f"{status:>3} {path:<34} source={source!s:<22}"
        if count is not None:
            line += f" count={count}"
        line += extra
        print(line)
        if status == 200:
            ok += 1
    print(f"\n{ok}/{len(ROUTES)} routes returned HTTP 200")
    return 0 if ok == len(ROUTES) else 1


if __name__ == "__main__":
    raise SystemExit(main())
