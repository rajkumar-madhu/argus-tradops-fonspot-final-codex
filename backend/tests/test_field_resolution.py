"""_field must not pin field.keyword when field_caps returns empty fields."""
import unittest
from unittest.mock import patch

from app.elastic import noren_service
from app.tenancy import current_id


class _Resp:
    def __init__(self, body):
        self.body = body


class FieldResolutionTests(unittest.TestCase):
    def setUp(self):
        noren_service._FIELD_CACHE.clear()

    def tearDown(self):
        noren_service._FIELD_CACHE.clear()

    def _key(self, field="BrokerId"):
        return (current_id(), "idx", field)

    def test_empty_field_caps_does_not_cache_keyword_subfield(self):
        """Missing index + ignore_unavailable is a 200 with fields: {}."""
        calls = {"get": 0, "post": 0}

        class FakeES:
            def perform_request(self, *_a, **_k):
                calls["get"] += 1
                return _Resp({"fields": {}})

            def field_caps(self, **_):
                calls["post"] += 1
                raise RuntimeError("specified fields can't be null or empty")

        with patch.object(noren_service, "get_es", return_value=FakeES()):
            first = noren_service._field("idx", "BrokerId")
            self.assertEqual(first, "BrokerId")
            self.assertNotIn(self._key(), noren_service._FIELD_CACHE)
            second = noren_service._field("idx", "BrokerId")
            self.assertEqual(second, "BrokerId")
            self.assertGreaterEqual(calls["get"], 2, "an empty resolution must be retried, not pinned")

    def test_empty_caps_from_get_and_post_does_not_cache(self):
        """ES 8 ignore_unavailable on a missing index is a 200 with fields: {} twice."""
        calls = {"get": 0, "post": 0}

        class FakeES:
            def perform_request(self, *_a, **_k):
                calls["get"] += 1
                return _Resp({"fields": {}})

            def field_caps(self, **_):
                calls["post"] += 1
                return {"fields": {}}

        with patch.object(noren_service, "get_es", return_value=FakeES()):
            self.assertEqual(noren_service._field("idx", "BrokerId"), "BrokerId")
            self.assertNotIn(self._key(), noren_service._FIELD_CACHE)
            self.assertEqual(noren_service._field("idx", "BrokerId"), "BrokerId")
            self.assertGreaterEqual(calls["get"], 2)

    def test_unparsed_get_body_falls_back_to_field_caps(self):
        class FakeES:
            def perform_request(self, *_a, **_k):
                return _Resp(None)

            def field_caps(self, **_):
                return {"fields": {"BrokerId": {"keyword": {}}}}

        with patch.object(noren_service, "get_es", return_value=FakeES()):
            self.assertEqual(noren_service._field("idx", "BrokerId"), "BrokerId")
            self.assertEqual(noren_service._FIELD_CACHE[self._key()], "BrokerId")

    def test_unparsed_body_does_not_cache_keyword_subfield(self):
        calls = {"get": 0}

        class FakeES:
            def perform_request(self, *_a, **_k):
                calls["get"] += 1
                return _Resp(None)

            def field_caps(self, **_):
                raise RuntimeError("specified fields can't be null or empty")

        with patch.object(noren_service, "get_es", return_value=FakeES()):
            self.assertEqual(noren_service._field("idx", "BrokerId"), "BrokerId")
            self.assertNotIn(self._key(), noren_service._FIELD_CACHE)
            self.assertEqual(noren_service._field("idx", "BrokerId"), "BrokerId")
            self.assertGreaterEqual(calls["get"], 2)

    def test_empty_caps_then_real_mapping_is_picked_up(self):
        n = {"n": 0}

        class FakeES:
            def perform_request(self, *_a, **_k):
                n["n"] += 1
                if n["n"] == 1:
                    return _Resp({"fields": {}})
                return _Resp({"fields": {"BrokerId": {"keyword": {}}}})

            def field_caps(self, **_):
                raise RuntimeError("specified fields can't be null or empty")

        with patch.object(noren_service, "get_es", return_value=FakeES()):
            self.assertEqual(noren_service._field("idx", "BrokerId"), "BrokerId")
            self.assertEqual(noren_service._field("idx", "BrokerId"), "BrokerId")
            self.assertEqual(noren_service._FIELD_CACHE[self._key()], "BrokerId")
            self.assertEqual(n["n"], 2)
            self.assertEqual(noren_service._field("idx", "BrokerId"), "BrokerId")
            self.assertEqual(n["n"], 2, "a successful resolution is cached")

    def test_keyword_subfield_is_cached(self):
        class FakeES:
            def perform_request(self, *_a, **_k):
                return _Resp({"fields": {"BrokerId.keyword": {"keyword": {}}}})

        with patch.object(noren_service, "get_es", return_value=FakeES()):
            self.assertEqual(noren_service._field("idx", "BrokerId"), "BrokerId.keyword")
            self.assertEqual(noren_service._FIELD_CACHE[self._key()], "BrokerId.keyword")

    def test_request_exception_returns_bare_field_and_does_not_cache(self):
        class FakeES:
            def perform_request(self, *_a, **_k):
                raise RuntimeError("cluster unreachable")

            def field_caps(self, **_):
                raise RuntimeError("cluster unreachable")

        with patch.object(noren_service, "get_es", return_value=FakeES()):
            self.assertEqual(noren_service._field("idx", "BrokerId"), "BrokerId")
            self.assertEqual(noren_service._FIELD_CACHE, {})


if __name__ == "__main__":
    unittest.main()
