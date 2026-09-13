# CLAUDE.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

`CLAUDE.md` and `AGENTS.md` are mirrors of each other apart from their heading lines. Update both together.

## What this is

Read-only observability for a Noren trading journal. The system **never places, cancels or modifies orders** — it only reads Elasticsearch (or a local journal file), correlates incidents and serves dashboards. Keep it that way: no write path to trading systems, and Elasticsearch credentials must stay read-only.

## Commands

```bash
# Full local stack (postgres, redis, alembic migrate, api, collector, worker) + frontend dev server
./start-local.sh                      # API on :8001, UI on :3000

# Docker only
docker compose up --build             # includes frontend container
docker compose up -d postgres redis migrate backend collector correlation-worker

# Backend, run directly (needs backend/.env, a reachable Redis/Postgres)
cd backend
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload --port 8001
python -m app.workers.collector
python -m app.workers.correlation_worker
python -m app.workers.market_data_worker   # requires TRUEDATA_ENABLED=true + credentials

# Migrations
cd backend && alembic revision --autogenerate -m "message" && alembic upgrade head

# Frontend
cd frontend && npm install
npm run dev -- -p 3000                # fallback API URL :8001 via .env.local
npm run build
```

### Tests and checks

```bash
cd backend && python -m unittest tests/test_*.py      # all backend tests (stdlib unittest)
cd backend && python -m unittest tests/test_auth.py   # one file
cd frontend && npm test                                # node --test over tests/*.test.mjs
cd frontend && npx tsc --noEmit                        # type check; there is no linter
```

Backend tests live in `backend/tests/` and are **not a package** — `unittest discover` fails on them, so pass file paths as shown. They are pure-unit (no Postgres, Redis or ES). Frontend tests cover the pure helpers in `lib/` (`table-filters`, `format`, `chart-data`, `data-source`, `order-journal-fields`) plus a layout assertion. Neither suite covers UI behaviour — exercise the endpoints and pages for anything else.

```bash
# UI preview against a mock API (avoids .next corruption from mixing build + dev)
./scripts/dev-preview.sh start        # mock API :8101, UI :3100; `stop` to tear down

# Runtime probes against a running stack
curl -s localhost:8001/health
curl -s localhost:8001/health/ready   # per-dependency readiness, live mode only
curl -s localhost:8001/metrics | head
curl -s localhost:8001/api/auth/config
python3 scripts/verify-live-data.py http://127.0.0.1:8001      # asserts each route's `source`
python3 scripts/test-runtime-ui.py http://localhost:3109 http://127.0.0.1:8101 --demo
```

Ports: API container 8000 → host **8001**. Worker metrics: collector 9108, correlation worker 9109, market-data worker 9110.

**Runtime API URL:** `NEXT_PUBLIC_*` is inlined at `next build` time. Kubernetes sets pod env `API_URL`; `app/layout.tsx` injects it as `window.__TRADEOPS_CONFIG__` per request so one image works in every environment. When server components need a different service-network endpoint, set `INTERNAL_API_URL`; browser-side calls continue to use `API_URL`. Do not rely on `NEXT_PUBLIC_API_URL` in deployed pods.

## Architecture

```text
Noren Journal → Filebeat → Logstash (noren_filebeat.conf) → Elasticsearch noren-<msg_type>-intraday
  → collector (leader-elected, the ONLY ES poller) → Redis Streams
  → correlation worker (consumer group) → PostgreSQL incidents/rca_cases
  → FastAPI (reads Redis for SSE, ES for on-demand queries) → Next.js
```

The key invariant: **only `app/workers/collector.py` polls Elasticsearch on a loop.** SSE endpoints (`app/live.py`) read Redis streams, so browser count does not multiply ES load. API replicas are stateless readers.

### The three data sources

Every read path resolves to one of three sources, and the chosen one is echoed in the response's `source` field:

- **`elasticsearch`** — live Noren indices via `elastic/noren_service.py`.
- **`journal snapshot`** — `app/journal_snapshot.py` parsing a local read-only journal file. Loaded once per process (`lru_cache`), never polled, never written back. Enabled by `TRADEOPS_JOURNAL_PATH`; Compose mounts the sample at `/data/journal/Journal.log`.
- **`demo`** — hardcoded `DEMO_*` constants in `main.py`, gated by `DEMO_MODE` (snapshotted at import).

