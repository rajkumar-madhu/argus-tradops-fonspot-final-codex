"""Exchange-time derivation.

Every document here is a field-for-field excerpt of a real ordupd record from the
supplied Noren journals (`mirae-finspot-management-console-elk/Journal.log` and the
3.5 GB root `Journal.log`), so the conventions asserted below are the ones measured
over 1.65M order rows, not assumptions about the protocol.
"""
import unittest

from app.elastic.normalizer import exchange_time, normalize_order


class ExchangeTimeEpochTests(unittest.TestCase):
    """ExchNsecs is a full nanosecond timestamp, not a sub-second remainder."""

    def test_nse_family_nanos_are_a_1980_ist_epoch_and_only_add_the_fraction(self):
        # NSE: ExchTimeStamp 1782791100 is 2026-06-30. ExchNsecs//1e9 is
        # 1467278100, which is the same instant counted from 1980-01-01 IST.
        # Adding ExchNsecs outright used to land this in 2072.
        doc = {"ExchSeg": "NSE", "ExchTimeStamp": 1782791100, "ExchNsecs": 1467278100007777483}
        self.assertEqual(exchange_time(doc), "2026-06-30T03:45:00.007777+00:00")

    def test_nfo_and_cds_share_the_nse_convention(self):
        for seg, ts, ns, expected in [
            ("NFO", 1782791104, 1467278104419550323, "2026-06-30T03:45:04.419550+00:00"),
            ("CDS", 1782791084, 1467278084975227403, "2026-06-30T03:44:44.975227+00:00"),
        ]:
            with self.subTest(segment=seg):
                self.assertEqual(
                    exchange_time({"ExchSeg": seg, "ExchTimeStamp": ts, "ExchNsecs": ns}),
                    expected,
                )

    def test_bse_family_nanos_are_a_unix_epoch(self):
        # BSE/BFO/MCX: ExchNsecs//1e9 equals ExchTimeStamp exactly.
        doc = {"ExchSeg": "BSE", "ExchTimeStamp": 1782790602, "ExchNsecs": 1782790602852290737}
        self.assertEqual(exchange_time(doc), "2026-06-30T03:36:42.852290+00:00")

    def test_mcx_resolves_without_being_named(self):
        # MCX appears only in the 3.5 GB journal, never in the sample. The epoch is
        # established per row, so a segment absent from the sample still resolves.
        doc = {"ExchSeg": "MCX", "ExchTimeStamp": 1788839100, "ExchNsecs": 1788839100123456789}
        self.assertEqual(exchange_time(doc), "2026-09-08T03:45:00.123456+00:00")

    def test_no_exchange_time_is_ever_dated_in_the_future(self):
        # The regression this guards: ExchTimeStamp + ExchNsecs/1e9 put NSE rows in
        # 2072 and BSE rows in 2082.
        for doc in [
            {"ExchSeg": "NSE", "ExchTimeStamp": 1782791100, "ExchNsecs": 1467278100007777483},
            {"ExchSeg": "BSE", "ExchTimeStamp": 1782790602, "ExchNsecs": 1782790602852290737},
        ]:
            with self.subTest(segment=doc["ExchSeg"]):
                self.assertTrue(exchange_time(doc).startswith("2026-"))


class ExchangeTimeCorroborationTests(unittest.TestCase):
    """A fraction is borrowed only from an ExchNsecs timing the same second."""

    def test_nanos_timing_a_later_event_contribute_no_fraction(self):
        # Real NFO row: ExchTimeStamp tracks OrgExchTime (1467278100 -> 1782791100)
        # while ExchNsecs times the current event one second later. The second
        # stands alone rather than taking 046497690ns from a different instant.
        doc = {
            "ExchSeg": "NFO",
            "ExchTimeStamp": 1782791100,
            "ExchNsecs": 1467278101046497690,
            "OrgExchTime": "1467278100",
        }
        self.assertEqual(exchange_time(doc), "2026-06-30T03:45:00+00:00")

    def test_nanos_timing_an_earlier_event_contribute_no_fraction(self):
        # Real NSE row: ExchNsecs is one second behind ExchTimeStamp.
        doc = {"ExchSeg": "NSE", "ExchTimeStamp": 1788840184, "ExchNsecs": 1473327183976704837}
        self.assertEqual(exchange_time(doc), "2026-09-08T04:03:04+00:00")

    def test_an_hour_scale_divergence_still_yields_the_stamped_second(self):
        # Real NFO row: ExchNsecs runs 4228s ahead of ExchTimeStamp.
        doc = {"ExchSeg": "NFO", "ExchTimeStamp": 1788839100, "ExchNsecs": 1473330328320399967}
        self.assertEqual(exchange_time(doc), "2026-09-08T03:45:00+00:00")

    def test_missing_nanos_yield_the_stamped_second(self):
        doc = {"ExchSeg": "NSE", "ExchTimeStamp": 1788839499, "ExchNsecs": None}
        self.assertEqual(exchange_time(doc), "2026-09-08T03:51:39+00:00")
        self.assertEqual(exchange_time({"ExchSeg": "NSE", "ExchTimeStamp": 1788839499}),
                         "2026-09-08T03:51:39+00:00")


