"""Free-text order search must not expose field syntax over excluded fields."""
import unittest
from app.elastic.noren_service import ORDER_SEARCH_FIELDS, order_search_query


class OrderSearchQueryTests(unittest.TestCase):
    def test_uses_simple_query_string_over_an_explicit_allowlist(self):
        query = order_search_query("PanNum:ABCDE1234F _exists_:IpAddr")
        self.assertIn("simple_query_string", query)
        self.assertNotIn("query_string", query)
        body = query["simple_query_string"]
        # The text is passed through as literal terms; simple_query_string has
        # no field:value or _exists_ syntax, so these cannot target PanNum/IpAddr.
        self.assertEqual(body["query"], "PanNum:ABCDE1234F _exists_:IpAddr")
        self.assertEqual(body["fields"], ORDER_SEARCH_FIELDS)
        self.assertEqual(body["default_operator"], "and")
        self.assertFalse(body["analyze_wildcard"])

    def test_allowlist_never_names_a_masked_or_excluded_field(self):
        for field in ORDER_SEARCH_FIELDS:
            self.assertNotIn("*", field, "wildcard patterns can match unintended sub-fields")
            self.assertNotIn(field, {"PanNum", "IpAddr", "ExchUserInfo", "ParticId", "UserSessId",
                                     "OrdRemarks", "FixRemarks"})


if __name__ == "__main__":
    unittest.main()
