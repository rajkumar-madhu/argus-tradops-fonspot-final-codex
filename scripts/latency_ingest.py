#!/usr/bin/env python3
"""Daily CSV -> analytics MySQL ingestion. Idempotent; safe to rerun.

    ANALYTICS_DB_HOST=... ANALYTICS_DB_USER=... ANALYTICS_DB_PASSWORD=... ANALYTICS_DB_NAME=analytics \
    TRADEOPS_CSV_DIR=/data/noren_core/COZY_LOG_FILES/nfs_ps \
    QUEUE_INSTANCE_LINES="NSE-2729=2,NFO-13424=2" \
    python3 scripts/latency_ingest.py [--dry-run] [--days 30]

Exit status is 1 if any file failed, so cron/CronJob alerting can see it.
See docs/DAILY_INGESTION.md.
"""
import argparse
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
from app.daily_ingest import Store, run, settings_from_env  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dry-run", action="store_true", help="parse and count; write nothing")
    parser.add_argument("--days", type=int, default=None, help="override ANALYTICS_KEEP_DAYS")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    try:
        cfg = settings_from_env()
    except ValueError as exc:
        print(f"configuration error: {exc}", file=sys.stderr)
        return 2
    import mysql.connector  # noqa: WPS433 — only needed on the ingestion host
    conn = mysql.connector.connect(host=cfg["host"], port=cfg["port"], user=cfg["user"],
                                   password=cfg["password"], database=cfg["database"], autocommit=False)
    try:
        report = run(Store(conn), cfg["csv_dir"], keep_days=args.days or cfg["keep_days"],
                     instance_lines=cfg["instance_lines"], dry_run=args.dry_run)
    finally:
        conn.close()
    logging.getLogger("tradeops.daily_ingest").info(
        "done: ingested=%d skipped=%d failed=%d retention=%s", len(report.ingested), len(report.skipped),
        len(report.failed), {k: str(v) for k, v in report.retention.items()})
    return 0 if report.ok else 1


if __name__ == "__main__":
    sys.exit(main())
