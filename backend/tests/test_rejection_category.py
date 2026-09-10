import unittest
from app.elastic.normalizer import rejection_category
from app.workers.correlation_worker import P2_CATEGORIES


class RejectionCategoryTests(unittest.TestCase):
    def test_journal_rule_families_are_classified(self):
        cases = {
            "RED:RULE:{Check circuit limit including square off order}Current:INR 261.00 LowerCircuit:INR 261.65": "RMS / Circuit Limit",
            "RED:RULE:{Check Freeze qty including square off order}Current:7800 Set:1801": "RMS / Freeze Qty",
            "RED:RULE:{Check Peak Margin}Available:INR -99.00 Peak Margin:INR 5.00": "RMS / Margin",
            "RED:Margin Shortfall:INR 1.00 Available:INR 2.00": "RMS / Margin",
            "RED:RULE:{Dont allow collateral and daylong cash for CAC/OPTION buy}Shortfall:INR 1.00": "RMS / Margin",
            "ONLY IOC ORDER ALLOWED IN RRM MODE": "RMS / Regulatory",
            "NON-COMPLIANT CLIENT CODE : G0907": "RMS / Regulatory",
            "RED:RULE:{Check Holdings Including BTST}Eligible Sell:95": "RMS / Holdings",
            "16419: This error code will be returned for invalid data in the order packet.": "Exchange",
            "ORA:AMO is stopped": "OMS / Order Rule",
        }
        for reason, expected in cases.items():
            self.assertEqual(rejection_category(reason), expected, reason)

    def test_new_categories_do_not_change_escalation(self):
        # Circuit-limit and freeze-qty rejections are routine price/qty checks.
        self.assertNotIn("RMS / Circuit Limit", P2_CATEGORIES)
        self.assertNotIn("RMS / Freeze Qty", P2_CATEGORIES)
        # Every P2 category is still a value the classifier produces.
        produced = {rejection_category(r) for r in (
            "margin shortfall", "block type:all", "mwpl", "saf:order is not open")}
        self.assertTrue(P2_CATEGORIES <= produced | {"RMS / Regulatory"})