class ExchangeTimeAbsenceTests(unittest.TestCase):
    """Unstamped events stay empty instead of being dated."""

    def test_the_1980_ist_sentinel_is_absence_not_a_1980_trade(self):
        # 315513000 is the zero of the NSE-family epoch as a unix second. It is the
        # only implausible ExchTimeStamp in either journal (108 rows), always on an
        # exchange rejection, and it used to render as 1979-12-31T18:30:00+00:00.
        doc = {
            "ExchSeg": "NSE",
            "ExchTimeStamp": 315513000,
            "ExchNsecs": None,
            "OrdStatus": 56,
            "RejReason": "16387: Security is not allowed to trade in this market.",
        }
        self.assertEqual(exchange_time(doc), "")

    def test_zero_missing_and_unparseable_stamps_are_empty(self):
        for value in (0, None, "", "   ", "n/a", -1, 315_513_000):
            with self.subTest(value=value):
                self.assertEqual(exchange_time({"ExchTimeStamp": value}), "")

    def test_absence_survives_a_present_exchnsecs(self):
        # A fraction must never resurrect a second the exchange did not stamp.
        self.assertEqual(
            exchange_time({"ExchTimeStamp": 315513000, "ExchNsecs": 1467278100007777483}),
            "",
        )

    def test_negative_and_unparseable_nanos_fall_back_to_the_second(self):
        for value in (-5, "abc", {}, 0):
            with self.subTest(value=value):
                self.assertEqual(
                    exchange_time({"ExchTimeStamp": 1788839499, "ExchNsecs": value}),
                    "2026-09-08T03:51:39+00:00",
                )


class ExchangeTimeOnOrderPayloadTests(unittest.TestCase):
    def test_normalize_order_carries_the_corrected_exchange_time(self):
        row = normalize_order({
            "NorenOrdNum": 26063000002738,
            "ExchSeg": "NSE",
            "ExchTimeStamp": 1782791100,
            "ExchNsecs": 1467278100007777483,
            "NorenTimeStamp": 1782791099,
            "NorenNsecs": 211534518,
            "OrdStatus": 48,
        })
        self.assertEqual(row["exchange_time"], "2026-06-30T03:45:00.007777+00:00")
        # Event time is unaffected: NorenNsecs is a genuine sub-second remainder.
        self.assertEqual(row["time"], "2026-06-30T03:44:59.211534+00:00")

    def test_unstamped_rejection_reports_no_exchange_time(self):
        row = normalize_order({
            "NorenOrdNum": 26063000002738,
            "ExchSeg": "NSE",
            "ExchTimeStamp": 315513000,
            "ExchOrdNum": "1300000000263187",
            "NorenTimeStamp": 1782791044,
            "OrdStatus": 56,
            "RejReason": "16387: Security is not allowed to trade in this market.",
        })
        self.assertEqual(row["exchange_time"], "")
        self.assertEqual(row["status"], "REJECTED")

    def test_exchange_time_never_follows_the_noren_event_second(self):
        # Measured invariant across both journals: read this way, the exchange
        # stamp is never later than the Noren event second. The old derivation
        # broke it by decades on every row.
        for ts, ns, noren in [
            (1782791100, 1467278100007777483, 1782791100),
            (1782790602, 1782790602852290737, 1782790700),
            (1788839100, 1473330328320399967, 1788843328),
        ]:
            row = normalize_order({"ExchTimeStamp": ts, "ExchNsecs": ns, "NorenTimeStamp": noren})
            with self.subTest(exchange_time=row["exchange_time"]):
                self.assertLessEqual(row["exchange_time"][:19], row["time"][:19])


if __name__ == "__main__":
    unittest.main()
