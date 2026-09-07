from __future__ import annotations
from prometheus_client import Counter, Gauge, Histogram

API_REQUESTS = Counter(
    "tradeops_api_requests_total",
    "HTTP requests handled by TradeOps API",
    ["method", "path", "status"],
)
API_LATENCY = Histogram(
    "tradeops_api_request_duration_seconds",
    "TradeOps API request latency",
    ["method", "path"],
)

COLLECTOR_RUNS = Counter("tradeops_collector_runs_total", "Collector iterations", ["result"])
COLLECTOR_LEADER = Gauge("tradeops_collector_leader", "1 when this collector holds the leader lease")
COLLECTOR_PUBLISHED = Counter("tradeops_collector_published_total", "Events published by collector", ["kind"])
COLLECTOR_RUN_SECONDS = Histogram("tradeops_collector_run_duration_seconds", "Collector iteration duration")

WORKER_MESSAGES = Counter("tradeops_worker_messages_total", "Correlation worker messages", ["stream", "result"])
WORKER_DLQ = Counter("tradeops_worker_dlq_total", "Messages moved to dead-letter stream", ["stream"])
WORKER_RCA = Counter("tradeops_worker_rca_total", "RCA builds", ["result"])
WORKER_INCIDENTS = Counter("tradeops_worker_incidents_total", "Incidents correlated", ["type"])

REDIS_STREAM_LAG = Gauge("tradeops_redis_stream_pending", "Pending entries in consumer group", ["stream", "group"])

MARKET_LEADER = Gauge("tradeops_market_leader", "1 when this market worker holds the leader lease")
MARKET_CONNECTED = Gauge("tradeops_market_truedata_connected", "1 when connected to TrueData")
MARKET_TICKS = Counter("tradeops_market_ticks_total", "TrueData ticks observed by the market worker")
MARKET_PUBLISHED = Counter("tradeops_market_published_total", "Market quote events published to Redis")
MARKET_FLUSH_SECONDS = Histogram("tradeops_market_flush_duration_seconds", "Market snapshot flush duration")
