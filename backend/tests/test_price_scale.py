"""Per-segment Noren price scale. Fixture values are shaped like the sample
journal's records (prices, ticks and multipliers), with identities removed."""
import json
import tempfile
import unittest
from dataclasses import replace
from pathlib import Path
from unittest.mock import patch

from app import config
from app.elastic import normalizer
from app.elastic.normalizer import normalize_order, price_divisor, rupee_value, segment_divisors
from app.journal_snapshot import journal_trades, load_journal


def order(**extra):
    base = {"msg_type": "ordupd", "NorenOrdNum": "1", "NorenTimeStamp": 1782791084,
            "OrdStatus": 48, "TransType": "B", "QtyToFill": 1}
    return {**base, **extra}


NSE_EQUITY = order(ExchSeg="NSE", TradingSymbol="OFSS-EQ", PriceToFill=1087000,
                   Scripupdate={"LotSize": 1, "TickSize": 50})
CDS_USDINR = order(ExchSeg="CDS", TradingSymbol="USDINR29JUL26F", QtyToFill=1000, PriceToFill=948800000,
                   Scripupdate={"LotSize": 1, "PricePrecision": 4, "Multiplier": 1000, "TickSize": 25000})
CDS_IRF = order(ExchSeg="CDS", TradingSymbol="648GS203530JUL26F", QtyToFill=250, PriceToFill=978200000,
                Scripupdate={"LotSize": 1, "PricePrecision": 4, "Multiplier": 1000, "PriceMultiplier": 2.0, "TickSize": 25000})
MCX_GOLDM = order(ExchSeg="MCX", TradingSymbol="GOLDM25SEP26C170000", QtyToFill=200, PriceToFill=37200,
                  Scripupdate={"LotSize": 100, "PricePrecision": 2, "PriceMultiplier": 0.1, "TickSize": 50,
                               "StrikePrice": 17000000})


class PriceScaleTests(unittest.TestCase):
    def test_nse_equity_is_paise(self):
        row = normalize_order(NSE_EQUITY)
        self.assertEqual(row["price"], 10870.0)
        self.assertEqual(row["price_raw"], 1087000)
        self.assertEqual(row["price_scale"], "verified")
        self.assertEqual(row["price_divisor"], 100.0)
        self.assertEqual(row["value_multiplier"], 1.0)

    def test_cds_usdinr_uses_the_currency_scale(self):
        row = normalize_order(CDS_USDINR)
        self.assertEqual(row["price"], 94.88)
        self.assertEqual(row["price_divisor"], 10_000_000.0)
        self.assertEqual(row["price_scale"], "verified")
        self.assertEqual(normalize_order(CDS_IRF)["price"], 97.82)
        # One tick (25000 raw) is Rs 0.0025, and four decimals survive rounding.
        self.assertEqual(normalize_order({**CDS_USDINR, "PriceToFill": 948825000})["price"], 94.8825)

    def test_cds_rupee_value_is_not_established(self):
        self.assertIsNone(normalize_order(CDS_USDINR)["value_multiplier"])
        self.assertIsNone(normalize_order(CDS_IRF)["value_multiplier"])

    def test_mcx_is_paise_and_value_uses_price_multiplier(self):
        row = normalize_order(MCX_GOLDM)
        self.assertEqual(row["price"], 372.0)
        self.assertEqual(row["value_multiplier"], 0.1)
        # The RMS rejected this shape with shortfall + available = Rs 7,440.00.
        self.assertEqual(rupee_value(row["price"], row["qty"], row["value_multiplier"]), 7440.0)
        no_multiplier = normalize_order({**MCX_GOLDM, "Scripupdate": {"LotSize": 100}})
        self.assertEqual(no_multiplier["price"], 372.0)
        self.assertIsNone(no_multiplier["value_multiplier"])

    def test_fill_price_follows_the_segment(self):
        row = normalize_order({**CDS_USDINR, "OrdStatus": 50, "FillPrice": 948800000, "FillAvgPrice": 948850000})
        self.assertEqual(row["fill_price"], 94.885)
        self.assertEqual(row["fill_price_raw"], 948850000)

    def test_unestablished_segments_stay_unnormalised(self):
        for doc in (order(ExchSeg="NCDEX", PriceToFill=554500), order(ExchSeg="BCD", PriceToFill=948800000),
                    order(PriceToFill=12345)):
            row = normalize_order(doc)
            self.assertIsNone(row["price"], doc.get("ExchSeg"))
            self.assertEqual(row["price_raw"], doc["PriceToFill"])
            self.assertEqual(row["price_scale"], "unverified")
            self.assertIsNone(row["price_divisor"])
            self.assertIsNone(row["value_multiplier"])

    def test_default_divisor_covers_paise_segments_and_overrides_apply(self):
        self.assertEqual(segment_divisors(), {"NSE": 100.0, "BSE": 100.0, "NFO": 100.0, "BFO": 100.0,
                                              "MCX": 100.0, "CDS": 10_000_000.0})
        custom = replace(config.settings, noren_price_divisor=1.0, noren_price_divisors="bcd=10000000, CDS=1e7")
        with patch.object(normalizer, "settings", custom):
            self.assertEqual(price_divisor("NSE"), 1.0)
            self.assertEqual(price_divisor("BCD"), 10_000_000.0)
            self.assertEqual(price_divisor("CDS"), 10_000_000.0)
            self.assertIsNone(price_divisor("NCDEX"))
            self.assertEqual(normalize_order(order(ExchSeg="BCD", PriceToFill=948800000))["price"], 94.88)
        with patch.object(normalizer, "settings", replace(config.settings, noren_price_divisor=0.0)):
            row = normalize_order(NSE_EQUITY)
            self.assertIsNone(row["price"])
            self.assertEqual(row["price_scale"], "unverified")
            self.assertEqual(normalize_order(CDS_USDINR)["price"], 94.88)

    def test_malformed_divisor_config_is_rejected(self):
        self.assertEqual(config.parse_price_divisors(""), {})
        self.assertEqual(config.parse_price_divisors("CDS=10000000,MCX=100,"), {"CDS": 1e7, "MCX": 100.0})
        for bad in ("CDS", "CDS=0", "CDS=-5", "CDS=ten", "=100", "CDS=nan", "C DS=100"):
            with self.assertRaises(ValueError, msg=bad):
                config.parse_price_divisors(bad)


