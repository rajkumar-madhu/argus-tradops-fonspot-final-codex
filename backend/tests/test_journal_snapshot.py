import json
import tempfile
import unittest
from pathlib import Path
from app.journal_snapshot import (
    MASKED_ORDER_JOURNAL_FIELDS,
    ORDER_JOURNAL_FIELDS,
    journal_order_latency_rows,
    load_journal,
)


class JournalSnapshotTests(unittest.TestCase):
    def tearDown(self):
        load_journal.cache_clear()

    def test_latest_state_and_masking(self):
        base = {"msg_type": "ordupd", "NorenOrdNum": "A", "NorenTimeStamp": 100,
                "OrdStatus": 48, "AcctId": "private-account", "UserId": "private-user",
                "PanNum": "sensitive", "IpAddr": "10.20.30.40", "ExchUserId": "123456",
                "SrcUserId": "source-user", "RejReason": "contains private information",
                "PriceToFill": 12345}
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
        fields = result["items"][0]["journal_fields"]
        self.assertEqual(tuple(fields), ORDER_JOURNAL_FIELDS)
        self.assertEqual(fields["Record No."], 1)
        self.assertEqual(fields["OrdStatus"], 50)
        self.assertEqual(fields["PriceToFill"], 123.45)
        self.assertEqual(fields["AcctId"], "pr***-account")
        self.assertEqual(fields["UserId"], "priv***")
        self.assertEqual(fields["PanNum"], "sens***")
        self.assertEqual(fields["IpAddr"], "10.20.x.xxx")
        self.assertEqual(result["items"][0]["masked_fields"], list(MASKED_ORDER_JOURNAL_FIELDS))
        encoded = json.dumps(result)
        for private in ["private-account", "private-user", "sensitive", "10.20.30.40", "123456", "source-user", "private information"]:
            self.assertNotIn(private, encoded)

    def test_invalid_journal_fails_without_partial_results(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "journal.log"
            path.write_text('{broken')
            with self.assertRaises(ValueError):
                load_journal(str(path))

    def test_journal_order_latency_rows_from_oms_interval(self):
        load_journal.cache_clear()
        base = {
            "msg_type": "ordupd",
            "NorenOrdNum": "ORD-1",
            "NorenTimeStamp": 100,
            "NorenNsecs": 0,
            "NorenOrgTimeStamp": 100,
            "NorenOrgNsecs": 0,
            "OrdStatus": 48,
            "ExchSeg": "NSE",
            "Eref": "L123",
            "ExchOrdNum": "EX-9",
            "TradingSymbol": "ABC-EQ",
        }
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "journal.log"
            path.write_text(json.dumps({**base, "NorenNsecs": 2_500_000}))
            rows, source = journal_order_latency_rows(str(path))
        self.assertEqual(source, "journal snapshot")
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["NOREN_ORD_NUM"], "ORD-1")
        self.assertEqual(rows[0]["EXCH_SEG"], "NSE")
        self.assertGreater(rows[0]["OMS_LATENCY"], 0)
