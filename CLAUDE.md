# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Read-only observability for a Noren trading journal. The system **never places, cancels or modifies orders** — it only reads Elasticsearch, correlates incidents and serves dashboards. Keep it that way: no write path to trading systems, and Elasticsearch credentials must stay read-only.

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

# Smoke check
curl -s localhost:8001/health
curl -s localhost:8001/metrics | head
curl -s localhost:8001/api/auth/config
```

There is **no test suite and no linter configured**. Verify changes by exercising the endpoints and the UI.

Ports: API container 8000 → host **8001**. Collector metrics 9108, correlation worker metrics 9109.

**Runtime API URL:** `NEXT_PUBLIC_*` is inlined at `next build` time. Kubernetes sets pod env `API_URL`; `app/layout.tsx` injects it as `window.__TRADEOPS_CONFIG__` per request so one image works in every environment. When server components need a different service-network endpoint, set `INTERNAL_API_URL`; browser-side calls continue to use `API_URL`. Do not rely on `NEXT_PUBLIC_API_URL` in deployed pods.

## Architecture

```
Noren Journal → Filebeat → Logstash (noren_filebeat.conf) → Elasticsearch noren-<msg_type>-intraday
  → collector (leader-elected, the ONLY ES poller) → Redis Streams
  → correlation worker (consumer group) → PostgreSQL incidents/rca_cases
  → FastAPI (reads Redis for SSE, ES for on-demand queries) → Next.js
