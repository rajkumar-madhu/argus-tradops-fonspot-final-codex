import os
from dataclasses import dataclass

from dotenv import load_dotenv

load_dotenv()


def _bool(name: str, default: bool = False) -> bool:
    return os.getenv(name, str(default)).strip().lower() in {"1", "true", "yes", "on"}


def _int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except ValueError:
        return default


def _float(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, str(default)))
    except ValueError:
        return default


@dataclass(frozen=True)
class Settings:
    environment: str = os.getenv("TRADEOPS_ENV", "development").strip().lower()
    journal_path: str = os.getenv("TRADEOPS_JOURNAL_PATH", "")
    journal_primary: bool = _bool("TRADEOPS_JOURNAL_PRIMARY", False)
    order_latency_path: str = os.getenv("TRADEOPS_ORDER_LATENCY_PATH", "")
    csv_dir: str = os.getenv("TRADEOPS_CSV_DIR", "")
    csv_cache_path: str = os.getenv("TRADEOPS_CSV_CACHE_PATH", "/tmp/tradeops-file-cache.sqlite")
    csv_latency_unit: str = os.getenv("TRADEOPS_CSV_LATENCY_UNIT", "unknown")
    csv_max_bytes: int = _int("TRADEOPS_CSV_MAX_BYTES", 268435456)
    csv_max_rows: int = _int("TRADEOPS_CSV_MAX_ROWS", 2000000)
    demo_mode: bool = _bool("TRADEOPS_DEMO_MODE", True)
    es_url: str = os.getenv("ELASTICSEARCH_URL", "http://localhost:9200")
    es_api_key: str | None = os.getenv("ELASTICSEARCH_API_KEY") or None
    es_username: str | None = os.getenv("ELASTICSEARCH_USERNAME") or None
    es_password: str | None = os.getenv("ELASTICSEARCH_PASSWORD") or None
    es_ca_certs: str | None = os.getenv("ELASTICSEARCH_CA_CERTS") or None
    es_verify_certs: bool = _bool("ELASTICSEARCH_VERIFY_CERTS", True)

    # Real Noren indices from the supplied Logstash pipeline.
    noren_order_index: str = os.getenv("NOREN_ORDER_INDEX", "noren-ordupd-intraday")
    noren_login_index: str = os.getenv("NOREN_LOGIN_INDEX", "noren-login-intraday")
    noren_logout_index: str = os.getenv("NOREN_LOGOUT_INDEX", "noren-logout-intraday")
    noren_yel_index: str = os.getenv("NOREN_YEL_INDEX", "noren-yel_connected-intraday")
    noren_all_index: str = os.getenv("NOREN_ALL_INDEX", "noren-*-intraday")
    noren_history_index: str = os.getenv("NOREN_HISTORY_INDEX", "noren-*-history")
    noren_timestamp_field: str = os.getenv("NOREN_TIMESTAMP_FIELD", "NorenTimeStamp_N")
    noren_ingest_timestamp_field: str = os.getenv("NOREN_INGEST_TIMESTAMP_FIELD", "@timestamp")
    noren_price_divisor: float = _float("NOREN_PRICE_DIVISOR", 100.0)
    noren_query_scan_limit: int = _int("NOREN_QUERY_SCAN_LIMIT", 5000)

    # Backward-compatible generic ELK settings used by Logs Explorer.
    journal_index: str = os.getenv("ELASTICSEARCH_JOURNAL_INDEX", "noren-*-intraday")
    oms_index: str = os.getenv("ELASTICSEARCH_OMS_INDEX", "noren-ordupd-intraday")
    rms_index: str = os.getenv("ELASTICSEARCH_RMS_INDEX", "noren-ordupd-intraday")
    exchange_index: str = os.getenv("ELASTICSEARCH_EXCHANGE_INDEX", "noren-yel_connected-intraday")
    all_index: str = os.getenv("ELASTICSEARCH_INDEX", "noren-*-intraday")
    timestamp_field: str = os.getenv("ELK_TIMESTAMP_FIELD", "@timestamp")
    event_type_field: str = os.getenv("ELK_EVENT_TYPE_FIELD", "msg_type.keyword")
    user_field: str = os.getenv("ELK_USER_FIELD", "UserId.keyword")
    broker_field: str = os.getenv("ELK_BROKER_FIELD", "BrokerId.keyword")
    service_field: str = os.getenv("ELK_SERVICE_FIELD", "msg_type.keyword")
    level_field: str = os.getenv("ELK_LEVEL_FIELD", "level.keyword")

    # Event bus / persistence
    redis_url: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    redis_public_label: str = os.getenv("REDIS_PUBLIC_LABEL", "redis")
    redis_orders_stream: str = os.getenv("REDIS_ORDERS_STREAM", "tradeops:orders")
    redis_rejections_stream: str = os.getenv("REDIS_REJECTIONS_STREAM", "tradeops:rejections")
    redis_exchange_stream: str = os.getenv("REDIS_EXCHANGE_STREAM", "tradeops:exchange")
    redis_incidents_stream: str = os.getenv("REDIS_INCIDENTS_STREAM", "tradeops:incidents")
    redis_rca_stream: str = os.getenv("REDIS_RCA_STREAM", "tradeops:rca")
    redis_market_stream: str = os.getenv("REDIS_MARKET_STREAM", "tradeops:market")
    redis_dlq_stream: str = os.getenv("REDIS_DLQ_STREAM", "tradeops:dlq")
    redis_stream_maxlen: int = _int("REDIS_STREAM_MAXLEN", 100000)
    redis_correlation_group: str = os.getenv("REDIS_CORRELATION_GROUP", "tradeops-correlation")
    redis_retry_max_attempts: int = _int("REDIS_RETRY_MAX_ATTEMPTS", 5)
    redis_retry_idle_ms: int = _int("REDIS_RETRY_IDLE_MS", 30000)
    redis_retry_key_ttl: int = _int("REDIS_RETRY_KEY_TTL", 86400)
    database_url: str = os.getenv("DATABASE_URL", "postgresql+psycopg://tradeops:tradeops@localhost:5432/tradeops")
    db_pool_size: int = _int("DB_POOL_SIZE", 5)
    db_max_overflow: int = _int("DB_MAX_OVERFLOW", 10)
    collector_interval_seconds: float = _float("COLLECTOR_INTERVAL_SECONDS", 2.0)
    collector_leader_key: str = os.getenv("COLLECTOR_LEADER_KEY", "tradeops:leader:collector")
    collector_leader_ttl_seconds: int = _int("COLLECTOR_LEADER_TTL_SECONDS", 15)
    collector_lookback: str = os.getenv("COLLECTOR_LOOKBACK", "2h")
    collector_order_batch: int = _int("COLLECTOR_ORDER_BATCH", 250)
    collector_rejection_scan_limit: int = _int("COLLECTOR_REJECTION_SCAN_LIMIT", 2500)
    rca_lookback: str = os.getenv("RCA_LOOKBACK", "30d")
    sse_heartbeat_seconds: float = _float("SSE_HEARTBEAT_SECONDS", 15.0)
    metrics_enabled: bool = _bool("METRICS_ENABLED", True)
    prometheus_url: str = os.getenv("PROMETHEUS_URL", "").strip()
    prometheus_timeout_seconds: float = _float("PROMETHEUS_TIMEOUT_SECONDS", 2.0)
    worker_metrics_port: int = _int("WORKER_METRICS_PORT", 9108)
    auto_create_schema: bool = _bool("AUTO_CREATE_SCHEMA", False)

    # TrueData market data (optional — served via market_data_worker → Redis snapshot)
    truedata_enabled: bool = _bool("TRUEDATA_ENABLED", False)
    truedata_username: str = os.getenv("TRUEDATA_USERNAME", "")
    truedata_password: str = os.getenv("TRUEDATA_PASSWORD", "")
    truedata_symbols: str = os.getenv(
        "TRUEDATA_SYMBOLS",
        "RELIANCE-EQ,NIFTY-I,BANKNIFTY-I",
    )
    truedata_ws_url: str | None = os.getenv("TRUEDATA_WS_URL") or None
    truedata_ws_port: int | None = (
        _int("TRUEDATA_WS_PORT", 0) or None
    )
    market_snapshot_key: str = os.getenv("MARKET_SNAPSHOT_KEY", "tradeops:market:snapshot")
    market_snapshot_ttl_seconds: int = _int("MARKET_SNAPSHOT_TTL_SECONDS", 120)
    market_flush_interval_seconds: float = _float("MARKET_FLUSH_INTERVAL_SECONDS", 1.0)
    market_leader_key: str = os.getenv("MARKET_LEADER_KEY", "tradeops:leader:market")
    market_leader_ttl_seconds: int = _int("MARKET_LEADER_TTL_SECONDS", 15)

    auth_disabled: bool = _bool("AUTH_DISABLED", True)
    allow_signup: bool = _bool("ALLOW_SIGNUP", False)
    keycloak_url: str = os.getenv("KEYCLOAK_URL", "http://localhost:8080")
    keycloak_realm: str = os.getenv("KEYCLOAK_REALM", "tradeops")
    keycloak_client_id: str = os.getenv("KEYCLOAK_CLIENT_ID", "tradeops-web")
    keycloak_verify_audience: bool = _bool("KEYCLOAK_VERIFY_AUDIENCE", True)

    @property
    def keycloak_issuer(self) -> str:
        return f"{self.keycloak_url.rstrip('/')}/realms/{self.keycloak_realm}"

    @property
    def keycloak_jwks_url(self) -> str:
        return f"{self.keycloak_issuer}/protocol/openid-connect/certs"


def production_errors(config: Settings) -> list[str]:
    """Fail closed for explicitly production deployments; never echo secrets."""
    if config.environment != "production":
        return []
    errors = []
    if config.demo_mode:
        errors.append("Demo mode must be disabled in production")
    if config.auth_disabled:
        errors.append("AUTH_DISABLED must be false in production")
    if not config.es_verify_certs:
        errors.append("Elasticsearch TLS verification must remain enabled")
    if not config.keycloak_url.startswith("https://"):
        errors.append("Production Keycloak must use HTTPS")
    from urllib.parse import urlsplit
    password = urlsplit(config.database_url).password
    if not password or password in {"tradeops", "postgres", "password", "changeme"}:
        errors.append("Configure a non-default database credential")
    return errors


settings = Settings()
_errors = production_errors(settings)
if _errors:
    raise RuntimeError("Invalid production configuration: " + "; ".join(_errors))
