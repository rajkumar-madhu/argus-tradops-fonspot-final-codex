# TradeOps production hardening

This revision adds the production controls that were intentionally left out of the previous event-bus starter.

## Implemented

- **Alembic migrations**: schema creation is migration-driven. `AUTO_CREATE_SCHEMA=false` is the default.
- **Collector leader election**: multiple collector replicas are safe; a Redis lease ensures only one actively queries Elasticsearch at a time.
- **Dead-letter handling**: failed correlation messages are retried from the consumer-group pending list and moved to `tradeops:dlq` after the configured attempt limit.
- **Prometheus metrics**: API request rate/latency plus collector, worker, DLQ, RCA, incident and stream-pending metrics.
- **Restricted Kubernetes security contexts**: non-root, RuntimeDefault seccomp, no privilege escalation, all Linux capabilities dropped, read-only root filesystem.
- **NetworkPolicy set** (`k8s/networkpolicies.example.yaml`): default deny plus DNS, ingress-controller → web/API, Prometheus → metrics ports, app → Redis/Postgres, and egress to Elasticsearch, Keycloak and TrueData. The external addresses are `192.0.2.x` placeholders that route nowhere; replace them before applying.
- **External Secrets + Vault example**: no production credentials need to live in Git manifests.
- **HA references**: CloudNativePG 3-instance Postgres example and a Redis replication/Sentinel values starter.
- **PDBs** for every Deployment (`minAvailable: 1`) and an HPA on the API. The leader-elected workers are deliberately not autoscaled: extra replicas only add standbys.
- **Topology spread** across nodes for every Deployment, so one node loss never takes both replicas.
- **Graceful shutdown**: workers trap SIGTERM (`app/workers/shutdown.py`), finish the current iteration and release their leader lease, so the standby takes over at once instead of after the lease TTL. The correlation worker finishes an already-read batch. API and web pods sleep 5s in `preStop` so endpoints drop them before the drain; uvicorn caps the drain at 20s because open SSE streams never end on their own. The web image runs `next start` directly, not through `npm`, so SIGTERM reaches it.
- **Structured logs**: workers emit one JSON object per line (`app/logging_setup.py`), with tracebacks inside the `exception` field instead of across lines. The API logs one JSON line per request keyed by route template.
- **No tokens in logs**: uvicorn's access log is disabled in the image because it prints raw query strings, and SSE authenticates with `?access_token=`. A test pins the flag.

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
- Replace the Elasticsearch, Keycloak and TrueData placeholders in the NetworkPolicy set before enabling default deny.
- Block `/metrics` at the ingress. The API serves it unauthenticated on the same port as the browser-facing API; Prometheus scrapes it in-cluster and never needs the public path.
- Worker liveness probes hit the metrics port, which proves the process is up but not that its loop is progressing. Alert on `tradeops_collector_runs_total` not increasing and on `tradeops_redis_stream_pending` growing (a quiet market legitimately produces no worker messages) rather than tightening the probe: a single ES call can legitimately take minutes under retries, and a heartbeat probe would restart healthy pods during an ES outage.
- Back up PostgreSQL and test restore/RTO regularly; Redis Streams should not be the only durable incident/RCA store.

## File analytics and release validation

Read [FILE_ANALYTICS.md](docs/FILE_ANALYTICS.md) for bounded source ingestion, request IDs, safe error handling, startup cache readiness and immutable release rendering. Workload templates use RELEASE_REQUIRED placeholders; only rendered manifests with real published digests are deployable. File snapshot readiness does not assert live dependency health.
