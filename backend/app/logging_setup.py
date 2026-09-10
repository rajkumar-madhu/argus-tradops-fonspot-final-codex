"""One-line JSON logging for the worker processes.

A plain-text formatter splits every traceback across many lines, which log
shippers (Filebeat, Promtail, Fluent Bit) ingest as unrelated records. Emitting
one JSON object per record keeps an exception and its stack together and makes
`level`/`component` filterable without regexes.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone


class JsonFormatter(logging.Formatter):
    def __init__(self, component: str) -> None:
        super().__init__()
        self.component = component

    def format(self, record: logging.LogRecord) -> str:
        entry = {
            "ts": datetime.fromtimestamp(record.created, timezone.utc).isoformat(timespec="milliseconds"),
            "level": record.levelname,
            "component": self.component,
            "logger": record.name,
            "message": record.getMessage(),
        }
        if record.exc_info:
            entry["exception"] = self.formatException(record.exc_info)
        return json.dumps(entry, default=str)


def configure_logging(component: str, level: int = logging.INFO) -> None:
    """Route the root logger through a single JSON handler.

    Replaces any existing root handlers so a repeated call (or an earlier
    `basicConfig`) cannot produce duplicate lines.
    """
    handler = logging.StreamHandler()
    handler.setFormatter(JsonFormatter(component))
    root = logging.getLogger()
    root.handlers[:] = [handler]
    root.setLevel(level)
