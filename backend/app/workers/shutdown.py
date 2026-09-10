"""SIGTERM handling for the long-running workers.

Python's default SIGTERM action kills the process on the spot: no `finally`
block runs, so a leader-elected worker exits still holding its Redis lease and
the standby replica sits idle until the TTL expires. Kubernetes sends SIGTERM on
every rollout, drain and scale-down, so each worker loop polls `requested` and
sleeps through `wait()` instead of `time.sleep()`.

The handler only flips a flag. Setting a `threading.Event` from a signal handler
can deadlock if the signal lands while the main thread holds the event's
internal lock, so `wait()` sleeps in short slices and re-checks the flag.
"""
from __future__ import annotations

import logging
import signal
import time

log = logging.getLogger("tradeops.shutdown")

_SLICE_SECONDS = 0.5


class GracefulShutdown:
    def __init__(self) -> None:
        self._requested = False

    def install(self, signals: tuple[signal.Signals, ...] = (signal.SIGTERM, signal.SIGINT)) -> "GracefulShutdown":
        """Register the handler. Must be called from the main thread."""
        for sig in signals:
            signal.signal(sig, self._handle)
        return self

    def _handle(self, signum: int, _frame: object) -> None:
        if not self._requested:
            log.info("received %s, finishing current iteration", signal.Signals(signum).name)
        self._requested = True

    @property
    def requested(self) -> bool:
        return self._requested

    def request(self) -> None:
        self._requested = True

    def wait(self, seconds: float) -> bool:
        """Sleep up to `seconds`, returning early (True) once shutdown is requested."""
        deadline = time.monotonic() + max(0.0, seconds)
        while not self._requested:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                break
            time.sleep(min(_SLICE_SECONDS, remaining))
        return self._requested
