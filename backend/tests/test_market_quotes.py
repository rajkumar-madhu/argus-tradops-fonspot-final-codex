import unittest

from app.truedata.normalizer import normalize_tick
from app.truedata.symbols import SymbolSpec


class MarketQuoteTests(unittest.TestCase):
    def setUp(self):
        self.spec = SymbolSpec("RELIANCE", "NSE", "EQ")

    def test_missing_depth_is_not_manufactured_from_last_price(self):
        row = normalize_tick({"ltp": 100, "total_bid": 500}, self.spec)
        for field in ("bid", "ask", "bid_qty", "ask_qty", "spread_bps", "volume", "oi", "change_pct"):
            self.assertIsNone(row[field], field)

    def test_zero_volume_and_change_are_preserved(self):
        row = normalize_tick({"ttq": 0, "volume": 500, "change_perc": 0}, self.spec)
        self.assertEqual(row["volume"], 0)
        self.assertEqual(row["change_pct"], 0)

    def test_nonfinite_values_and_crossed_book_are_unavailable(self):
        row = normalize_tick({"ltp": float("nan"), "bid": 101, "ask": 100, "oi": float("inf")}, self.spec)
        self.assertIsNone(row["ltp"])
        self.assertIsNone(row["oi"])
        self.assertIsNone(row["spread_bps"])

    def test_real_best_quotes_produce_measured_spread(self):
        row = normalize_tick({"best_bid_price": 99, "best_ask_price": 101, "best_bid_qty": 2}, self.spec)
        self.assertEqual(row["spread_bps"], 200)
        self.assertEqual(row["bid_qty"], 2)
