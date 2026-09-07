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

- Run exactly one collector replica unless you add leader election. Correlation workers can scale horizontally using the Redis consumer group.
- Use managed Redis/PostgreSQL or operators for HA. The included Compose services are local-development conveniences.
- Put ELK API keys and database credentials in Vault/External Secrets, not ConfigMaps or Git.
- Retain SSE behind an ingress/proxy configured with response buffering disabled and sufficient idle timeout.
- Replace SQLAlchemy `create_all` with Alembic migrations before controlled production releases.

## Hardening additions

The collector can run with multiple replicas; only the instance holding `COLLECTOR_LEADER_KEY` publishes events. Correlation workers use Redis consumer groups. Pending entries are reclaimed after `REDIS_RETRY_IDLE_MS`; after `REDIS_RETRY_MAX_ATTEMPTS`, poison messages are acknowledged from the source stream and written with error/evidence metadata to `tradeops:dlq`. PostgreSQL schema changes are managed by Alembic, not runtime `create_all`.
