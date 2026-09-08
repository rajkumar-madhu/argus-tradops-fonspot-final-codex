#!/usr/bin/env python3
"""HTTP regressions against a running production preview.

Build with one API_URL, start the same build with a different API_URL, then run:
  python3 scripts/test-runtime-ui.py http://localhost:3109 http://127.0.0.1:8101 --demo
The --demo checks require an auth-disabled backend in demo mode.
"""
import argparse
import json
import re
import sys
from html import unescape
from urllib.parse import urlencode
from urllib.request import urlopen

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("ui_url")
parser.add_argument("expected_api_url")
parser.add_argument("--demo", action="store_true")
args = parser.parse_args()
failures = []


def get(path):
    with urlopen(args.ui_url.rstrip("/") + path, timeout=30) as response:
        return response.read().decode("utf-8")


def check(name, run):
    try:
        run()
        print("PASS", name)
    except Exception as exc:
        failures.append(name)
        print("FAIL", name, "-", exc)


def config(path):
    html = get(path)
    match = re.search(r"window\.__TRADEOPS_CONFIG__=(\{[^<]*?\})</script>", html)
    assert match, "runtime config script missing"
    actual = json.loads(match.group(1))["apiUrl"]
    assert actual == args.expected_api_url.rstrip("/"), f"runtime apiUrl is {actual!r}"


for route in ("/signin", "/signup", "/forgot-password", "/verify", "/dashboard"):
    check(route + " runtime config", lambda route=route: config(route))

if args.demo:
    def logs():
        baseline = get("/logs")
        assert "RED:Margin Shortfall" in baseline, "expected demo baseline log missing"
        query = "NO_MATCH_FILTER_987 & literal=1"
        filtered = get("/logs?" + urlencode({"q": query}))
        assert "No log entries" in filtered, "no-match search did not render empty state"
        assert "RED:Margin Shortfall" not in filtered, "unmatched log was rendered"
        assert f'value="{query}"' in unescape(filtered), "search input lost submitted query"
        assert "Unable to load logs" not in filtered, "API query failed"
    check("demo logs query and preserved input", logs)

sys.exit(bool(failures))
