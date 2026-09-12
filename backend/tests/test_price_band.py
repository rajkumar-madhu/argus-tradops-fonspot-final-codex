"""Circuit band and freeze quantity parsed out of the rejection text.

Fixtures are real reason strings from the journals with client codes replaced.
"""
import unittest

from app.elastic.normalizer import freeze_quantity, mask_reason, normalize_order, price_band

ABOVE = ("RED:RULE:{Check circuit limit including square off order}Current:INR 3999.00 "
         "LowerCircuit:INR 3215.80 UpperCircuit:INR 3930.40:NSE.SIEMENS-EQ for C-***-EXA [RISK2]")
BELOW = ("RED:RULE:{Check circuit limit including square off order}Current:INR 50.55 "
         "LowerCircuit:INR 50.65 UpperCircuit:INR 160.75:NFO.HINDALCO30JUN26P1070 for C-*** [RISK2]")
INSIDE = ("RED:RULE:{Check circuit limit including square off order}Current:INR 100.00 "
          "LowerCircuit:INR 90.00 UpperCircuit:INR 110.00:NSE.X-EQ for C-*** [RISK2]")
MARGIN = "RED:Margin Shortfall:INR 203.50 Available:INR 7236.50 for C-*** [RISK2]"


class PriceBandTests(unittest.TestCase):
    def test_breach_side_is_derived_not_assumed(self):
        self.assertEqual(price_band(ABOVE), {"current": 3999.0, "lower": 3215.8, "upper": 3930.4,
                                             "breach": "above", "unit": "INR"})
        self.assertEqual(price_band(BELOW)["breach"], "below")
        self.assertIsNone(price_band(INSIDE)["breach"], "inside the band: the band alone does not explain it")

    def test_text_without_a_band_yields_none(self):
        for reason in (MARGIN, "SAF:order is not open to cancel", "", None):
            self.assertIsNone(price_band(reason))

    def test_band_survives_masking(self):
        # mask_reason keeps market figures readable, so the parse works either way.
        self.assertEqual(price_band(mask_reason(ABOVE)), price_band(ABOVE))
        self.assertNotIn("INR 203.50", mask_reason(MARGIN), "balances are still masked")

    def test_thousands_separators(self):
        band = price_band("Current:INR 24,220.00 LowerCircuit:INR 231,221.00 UpperCircuit:INR 250,489.00")
        self.assertEqual((band["current"], band["upper"]), (24220.0, 250489.0))

    def test_freeze_quantity(self):
        self.assertEqual(freeze_quantity("RED:Freeze qty Set:5000 Current:9000 for C-***"),
                         {"allowed": 5000, "requested": 9000})
        self.assertIsNone(freeze_quantity(MARGIN))

    def test_order_payload_carries_the_band(self):
        row = normalize_order({"msg_type": "ordupd", "NorenOrdNum": "A", "ExchSeg": "NSE",
                               "OrdStatus": 56, "PriceToFill": 399900, "RejReason": ABOVE})
        self.assertEqual(row["price_band"]["upper"], 3930.4)
        self.assertEqual(row["price_band"]["breach"], "above")
        # The band's Current agrees with the normalised price: same paise scale.
        self.assertEqual(row["price"], row["price_band"]["current"])
        self.assertIsNone(row["freeze_qty"])


if __name__ == "__main__":
    unittest.main()
