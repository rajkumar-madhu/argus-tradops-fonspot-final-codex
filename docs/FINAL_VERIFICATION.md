# Verification evidence — 2026-09-09

## Outcome and scope

The existing Argus TradeOps implementation now includes validated real-source latency analytics, per-instance queue monitoring, source reconciliation, authenticated filtered exports and a light-default operations shell. The application remains read-only toward trading systems. Existing user edits and all original data were preserved. No commit, push, cluster mutation or production deployment was performed.

The production frontend was built in `.local/release-final/frontend` and served at **http://127.0.0.1:3106/dashboard**, using the real journal/CSV API at **http://127.0.0.1:8104** with synthetic mode disabled. This is a loopback development preview with auth explicitly bypassed; process lifetime is tied to the running local processes. The durable startup procedure is `scripts/start-file-preview.sh`, documented in FILE_ANALYTICS.md.

## Executed checks

| Check | Exact result | Local evidence |
|---|---|---|
| `backend/.venv/bin/python scripts/test-backend.py` | 71 tests, OK; latest worktree run 0.263 seconds | output/audit/backend-worktree-final.log |
| `npm test` | 26 passed, 0 failed | output/audit/frontend-worktree-final.log |
| `npx tsc --noEmit --incremental false` | Exit 0, no diagnostics, including latest worktree | output/audit/typecheck-worktree-final.log |
| `npm run build` in isolated frontend copy | Exit 0, optimized production build generated | output/audit/build-final.log |
| `scripts/validate-files.py --source-dir . --cache .local/validation-final.sqlite` | PASS: 11 CSV files, 4 empty; 509100 latency events, 17250 queue observations; reconciliation, percentiles, export and idempotence pass | output/audit/source-validation-final.json |
| `scripts/verify-file-runtime.py --api http://127.0.0.1:8104 --ui http://127.0.0.1:3106` | 25 HTML routes pass; no-match state pass; API and frontend exports match 23760 BFO latency rows and 5811 NSE2 queue rows | output/audit/runtime-final.json |
| `scripts/test-runtime-ui.py http://127.0.0.1:3106 http://127.0.0.1:8104` | Runtime URL injection passes on signin, signup, forgot-password, verify, dashboard | output/audit/runtime-ui-final.log |
| `docker compose config --quiet` | Exit 0 | Executed locally |
| `kubeconform -strict -summary -ignore-missing-schemas k8s/*.yaml` | 33 resources: 30 valid, 0 invalid, 0 errors, 3 skipped custom schemas | Executed locally; not a cluster dry-run |
| Release renderer with `example/backend:latest` / `example/frontend:latest` | Expected exit 2; mutable image references rejected | No manifests produced for invalid images |
| Original source SHA-256 comparison | 12 checked, 0 changed | output/audit/source-checksums.json |
| `bash -n scripts/start-file-preview.sh` / `git diff --check` | Exit 0 | Executed locally |

No configured standalone frontend linter or backend type-checker exists. The build/type-check/unit/runtime checks above are the available checks, not substitute claims of unexecuted linting.

## Browser evidence

Playwright CLI session `finalcheck` exercised the real snapshot build. Applied and reset filters, pagination, no-match results, four-source empty-file behavior, queue anomaly columns and backend-unavailable latency messaging were verified. A held navigation request verified the Loading button state. Keyboard verification confirmed the skip link and Tab movement from order search to segment. Initial captures occurred during streaming and were replaced with settled captures. Initial selector mistakes were corrected before recording the final interaction results.

Evidence is under `output/audit/browser-*-final.log` and `output/playwright/final-*.png`. Desktop/laptop and narrow dashboard views were exercised. These focused keyboard/layout checks are not a comprehensive WCAG audit. HTTP coverage includes authentication pages; no live Keycloak login was performed.

## Data and release limitations

- September duration units remain unconfirmed: original measurements use **source units** until the producer establishes us/ms/s. No conversion or SLO is invented.
- Four queue files are empty. Matching hashes under different queue names indicate possible aliases; aggregate depth across them is not advertised.
- The supplied XLSX is invalid. Raw Journal.log remains authoritative for journal-supported workflows. The journal and CSV files have different dates and are not silently joined.
- Snapshots refresh at startup; they are not live ingestion. Restart after atomically replacing inputs. SQLite is a per-replica derived cache, not shared network storage.
- Live Elasticsearch, Keycloak, TrueData, Redis/Postgres integration, Alembic execution, failover/capacity testing and cluster rollout were not verified in this file-backed run.
- Kubernetes files are release templates. Actual published digests, environment-specific secrets/hosts/egress, migrations and target-cluster validation remain required. Worker HTTP probes establish responsiveness, not processing progress.
- Additional session/journal projection edits arrived from another editing session after the isolated production snapshot. They were preserved. Latest worktree unit tests and type-check passed; the production build/browser results cover the isolated snapshot, not those later edits. Rebuild/retest after the shared worktree is stable before release.

See FILE_ANALYTICS.md for configuration, ingestion, security boundaries and startup; REFERENCE_SCREEN_INVENTORY.md for all 67 reference images mapped to routes; PRODUCTION_COMPLETION_AUDIT.md for prioritized findings.
