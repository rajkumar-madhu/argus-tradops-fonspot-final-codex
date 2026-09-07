# TradeOps — Noren ELK Production-Hardened Build

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
