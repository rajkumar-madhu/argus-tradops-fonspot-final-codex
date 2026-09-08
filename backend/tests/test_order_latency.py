import unittest
from unittest.mock import patch

from app import main
from app.journal_snapshot import _journal_latency_rows_from_items


class OrderLatencyTests(unittest.TestCase):
    def journal_payload(self, items):
        rows = _journal_latency_rows_from_items(items)
        with patch.object(main, "_use_journal_data", return_value=True), patch.object(
            main, "_journal_path", return_value="unused"
        ), patch("app.journal_snapshot.journal_order_latency_rows", return_value=(rows, "journal snapshot")):
            return main.order_latency()

    def test_journal_status_uses_noren_mapping_and_filled_quantity(self):
        cases = [(65, 0, "REJECTED"), (56, 0, "REJECTED"), (50, 0, "COMPLETE"),
                 (52, 0, "CANCELLED"), (48, 0, "OPEN"), (48, 2, "PARTIAL"),
                 (54, 0, "TRIGGER_PENDING"), (109, 0, "PENDING"), (999, 0, "STATUS_999")]
        payload = self.journal_payload([
            {"order_id": str(i), "status_code": code, "filled_qty": filled, "qty": 10,
             "latency_ms": 2.5, "exchange_order_id": "EX-1"}
            for i, (code, filled, _) in enumerate(cases)
        ])
        self.assertEqual([r["oms_status_label"] for r in payload["items"]], [c[2] for c in cases])
        self.assertTrue(payload["oms_status_mapping_confirmed"])

    def test_journal_confirmation_is_evidence_not_a_timing_sample(self):
        payload = self.journal_payload([
            {"order_id": "A", "status_code": None, "latency_ms": 2.5, "exchange_order_id": "EX-1"},
            {"order_id": "B", "status_code": 48, "latency_ms": 1, "exchange_order_id": ""},
        ])
        self.assertEqual([r["confirmed"] for r in payload["items"]], [True, False])
        self.assertEqual(payload["summary"]["confirmed_orders"], 1)
        self.assertEqual(payload["summary"]["unconfirmed_orders"], 1)
        self.assertEqual(payload["summary"]["confirmation_timing_samples"], 0)
        self.assertEqual(payload["summary"]["confirm_p50_us"], 0)
        self.assertEqual(payload["latency_kind"], "journal_event_interval")
        self.assertFalse(payload["confirmation_timing_available"])
        self.assertEqual(payload["items"][0]["oms_latency_us"], 2500)
        self.assertEqual(payload["items"][0]["exch_status_label"], "CONFIRMED")
        self.assertTrue(all(r["confirm_latency_us"] == 0 and r["exch_update_time"] == 0 for r in payload["items"]))

    def test_csv_fallback_keeps_provisional_mapping(self):
        rows = [{"OMS_STATUS": code, "EXCH_STATUS": 48, "OMS_EXCH_CONFIRMATION": 10}
                for code in (65, 56, 48, 45)]
        with patch.object(main, "_use_journal_data", return_value=True), patch.object(
            main, "_journal_path", return_value="unused"
        ), patch("app.journal_snapshot.journal_order_latency_rows", return_value=(rows, "order-latency csv")):
            payload = main.order_latency()
        self.assertEqual([r["oms_status_label"] for r in payload["items"]],
                         ["COMPLETE", "OPEN", "AFTER_MARKET_ORDER", "REJECTED"])
        self.assertFalse(payload["oms_status_mapping_confirmed"])
        self.assertEqual(payload["feed_kind"], "order-latency csv")

    def test_confirmation_counts_match_table_and_samples_require_evidence(self):
        rows = [{"EXCH_STATUS": status, "OMS_EXCH_CONFIRMATION": timing}
                for status, timing in [(48, 0), (48, 20), ("", 900), (None, 800), (0, 700), ("0", 600)]]
        payload = main._latency_payload(rows, "order-latency csv")
        self.assertEqual([r["confirmed"] for r in payload["items"]], [True, True, False, False, False, False])
        self.assertEqual(payload["summary"]["confirmed_orders"], 2)
        self.assertEqual(payload["summary"]["unconfirmed_orders"], 4)
        self.assertEqual(payload["summary"]["confirmation_timing_samples"], 1)
        self.assertEqual(payload["summary"]["confirm_p50_us"], 20)
        self.assertEqual(payload["by_segment"][0]["confirm_p50_us"], 20)
        self.assertEqual(payload["by_segment"][0]["unconfirmed"], 4)

    def test_demo_and_empty_live_remain_honest(self):
        with patch.object(main, "_use_journal_data", return_value=False):
            with patch.object(main, "DEMO_MODE", True):
                demo = main.order_latency()
            with patch.object(main, "DEMO_MODE", False):
                live = main.order_latency()
        self.assertEqual(demo["source"], "demo")
        self.assertFalse(demo["oms_status_mapping_confirmed"])
        self.assertEqual(demo["summary"]["confirmed_orders"], sum(r["confirmed"] for r in demo["items"]))
        self.assertEqual(live["items"], [])
        self.assertEqual(live["source"], "elasticsearch")
        self.assertFalse(live["confirmation_timing_available"])

    def test_empty_journal_has_consistent_metadata(self):
        payload = self.journal_payload([])
        self.assertEqual(payload["items"], [])
        self.assertEqual(payload["summary"]["confirmed_orders"], 0)
        self.assertEqual(payload["latency_kind"], "journal_event_interval")
        self.assertFalse(payload["confirmation_timing_available"])
