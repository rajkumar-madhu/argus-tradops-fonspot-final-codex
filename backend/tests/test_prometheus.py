import unittest
from base64 import b64encode
from dataclasses import replace
from unittest.mock import patch

from app import prometheus_service


class PrometheusAuthTests(unittest.TestCase):
    def test_unconfigured_prometheus_has_no_authorization_header(self):
        with patch.object(prometheus_service, "settings", replace(prometheus_service.settings, prometheus_username="", prometheus_password="")):
            headers = prometheus_service._request_headers()
        self.assertNotIn("Authorization", headers)
        self.assertEqual(headers["Accept"], "application/json")

    def test_basic_auth_is_sent_when_username_is_set(self):
        with patch.object(
            prometheus_service,
            "settings",
            replace(prometheus_service.settings, prometheus_username="prometheus", prometheus_password="secret"),
        ):
            headers = prometheus_service._request_headers()
        expected = "Basic " + b64encode(b"prometheus:secret").decode("ascii")
        self.assertEqual(headers["Authorization"], expected)
        self.assertNotIn("secret", str(headers).replace(expected, ""))
