"""Daily ORDERLATENCY / QueSize CSV ingestion into the analytics MySQL database.

Tracked replacement for the untracked host script ``latency.py``. Same three
target tables (``order_latency``, ``queue_line1``, ``queue_line2``) and the
same column lists, so existing readers are unaffected. What changes:

- credentials come from the environment, never from source;
- every file is ingested at most once, keyed by its sha256, recorded in a new
  ``ingestion_runs`` table (the only DDL this module issues);
- a file is one transaction: a failure part-way leaves no rows behind and the
  next run retries it;
- a byte-identical file under another name (``QueSize_NSE2`` vs
  ``QueSize_NSE-2729``) is recorded as an alias, not ingested twice;
- instance-tagged queue files (``QueSize_NSE-5864``) are only ingested when
  ``QUEUE_INSTANCE_LINES`` says which line they are. The old regex silently
  dropped them; guessing a line would be worse.

Stdlib only, so it runs on the OMS host without the API's dependencies.
"""
from __future__ import annotations

import csv
import hashlib
import logging
import os
import re
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Iterator

log = logging.getLogger("tradeops.daily_ingest")

IST = timezone(timedelta(hours=5, minutes=30))
BATCH_SIZE = 1000
DEFAULT_KEEP_DAYS = 30

QUEUE_NAME = re.compile(r"^QueSize_([A-Z]+)(?:-(\d+))?(2)?_(\d{2}-[A-Za-z]{3}-\d{4})\.csv$")
LATENCY_NAME = re.compile(r"^ORDERLATENCY_(\d{2}-[A-Za-z]{3}-\d{4})\.csv$")
QUEUE_TIME_FORMAT = "%a %b %d %I:%M:%S %p IST %Y"

LATENCY_COLUMNS = ("NOREN_ORD_NUM", "EXCH_SEG", "TOKEN", "OMS_LATENCY", "OMS_EXCH_CONFIRMATION",
                   "OMSUPDATETIME", "EXCHUPDATETIME")
QUEUE_COLUMNS = ("Time", "SeqNo", "Erf", "QSz")
DATA_TABLES = ("order_latency", "queue_line1", "queue_line2")

INSERT_LATENCY = ("INSERT INTO order_latency (file_date, noren_ord_num, exch_seg, token, oms_latency, "
                  "oms_exch_confirmation, oms_update_time, exch_update_time, oms_update_time_conv) "
                  "VALUES ({p}, {p}, {p}, {p}, {p}, {p}, {p}, {p}, {p})")
INSERT_QUEUE = "INSERT INTO {table} (file_date, segment, time, seq_no, erf, queue_size) VALUES ({p}, {p}, {p}, {p}, {p}, {p})"


def parse_file_date(text: str) -> date:
    return datetime.strptime(text, "%d-%b-%Y").date()