class JournalPriceScaleTests(unittest.TestCase):
    def tearDown(self):
        load_journal.cache_clear()

    def _load(self, *docs):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        path = Path(directory.name) / "journal.log"
        path.write_text("\n".join(json.dumps({**doc, "NorenOrdNum": str(i)}) for i, doc in enumerate(docs)))
        return str(path)

    def test_journal_fields_use_the_segment_scale(self):
        path = self._load(NSE_EQUITY, CDS_USDINR, order(ExchSeg="NCDEX", PriceToFill=554500))
        rows = {row["exchange"]: row for row in load_journal(path)["items"]}
        self.assertEqual(rows["NSE"]["journal_fields"]["PriceToFill"], 10870.0)
        self.assertEqual(rows["CDS"]["journal_fields"]["PriceToFill"], 94.88)
        self.assertEqual(rows["CDS"]["price"], 94.88)
        # Unverified: the evidence panel keeps the recorded value, unscaled.
        self.assertEqual(rows["NCDEX"]["journal_fields"]["PriceToFill"], 554500)
        self.assertIsNone(rows["NCDEX"]["price"])
        self.assertEqual(rows["NCDEX"]["price_scale"], "unverified")

    def test_trade_value_only_where_the_notional_is_established(self):
        filled = dict(OrdStatus=50, TotalFillQty=None)
        path = self._load({**NSE_EQUITY, **filled, "QtyToFill": 3}, {**CDS_USDINR, **filled},
                          {**MCX_GOLDM, **filled})
        trades = {row["exchange"]: row for row in journal_trades(path)["items"]}
        self.assertEqual(trades["NSE"]["value"], 32610.0)
        self.assertEqual(trades["MCX"]["value"], 7440.0)
        self.assertEqual(trades["CDS"]["price"], 94.88)
        self.assertIsNone(trades["CDS"]["value"])


if __name__ == "__main__":
    unittest.main()
