"""Freshness classification, silent-fallback annotation, YEL evidence semantics."""
import unittest
from datetime import date, datetime, timedelta, timezone
from unittest.mock import patch

from app import freshness
from app.csv_store import CsvStore
from app.elastic import noren_service
from app.workers import collector

UTC = timezone.utc
# Tuesday 2026-09-08 11:00 IST = 05:30 UTC: inside the default session.
OPEN = datetime(2026, 9, 8, 5, 30, tzinfo=UTC)
# Same day 20:00 IST = 14:30 UTC: after close.
CLOSED = datetime(2026, 9, 8, 14, 30, tzinfo=UTC)


class AssessTests(unittest.TestCase):
    def test_states_by_age(self):
        self.assertEqual(freshness.assess(OPEN - timedelta(seconds=5), OPEN)["state"], "live")
        self.assertEqual(freshness.assess(OPEN - timedelta(seconds=120), OPEN)["state"], "delayed")
        self.assertEqual(freshness.assess(OPEN - timedelta(seconds=900), OPEN)["state"], "stale")
        self.assertEqual(freshness.assess(None, OPEN), {"state": "unavailable", "as_of": None, "age_seconds": None})

    def test_quiet_stream_after_close_is_closed_not_stale(self):
        two_hours_old = CLOSED - timedelta(hours=2)
        self.assertEqual(freshness.assess(two_hours_old, CLOSED, session_aware=True)["state"], "closed")
        self.assertEqual(freshness.assess(two_hours_old, CLOSED)["state"], "stale", "only session-aware sources get 'closed'")
        self.assertEqual(freshness.assess(OPEN - timedelta(hours=2), OPEN, session_aware=True)["state"], "stale", "an outage during the session is stale")

    def test_trading_window(self):
        self.assertTrue(freshness.trading_open(OPEN))
        self.assertFalse(freshness.trading_open(CLOSED))
        saturday = datetime(2026, 9, 12, 5, 30, tzinfo=UTC)
        self.assertFalse(freshness.trading_open(saturday))
        self.assertTrue(freshness.trading_open(CLOSED, hours="09:00-23:30"), "MCX-wide window is configurable")

    def test_epoch_seconds_and_millis_accepted(self):
        stamp = OPEN - timedelta(seconds=10)
        self.assertEqual(freshness.assess(stamp.timestamp(), OPEN)["age_seconds"], 10.0)
        self.assertEqual(freshness._epoch(stamp.timestamp() * 1000), stamp.timestamp())


class BatchTests(unittest.TestCase):
    def test_newest_file_date(self):
        self.assertEqual(freshness.newest_file_date(["QueSize_NSE_08-Sep-2026.csv", "ORDERLATENCY_07-Sep-2026.csv", "junk.csv"]), date(2026, 9, 8))
        self.assertIsNone(freshness.newest_file_date(["junk.csv"]))

    def test_expected_day_follows_the_1820_drop(self):
        tue_morning = datetime(2026, 9, 8, 4, 0, tzinfo=UTC)     # 09:30 IST: Monday's file is current
        tue_evening = datetime(2026, 9, 8, 14, 0, tzinfo=UTC)    # 19:30 IST: Tuesday's file is due
        self.assertEqual(freshness.batch_state(date(2026, 9, 7), tue_morning), "batch")
        self.assertEqual(freshness.batch_state(date(2026, 9, 7), tue_evening), "delayed")
        self.assertEqual(freshness.batch_state(date(2026, 9, 8), tue_evening), "batch")
        monday_morning = datetime(2026, 9, 7, 4, 0, tzinfo=UTC)  # weekend skipped: Friday's file is current
        self.assertEqual(freshness.batch_state(date(2026, 9, 4), monday_morning), "batch")
        self.assertEqual(freshness.batch_state(None, tue_evening), "unavailable")


