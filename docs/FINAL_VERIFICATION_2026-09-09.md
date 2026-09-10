# Integrated local verification — 9 September 2026

This report supplements the earlier audit and continuation checkpoints. Existing and concurrent worktree edits were preserved. No source CSV/XLSX was modified, no trading write path was added, and no production deployment was performed.

## Running preview

The verified production Next.js build is available at `http://127.0.0.1:3102/dashboard`, with `/order-latency`, `/queue-monitor` and `/data-quality`. API: `http://127.0.0.1:8102/health/ready`. These are local snapshot processes and remain available only while their processes are running. Authentication is explicitly bypassed for this loopback preview; this does not validate production authentication.

The frontend build is isolated in `.local/build-check`; the backend uses the pinned Python 3.12 environment `.local/test-venv`. The existing backend virtual environment was found to contain different dependency versions. To reproduce an isolated environment, install `backend/requirements.txt` and `backend/requirements-dev.txt` into a new Python 3.12 virtual environment. For repeatable development startup use `scripts/start-file-preview.sh`, setting `BACKEND_PYTHON` to that environment and choosing free `PORT_API` and `PORT_UI` values. See `FILE_ANALYTICS.md` for configuration and data contracts.

## Executed checks

| Command/check | Latest result |
|---|---|
| `.local/test-venv/bin/python scripts/test-backend.py` | 71 tests passed |
| `npm --prefix frontend test` | 26 tests passed |
| `cd frontend && npx tsc --noEmit --incremental false` | Exit 0 |
| `cd .local/build-check && npm run build` after copying current frontend source | Next.js 15.5.25 production build passed |
| `.local/test-venv/bin/python scripts/validate-files.py --source-dir . --cache .local/verified-source.sqlite` | PASS: source hashes unchanged, row reconciliation, filtered percentiles/exports and repeated-ingestion idempotence |
| `python3 scripts/smoke-file-api.py http://127.0.0.1:8102` | PASS: 509,100 latency events; 11 sources; 10 queue instances; four empty queues; 6,043 sorted filtered export rows; empty filters and invalid-query rejection |
| `python3 scripts/verify-file-runtime.py --api http://127.0.0.1:8102 --ui http://127.0.0.1:3102` | PASS: API and frontend exports reconcile for 23,760 BFO latency rows and 5,811 NSE2 queue observations; 25 HTML routes and no-match state pass |
| `docker compose config --quiet` | Exit 0 |
| `kubeconform -strict -summary -ignore-missing-schemas k8s/*.yaml` | 33 resources: 30 valid, zero invalid/errors, three custom resources skipped |
| Release renderer with synthetic immutable digest fixtures; repeat with mutable tags | Digest fixtures rendered without placeholders; mutable tags rejected. No image availability/deployment proof implied |
| `git diff --check`; AGENTS/CLAUDE mirror comparison | Pass |

The latest observed API summary requests took 0.020 and 0.003 seconds. These were cache-backed requests, not a cold-import or load benchmark. The full source validation completed successfully under concurrent host load; ingestion duration varies substantially with host load and cache generation.

## Browser evidence

Playwright CLI drove a fresh browser context against the isolated production build. All 26 checked routes returned HTTP 200, rendered their headings, and had no page exceptions or document overflow at 1440 pixels. `/auth/callback` without an authorization code correctly rendered “Sign-in failed”. This is expected error handling, not successful Keycloak authentication.

At 1024 × 800, latency filtering, pagination, no-match results, reset, optional dark theme, Ctrl-K search focus and subsequent Tab navigation passed. A delayed navigation response exercised the disabled “Loading…” filter button. The focused run reported no browser console errors. An additional temporary frontend pointed at an unavailable backend rendered “Unable to load latency analytics” without crashing. That temporary process was stopped after the check.

Screenshots are local ignored artifacts in `output/playwright/`: `verified-dashboard.png`, `verified-orders.png`, `verified-order-latency.png`, `verified-queue-monitor.png`, `verified-data-quality.png`, `verified-infra.png`, `verified-laptop.png`, and `verified-backend-unavailable.png`. Machine-readable/local logs are under `.local/`: `browser-sweep-result.txt`, `focused-browser-result.txt`, `unavailable-browser-result.txt`, `final-runtime.log`, `api-smoke.json`, `source-validation-result.json`, `final-backend.log`, `final-frontend.log` and `final-build.log`.

An initial export reconciliation failed during the overlapping runtime work; direct endpoint counts and the complete subsequent runtime rerun passed. Treat this as a reason to run release verification with one stable worktree and isolated processes. Earlier development-browser hydration attribute warnings were not reproduced by the focused production-browser check. Repeated chart labels now have distinct React keys.

## Source interpretation and release limits

- The supplied latency CSV contains 509,100 events; the ten queue sources contain 17,250 observations, with four zero-byte sources. Unknown duration units remain “source units”; absent statuses are unavailable. Queue instances retain their complete names and are not summed across possible aliases.
- Percentiles use finite valid measurements and nearest rank; valid zeros remain valid. Mean time buckets are labelled as means, with observed timestamps and explicit UTC presentation. Journal event intervals remain separate from measured CSV timing values.
- Historical exchange evidence does not establish current adapter connectivity or heartbeat. Venue rejection rates use each venue's own observed order denominator. Missing live measurements remain unavailable.
- Snapshot readiness verifies configured snapshot availability only. Live Elasticsearch, Redis, PostgreSQL, Keycloak, TrueData and worker progress require separate integration evidence.
- Kubernetes custom resources require installed CRDs and their schemas; manifests still need actual published image digests, secrets, ingress/TLS, source/cache storage and environment-specific egress rules. No migrations, cluster dry run, HA failover, capacity test or production rollout was executed.
- Confirm latency duration units with the source producer. The supplied XLSX is invalid as a ZIP workbook; use the unchanged raw journal. CSV and journal snapshots cover different dates and cannot establish a combined contemporaneous lifecycle.

The source-backed local workflow is implemented and verified. Production release acceptance remains conditional on those environment-specific checks.
