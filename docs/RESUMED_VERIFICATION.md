# Resumed worktree verification — 9 September 2026

Read AGENTS.md and inspected status, diff statistics and the requested file diffs before proceeding. `file_analytics.py` and `file_routes.py` are untracked, so ordinary git diff does not display them; their complete current contents were reviewed directly. All inherited tracked and untracked work, including the root Journal.log, was preserved. No reset, deletion, commit, push or deployment was performed.

## Changes in this continuation

- `frontend/app/order-latency/page.tsx`: render the facade's detailed interpretation notes, retaining compatibility with the single-note contract. This exposes the existing timestamp, source-date, duplicate, missing-status and unit guidance to operators.
- `scripts/validate-files.py`: independently reconcile both OMS and confirmation sample counts, maxima and p50/p90/p95/p99 against exported observations. Added per-instance queue sample counts, peaks, p99 anomaly counts, last timestamps, empty states and inclusive time-filter/export checks.
- `docs/FILE_ANALYTICS.md`: describe the expanded validation coverage.

The existing facade/routes implementation was retained. No evidence required replacing it.

## Executed results

| Command | Result |
|---|---|
| `.local/test-venv/bin/python scripts/test-backend.py` | 71 passed |
| `npm --prefix frontend test` | 26 passed, zero failed |
| `cd frontend && npx tsc --noEmit --incremental false` | Exit 0 |
| `npm --prefix .local/resume-build run build` after isolated source copy | Exit 0; Next.js 15.5.25 production build |
| `.local/test-venv/bin/python scripts/validate-files.py --source-dir . --cache .local/verified-source.sqlite` | PASS: 11 sources, four empty, 509100 latency events, 17250 queue observations; original hashes unchanged; reconciliation, both timing distributions, queue aggregates/time filters and idempotence passed |
| `python3 scripts/verify-file-runtime.py --api http://127.0.0.1:8197 --ui http://127.0.0.1:3197` | PASS: 25 HTML routes, no-match state, both API/frontend exports (23760 BFO latency rows and 5811 NSE2 queue observations) |
| `python3 scripts/test-runtime-ui.py http://127.0.0.1:3197 http://127.0.0.1:8197` | Five runtime API-URL injection checks passed |
| `docker compose config --quiet` | Exit 0 |
| `kubeconform -strict -summary -ignore-missing-schemas k8s/*.yaml` | 30 valid, zero invalid/errors, three skipped custom resources |
| `bash -n scripts/start-file-preview.sh`; `git diff --check` | Passed |

Playwright verified the current production latency page at 1024×800: detailed notes visible, no document overflow, no page or console errors. Screenshot: `output/playwright/resume-latency.png`. An initial attempt reused the older API with an incompatible CORS origin; this produced browser errors despite passing server rendering. The final preview uses its own API process with the correct CORS origin and was rechecked successfully.

Logs: `.local/resume-backend.log`, `resume-frontend.log`, `resume-build.log`, `resume-csv.json`, `resume-runtime.log`, `resume-url.log`, `resume-browser.log`.

## Startup and boundaries

Current isolated production-build preview: `http://127.0.0.1:3197/dashboard`, `/order-latency`, `/queue-monitor`, `/data-quality`. API readiness: `http://127.0.0.1:8197/health/ready`. Processes must remain running. Older preview listeners were left intact.

To start a fresh development preview from the repository root using unused ports:

```bash
BACKEND_PYTHON="$PWD/.local/test-venv/bin/python" \
PORT_API=8198 PORT_UI=3198 \
RUN_DIR="$PWD/.local/restarted-preview" \
./scripts/start-file-preview.sh
```

This imports a derived cache and starts an isolated frontend. Keep the terminal running; Ctrl-C stops that script's processes. The script refuses occupied ports. The referenced Python 3.12 environment already contains the pinned backend and development requirements in this workspace. No source file is changed.

This is an explicitly auth-disabled loopback snapshot, not production authentication. The previous source limitations remain: unknown duration units, four empty queue files, different CSV/journal dates, invalid supplied XLSX. Live Keycloak/ES/Redis/Postgres/TrueData, migrations, HA/capacity testing and production deployment remain unverified. Kubernetes CRDs, actual published image digests, secrets, storage, ingress/TLS and deployment-specific egress need target-environment acceptance. Earlier broad browser evidence is documented separately; this continuation's fresh browser check is focused on the changed latency page.