`main.py:_with_data_source(live_fn, journal_fn)` is the arbiter: journal wins when `_use_journal_data()` (a readable path plus either `TRADEOPS_JOURNAL_PRIMARY=true` or demo mode), otherwise the live call runs and **falls back to journal on exception or on a demo-shaped result**. A new endpoint must handle all three branches; `/api/config` reports which one is active. `_journal_path()` returns `None` for a configured-but-missing file so containers degrade instead of raising.

`/api/journal/orders` and `/api/journal/orders/{order_id}/lifecycle` are the explicit journal-only routes (`orders:read`), backing `/orders?source=journal`. A missing file returns 503, never demo data. See `docs/JOURNAL_DATA_CONTRACT.md` for what the journal does and does not establish.

`/api/journal/explore` backs `/logs` (the Journal Explorer): paged masked rows, facet counts and an event histogram for one `msg_type` at a time. It reuses `journal_routes.allowed()`, so permission is per message type — `ordupd` needs `orders:read`, sessions need `sessions:read`, `yel_connected` needs `exchange:read`. That matters because `/logs` itself is granted via `logs:read`, which `infra_sre` holds without holding `orders:read`: the route is reachable but order records are not. Raw log search (`/api/logs/search`) stays empty under a journal source by design — source rows carry PAN, IP and session fields, so the explorer serves the masked projection instead.

Operator-facing UI must never render the word "demo": `frontend/lib/data-source.ts` maps sources to badges. The vocabulary is five states, not three: `LIVE` (newest event within `TRADEOPS_FRESH_LIVE_SECONDS`), `DELAYED`, `STALE` (quiet during trading hours), `CLOSED` (quiet outside `TRADEOPS_TRADING_HOURS`), `FILE-BASED`, `OFFLINE`. `/api/freshness` (`app/freshness.py`) is the source of those states; `freshnessBadge()` renders them and a live→journal `fallback` on any payload is always `DELAYED`, never `LIVE`. Route new `source` values through those helpers.
- Failures are never zero: `_reject_rate` returns `None`, `yel_health().connected` is `None` when the index holds no `yel_connected` event (a data gap, not a P1), `_with_data_source` stamps `fallback` on a payload it served from the journal, and `fmt()` renders a missing count as `—`.

### Backend (`backend/app/`)

