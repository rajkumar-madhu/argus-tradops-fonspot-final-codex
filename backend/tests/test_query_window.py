"""IST calendar-day windows vs rolling lookback."""
import os
import sys
import unittest
from datetime import datetime, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.query_window import IST, es_range, ist_day_bounds, ist_today, resolve_window  # noqa: E402


class QueryWindowTests(unittest.TestCase):
    def test_ist_day_is_midnight_ist_in_utc(self):
        gte, lt = ist_day_bounds("2026-09-15")
        self.assertEqual(gte, "2026-09-14T18:30:00Z")
        self.assertEqual(lt, "2026-09-15T18:30:00Z")

    def test_today_ignores_a_stale_date_field(self):
        self.assertEqual(resolve_window("today", "2026-01-01")[0], None)
        self.assertEqual(resolve_window("today", "2026-01-01")[1], ist_today())

    def test_rolling_window_ignores_day(self):
        self.assertEqual(resolve_window("7d", "2026-09-15"), ("7d", None))

    def test_custom_day_when_lookback_is_custom_or_absent(self):
        self.assertEqual(resolve_window("custom", "2026-09-10"), (None, "2026-09-10"))
        self.assertEqual(resolve_window(None, "2026-09-10"), (None, "2026-09-10"))

    def test_default_is_ist_today(self):
        self.assertEqual(resolve_window(None, None), (None, ist_today()))
        self.assertEqual(resolve_window("", ""), (None, ist_today()))

    def test_es_range_calendar_day(self):
        body = es_range("NorenTimeStamp_N", lookback="custom", day="2026-09-15")
        self.assertEqual(body["range"]["NorenTimeStamp_N"]["gte"], "2026-09-14T18:30:00Z")
        self.assertEqual(body["range"]["NorenTimeStamp_N"]["lt"], "2026-09-15T18:30:00Z")

    def test_es_range_rolling(self):
        self.assertEqual(
            es_range("NorenTimeStamp_N", lookback="7d"),
            {"range": {"NorenTimeStamp_N": {"gte": "now-7d"}}},
        )

    def test_ist_today_uses_kolkata_date_not_utc(self):
        # 00:30 IST on 16 Sep is still 15 Sep 19:00 UTC.
        now = datetime(2026, 9, 15, 19, 0, tzinfo=timezone.utc)
        self.assertEqual(ist_today(now), "2026-09-16")
        self.assertEqual(now.astimezone(IST).date().isoformat(), "2026-09-16")


if __name__ == "__main__":
    unittest.main()