def sha256_of(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def parse_instance_lines(text: str) -> dict[str, str]:
    """``"NSE-2729=2,NFO-13424=2"`` -> ``{"NSE-2729": "2", ...}``; malformed raises."""
    mapping: dict[str, str] = {}
    for item in str(text or "").split(","):
        item = item.strip()
        if not item:
            continue
        key, sep, line = item.partition("=")
        if not sep or line.strip() not in ("1", "2") or not re.fullmatch(r"[A-Z]+-\d+", key.strip()):
            raise ValueError(f"QUEUE_INSTANCE_LINES: invalid entry {item!r}; expected SEG-NNNN=1|2")
        mapping[key.strip()] = line.strip()
    return mapping


@dataclass
class SourceFile:
    path: Path
    kind: str                      # "latency" | "queue"
    file_date: date
    segment: str | None = None
    instance: str | None = None    # "2729" for QueSize_NSE-2729
    line: str | None = None        # "1" | "2" | None when unmapped
    sha256: str = ""
    size: int = 0

    @property
    def target_table(self) -> str | None:
        if self.kind == "latency":
            return "order_latency"
        return {"1": "queue_line1", "2": "queue_line2"}.get(self.line or "")


def classify(path: Path, instance_lines: dict[str, str]) -> SourceFile | None:
    name = path.name
    m = LATENCY_NAME.match(name)
    if m:
        return SourceFile(path, "latency", parse_file_date(m.group(1)))
    m = QUEUE_NAME.match(name)
    if not m:
        return None
    segment, instance, two, day = m.groups()
    if instance:
        line = instance_lines.get(f"{segment}-{instance}")
    else:
        line = "2" if two else "1"
    return SourceFile(path, "queue", parse_file_date(day), segment=segment, instance=instance, line=line)


def discover(csv_dir: Path, *, keep_days: int, today: date, instance_lines: dict[str, str]) -> list[SourceFile]:
    cutoff = today - timedelta(days=keep_days)
    found: list[SourceFile] = []
    for path in sorted(csv_dir.iterdir()):
        if not path.is_file():
            continue
        source = classify(path, instance_lines)
        if source is None or source.file_date < cutoff or source.file_date > today:
            continue
        source.size = path.stat().st_size
        if source.size == 0:
            log.info("skip empty file %s", path.name)
            continue
        source.sha256 = sha256_of(path)
        found.append(source)
    return found


@dataclass
class ParseResult:
    rows: list[tuple[Any, ...]] = field(default_factory=list)
    read: int = 0
    rejected: int = 0


def _require_columns(header: list[str] | None, required: tuple[str, ...], name: str) -> None:
    missing = [c for c in required if c not in (header or [])]
    if missing:
        raise ValueError(f"{name}: missing required columns {missing}")


def parse_latency(source: SourceFile) -> Iterator[tuple[Any, ...]]:
    with source.path.open(newline="", encoding="utf-8") as stream:
        reader = csv.DictReader(stream)
        _require_columns(reader.fieldnames, LATENCY_COLUMNS, source.path.name)
        for row in reader:
            try:
                oms_update = int(float(row["OMSUPDATETIME"]))
                conv = datetime.fromtimestamp(oms_update, tz=timezone.utc).astimezone(IST).replace(tzinfo=None)
                yield (source.file_date, int(row["NOREN_ORD_NUM"]), row["EXCH_SEG"].strip(), int(float(row["TOKEN"])),
                       float(row["OMS_LATENCY"]), float(row["OMS_EXCH_CONFIRMATION"]), oms_update,
                       int(float(row["EXCHUPDATETIME"])), conv)
            except (KeyError, TypeError, ValueError, OverflowError, OSError):
                yield None  # type: ignore[misc]


def parse_queue(source: SourceFile) -> Iterator[tuple[Any, ...]]:
    with source.path.open(newline="", encoding="utf-8") as stream:
        reader = csv.DictReader(stream)
        _require_columns(reader.fieldnames, QUEUE_COLUMNS, source.path.name)
        for row in reader:
            try:
                # Wall-clock IST from the feed, stored naive as latency.py did.
                when = datetime.strptime(row["Time"].strip(), QUEUE_TIME_FORMAT)
                yield (source.file_date, source.segment, when, int(row["SeqNo"]), int(row["Erf"]), int(row["QSz"]))
            except (KeyError, TypeError, ValueError):
                yield None  # type: ignore[misc]


class Store:
    """Thin DB-API wrapper. ``paramstyle`` is ``format`` (MySQL) or ``qmark`` (sqlite, tests)."""

    def __init__(self, connection: Any, *, paramstyle: str = "format") -> None:
        self.conn = connection
        self.p = "%s" if paramstyle == "format" else "?"
        self.paramstyle = paramstyle

    def _exec(self, sql: str, params: tuple[Any, ...] = ()) -> Any:
        cur = self.conn.cursor()
        cur.execute(sql, params)
        return cur

    def ensure_schema(self) -> None:
        pk = "BIGINT AUTO_INCREMENT PRIMARY KEY" if self.paramstyle == "format" else "INTEGER PRIMARY KEY AUTOINCREMENT"
        self._exec(f"""CREATE TABLE IF NOT EXISTS ingestion_runs (
            id {pk},
            file_name VARCHAR(255) NOT NULL,
            file_sha256 CHAR(64) NOT NULL,
            file_size BIGINT NOT NULL,
            file_date DATE NULL,
            kind VARCHAR(16) NOT NULL,
            segment VARCHAR(16) NULL,
            line VARCHAR(4) NULL,
            target_table VARCHAR(32) NULL,
            status VARCHAR(24) NOT NULL,
            rows_read INT NOT NULL DEFAULT 0,
            rows_inserted INT NOT NULL DEFAULT 0,
            rows_rejected INT NOT NULL DEFAULT 0,
            started_at DATETIME NOT NULL,
            finished_at DATETIME NULL,
            error TEXT NULL
        )""")
        if self.paramstyle == "format":
            for name, cols in (("ix_ingestion_runs_sha", "file_sha256, status"), ("ix_ingestion_runs_date", "file_date")):
                exists = self._exec(
                    "SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() "
                    "AND table_name = 'ingestion_runs' AND index_name = %s", (name,)).fetchone()[0]
                if not exists:
                    self._exec(f"CREATE INDEX {name} ON ingestion_runs ({cols})")
        else:
            self._exec("CREATE INDEX IF NOT EXISTS ix_ingestion_runs_sha ON ingestion_runs (file_sha256, status)")
            self._exec("CREATE INDEX IF NOT EXISTS ix_ingestion_runs_date ON ingestion_runs (file_date)")
        self.conn.commit()

    def successful_run(self, sha256: str) -> str | None:
        """Name of the file already ingested with this content, if any."""
        row = self._exec(f"SELECT file_name FROM ingestion_runs WHERE file_sha256 = {self.p} AND status = 'success' "
                         f"ORDER BY id LIMIT 1", (sha256,)).fetchone()
        return row[0] if row else None

    def start_run(self, source: SourceFile, status: str = "running") -> int:
        cur = self._exec(
            "INSERT INTO ingestion_runs (file_name, file_sha256, file_size, file_date, kind, segment, line, "
            f"target_table, status, started_at) VALUES ({', '.join([self.p] * 10)})",
            (source.path.name, source.sha256, source.size, source.file_date, source.kind, source.segment,
             source.line, source.target_table, status, datetime.now(IST).replace(tzinfo=None)))
        self.conn.commit()
        return int(cur.lastrowid)

    def finish_run(self, run_id: int, status: str, *, read: int = 0, inserted: int = 0, rejected: int = 0,
                   error: str | None = None) -> None:
        self._exec(
            f"UPDATE ingestion_runs SET status = {self.p}, rows_read = {self.p}, rows_inserted = {self.p}, "
            f"rows_rejected = {self.p}, finished_at = {self.p}, error = {self.p} WHERE id = {self.p}",
            (status, read, inserted, rejected, datetime.now(IST).replace(tzinfo=None),
             (error or "")[:2000] or None, run_id))
        self.conn.commit()

    def insert_batch(self, sql: str, rows: list[tuple[Any, ...]]) -> None:
        self.conn.cursor().executemany(sql.format(p=self.p, table="{table}") if "{table}" in sql else sql.format(p=self.p), rows)

    def retention(self, keep_days: int) -> dict[str, date | None]:
        """Keep the newest ``keep_days`` distinct file_dates per table, as latency.py did."""
        cutoffs: dict[str, date | None] = {}
        for table in DATA_TABLES:
            rows = self._exec(f"SELECT DISTINCT file_date FROM {table} ORDER BY file_date DESC LIMIT {int(keep_days)}").fetchall()
            dates = [r[0] for r in rows]
            if len(dates) < keep_days:
                cutoffs[table] = None
                continue
            oldest = min(dates)
            self._exec(f"DELETE FROM {table} WHERE file_date < {self.p}", (oldest,))
            cutoffs[table] = oldest if not isinstance(oldest, str) else parse_iso(oldest)
        self.conn.commit()
        return cutoffs


def parse_iso(text: str) -> date:
    return date.fromisoformat(text[:10])


@dataclass
class RunReport:
    ingested: list[str] = field(default_factory=list)
    skipped: dict[str, str] = field(default_factory=dict)   # file -> reason
    failed: dict[str, str] = field(default_factory=dict)    # file -> error
    retention: dict[str, date | None] = field(default_factory=dict)

    @property
    def ok(self) -> bool:
        return not self.failed


def ingest_file(store: Store, source: SourceFile, *, dry_run: bool = False) -> tuple[int, int, int]:
    """One transaction per file: (read, inserted, rejected). Raises on failure after rollback."""
    table = source.target_table
    assert table
    if source.kind == "latency":
        sql = INSERT_LATENCY.format(p=store.p)
        rows = parse_latency(source)
    else:
        sql = INSERT_QUEUE.format(table=table, p=store.p)
        rows = parse_queue(source)
    read = inserted = rejected = 0
    batch: list[tuple[Any, ...]] = []
    try:
        for row in rows:
            read += 1
            if row is None:
                rejected += 1
                continue
            batch.append(row)
            if len(batch) >= BATCH_SIZE:
                if not dry_run:
                    store.conn.cursor().executemany(sql, batch)
                inserted += len(batch)
                batch = []
        if batch:
            if not dry_run:
                store.conn.cursor().executemany(sql, batch)
            inserted += len(batch)
        if dry_run:
            store.conn.rollback()
        else:
            store.conn.commit()
    except Exception:
        store.conn.rollback()
        raise
    return read, inserted, rejected


def run(store: Store, csv_dir: Path, *, keep_days: int = DEFAULT_KEEP_DAYS, today: date | None = None,
        instance_lines: dict[str, str] | None = None, dry_run: bool = False) -> RunReport:
    today = today or datetime.now(IST).date()
    instance_lines = instance_lines or {}
    report = RunReport()
    store.ensure_schema()
    seen_this_run: dict[str, str] = {}
    for source in discover(csv_dir, keep_days=keep_days, today=today, instance_lines=instance_lines):
        name = source.path.name
        prior = seen_this_run.get(source.sha256) or store.successful_run(source.sha256)
        if prior == name:
            report.skipped[name] = "already ingested"
            log.info("skip %s: already ingested (sha256 %s)", name, source.sha256[:12])
            continue
        if prior:
            report.skipped[name] = f"alias of {prior}"
            log.warning("skip %s: byte-identical to %s", name, prior)
            if not dry_run:
                store.finish_run(store.start_run(source, "alias"), "alias", error=f"identical to {prior}")
            continue
        if source.target_table is None:
            key = f"{source.segment}-{source.instance}"
            report.skipped[name] = f"unmapped instance {key}"
            log.warning("skip %s: no line for %s in QUEUE_INSTANCE_LINES", name, key)
            if not dry_run:
                store.finish_run(store.start_run(source, "unmapped_instance"), "unmapped_instance",
                                 error=f"set QUEUE_INSTANCE_LINES={key}=1|2")
            continue
        run_id = None if dry_run else store.start_run(source)
        try:
            read, inserted, rejected = ingest_file(store, source, dry_run=dry_run)
        except Exception as exc:  # noqa: BLE001 — recorded per file, run continues
            log.error("failed %s: %s", name, exc)
            report.failed[name] = str(exc)
            if run_id is not None:
                store.finish_run(run_id, "failed", error=str(exc))
            continue
        if run_id is not None:
            store.finish_run(run_id, "success", read=read, inserted=inserted, rejected=rejected)
        seen_this_run[source.sha256] = name
        report.ingested.append(name)
        log.info("ingested %s -> %s: read=%d inserted=%d rejected=%d%s", name, source.target_table, read,
                 inserted, rejected, " (dry run)" if dry_run else "")
    if not dry_run:
        report.retention = store.retention(keep_days)
    return report


def settings_from_env(env: dict[str, str] | None = None) -> dict[str, Any]:
    env = os.environ if env is None else env
    missing = [k for k in ("ANALYTICS_DB_HOST", "ANALYTICS_DB_USER", "ANALYTICS_DB_PASSWORD", "ANALYTICS_DB_NAME") if not env.get(k)]
    if missing:
        raise ValueError(f"missing environment: {', '.join(missing)}")
    return {
        "host": env["ANALYTICS_DB_HOST"],
        "port": int(env.get("ANALYTICS_DB_PORT", "3306")),
        "user": env["ANALYTICS_DB_USER"],
        "password": env["ANALYTICS_DB_PASSWORD"],
        "database": env["ANALYTICS_DB_NAME"],
        "csv_dir": Path(env.get("TRADEOPS_CSV_DIR") or "/data/noren_core/COZY_LOG_FILES/nfs_ps"),
        "keep_days": int(env.get("ANALYTICS_KEEP_DAYS", str(DEFAULT_KEEP_DAYS))),
        "instance_lines": parse_instance_lines(env.get("QUEUE_INSTANCE_LINES", "")),
    }
