import json
import tempfile
import unittest
from pathlib import Path
from app.journal_snapshot import load_journal


class JournalSnapshotTests(unittest.TestCase):
    def tearDown(self):
        load_journal.cache_clear()

    def test_latest_state_and_masking(self):
        base = {"msg_type": "ordupd", "NorenOrdNum": "A", "NorenTimeStamp": 100,
                "OrdStatus": 48, "AcctId": "private-account", "UserId": "private-user",
                "PanNum": "sensitive", "RejReason": "contains private information", "PriceToFill": 12345}
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "journal.log"
            path.write_text('\n'.join(json.dumps(row) for row in [
                {**base, "NorenTimeStamp": 300, "OrdStatus": 50},
                {**base, "NorenOrdNum": "B", "NorenTimeStamp": 200}, base,
                {"msg_type": "login"},
            ]))
            result = load_journal(str(path))
        self.assertEqual(result["records"], 4)
        self.assertEqual(result["count"], 2)
        self.assertEqual([r["order_id"] for r in result["items"]], ["A", "B"])
        self.assertEqual(result["items"][0]["status"], "COMPLETE")
        self.assertEqual(result["items"][0]["price"], 123.45)
        self.assertEqual(len(result["events"]), 3)
        encoded = json.dumps(result)
        for private in ["private-account", "private-user", "PanNum", "sensitive", "private information"]:
            self.assertNotIn(private, encoded)

    def test_invalid_journal_fails_without_partial_results(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "journal.log"
            path.write_text('{broken')
            with self.assertRaises(ValueError):
                load_journal(str(path))