```

The key invariant: **only `app/workers/collector.py` polls Elasticsearch on a loop.** SSE endpoints (`app/live.py`) read Redis streams, so browser count does not multiply ES load. API replicas are stateless readers.

### Backend (`backend/app/`)

- `config.py` — a single frozen `Settings` dataclass whose defaults are evaluated **at import time**. `settings` is a module-level singleton; env changes require a process restart, and anything importing `app.config` inherits the env as it was at startup.
- `main.py` — every endpoint has a `DEMO_MODE` branch returning a hardcoded `DEMO_*` constant, and a live branch delegating to `elastic/noren_service.py` or `repository.py`. New endpoints must follow both branches. `DEMO_MODE` is snapshotted at import.
- `auth.py` — Keycloak RS256 JWT verification. Token from `Authorization` header, `tradeops_token` cookie, or `access_token` query param (SSE fallback). `require("<perm>")` guards each route. `AUTH_DISABLED=true` short-circuits to `super_admin`. Mirror new permissions in `frontend/lib/auth.ts` `ROLE_ROUTES`.
- `elastic/noren_service.py` — all Noren-shaped ES queries. `_field(index, field)` resolves `X` vs `X.keyword` via `field_caps`; only **successful** resolutions are cached (transient failures are not pinned).
- `elastic/normalizer.py` — the Noren→TradeOps field translation and the PII masking layer (`mask_account`, `mask_id`, `mask_ip`). Masking is applied here **and** reinforced by `_source.excludes` in the queries; keep both when adding fields. `NOREN_FIELD_MAP.md` is the reference table.
- `event_bus.py` — `STREAMS` maps logical kinds (`orders`, `rejections`, `exchange`, `incidents`, `rca`, `dlq`) to Redis stream names. Every message is a JSON envelope under field `json` with `kind`/`published_at`/`payload`; use `publish()`/`decode_message()` rather than raw `xadd`.
- `leader.py` — Redis SET NX lease with Lua compare-and-swap renew/release. Multiple collector replicas are safe; only the lease holder queries ES.
- `repository.py` — Postgres upserts keyed by `incidents.fingerprint` (sha256 of `type|key`) and `rca_cases.order_id`, using PostgreSQL `ON CONFLICT`. This is Postgres-specific by design.
- `metrics.py` — all Prometheus metrics live here. API metrics via middleware in `main.py`; workers call `start_http_server(WORKER_METRICS_PORT)`.

### Workers

- **collector**: polls `live_orders`, `rejection_summary`, `yel_health`, and publishes only when a JSON fingerprint stored at `tradeops:dedupe:*` changes — so republishing identical state is suppressed. Runs every `COLLECTOR_INTERVAL_SECONDS` while holding the lease.
- **correlation_worker**: consumer group on `rejections` and `exchange` streams. Builds RCA **before** incident upsert (so retries don't inflate occurrence counts). P2 severity categories must match `normalizer.rejection_category()` output exactly.
- **market_data_worker**: optional TrueData WebSocket feed (`truedata` PyPI package). Leader-elected like the collector; writes a Redis snapshot (`tradeops:market:snapshot`) and publishes per-symbol ticks to `tradeops:market`. API `/api/market-data` reads the snapshot only — browsers never hit TrueData directly.

### Frontend (`frontend/`)

Next.js 15 App Router, React 19, hand-written CSS in `app/globals.css`. No state library.

- **Server components** call `getJSON()` from `lib/api.ts`, forwarding the `tradeops_token` cookie as `Authorization`.
- **Client auth**: `lib/oidc.ts` runs Keycloak Authorization Code + PKCE; callback at `/auth/callback` stores the access token via `lib/session.ts` (`tradeops_token` cookie).
- **SSE**: `lib/stream.ts` → `openAuthenticatedEventSource()` passes `access_token` query param (EventSource cannot set headers). Used by `LiveOrders.tsx` and `RejectionsView.tsx`.
- **Runtime config**: `lib/runtime.ts` — browser uses `window.__TRADEOPS_CONFIG__.apiUrl` injected by `app/layout.tsx`.
- `components/Shell.tsx` — sidebar nav filtered by JWT roles; sign-out via Keycloak end-session endpoint.

## Data model conventions

- Event time is `NorenTimeStamp_N` (a date field Logstash derives from the UNIX `NorenTimeStamp`), **not** `@timestamp`. `@timestamp` is ingestion time and is the only usable sort for `yel_connected`.
- Order status is derived from the numeric `OrdStatus` in `normalizer.order_status()`; `_status_codes()` in `noren_service.py` maps the reverse direction for filters. Both must stay in sync (56/65 rejected, 52 cancelled, 50 complete, 48 open, 54 trigger-pending, 109/110/115 pending).
- Prices are divided by `NOREN_PRICE_DIVISOR` (default 100).
- Order identity is `NorenOrdNum`; list queries `collapse` on it and count via a `cardinality` agg, so `count` (unique orders) and `returned` (rows) differ deliberately.

## Configuration and deployment

- `backend/.env` (from `.env.example`) drives Compose. It currently ships with `TRADEOPS_DEMO_MODE=true` — set it to `false` plus a real `ELASTICSEARCH_URL`/`ELASTICSEARCH_API_KEY` to hit live data.
- `AUTO_CREATE_SCHEMA` defaults to `false`; schema comes from Alembic (`backend/alembic/versions/`), and `k8s/migrate-job.yaml` must run before each API/worker rollout. `db.init_db()` exists for local convenience only.
- `k8s/` holds the production manifests (restricted security contexts, NetworkPolicy starter, External Secrets example, PDB/HPA, ServiceMonitors); `k8s/ha/` has CloudNativePG and Redis HA references. `k8s/data-services.yaml` is single-node and not for production. Images are `your-registry/tradeops-backend:latest` placeholders — pin digests before deploying.
- SSE needs proxy response buffering disabled (`X-Accel-Buffering: no` is already set) and a long idle timeout.
- `mirae-finspot-management-console-elk/` is the customer's supplied ELK deployment (Filebeat/Logstash/Elasticsearch configs and a sample `Journal.log`) — reference material for field shapes, not part of the build. `elk/noren-index-template.json` only affects newly created indices.

Companion docs: `EVENT_BUS_ARCHITECTURE.md`, `PRODUCTION_HARDENING.md`, `NOREN_FIELD_MAP.md`.
