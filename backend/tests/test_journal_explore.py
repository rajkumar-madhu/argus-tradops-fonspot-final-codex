"""Facet, filter and histogram behaviour for the journal explorer.

Pure unit tests: each builds its own tiny journal file in a temp dir. Paths are
unique per test because snapshot() and build_index() are both lru_cached on path.
"""
import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.journal_explore import (  # noqa: E402
    FACET_FIELDS, STATUS_LABELS, build_index, explore,
)


def order(record, status=48, seg="NSE", product="C", side="B", ts=1_757_000_000):
    return {
        "msg_type": "ordupd", "NorenOrdNum": f"25090800{record:04d}", "NorenTimeStamp": ts,
        "OrdStatus": status, "ExchSeg": seg, "Product": product, "TransType": side,
        "PriceType": "LMT", "ReportType": status, "OrdSrc": "MOB", "OrdDuration": "DAY",
        "TradingSymbol": "RELIANCE-EQ", "QtyToFill": 10, "AcctId": "ACC123456",
    }


def write(docs):
    handle = tempfile.NamedTemporaryFile("w", suffix=".log", delete=False, encoding="utf-8")
    with handle as stream:
        for doc in docs:
            stream.write(json.dumps(doc) + "\n")
    return handle.name


class FacetCountTests(unittest.TestCase):
    def setUp(self):
        self.path = write([
            order(1, seg="NSE", product="C"),
            order(2, seg="NSE", product="M"),
            order(3, seg="BSE", product="C"),
            order(4, seg="NFO", product="M", status=65),
        ])

    def facet(self, result, field):
        found = next(f for f in result["facets"] if f["field"] == field)
        return {item["value"]: item["count"] for item in found["values"]}

    def test_unfiltered_counts_cover_every_record(self):
        result = explore(self.path, "ordupd", {})
        self.assertEqual(result["count"], 4)
        self.assertEqual(result["total"], 4)
        self.assertEqual(self.facet(result, "ExchSeg"), {"NSE": 2, "BSE": 1, "NFO": 1})

    def test_a_facet_narrows_the_result_set(self):
        result = explore(self.path, "ordupd", {"ExchSeg": ["NSE"]})
        self.assertEqual(result["count"], 2)
        self.assertEqual(self.facet(result, "Product"), {"C": 1, "M": 1})

    def test_values_within_one_facet_are_an_or(self):
        result = explore(self.path, "ordupd", {"ExchSeg": ["NSE", "BSE"]})
        self.assertEqual(result["count"], 3)

    def test_separate_facets_are_an_and(self):
        result = explore(self.path, "ordupd", {"ExchSeg": ["NSE"], "Product": ["M"]})
        self.assertEqual(result["count"], 1)

    def test_a_facets_own_filter_is_lifted_from_its_own_counts(self):
        """Otherwise every unpicked value shows zero and the operator is stuck."""
        result = explore(self.path, "ordupd", {"ExchSeg": ["NSE"]})
        self.assertEqual(self.facet(result, "ExchSeg"), {"NSE": 2, "BSE": 1, "NFO": 1})
        selected = {item["value"]: item["selected"]
                    for item in next(f for f in result["facets"] if f["field"] == "ExchSeg")["values"]}
        self.assertTrue(selected["NSE"])
        self.assertFalse(selected["BSE"])

    def test_other_facets_still_constrain_a_lifted_facet(self):
        result = explore(self.path, "ordupd", {"ExchSeg": ["NSE"], "Product": ["C"]})
        # Only NSE and BSE have a Product=C record; NFO's record is Product=M.
        self.assertEqual(self.facet(result, "ExchSeg"), {"NSE": 1, "BSE": 1})


class SearchTests(unittest.TestCase):
    def test_search_matches_the_documented_field_scope(self):
        path = write([order(1), order(2, seg="BSE")])
        self.assertEqual(explore(path, "ordupd", {}, q="RELIANCE")["count"], 2)
        self.assertEqual(explore(path, "ordupd", {}, q="bse")["count"], 1)
        self.assertEqual(explore(path, "ordupd", {}, q="nothing-here")["count"], 0)

    def test_search_combines_with_facets(self):
        path = write([order(1, seg="NSE"), order(2, seg="BSE")])
        result = explore(path, "ordupd", {"ExchSeg": ["NSE"]}, q="RELIANCE")
        self.assertEqual(result["count"], 1)

    def test_search_cannot_reach_withheld_free_text(self):
        path = write([dict(order(1), RejReason="MARGIN SHORTFALL", OrdRemarks="private note")])
        self.assertEqual(explore(path, "ordupd", {}, q="MARGIN")["count"], 0)
        self.assertEqual(explore(path, "ordupd", {}, q="private")["count"], 0)
        fields = explore(path, "ordupd", {})["items"][0]["fields"]
        self.assertEqual(fields["OrdRemarks"], "[redacted]")

    def test_rejection_reason_is_shown_with_client_data_masked(self):
        reason = "RED:Margin Shortfall:INR 22.18 Available:INR 114280.07 for C-R1289-PSB [PSBDIRECT-PSB]"
        path = write([dict(order(1), RejReason=reason)])
        shown = explore(path, "ordupd", {})["items"][0]["fields"]["RejReason"]
        self.assertEqual(shown, "RED:Margin Shortfall:INR *** Available:INR *** for C-***-PSB [PSBDIRECT-PSB]")
        for secret in ("114280.07", "22.18", "R1289"):
            self.assertNotIn(secret, shown)


