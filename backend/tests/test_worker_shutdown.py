import json
import logging
import os
import signal
import sys
import time
import unittest
from types import SimpleNamespace
from unittest import mock

from app.logging_setup import JsonFormatter
from app.workers import collector
from app.workers.shutdown import GracefulShutdown


class GracefulShutdownTests(unittest.TestCase):
    def setUp(self):
        self._previous = {sig: signal.getsignal(sig) for sig in (signal.SIGTERM, signal.SIGINT)}

    def tearDown(self):
        for sig, handler in self._previous.items():
            signal.signal(sig, handler)

    def test_sigterm_sets_flag_instead_of_killing_the_process(self):
        shutdown = GracefulShutdown().install()
        os.kill(os.getpid(), signal.SIGTERM)
        self.assertTrue(shutdown.requested)

    def test_wait_returns_early_once_requested(self):
        shutdown = GracefulShutdown()
        shutdown.request()
        started = time.monotonic()
        self.assertTrue(shutdown.wait(30))
        self.assertLess(time.monotonic() - started, 1)

    def test_wait_times_out_without_a_request(self):
        self.assertFalse(GracefulShutdown().wait(0.01))


class FakeLease:
    def __init__(self, *_args):
        self.released = False

    def acquire(self):
        return True

    def renew(self):
        return True

    def release(self):
        self.released = True
        return True


class CollectorShutdownTests(unittest.TestCase):
    def setUp(self):
        self._previous = {sig: signal.getsignal(sig) for sig in (signal.SIGTERM, signal.SIGINT)}

    def tearDown(self):
        for sig, handler in self._previous.items():
            signal.signal(sig, handler)

    def test_sigterm_mid_iteration_releases_the_leader_lease(self):
        leases = []

        def make_lease(*args):
            leases.append(FakeLease(*args))
            return leases[-1]

        def collect_then_terminate():
            os.kill(os.getpid(), signal.SIGTERM)
            return {"orders": 0, "rejections": 0, "exchange": 0}

        fake_settings = SimpleNamespace(
            metrics_enabled=False,
            collector_leader_key="test:leader",
            collector_leader_ttl_seconds=15,
            collector_interval_seconds=30,
            collector_lookback="2h",
        )
        with mock.patch.object(collector, "settings", fake_settings), \
             mock.patch.object(collector, "configure_logging"), \
             mock.patch.object(collector, "RedisLeaderLease", make_lease), \
             mock.patch.object(collector, "collect_once", collect_then_terminate):
            started = time.monotonic()
            collector.main()

        self.assertTrue(leases[0].released)
        # The 30s interval sleep must be cut short by the signal.
        self.assertLess(time.monotonic() - started, 5)


class JsonFormatterTests(unittest.TestCase):
    def test_exception_stays_on_one_parseable_line(self):
        try:
            raise ValueError("boom")
        except ValueError:
            record = logging.getLogger("tradeops.test").makeRecord(
                "tradeops.test", logging.ERROR, __file__, 1, "failed id=%s", ("x1",), sys.exc_info(),
            )
        line = JsonFormatter("collector").format(record)
        self.assertNotIn("\n", line)
        entry = json.loads(line)
        self.assertEqual(entry["component"], "collector")
        self.assertEqual(entry["level"], "ERROR")
        self.assertEqual(entry["message"], "failed id=x1")
        self.assertIn("ValueError: boom", entry["exception"])


if __name__ == "__main__":
    unittest.main()
