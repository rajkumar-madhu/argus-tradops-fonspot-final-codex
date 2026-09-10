# TradeOps Event-Bus Architecture

## Runtime path

```text
Noren Journal / Logstash
        ↓
Elasticsearch (noren-*-intraday)
        ↓
TradeOps Collector (single logical replica)
        ↓
Redis Streams
  ├─ tradeops:orders
  ├─ tradeops:rejections
  └─ tradeops:exchange
        ↓
Correlation Workers (consumer group)
  ├─ persistent incident upsert
  ├─ Noren order lifecycle lookup
  └─ RCA evidence persistence
        ↓
PostgreSQL
  ├─ incidents
  └─ rca_cases
        ↓
FastAPI replicas
        ↓
SSE / REST
        ↓
Next.js dashboards
```

## Why this is different from the previous build

The previous SSE implementation queried Elasticsearch per live stream. This build makes Elasticsearch polling a backend collector responsibility. Redis Streams fan out events to workers/API instances and PostgreSQL preserves incident/RCA state across restarts.

## Safety and permissions

The collector and backend require read-only Elasticsearch access. The system performs observability and incident analysis only; it has no order placement/cancel/modify endpoint. Keep trade execution systems on separate credentials and network policy.

## Production notes

- Collector replicas use the implemented Redis leader lease; only the current holder polls ES. Correlation workers can scale horizontally using the Redis consumer group.
- Use managed Redis/PostgreSQL or operators for HA. The included Compose services are local-development conveniences.
- Put ELK API keys and database credentials in Vault/External Secrets, not ConfigMaps or Git.
- Retain SSE behind an ingress/proxy configured with response buffering disabled and sufficient idle timeout.
- Run Alembic migrations before controlled releases; runtime schema creation defaults off.

## Hardening additions

The collector can run with multiple replicas; only the instance holding `COLLECTOR_LEADER_KEY` publishes events. Correlation workers use Redis consumer groups. Pending entries are reclaimed after `REDIS_RETRY_IDLE_MS`; after `REDIS_RETRY_MAX_ATTEMPTS`, poison messages are acknowledged from the source stream and written with error/evidence metadata to `tradeops:dlq`. PostgreSQL schema changes are managed by Alembic, not runtime `create_all`.

## File analytics branch

The optional CSV path uses startup-batched validation into a per-replica SQLite cache; it does not poll Elasticsearch or publish invented trading events. See `docs/FILE_ANALYTICS.md`. Journal/CSV snapshots do not prove live event-bus connectivity.
