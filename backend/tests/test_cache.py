import unittest
from unittest.mock import patch
from app import cache
from app.cache import ttl_cache


class TtlCacheTests(unittest.TestCase):
    def setUp(self):
        cache.clear()

    def test_repeat_calls_within_ttl_do_not_recompute(self):
        calls = []

        @ttl_cache(5.0)
        def expensive(*, lookback="24h"):
            calls.append(lookback)
            return {"items": [1], "source": "elasticsearch"}

        a = expensive(lookback="24h"); b = expensive(lookback="24h"); c = expensive(lookback="1h")
        self.assertEqual(calls, ["24h", "1h"])
        self.assertIs(a, b)
        self.assertIn("cached_at", a, "a cached payload says when it was computed")
        self.assertIsNot(a, c)

    def test_expires(self):
        clock = [100.0]
        with patch.object(cache.time, "monotonic", lambda: clock[0]):
            @ttl_cache(2.0)
            def f():
                return {"n": clock[0]}
            first = f(); clock[0] += 1; self.assertIs(f(), first)
            clock[0] += 2; self.assertIsNot(f(), first)


if __name__ == "__main__":
    unittest.main()
