# Argus TradeOps file analytics

The application remains read-only toward trading systems and original data. Journal/Elasticsearch evidence and CSV observations are separate feeds; they are never silently joined across different source dates.

## Data flow and ownership

`operator-provided CSV directory → streamed validation → normalized SQLite cache → bounded SQL queries → authenticated FastAPI → Next.js`

`csv_store.py` owns ingestion. `file_analytics.py` adapts its contract for the existing API/UI. SQLite is a rebuildable per-replica analytical cache, **not** the PostgreSQL incident/RCA database. CSVs are read only at startup or by the offline ingestion CLI. Requests do not reopen or parse the 48.9 MB CSV. Warm identical latency requests use a bounded 32-entry cache; different filters use indexed, bounded queries. CSV inserts are batched in groups of 1,000 and each file is replaced atomically. Ingestion has a longer deadline than interactive queries. Files removed from the configured directory cease to contribute after reingestion.

Only configured source directories are scanned. No upload, arbitrary file-path, SQL, or reingestion HTTP endpoint is exposed. Symlinks are rejected, file opens use O_NOFOLLOW where supported, rows/fields/files are bounded, and malformed file errors never return exception details. Cache files have owner-only permissions. Mount only a dedicated CSV directory in containers, never the repository or credentials directory.

## Source contracts

| Source | Verified columns / interpretation |
|---|---|
| September ORDERLATENCY | NOREN_ORD_NUM, EXCH_SEG, TOKEN, OMS_LATENCY, OMS_EXCH_CONFIRMATION, OMSUPDATETIME, EXCHUPDATETIME, OMSUPDATETIME_CONV |
| Queue CSV | Time, SeqNo, Erf, QSz; full filename instance is preserved |
| Journal | Existing allowlisted, masked Noren journal contract; see JOURNAL_DATA_CONTRACT.md |
| Journal_Converted.xlsx | Invalid ZIP workbook; not imported or rewritten |

The September latency file **does not contain OMS_STATUS, EXCH_STATUS or EXT_RMKS**. It cannot establish confirmation counts or broker/trader/client/account analysis. TOKEN and free-text remarks are not persisted in the normalized event projection. Order IDs are available only under the latency/orders permission boundaries.

Numeric fields accept finite, non-negative values, including **zero**. Invalid and missing measurements become null and are excluded independently from each metric distribution; they do not become zero. Invalid identity/time rows are rejected. Source metadata records processed, accepted, duplicate and rejected rows, invalid/missing field counts, timestamp mismatches, file hash and import duration. Each file reconciles as:

`processed rows = accepted events + rejected rows + exact duplicate rows`

Identical full-row hashes deduplicate within a source. Repeated order IDs with different lifecycle observations remain distinct events; both event count and unique order count are returned. Identical content under different queue names remains separate and is disclosed as a possible alias. **Do not sum queue depths across aliases.** The current supplied CSVs contain 509,100 unique latency events and 17,250 queue observations across distinct named sources; four of ten queue files are empty.

Percentiles use exact nearest rank, `ceil(p / 100 × valid sample count)`, for p50/p90/p95/p99; maximum uses the same valid values. Empty distributions return null. Summary, segment comparisons, trend, pagination and exports use the same SQL filter predicates. Sort columns are allowlisted. Export preserves requested ordering, streams batches and neutralizes spreadsheet-formula text.

## Units, time and freshness

The source importer script establishes UNIX seconds and Asia/Kolkata presentation, but does not document the duration unit for the September feed. Default **source units** is deliberate. `TRADEOPS_CSV_LATENCY_UNIT=us|ms|s` is an explicit operator declaration after confirmation from the producer; it labels original values without converting them. No absolute latency SLO or network round-trip claim is made without a verified contract.

Numeric timestamp magnitudes normalize supported seconds/milliseconds/microseconds/nanoseconds to epoch seconds. Values must land between 2000 and 2100. Textual IST timestamps are parsed in Asia/Kolkata. Naive ISO strings are rejected; time-filter parameters require offsets. UI and exports label UTC. Converted source timestamp discrepancies are counted. Queue size is a non-negative whole number of entries.

The latency chart shows **mean values per observed adaptive time bucket**, not a percentile history. Distribution cards show exact percentiles. Queue trends show peak per bucket; latest is selected by event time and insertion/source order for equal timestamps. Samples above the filtered source p99 are labelled statistical anomalies, not incident alerts. Snapshot age is based on the last event, not import time; after five minutes a queue snapshot is marked stale. Empty files say **No data received**, with no invented zero latest/peak.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| TRADEOPS_CSV_DIR | empty / disabled | Directory of ORDERLATENCY*, L_ORDERLATENCY* and QueSize_* CSVs |
| TRADEOPS_CSV_CACHE_PATH | /tmp/tradeops-file-cache.sqlite | Writable per-replica derived cache |
| TRADEOPS_CSV_LATENCY_UNIT | unknown | Producer-confirmed us/ms/s, otherwise source units |
| TRADEOPS_CSV_MAX_BYTES | 268435456 | Per-file 256 MiB limit |
| TRADEOPS_CSV_MAX_ROWS | 2000000 | Per-file row limit |
| TRADEOPS_JOURNAL_PATH | empty | Separate read-only Journal.log source |
| TRADEOPS_JOURNAL_PRIMARY | false | Prefer journal evidence for journal-supported routes |
| API_URL | localhost:8001 fallback | Browser-reachable API URL, injected per request |
| INTERNAL_API_URL | API_URL | API URL reachable from Next.js server components |

