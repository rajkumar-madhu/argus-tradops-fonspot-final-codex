# Order latency stage timing (ORDERLATENCYSORTED files)

Date: 2026-09-11 · Status: approved in chat (phase A of "both, A first")

## Problem

A new Noren export, `ORDERLATENCYSORTED<YYYYMMDDHHmmss>.csv`, carries per-order stage
timings. Nothing reads it: `latency.py` (cron → MySQL) and the app's CSV ingest both expect
the headered `ORDERLATENCY_` / `L_ORDERLATENCY` formats. Worse, the app's discovery glob
`ORDERLATENCY*.csv` also matches the new name, so a dropped-in file is parsed as the wrong
kind and rejected with "Missing required fields".

## File format (verified on the 2026-07-17 sample)

Headerless CSV, one row per order, 103 fields:

`NOREN_ORD_NUM, instance ("QKBT1"), EXCH_SEG, ext_rmks,` then 14 groups of 7:

`code_a, code_b, duration_us, end_s, end_ns, start_s, start_ns`

- An unused group has an empty `code_a` (duration `0`). A trailing empty field may follow.
- `duration_us == ((end_s·1e9 + end_ns) − (start_s·1e9 + start_ns)) / 1000` — 0 of 94 stages in
  the sample disagree by more than 1 µs, so the unit is established by the data itself.
- Groups are **named intervals, not a chain**: several share start points and overlap. The
  right visual is a per-order timeline (Gantt), not stacked bars.
- Stage label = `code_a`, or `code_a/code_b` when they differ (`50/49` in the sample).
- Code meanings (82, 79, 80, 83, 46, 47, 65, 56, 48, 50/49) are **not documented**. Show them raw
  as "Stage 82" with a "names pending" note. Do not guess (same rule as the journal explorer).

## Design

### Ingest — `backend/app/csv_store.py`
- New kind `hops` for `ORDERLATENCYSORTED*.csv`, discovered **before** and **excluded from** the
  `ORDERLATENCY*` latency glob.
- Separate table `hops(file, fingerprint, order_id, instance, segment, stage, position, duration,
  start_ns, end_ns, row_number)`; the `events` schema is latency/queue shaped.
- Reuse the existing per-file scaffolding: path/symlink guard, size and row limits, signature skip,
  sha256, atomic replace, source-changed check, interrupt handling, catalog metadata, metrics.
- Row validation: ≥1 non-empty group; fields after the last group empty; codes 1–4 digits;
  numeric duration ≥ 0; integer timestamps within the supported epoch range; end ≥ start;
  order id ≤ 32 chars; segment ≤ 16; instance ≤ 64. A malformed group rejects the whole row.
  Duration/timestamp disagreement > 1 µs is kept but counted as `timestamp_mismatches`.
- Stage fingerprint = sha256(order, stage, start_ns, end_ns, duration) → exact duplicates are
  counted, not stored twice.
- `ext_rmks` is never stored (free text; consistent with "no remarks persisted").

### Queries and API (read-only, `latency:read`)
- `GET /api/files/hops?segment=&instance=` → orders, per-stage count and p50/p90/p95/p99/max
  (µs), stages ordered by typical position, the 20 slowest orders by span, facet choices.
- `GET /api/files/hops/{order_id}` → that order's stages with start/end offsets from its first
  start, plus the absolute first-start time.

### UI — `/order-latency`
- New `StageTiming` server component after "Segment comparison": stage table with log-scale p95
  bars, segment/instance filters, slowest-orders list linking `?hop_order=`, and the order trace
  timeline (teal intervals, amber for any stage covering ≥ 50% of the order's span).
- Honest empty state when no hop file is ingested. `FILE-BASED`, Argus palette tokens only.

### Out of scope (phase B, separate spec)
Fix `latency.py` (review findings: double insert, dropped hyphenated files, root password,
first-run OR backfill, partial-batch truncation), load hops into MySQL, add a read-only MySQL
source.

## Verification
Backend unit tests (format, empty groups, trailing field, malformed row, mismatch counting,
duplicates, glob collision, filename with a space, catalog/removal), `tsc`, frontend helper tests,
and a real preview (`file-preview`) with the sample file.
