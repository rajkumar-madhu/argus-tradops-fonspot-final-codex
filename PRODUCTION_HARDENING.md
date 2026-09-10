# TradeOps production hardening

This revision adds the production controls that were intentionally left out of the previous event-bus starter.

## Implemented

- **Alembic migrations**: schema creation is migration-driven. `AUTO_CREATE_SCHEMA=false` is the default.
- **Collector leader election**: multiple collector replicas are safe; a Redis lease ensures only one actively queries Elasticsearch at a time.
- **Dead-letter handling**: failed correlation messages are retried from the consumer-group pending list and moved to `tradeops:dlq` after the configured attempt limit.
- **Prometheus metrics**: API request rate/latency plus collector, worker, DLQ, RCA, incident and stream-pending metrics.
- **Restricted Kubernetes security contexts**: non-root, RuntimeDefault seccomp, no privilege escalation, all Linux capabilities dropped, read-only root filesystem.
- **NetworkPolicy starter**: namespace default deny, DNS, application-to-data paths. Add explicit policies for your external Elasticsearch and Keycloak destinations.
- **External Secrets + Vault example**: no production credentials need to live in Git manifests.
- **HA references**: CloudNativePG 3-instance Postgres example and a Redis replication/Sentinel values starter.
- **PDB/HPA starter** for the API and correlation workers.

## Deployment order

1. Provision HA PostgreSQL and Redis/Sentinel (or managed equivalents).
2. Create Vault paths and External Secrets objects.
3. Apply `k8s/namespace.yaml`, config, secrets integration and NetworkPolicies.
4. Run `k8s/migrate-job.yaml` for each release before rolling the API/workers.
5. Deploy API, collectors and correlation workers.
6. Install `ServiceMonitor` objects if Prometheus Operator is present.
7. Alert on DLQ growth, collector leadership loss, Redis pending entries, worker failures and API error-rate/latency.

## Important production notes

- Do not use the single-node `k8s/data-services.yaml` for production HA.
- Keep Elasticsearch credentials read-only and index-scoped.
- Pin container image tags/digests instead of `latest`.
- Add explicit egress NetworkPolicies for the actual Elasticsearch and Keycloak addresses before enabling default deny.
- Back up PostgreSQL and test restore/RTO regularly; Redis Streams should not be the only durable incident/RCA store.

## File analytics and release validation

Read [FILE_ANALYTICS.md](docs/FILE_ANALYTICS.md) for bounded source ingestion, request IDs, safe error handling, startup cache readiness and immutable release rendering. Workload templates use RELEASE_REQUIRED placeholders; only rendered manifests with real published digests are deployable. File snapshot readiness does not assert live dependency health.