class PagingTests(unittest.TestCase):
    def test_paging_walks_the_result_without_repeating_rows(self):
        path = write([order(n) for n in range(10)])
        first = explore(path, "ordupd", {}, limit=4, offset=0)
        second = explore(path, "ordupd", {}, limit=4, offset=4)
        self.assertEqual(first["count"], 10)
        self.assertEqual(len(first["items"]), 4)
        self.assertEqual(len(second["items"]), 4)
        lines = [row["source_line"] for row in first["items"] + second["items"]]
        self.assertEqual(len(set(lines)), 8)
        self.assertEqual(lines, sorted(lines))

    def test_offset_past_the_end_yields_no_rows_not_an_error(self):
        path = write([order(1)])
        self.assertEqual(explore(path, "ordupd", {}, offset=500)["items"], [])


class HistogramTests(unittest.TestCase):
    def test_buckets_span_the_real_time_range(self):
        path = write([order(1, ts=1_757_000_000), order(2, ts=1_757_003_600)])
        histogram = explore(path, "ordupd", {})["histogram"]
        self.assertEqual(sum(bucket["count"] for bucket in histogram["buckets"]), 2)
        self.assertLess(histogram["start"], histogram["end"])
        self.assertEqual(histogram["undated"], 0)

    def test_a_single_instant_does_not_divide_by_zero(self):
        path = write([order(1, ts=1_757_000_000), order(2, ts=1_757_000_000)])
        histogram = explore(path, "ordupd", {})["histogram"]
        self.assertEqual(sum(bucket["count"] for bucket in histogram["buckets"]), 2)

    def test_undated_records_are_counted_not_dropped(self):
        path = write([order(1), {"msg_type": "ordupd", "NorenOrdNum": "X", "OrdStatus": 48}])
        result = explore(path, "ordupd", {})
        self.assertEqual(result["count"], 2)
        self.assertEqual(result["histogram"]["undated"], 1)

    def test_no_timestamps_yields_no_buckets(self):
        path = write([{"msg_type": "ordupd", "NorenOrdNum": "X", "OrdStatus": 48}])
        histogram = explore(path, "ordupd", {})["histogram"]
        self.assertEqual(histogram["buckets"], [])
        self.assertEqual(histogram["undated"], 1)


class LabelTests(unittest.TestCase):
    def test_only_documented_status_codes_carry_a_label(self):
        path = write([order(1, status=48), order(2, status=98), order(3, status=65)])
        values = next(f for f in explore(path, "ordupd", {})["facets"]
                      if f["field"] == "OrdStatus")["values"]
        labels = {item["value"]: item["label"] for item in values}
        self.assertEqual(labels["48"], "Open")
        self.assertEqual(labels["65"], "Rejected")
        # 98 occurs in real journal data; inventing a name for it would read as fact.
        self.assertIsNone(labels["98"])

    def test_status_label_map_matches_the_documented_codes(self):
        self.assertEqual(
            sorted(STATUS_LABELS),
            sorted(["48", "50", "52", "54", "56", "65", "109", "110", "115"]),
        )

    def test_non_status_fields_are_never_labelled(self):
        path = write([order(1)])
        for facet in explore(path, "ordupd", {})["facets"]:
            if facet["field"] != "OrdStatus":
                for item in facet["values"]:
                    self.assertIsNone(item["label"], f"{facet['field']} must not invent labels")


class SafetyTests(unittest.TestCase):
    def test_facet_fields_never_expose_a_masked_or_withheld_field(self):
        forbidden = {"AcctId", "UserId", "IpAddr", "PanNum", "ExchUserId", "SrcUserId",
                     "RejReason", "OrdRemarks", "FixRemarks"}
        for kind, fields in FACET_FIELDS.items():
            self.assertFalse(forbidden & set(fields), f"{kind} facets leak a protected field")

    def test_masked_fields_stay_masked_in_explorer_rows(self):
        path = write([order(1)])
        fields = explore(path, "ordupd", {})["items"][0]["fields"]
        self.assertNotEqual(fields["AcctId"], "ACC123456")

    def test_index_is_cached_per_path_and_kind(self):
        path = write([order(1)])
        self.assertIs(build_index(path, "ordupd"), build_index(path, "ordupd"))

    def test_an_empty_journal_reports_zero_rather_than_failing(self):
        path = write([])
        result = explore(path, "ordupd", {})
        self.assertEqual(result["count"], 0)
        self.assertEqual(result["items"], [])
        self.assertEqual(result["histogram"]["buckets"], [])


if __name__ == "__main__":
    unittest.main()