- `config.py` — a single frozen `Settings` dataclass whose defaults are evaluated **at import time**. `settings` is a module-level singleton; env changes require a process restart, and anything importing `app.config` inherits the env as it was at startup.
- `main.py` — all HTTP routes (~950 lines), each following the three-source pattern above. Prometheus middleware labels by matched route template via `_metrics_path()`, never the raw URL — order ids in a metric label would be unbounded cardinality *and* a data leak.
- `auth.py` — Keycloak RS256 JWT verification. Token from `Authorization` header, `tradeops_token` cookie, or `access_token` query param (SSE fallback). `require("<perm>")` guards each route; its 403 `detail` is an object (`forbidden_detail`: the permission, the roles that grant it, the TradeOps roles the token did carry, the client id) that `lib/api-result.ts` turns into an admin-actionable message. Roles count only from the realm and the `KEYCLOAK_CLIENT_ID` client — the rail's `tokenRoles()` (`lib/session-shared.ts`) reads the same two places via `azp`, so it never links to a page the API refuses. `AUTH_DISABLED=true` short-circuits to `super_admin`. Mirror new permissions in `frontend/lib/auth.ts` `ROLE_ROUTES` — `tests/test_auth.py` asserts that parity.
- `readiness.py` — `/health/ready`. Bounded checks (2s timeouts) on ES, Redis and the `incidents` table; returns `ready` immediately in demo mode. Responses must never carry exception text (connection strings leak credentials) — a test pins this.
- `elastic/noren_service.py` — all Noren-shaped ES queries. `_field(index, field)` resolves `X` vs `X.keyword` via `field_caps`; only **successful** resolutions are cached (transient failures are not pinned).
- `elastic/normalizer.py` — the Noren→TradeOps field translation and the PII masking layer (`mask_account`, `mask_id`, `mask_ip`, `mask_reason`). Masking is applied here **and** reinforced by `_source.excludes` in the queries; keep both when adding fields. `journal_snapshot.py` reuses these same functions, so a masking change covers both sources. `NOREN_FIELD_MAP.md` is the reference table.
- `journal_snapshot.py` — journal parsing plus an allowlisted `ORDER_JOURNAL_FIELDS` projection. Arbitrary raw documents are never returned; the order list withholds free-text rejection reasons. Every other path — rejection lists, the lifecycle route, RCA and the event bus — carries the reason through `normalizer.mask_reason`, which `normalize_order()` applies after deriving `code` and `rejection_category` from the raw text.
- `journal_explore.py` — the facet/histogram index behind `/api/journal/explore` and the `/logs` explorer. Builds a cached inverted index per message type (`build_index`) over the **already-masked** projections from `journal_evidence.snapshot`, so masking and withholding carry over unchanged. Facet counts lift the facet's own filter (an operator must see the values they could switch to, not zeroes); `FACET_FIELDS` must never name a masked or withheld field, and a test pins that. Free-text `q` is scoped to `SEARCH_FIELDS`, deliberately narrower than `/records`, which keeps withheld text unsearchable. `RejReason` is the one free-text field the explorer shows: `journal_evidence.project` passes it through `normalizer.mask_reason` (client codes, balances, shortfalls and holdings masked; circuit prices, freeze qty and the bracketed product group kept), and it stays out of `SEARCH_FIELDS` and `FACET_FIELDS`. `OrdRemarks`/`FixRemarks` remain `[redacted]`. The `/logs` order card loads the lifecycle route for status/qty/price only. Histogram buckets carry a `by` split on `LEVEL_FIELDS` (`OrdStatus` for ordupd, `ReqStatus` for logins and logouts) — a level field must also be a facet field, and a test pins that; the page groups those values into outcomes with `levelBreakdown` in `lib/journal-explore.ts`, because the journal has no log level. The page's Export CSV goes through the same-origin proxy `app/api/exports/journal/route.ts` (a plain link to the API origin would carry no token); the export applies the search text but not the facets.
- Order-status codes: `STATUS_LABELS` in `journal_explore.py` mirrors the same map in `frontend/lib/journal-explore.ts` — add a code to one and you must add it to the other, or a row and its facet will disagree. Only documented codes are labelled; the real journal also carries **98** and **88**, which have no established meaning and are surfaced as untranslated rather than guessed.
- Memory: the journal snapshot is held whole in RAM (`lru_cache`), and measured on the 26 MB sample it costs ~92 MB resident, with the explorer's index adding ~28 MB on top — roughly **4.6x the file size**. The 80 MB workset therefore needs ~370 MB, and the 3.5 GB `Journal.log` at the repo root would need on the order of 16 GB and must not be pointed at by `TRADEOPS_JOURNAL_PATH`. Size the API pod's memory limit against the journal you actually mount.
- `event_bus.py` — `STREAMS` maps logical kinds (`orders`, `rejections`, `exchange`, `incidents`, `rca`, `dlq`) to Redis stream names. Every message is a JSON envelope under field `json` with `kind`/`published_at`/`payload`; use `publish()`/`decode_message()` rather than raw `xadd`.
- `leader.py` — Redis SET NX lease with Lua compare-and-swap renew/release. Multiple collector replicas are safe; only the lease holder queries ES.
- `repository.py` — Postgres upserts keyed by `incidents.fingerprint` (sha256 of `type|key`) and `rca_cases.order_id`, using PostgreSQL `ON CONFLICT`. This is Postgres-specific by design.
- `market_cache.py` — reads the Redis market snapshot written by the market-data worker; the API never talks to TrueData.
- `metrics.py` — all Prometheus metrics live here. API metrics via middleware in `main.py`; workers call `start_http_server(WORKER_METRICS_PORT)`.

### Workers

