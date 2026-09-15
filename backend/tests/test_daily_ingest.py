"""Daily CSV ingestion: idempotent, transactional, never guesses a queue line."""
import logging
import sqlite3
import tempfile
import unittest
from datetime import date
from pathlib import Path

from app import daily_ingest
from app.daily_ingest import Store, classify, parse_instance_lines, run

DAY = "08-Sep-2026"
TODAY = date(2026, 9, 8)
LATENCY_HEADER = "NOREN_ORD_NUM,EXCH_SEG,TOKEN,OMS_LATENCY,OMS_EXCH_CONFIRMATION,OMSUPDATETIME,EXCHUPDATETIME,OMSUPDATETIME_CONV\n"
LATENCY_ROW = "26063000006515,NSE,383,185.25,2840.25,1788839160,1788839163,Tue Sep  8 09:16:00 AM IST 2026\n"
QUEUE_HEADER = "Time,SeqNo,Erf,QSz\n"
QUEUE_ROW = "Tue Sep  8 09:15:{s:02d} AM IST 2026,{n},{n},{q}\n"


def queue_csv(n: int, start_depth: int = 750) -> str:
    return QUEUE_HEADER + "".join(QUEUE_ROW.format(s=i % 60, n=i + 1, q=start_depth - i) for i in range(n))


class SqliteStore(Store):
    def __init__(self, conn):
        super().__init__(conn, paramstyle="qmark")


def fresh_db() -> sqlite3.Connection:
    conn = sqlite3.connect(":memory:")
    conn.execute("CREATE TABLE order_latency (file_date DATE, noren_ord_num BIGINT, exch_seg TEXT, token INT, "
                 "oms_latency REAL, oms_exch_confirmation REAL, oms_update_time BIGINT, exch_update_time BIGINT, "
                 "oms_update_time_conv DATETIME)")
    for table in ("queue_line1", "queue_line2"):
        conn.execute(f"CREATE TABLE {table} (file_date DATE, segment TEXT, time DATETIME, seq_no INT, erf INT, queue_size INT)")
    return conn


def count(conn, table):
    return conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]


logging.getLogger("tradeops.daily_ingest").setLevel(logging.CRITICAL)


class ClassifyTests(unittest.TestCase):
    def test_queue_file_names(self):
        plain = classify(Path(f"QueSize_NSE_{DAY}.csv"), {})
        two = classify(Path(f"QueSize_NSE2_{DAY}.csv"), {})
        inst = classify(Path(f"QueSize_NFO-13424_{DAY}.csv"), {})
        mapped = classify(Path(f"QueSize_NFO-13424_{DAY}.csv"), {"NFO-13424": "2"})
        self.assertEqual((plain.segment, plain.line, plain.target_table), ("NSE", "1", "queue_line1"))
        self.assertEqual((two.segment, two.line, two.target_table), ("NSE", "2", "queue_line2"))
        # The old regex ([A-Z0-9]+?) could not match a hyphenated instance and
        # dropped the file silently. Now it is recognised and left unmapped.
        self.assertEqual((inst.segment, inst.instance, inst.line, inst.target_table), ("NFO", "13424", None, None))
        self.assertEqual(mapped.target_table, "queue_line2")
        self.assertIsNone(classify(Path("ORDERLATENCYSORTED20260717170001 4.csv"), {}), "headerless stage file is not the feed")
        self.assertEqual(classify(Path(f"ORDERLATENCY_{DAY}.csv"), {}).target_table, "order_latency")

    def test_instance_line_config_is_validated(self):
        self.assertEqual(parse_instance_lines(" NSE-2729=2, NFO-13424=2 "), {"NSE-2729": "2", "NFO-13424": "2"})
        for bad in ("NSE-2729", "NSE-2729=3", "NSE=1", "nse-1=1"):
            with self.assertRaises(ValueError, msg=bad):
                parse_instance_lines(bad)

    def test_credentials_only_from_environment(self):
        with self.assertRaises(ValueError):
            daily_ingest.settings_from_env({})
        cfg = daily_ingest.settings_from_env({"ANALYTICS_DB_HOST": "h", "ANALYTICS_DB_USER": "u",
                                              "ANALYTICS_DB_PASSWORD": "p", "ANALYTICS_DB_NAME": "analytics"})
        self.assertEqual(cfg["port"], 3306)
        self.assertEqual(cfg["keep_days"], 30)


class RunTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.dir = Path(self.tmp.name)
        self.conn = fresh_db()
        self.store = SqliteStore(self.conn)

    def write(self, name: str, text: str) -> None:
        (self.dir / name).write_text(text)

    def test_ingests_each_file_once_and_reruns_are_no_ops(self):
        self.write(f"ORDERLATENCY_{DAY}.csv", LATENCY_HEADER + LATENCY_ROW * 3)
        self.write(f"QueSize_NSE_{DAY}.csv", queue_csv(5))
        self.write(f"QueSize_NSE2_{DAY}.csv", queue_csv(4, 400))
        first = run(self.store, self.dir, today=TODAY)
        self.assertEqual(sorted(first.ingested), [f"ORDERLATENCY_{DAY}.csv", f"QueSize_NSE2_{DAY}.csv", f"QueSize_NSE_{DAY}.csv"])
        self.assertEqual((count(self.conn, "order_latency"), count(self.conn, "queue_line1"), count(self.conn, "queue_line2")), (3, 5, 4))
        # latency.py inserted queue rows ~3x and latency rows ~2x per run. Now a rerun adds nothing.
        second = run(self.store, self.dir, today=TODAY)
        self.assertEqual(second.ingested, [])
        self.assertEqual(set(second.skipped.values()), {"already ingested"})
        self.assertEqual((count(self.conn, "order_latency"), count(self.conn, "queue_line1"), count(self.conn, "queue_line2")), (3, 5, 4))
        runs = self.conn.execute("SELECT file_name, status, rows_read, rows_inserted, rows_rejected FROM ingestion_runs ORDER BY id").fetchall()
        self.assertEqual([r[1] for r in runs], ["success"] * 3)
        self.assertEqual(runs[0][2:], (3, 3, 0))

    def test_identical_content_under_another_name_is_an_alias(self):
        # QueSize_NSE2 and QueSize_NSE-2729 are byte-identical in the 08-Sep set.
        self.write(f"QueSize_NSE2_{DAY}.csv", queue_csv(6))
        self.write(f"QueSize_NSE-2729_{DAY}.csv", queue_csv(6))
        report = run(self.store, self.dir, today=TODAY, instance_lines={"NSE-2729": "2"})
        self.assertEqual(report.ingested, [f"QueSize_NSE-2729_{DAY}.csv"], "sorted order: the hyphenated name comes first")
        self.assertEqual(report.skipped, {f"QueSize_NSE2_{DAY}.csv": f"alias of QueSize_NSE-2729_{DAY}.csv"})
        self.assertEqual(count(self.conn, "queue_line2"), 6)
        self.assertEqual(self.conn.execute("SELECT status FROM ingestion_runs WHERE file_name LIKE 'QueSize_NSE2%'").fetchone()[0], "alias")

    def test_unmapped_instance_is_recorded_not_guessed(self):
        self.write(f"QueSize_NSE-5864_{DAY}.csv", queue_csv(3))
        report = run(self.store, self.dir, today=TODAY)
        self.assertEqual(report.ingested, [])
        self.assertIn("unmapped instance NSE-5864", report.skipped[f"QueSize_NSE-5864_{DAY}.csv"])
        self.assertEqual(count(self.conn, "queue_line1") + count(self.conn, "queue_line2"), 0)
        self.assertEqual(self.conn.execute("SELECT status, error FROM ingestion_runs").fetchone(),
                         ("unmapped_instance", "set QUEUE_INSTANCE_LINES=NSE-5864=1|2"))

    def test_a_bad_row_is_counted_and_a_missing_column_fails_the_whole_file(self):
        self.write(f"QueSize_BSE_{DAY}.csv", QUEUE_HEADER + "not a time,1,1,5\n" + QUEUE_ROW.format(s=1, n=2, q=4))
        self.write(f"ORDERLATENCY_{DAY}.csv", "NOREN_ORD_NUM,EXCH_SEG\n1,NSE\n")
        report = run(self.store, self.dir, today=TODAY)
        self.assertEqual(report.ingested, [f"QueSize_BSE_{DAY}.csv"])
        self.assertIn("missing required columns", report.failed[f"ORDERLATENCY_{DAY}.csv"])
        self.assertFalse(report.ok)
        self.assertEqual(count(self.conn, "queue_line1"), 1)
        self.assertEqual(count(self.conn, "order_latency"), 0)
        rows = {r[0]: r[1:] for r in self.conn.execute("SELECT file_name, status, rows_read, rows_inserted, rows_rejected FROM ingestion_runs")}
        self.assertEqual(rows[f"QueSize_BSE_{DAY}.csv"], ("success", 2, 1, 1))
        self.assertEqual(rows[f"ORDERLATENCY_{DAY}.csv"][0], "failed")

    def test_partial_failure_leaves_no_rows_and_is_retried_next_run(self):
        self.write(f"ORDERLATENCY_{DAY}.csv", LATENCY_HEADER + LATENCY_ROW * 2)
        original = daily_ingest.parse_latency

        def exploding(source):
            yield from original(source)
            raise OSError("disk read error mid-file")

        daily_ingest.parse_latency = exploding
        try:
            report = run(self.store, self.dir, today=TODAY)
        finally:
            daily_ingest.parse_latency = original
        self.assertIn("disk read error", report.failed[f"ORDERLATENCY_{DAY}.csv"])
        self.assertEqual(count(self.conn, "order_latency"), 0, "per-batch commits in latency.py left partial days behind")
        retry = run(self.store, self.dir, today=TODAY)
        self.assertEqual(retry.ingested, [f"ORDERLATENCY_{DAY}.csv"])
        self.assertEqual(count(self.conn, "order_latency"), 2)

    def test_dry_run_writes_nothing(self):
        self.write(f"ORDERLATENCY_{DAY}.csv", LATENCY_HEADER + LATENCY_ROW)
        report = run(self.store, self.dir, today=TODAY, dry_run=True)
        self.assertEqual(report.ingested, [f"ORDERLATENCY_{DAY}.csv"])
        self.assertEqual(count(self.conn, "order_latency"), 0)
        self.assertEqual(count(self.conn, "ingestion_runs"), 0)

    def test_latency_row_conversion_and_ist(self):
        self.write(f"ORDERLATENCY_{DAY}.csv", LATENCY_HEADER + LATENCY_ROW)
        run(self.store, self.dir, today=TODAY)
        row = self.conn.execute("SELECT noren_ord_num, exch_seg, token, oms_latency, oms_update_time, oms_update_time_conv FROM order_latency").fetchone()
        self.assertEqual(row[:5], (26063000006515, "NSE", 383, 185.25, 1788839160))
        self.assertEqual(row[5], "2026-09-08 09:16:00", "epoch 1788839160 (03:46 UTC) as naive IST, matching the feed's own OMSUPDATETIME_CONV")

    def test_files_outside_the_window_and_empty_files_are_ignored(self):
        self.write("ORDERLATENCY_01-Jan-2026.csv", LATENCY_HEADER + LATENCY_ROW)
        self.write(f"QueSize_BFO_{DAY}.csv", "")
        report = run(self.store, self.dir, today=TODAY)
        self.assertEqual((report.ingested, report.skipped, report.failed), ([], {}, {}))


if __name__ == "__main__":
    unittest.main()