class FallbackAnnotationTests(unittest.TestCase):
    def test_live_failure_is_labelled_not_silent(self):
        from app import main
        with patch.object(main, "_use_journal_data", return_value=False), patch.object(main, "_journal_path", return_value="/j"):
            def live():
                raise RuntimeError("http://user:secret@es:9200 refused")
            out = main._with_data_source(live, lambda: {"items": [1], "source": "journal snapshot"})
        self.assertEqual(out["source"], "journal snapshot")
        self.assertEqual(out["fallback"]["from"], "elasticsearch")
        self.assertEqual(out["fallback"]["reason"], "elasticsearch unavailable")
        self.assertNotIn("secret", str(out))

    def test_live_success_carries_no_fallback(self):
        from app import main
        with patch.object(main, "_use_journal_data", return_value=False):
            out = main._with_data_source(lambda: {"items": [], "source": "elasticsearch"}, lambda: {"source": "journal snapshot"})
        self.assertNotIn("fallback", out)


class YelEvidenceTests(unittest.TestCase):
    def _yel(self, hits):
        class Es:
            def search(self, **kw):
                return {"hits": {"hits": hits}}
        with patch.object(noren_service, "get_es", return_value=Es()):
            return noren_service.yel_health()

    def test_no_event_is_unknown_not_disconnected(self):
        self.assertIsNone(self._yel([])["connected"])
        self.assertFalse(self._yel([{"_source": {"@timestamp": "t", "Keys": []}}])["connected"])
        self.assertTrue(self._yel([{"_source": {"@timestamp": "t", "Keys": ["NSE"]}}])["connected"])

    def test_incident_only_on_explicit_disconnect(self):
        rej = {"rejected_unique_orders": 0, "groups": [], "source": "elasticsearch", "reject_rate": None, "index": "i"}
        with patch.object(noren_service, "rejection_summary", return_value=rej):
            with patch.object(noren_service, "yel_health", return_value={"connected": None}):
                out = noren_service.incident_candidates()
                self.assertEqual(out["items"], [])
                self.assertEqual([g["type"] for g in out["data_gaps"]], ["NO_YEL_EVIDENCE", "REJECT_RATE_UNMEASURED"])
            with patch.object(noren_service, "yel_health", return_value={"connected": False, "keys": []}):
                out = noren_service.incident_candidates()
                self.assertEqual([i["type"] for i in out["items"]], ["YEL_CONNECTIVITY"])

    def test_worker_ignores_absent_evidence(self):
        from app.workers import correlation_worker as w
        with patch.object(w, "upsert_incident") as upsert:
            w._handle_exchange({"connected": None})
            w._handle_exchange({"connected": True})
            upsert.assert_not_called()


class CollectorFreshnessTests(unittest.TestCase):
    def test_gauges_from_the_batch(self):
        newest, lag = collector.observe_freshness([
            {"time": "2026-09-08T05:30:00+00:00", "ingested_at": "2026-09-08T05:30:02+00:00"},
            {"time": "2026-09-08T05:29:00+00:00", "ingested_at": "2026-09-08T05:29:07+00:00"},
            {"time": "", "ingested_at": None},
        ])
        self.assertEqual(newest, datetime(2026, 9, 8, 5, 30, tzinfo=UTC).timestamp())
        self.assertEqual(lag, 7.0, "worst lag in the batch, not the newest row's")
        self.assertEqual(collector.observe_freshness([]), (None, None))


class QueueDrainTests(unittest.TestCase):
    def test_countdowns_become_snapshots_with_start_depth(self):
        # Real dumps drain to 1 (NFO-13424: 750 -> 1), so the next dump's first
        # row is always a rise; that rise is the boundary.
        rows = [(100.0, 5), (100.0, 4), (100.1, 3), (100.2, 2), (100.2, 1),   # dump 1 starts at 5
                (160.0, 12), (160.0, 11), (160.5, 10), (160.5, 1),            # dump 2 starts at 12
                (200.0, None), (200.0, 3), (200.5, 2), (200.5, 1)]            # dump 3 starts at 3
        snaps = CsvStore.drain_snapshots(rows)
        self.assertEqual([s["depth"] for s in snaps], [5, 12, 3])
        self.assertEqual([s["rows"] for s in snaps], [5, 4, 3])
        self.assertEqual(snaps[0]["seconds"], 0.2)
        self.assertEqual(snaps[0]["drain_rows_per_second"], 25.0)
        self.assertEqual(snaps[2]["seconds"], 0.5)
        self.assertEqual(CsvStore.drain_snapshots([]), [])


if __name__ == "__main__":
    unittest.main()