- **collector**: polls `live_orders`, `rejection_summary`, `yel_health`, and publishes only when a JSON fingerprint stored at `tradeops:dedupe:*` changes — so republishing identical state is suppressed. Runs every `COLLECTOR_INTERVAL_SECONDS` while holding the lease.
- **correlation_worker**: consumer group on `rejections` and `exchange` streams. Builds RCA **before** incident upsert (so retries don't inflate occurrence counts). P2 severity categories must match `normalizer.rejection_category()` output exactly.
- **market_data_worker**: optional TrueData WebSocket feed (`truedata` PyPI package; `app/truedata/` holds the normalizer and symbol map). Leader-elected like the collector; writes a Redis snapshot (`tradeops:market:snapshot`) and publishes per-symbol ticks to `tradeops:market`. API `/api/market-data` reads the snapshot only — browsers never hit TrueData directly.
- All three call `configure_logging()` (one JSON object per line) and loop on `GracefulShutdown` from `app/workers/shutdown.py`: sleep with `shutdown.wait()`, never `time.sleep()`, or SIGTERM waits out the full interval and the leader lease is left for its TTL to expire.

### Frontend (`frontend/`)

Next.js 15 App Router, React 19, hand-written CSS in `app/globals.css`. No state library.

- **Server components** call `getJSON()` from `lib/api.ts`, forwarding the `tradeops_token` cookie as `Authorization`. Failures come back as `{_error}` rather than throwing; read them with `lib/api-result.ts`.
- **Client auth**: `lib/oidc.ts` runs Keycloak Authorization Code + PKCE; callback at `/auth/callback` stores the access token via `lib/session.ts` (`tradeops_token` cookie).
- **SSE**: `lib/stream.ts` → `openAuthenticatedEventSource()` passes `access_token` query param (EventSource cannot set headers). Used by `LiveOrders.tsx` and `RejectionsView.tsx`. Journal-source pages deliberately do not subscribe.
- **Runtime config**: `lib/runtime.ts` — browser uses `window.__TRADEOPS_CONFIG__.apiUrl` injected by `app/layout.tsx`.
- `components/Shell.tsx` — sidebar nav filtered by JWT roles; sign-out via Keycloak end-session endpoint.
- `components/CommandPalette.tsx` + `lib/command-palette.ts` — the Ctrl+K palette. Navigation only (pages, an order number to `/rca?order_id=` or `/orders?order=`, a journal search to `/logs?q=`), filtered by the same role allowlist as the rail. Every `NAV_GROUPS` route needs a `ROUTE_KEYWORDS` entry; a test pins that.
- `ds-entry.tsx` — design-sync export surface. It exports only presentational components; anything importing `next/navigation` or `@/lib/stream` cannot render outside the app and is deliberately excluded.
- `mock-api.local.mjs` — the fixture API behind `scripts/dev-preview.sh`.
- **Palette and type are fixed** (the Argus Tradeops design): charcoal rail, **gold `--brand` for actions only**, **teal `--signal` for data and informational state** (chart series, Open status, info badges), slate neutrals, and Instrument Serif titles / IBM Plex Mono figures and uppercase labels / IBM Plex Sans body. **No cobalt or navy primary** — follow the `images ref/` mockups' layout, not their blue. Inside the app the effective tokens are the `.app-shell` block in `globals.css` (it beats every `:root` layer). **There is no dark theme**: the toggle, the `dashboard-theme` class and `dashboard-theme.css` were removed because the light-mode literals in the reference-theme block could not follow a second theme (dark rendered table text at 1.2:1 and severity cards at 1.03:1). Inert `.dashboard-theme` selectors still sit in `globals.css`; nothing applies the class. Use tokens, never hardcoded colours: text must be `var(--ink)`/`var(--muted)`. Warning stays amber, never gold. **Fills and text are different colours**: `--amber` (#F59E0B) and `--brand` (#9C6D22) are fill/icon colours and fail WCAG AA as small text (2.15:1 on white, 4.27:1 on a tinted row); use `--amber-ink`/`--brand-ink` for text. Every page measures 0 contrast failures at 1440px and 390px — keep it that way when adding colour.

## Data model conventions

- Event time is `NorenTimeStamp_N` (a date field Logstash derives from the UNIX `NorenTimeStamp`), **not** `@timestamp`. `@timestamp` is ingestion time and is the only usable sort for `yel_connected`.
- Order status is derived from the numeric `OrdStatus` in `normalizer.order_status()`; `_status_codes()` in `noren_service.py` maps the reverse direction for filters. Both must stay in sync (56/65 rejected, 52 cancelled, 50 complete, 48 open, 54 trigger-pending, 109/110/115 pending).
- Prices are divided per exchange segment (`normalizer.price_divisor()`): `NOREN_PRICE_DIVISOR` (default 100) for NSE/BSE/NFO/BFO/MCX, 10⁷ for CDS, overridable via `NOREN_PRICE_DIVISORS="SEG=n,..."`. A segment without an established divisor is left unscaled (`price` null, `price_raw` kept, `price_scale: "unverified"`) — never guess one. Rupee value is qty × price × `value_multiplier` (1 on equity/F&O, `Scripupdate.PriceMultiplier` on MCX, null on CDS). Evidence in `NOREN_FIELD_MAP.md`.
- Order identity is `NorenOrdNum`; list queries `collapse` on it and count via a `cardinality` agg, so `count` (unique orders) and `returned` (rows) differ deliberately.
- Latency has two distinct meanings and `latency_kind` in the response says which: `oms_latency` (measured OMS→exchange confirmation) vs `journal_event_interval` (the gap between Noren original and current event timestamps — **not** a network measurement). Never relabel one as the other.

## Configuration and deployment

- `backend/.env` (from `.env.example`) drives Compose. It currently ships with `TRADEOPS_DEMO_MODE=true` — set it to `false` plus a real `ELASTICSEARCH_URL`/`ELASTICSEARCH_API_KEY` to hit live data, or set `TRADEOPS_JOURNAL_PATH`/`TRADEOPS_JOURNAL_PRIMARY` for the file-backed snapshot.
- `AUTO_CREATE_SCHEMA` defaults to `false`; schema comes from Alembic (`backend/alembic/versions/`), and `k8s/migrate-job.yaml` must run before each API/worker rollout. `db.init_db()` exists for local convenience only.
- `k8s/` holds the production manifests (restricted security contexts, NetworkPolicy starter, External Secrets example, PDB/HPA, ServiceMonitors); `k8s/ha/` has CloudNativePG and Redis HA references. `k8s/data-services.yaml` is single-node and not for production. Images are `your-registry/tradeops-backend:latest` placeholders — pin digests before deploying.
- Every manifest hardcodes `namespace: tradeops` (33 lines across 12 files), so `kubectl apply -n <other>` is rejected outright. `deploy/prod/` and `deploy/uat/` are kustomize overlays over `k8s/kustomization.yaml` that set the namespace and the image digests: `kustomize edit set image your-registry/tradeops-backend=<ref>@sha256:<digest>` then `kubectl apply -k deploy/uat`. They sit outside `k8s/` because kustomize treats a base containing its own overlay as a cycle. `deploy/uat` guesses `tradeops-uat` — confirm the real namespace before applying. The `RELEASE_REQUIRED` tag is left in the base so a forgotten digest fails at image pull.
- SSE needs proxy response buffering disabled (`X-Accel-Buffering: no` is already set) and a long idle timeout.

## Untracked reference material

These are gitignored (see `.gitignore` for why) but present on disk and load-bearing for design and field-shape decisions:

- `images ref/` — the target UI mockups, one per route. `docs/REFERENCE_COVERAGE.md` maps files to screens and flags duplicates.
- `mirae-finspot-management-console-elk/` — the customer's supplied ELK deployment (Filebeat/Logstash/ES configs and the sample `Journal.log`). Its own git repo; reference material, not part of the build. `elk/noren-index-template.json` only affects newly created indices.
- `Journal_Converted.xlsx` — corrupt as supplied; use the raw journal instead.
- `ds-bundle/`, `.ds-sync/`, `.design-sync/` — design-system sync build output and machine state.

Companion docs: `EVENT_BUS_ARCHITECTURE.md`, `PRODUCTION_HARDENING.md`, `NOREN_FIELD_MAP.md`, `docs/JOURNAL_DATA_CONTRACT.md`, `docs/REFERENCE_COVERAGE.md`.

## CSV analytics extension

`app/csv_store.py` owns read-only CSV ingestion; `app/file_analytics.py` adapts the UI contract and caches bounded latency queries. `app/file_routes.py` exposes authenticated GET-only source, latency, queue and export routes. See `docs/FILE_ANALYTICS.md` for units, freshness, duplicate semantics, startup and deployment. Use `python scripts/test-backend.py` from the repository root when a dependency package named `tests` shadows the non-package backend test files. `scripts/start-file-preview.sh` provides an isolated real file-backed console on 3102/8102 without killing unrelated listeners.

## Authentication completion and protected routing

The callback verifies the exchanged access token with `GET /api/auth/me` before
persisting it, checks that the cookie was actually saved, and restricts return
paths to application routes. Login and enabled self-registration both create
PKCE verifier/state; the callback exchanges a code once under Strict Mode.
`frontend/middleware.ts` authenticates protected requests through
`INTERNAL_API_URL` and the existing role allowlist before rendering. A 401
redirects to sign-in, a 403 renders a permission response, and verification
outages return 503 without clearing the session. Standalone denial responses
preserve HTTP status instead of relying on an App Router rewrite.

`CORS_ORIGINS` supports comma-separated HTTP(S) origins or a JSON string array;
wildcards and invalid entries fail closed. API URLs are origins without an
additional `/api` suffix. See `docs/LOGIN_INVESTIGATION_2026-09-13.md` for the
investigation, isolated fixture commands, validation limits and external UAT
GitOps ownership. `scripts/auth-fixture.py` is a loopback-only synthetic OIDC
fixture with in-memory signing keys and must never be deployed.