A source directory supports at most 256 files. Changed files must be complete/atomically published before startup. **Restart each API replica after source replacement** to reingest and invalidate cached summaries. The offline CLI should use its own cache, not modify a serving replica's cache. Do not share a writable SQLite file between replicas or across network filesystems.

## Local operation

From the repository root, with the existing backend environment and frontend dependencies:

```bash
./scripts/start-file-preview.sh
```

This starts a real file-backed API on 127.0.0.1:8102 and UI on 127.0.0.1:3102. It explicitly disables fixture mode, selects journal and CSV paths, uses a loopback unavailable ES endpoint, and enables the development-only auth bypass. It isolates Next.js output under .local/file-preview/frontend, refuses occupied ports and only stops processes it created. Keep the process running; Ctrl-C stops its children.

For a clean dependency environment without overwriting the existing venv:

```bash
uv venv --python 3.12 .local/runtime-venv
uv pip install --python .local/runtime-venv/bin/python -r backend/requirements.txt -r backend/requirements-dev.txt
BACKEND_PYTHON="$PWD/.local/runtime-venv/bin/python" ./scripts/start-file-preview.sh
```

Set PORT_API, PORT_UI and RUN_DIR to isolate another preview. The local auth bypass is never a production configuration.

Offline import and validation:

```bash
backend/.venv/bin/python scripts/ingest-files.py --source-dir . --cache .local/offline-import.sqlite
backend/.venv/bin/python scripts/validate-files.py --source-dir . --cache .local/validation.sqlite
backend/.venv/bin/python scripts/test-backend.py
cd frontend
npm test
npx tsc --noEmit --incremental false
npm run build
```

Stop a dev server sharing frontend/.next before building, or copy the frontend to a separate directory. There is no standalone frontend linter or backend type-check configuration; typecheck, unit tests, runtime checks and production build are the configured validations. The test runner loads non-package test files explicitly to avoid a third-party package named tests shadowing them under Python 3.12.

## API and workspaces

| Route | Behavior / permission |
|---|---|
| /order-latency | CSV analytics when configured; journal event-interval fallback otherwise |
| /queue-monitor | Source freshness, backlog, peaks, statistical anomalies and filtered export |
| /data-quality | Source inventory, row reconciliation and inventory export |
| /api/files/latency | latency:read; q (order substring), segment, status, start/end, limit/offset, sort/direction |
| /api/files/latency/export | Same filters/sort, all matching observations, streamed CSV |
| /api/files/queues | latency:read; instance and start/end |
| /api/files/queues/export | Same instance/time scope, streamed CSV |
| /api/files/sources | dashboard:read; safe source metadata |
| /health/ready | Snapshot mode checks journal/cache; live mode checks ES/Redis/Postgres separately |

File readiness does not assert live integration health. Infrastructure unavailable states remain explicit. Structured request logs carry bounded route templates, status, duration and request IDs; query strings and token values are omitted. Ingestion metrics include tradeops_csv_ingestion_seconds and tradeops_csv_rows_total with bounded kind/outcome labels. Existing API/worker Prometheus metrics continue unchanged.

## Compose and production

```bash
python3 scripts/prepare-file-data.py
# Creates .local/csv-input containing copies of CSVs only; originals are unchanged.
docker compose config --quiet
docker compose up --build
```

Set TRADEOPS_CSV_HOST_DIR to a dedicated external CSV directory if required. Compose mounts this read-only. Keep actual authentication/database/ES secrets in the private backend environment file; use backend/.env.example as a template, never commit values.

Kubernetes workloads remain **release templates**. RELEASE_REQUIRED is not an image you can deploy. Build/publish your images, obtain their real immutable digests, then run:

```bash
python3 scripts/render-release.py \
  --backend-image 'REGISTRY/BACKEND@sha256:REAL_64_HEX_DIGEST' \
  --frontend-image 'REGISTRY/FRONTEND@sha256:REAL_64_HEX_DIGEST' \
  --output .local/release
```

The example placeholders are intentionally rejected. Apply environment-specific hosts, secrets, ingress and external egress first. Use actual immutable digests, run the migration Job before the rollout, and validate the rendered manifests against the target cluster before applying. No deployment is performed by the renderer. Default-deny NetworkPolicy needs explicit ingress-controller, Prometheus, Keycloak and Elasticsearch rules for the actual environment; the supplied examples do not prove those paths. Worker probes only check metric-server responsiveness; alert on worker errors, leadership, pending messages and lack of processing progress.

## Limitations

Historical CSV ingestion does not provide streaming files, a scheduler, multi-tenant durable imports or automatic trading incident creation. Broker/account dimensions, live market depth, holdings, authoritative positions/P&L, RMS limits, infrastructure history and report delivery require their respective integrations. Journal and CSV order IDs may not overlap. Do not infer a lifecycle where no corresponding journal evidence exists. Live Keycloak, ES, Redis/Postgres HA, external egress and production deployment must be verified in the target environment.

The source validator checks both OMS and confirmation percentiles/sample counts/maxima, plus per-instance queue peaks, p99 anomaly counts and inclusive time-filter/export reconciliation. See `RESUMED_VERIFICATION.md` for the latest continuation results.
