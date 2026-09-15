import json
import unittest
from datetime import datetime, timezone

try:
    from app.list_response import ListJSONResponse
except ModuleNotFoundError:  # fastapi not installed: the class is a thin JSONResponse subclass
    ListJSONResponse = None


@unittest.skipIf(ListJSONResponse is None, "fastapi not installed")
class ListJSONResponseTests(unittest.TestCase):
    def test_renders_compact_json_without_the_fastapi_encoder(self):
        body = ListJSONResponse({"items": [{"order_id": "1", "qty": 10, "price": None}], "count": 1}).body
        self.assertEqual(body, b'{"items":[{"order_id":"1","qty":10,"price":null}],"count":1}')

    def test_non_json_scalars_fall_back_to_str(self):
        when = datetime(2026, 9, 13, 6, 24, tzinfo=timezone.utc)
        body = json.loads(ListJSONResponse({"when": when}).body)
        self.assertEqual(body["when"], str(when))

    def test_media_type_and_unicode(self):
        response = ListJSONResponse({"symbol": "₹NIFTY"})
        self.assertEqual(response.media_type, "application/json")
        self.assertIn("₹NIFTY".encode("utf-8"), response.body)


if __name__ == "__main__":
    unittest.main()
