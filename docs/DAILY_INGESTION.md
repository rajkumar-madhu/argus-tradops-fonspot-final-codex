# Daily CSV ingestion

Around 18:20 IST the OMS drops `ORDERLATENCY_<DD-Mon-YYYY>.csv` and one
`QueSize_<SEGMENT>[2|-<instance>]_<date>.csv` per exchange line into
`/data/noren_core/COZY_LOG_FILES/nfs_ps`. Two consumers read them:

- **TradeOps UI** — `backend/app/csv_store.py` builds a read-only SQLite cache from
  `TRADEOPS_CSV_DIR` at API startup; `/api/files/*` serves it. This is what the
  Order Latency and Queue Monitor pages show. It is a derived cache, rebuilt per
  replica, never a system of record.
- **Analytics MySQL** — historically the untracked host script `latency.py`,
  run from cron. Replaced by `scripts/latency_ingest.py`, which writes the same
  three tables (`order_latency`, `queue_line1`, `queue_line2`) with the same
  columns.

## Why `latency.py` was replaced

Measured on the 08-Sep-2026 set:

- It processed every `QueSize_*` file for a date once per line loop and again
  for "today", so queue rows landed ~3× and latency rows ~2× per normal run.
  Reruns repeated it. There was no unique key and no file identity.
- Its segment regex `[A-Z0-9]+?` cannot match `QueSize_NSE-2729`; four of ten
  queue files were dropped with no log line.
- `QueSize_NSE2` and `QueSize_NSE-2729` are byte-identical (likewise
  `NFO2`/`NFO-13424`); it ingested both.
- Batches were committed one by one with no rollback, so a mid-file failure
  left a partial day that the `MAX(file_date)` watermark then treated as done.
- Root MySQL credentials were in the source.

## Running the replacement

```bash
ANALYTICS_DB_HOST=10.172.0.10 ANALYTICS_DB_PORT=30414 \
ANALYTICS_DB_USER=tradeops_ingest ANALYTICS_DB_PASSWORD=... ANALYTICS_DB_NAME=analytics \
TRADEOPS_CSV_DIR=/data/noren_core/COZY_LOG_FILES/nfs_ps \
QUEUE_INSTANCE_LINES="NSE-2729=2,NFO-13424=2" \
python3 scripts/latency_ingest.py --dry-run
```

Drop `--dry-run` once the counts look right. Exit status 1 means at least
one file failed; that file is retried on the next run because nothing of it
was committed.

Guarantees:

- **Idempotent.** Each file's sha256 is recorded in `ingestion_runs` (the only
  table the script creates). A file is ingested once, however many times the
  script runs. Byte-identical files under a second name are recorded as
  `alias` and skipped.
- **Transactional.** One transaction per file. Failure → rollback + a
  `failed` run row with the error; no partial days.
- **No guessing.** `QueSize_<SEG>-<instance>` files are ingested only when
  `QUEUE_INSTANCE_LINES` names their line. Otherwise they are recorded as
  `unmapped_instance` and skipped — visibly, with the setting to add.
- **Rejected rows are counted**, not silently coerced to NULL.
- **Retention** keeps the newest 30 distinct `file_date`s per table, as before.

Use a dedicated MySQL account with `SELECT, INSERT, DELETE` on the three data
tables and `CREATE, SELECT, INSERT, UPDATE` on `ingestion_runs`. Rotate the
root password that shipped in `latency.py`.

## Scheduling

Keep the existing cron on the OMS host until the CSV directory is mountable in
the cluster; the schedule is not in this repo today, so record it there:

```
25 18 * * 1-5 . /etc/tradeops/ingest.env && /usr/bin/python3 /opt/tradeops/scripts/latency_ingest.py >> /var/log/tradeops-ingest.log 2>&1
```

`k8s/daily-ingest-cronjob.example.yaml` shows the in-cluster equivalent.

## Freshness

Between 09:00 and ~18:25 IST the newest complete day is D-1. UI freshness for
these feeds is "as of the last completed batch", never wall-clock age of the
last event — a 300-second stale rule would flag every row all day.
