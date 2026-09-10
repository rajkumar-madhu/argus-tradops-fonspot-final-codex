# Argus TradeOps — Noren observability

Production-oriented full-stack TradeOps baseline for Noren journal observability.

## Data path

`Noren Journal → Logstash → Elasticsearch → leader-elected collector → Redis Streams → correlation workers → PostgreSQL → FastAPI/SSE → Next.js`

## Hardening in this revision

- Real `noren-*` field mapping retained
- Redis Streams event bus
- PostgreSQL incident/RCA persistence
- Alembic schema migrations
- Redis-backed collector leader election
- retry + pending-message recovery + dead-letter stream
- Prometheus API/worker metrics
- Keycloak RBAC baseline
- restricted Kubernetes security contexts
- NetworkPolicy starter
- Vault/External Secrets example
- CloudNativePG / Redis HA reference manifests
- PDB/HPA and migration Job

See `PRODUCTION_HARDENING.md`, `EVENT_BUS_ARCHITECTURE.md` and `NOREN_FIELD_MAP.md`.

## Local start

```bash
cp backend/.env.example backend/.env
# Set ELASTICSEARCH_URL and a read-only API key.
docker compose up --build
```

Docker Compose runs `alembic upgrade head` before starting the API/workers.

## Key metrics

API: `/metrics`

Workers expose Prometheus metrics on the configured `WORKER_METRICS_PORT`. Alert at minimum on DLQ growth, repeated worker failures, Redis pending depth, collector leadership and API 5xx/latency.

## File-backed operations console

The supplied September latency and queue CSVs are now supported through a validated, indexed cache. Start the real local snapshot console with:

```bash
./scripts/start-file-preview.sh
# UI: http://127.0.0.1:3102/dashboard
# API readiness: http://127.0.0.1:8102/health/ready
```

Use `/order-latency`, `/queue-monitor` and `/data-quality` for server-filtered analytics, exports and source reconciliation. Light is the default theme; the top-bar preference retains the existing navy theme. Original journal/CSV/XLSX files are never modified.

Read [File analytics operation and data contract](docs/FILE_ANALYTICS.md) for exact setup, environment variables, units, ingestion, Compose mounts, deployment gates, troubleshooting and validation commands. Read [Reference inventory](docs/REFERENCE_SCREEN_INVENTORY.md) for all 67 supplied images and route coverage.

**This is a production-oriented implementation, not deployment proof.** The September latency unit is unverified, so the UI uses source units until the producer confirms it. Missing feeds are shown as unavailable. Kubernetes image placeholders must be rendered using actual published SHA-256 digests before deployment.

See [Final verification evidence and limits](docs/FINAL_VERIFICATION.md) for executed checks, the tested preview and remaining release validation.

Latest integrated local evidence: [9 September 2026 verification report](docs/FINAL_VERIFICATION_2026-09-09.md).
