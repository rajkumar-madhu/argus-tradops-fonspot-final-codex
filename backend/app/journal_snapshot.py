"""Explicit local journal snapshots. No polling, trading writes, or ES access."""
import json
from functools import lru_cache
from pathlib import Path
from app.elastic.normalizer import normalize_order


@lru_cache(maxsize=1)
def load_journal(path: str):
    events = []
    records = 0
    # Project only normalized fields; raw journal contains sensitive account data.
    with Path(path).open(encoding="utf-8") as stream:
        for line in stream:
            if not line.strip():
                continue
            doc = json.loads(line)
            if not isinstance(doc, dict):
                raise ValueError("Journal record must be an object")
            records += 1
            if doc.get("msg_type") == "ordupd":
                row = normalize_order(doc, mask_sensitive=True)
                # Free-text rejection reasons may contain PII. Keep category/code.
                row["reason"] = ""
                events.append(row)
    events.sort(key=lambda row: row["time"])
    latest = {row["order_id"]: row for row in events if row["order_id"]}
    return {
        "items": sorted(latest.values(), key=lambda row: row["time"], reverse=True), "events": events,
        "records": records, "count": len(latest), "source": "journal snapshot",
        "from": events[0]["time"] if events else None,
        "to": events[-1]["time"] if events else None,
    }
