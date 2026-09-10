# Production completion audit — 2026-09-09

Branch: `codex/truedata-tradeops-ui`. Existing edits were recorded before implementation in ignored `output/audit/pre-existing.patch` and preserved. Source checksums are recorded separately; raw sources are never modified.

## Prioritized findings

| Priority | Finding | Resolution target |
|---|---|---|
| P0 | September 48.9 MB latency CSV ignored; old parser assumes statuses and microseconds | Explicit validated, indexed file analytics with honest unit metadata |
| P0 | Invalid timing coerced to zero; valid zeros hidden | Nullable finite non-negative measurements; separate invalid/missing counters |
| P0 | Production environment incorrectly under ConfigMap metadata | Correct `data.TRADEOPS_ENV`, validate manifests |
| P0 | Authentication and ES errors expose exception details | Safe bounded errors and request correlation |
| P0 | Health substring matching treats Disconnected as connected; fabricated resource percentages | Exact state classification; display unavailable telemetry |
| P1 | No queue/source-quality workspace; four zero-byte sources | Dynamic per-instance discovery, preserved empty-source states |
| P1 | Per-table filtering diverges from page KPIs | Shared server filter predicates for summary, trend, pagination and export |
| P1 | Expensive files reparsed in request paths | Atomic derived SQLite cache, bounded batches, explicit ingestion |
| P1 | NetworkPolicy label mismatch and missing data ingress/frontend egress | Align selectors and document deployment-specific ingress/egress |
| P2 | Dashboard forced dark; loading/error consistency | Light default, retained optional dashboard navy preference, route boundaries |

## Source evidence

`ORDERLATENCY_08-Sep-2026.csv` has headers NOREN_ORD_NUM, EXCH_SEG, TOKEN, OMS_LATENCY, OMS_EXCH_CONFIRMATION, OMSUPDATETIME, EXCHUPDATETIME, OMSUPDATETIME_CONV. OMS_STATUS, EXCH_STATUS and EXT_RMKS are absent. Legacy field mappings cannot establish their values. `latency.py` establishes UNIX seconds and Asia/Kolkata presentation, but does not document the duration unit; use source units until the owner confirms it. Never execute the legacy script: it has a separate database connection and writes/deletes data.

Ten QueSize CSVs use Time, SeqNo, Erf, QSz. Four are zero bytes. Preserve full instance names, including hyphens and `2` suffixes. Identical-content files under different instance names remain separate observations; summed queue depths would double-count possible aliases and are not advertised as a total.

`Journal_Converted.xlsx` is not a valid ZIP workbook; raw Journal.log remains the journal source. No repair or rewrite is attempted.

## Reference review

All 67 image files were inventoried by SHA-256, yielding 45 unique images, reviewed in eight contact sheets. See `REFERENCE_SCREEN_INVENTORY.md` for the complete mapping. Argus TradeOps identity, light operational surfaces, compact tables, blue actions and semantic status colors are the chosen direction. Third-party logos, invented telemetry, trade execution buttons and unsupported financial claims are excluded.

## Historical verification checkpoint

The following records the earlier checkpoint. Current verification evidence is in [FINAL_VERIFICATION.md](FINAL_VERIFICATION.md). Another editing session began writing `backend/tests/test_file_analytics.py`, `backend/app/file_analytics.py`, `backend/app/file_routes.py`, shared backend configuration/middleware and the frontend shell during this run. The initial baseline patch predates those files. The file-analytics facade and CSV store currently satisfy the discovered tests, but overlapping changes require integration review after one session owns the worktree. No reset/revert was performed; no raw source was changed.

Executed checks:

- Frontend `npm test`: 20 passed, 0 failed.
- Focused backend CSV/store/file-contract/security/API checks: 16 passed, 0 failed.
- Strict kubeconform baseline: 20 valid, 1 invalid (TRADEOPS_ENV under metadata).
- Strict kubeconform after deployment fixes: 23 valid, 0 invalid, 0 errors, 0 skipped.
- `docker compose config --quiet`: exit 0.
- Source checksum comparison: 12 checked, zero changed.
- Real-source ingestion: 509,100 latency events / unique orders; 11 CSV sources including 10 queues, four empty. Initial ingestion 9.2003 seconds; unchanged-input ingestion 0.00546 seconds; full latency summary/page query 1.1565 seconds. These are one local measurement, not an SLO/load-test claim.
- Latest `git diff --check`: no whitespace errors.

No production deployment, live Elasticsearch/Keycloak integration test, final production build or full browser sweep is claimed for this checkpoint. Remaining integration includes latency/queue/source-quality pages, light-default preferences, all-route data-honesty corrections, bounded startup ingestion status, filtered export sorting and release-specific image digests.

Deployment images now carry an explicit `RELEASE_REQUIRED` placeholder rather than a mutable latest tag. This is a release gate, not a valid deployable image. Operators must supply built/published immutable image digests before deployment. Worker HTTP probes establish metrics-server responsiveness, not progress of the processing loop; monitor existing worker error, leadership and stream-pending metrics separately.
