import math
import os
from datetime import datetime, timezone
from typing import Any

from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from prometheus_client import make_asgi_app
import time

from app.auth import TOKEN_COOKIE, current_user, require
from app.config import settings
from app.elastic.service import (
    elk_status,
    latest_sessions,
    login_trend,
    log_level_trend,
    search_logs as elk_search_logs,
    service_breakdown,
)
from app.live import event_stream
from app.db import init_db
from app.event_bus import redis_status
from app.market_cache import load_snapshot
from app.metrics import API_LATENCY, API_REQUESTS
from app.repository import get_rca as get_persisted_rca, list_incidents, list_rca
from app.elastic.normalizer import (
    OMS_STATUS_MAPPING_CONFIRMED,
    exch_confirm_label,
    oms_status_label,
)
from app.elastic.noren_service import (
    active_sessions,
    live_orders,
    order_lifecycle,
    overview as noren_overview,
    rca as noren_rca,
    rejection_summary,
    session_summary,
    yel_health,
    incident_candidates,
)

app = FastAPI(title="TradeOps Observability API", version="1.1.0")
if settings.metrics_enabled:
    app.mount("/metrics", make_asgi_app())

origins = [x.strip() for x in os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",") if x.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DEMO_MODE = settings.demo_mode


def _journal_path() -> str | None:
    path = (settings.journal_path or "").strip()
    return path or None


def _use_journal_data() -> bool:
    if not _journal_path():
        return False
    if settings.journal_primary:
        return True
    return DEMO_MODE


def _with_data_source(live_fn, journal_fn):
    if _use_journal_data():
        return journal_fn()
    try:
        result = live_fn()
        if isinstance(result, dict) and result.get("source") == "demo" and _journal_path():
            return journal_fn()
        return result
    except Exception:
        if _journal_path():
            return journal_fn()
        raise


def _metrics_path(request: Request) -> str:
    """Label with the matched route template, never the raw URL.

    `/api/orders/{order_id}/lifecycle` must not become one metric series per
    order id: that is unbounded cardinality, and it would also publish live order
    ids on the /metrics endpoint.
    """
    route = request.scope.get("route")
    template = getattr(route, "path_format", None) or getattr(route, "path", None)
    if template:
        return template
    params = request.scope.get("path_params")
    if params is None:
        # Nothing matched (404). Bucket it rather than labelling with the raw URL.
        return "unmatched"
    # Route object unavailable: rebuild the template from the matched parameters
    # so an order id can never end up in a metric label.
    path = request.url.path
    for name, value in params.items():
        if value is not None:
            path = path.replace(str(value), "{" + name + "}")
    return path


@app.middleware("http")
async def metrics_middleware(request: Request, call_next):
    started = time.perf_counter()
    response = await call_next(request)
    if request.url.path.startswith("/metrics"):
        return response
    path = _metrics_path(request)
    API_REQUESTS.labels(method=request.method, path=path, status=str(response.status_code)).inc()
    API_LATENCY.labels(method=request.method, path=path).observe(time.perf_counter() - started)
    return response


@app.on_event("startup")
def startup() -> None:
    # Safe/idempotent table creation for the starter build. Production teams can
    # replace create_all with Alembic migrations without changing API contracts.
    if not DEMO_MODE and settings.auto_create_schema:
        init_db()

# Synthetic demo values only. No records from the supplied Journal.log are embedded in the product package.
DEMO_ORDERS = [
    {"order_id":"DEMO-1001","eref":"501","exchange_order_id":"","time":"2026-09-07T09:15:01+00:00","exchange":"NSE","symbol":"ALPHA-EQ","side":"BUY","qty":10,"product":"C","type":"LMT","status":"OPEN","status_code":48,"account":"AC***-DMO","user":"USER***","broker":"DMO","region":"HO-DMO","price":125.5,"filled_qty":0,"cancelled_qty":0,"latency_ms":3.8,"code":"","reason":"","rejection_category":"","source":"demo"},
    {"order_id":"DEMO-1002","eref":"502","exchange_order_id":"","time":"2026-09-07T09:15:02+00:00","exchange":"BSE","symbol":"BETA","side":"SELL","qty":25,"product":"M","type":"MKT","status":"REJECTED","status_code":56,"account":"AC***-DMO","user":"USER***","broker":"DMO","region":"HO-DMO","price":0,"filled_qty":0,"cancelled_qty":0,"latency_ms":5.1,"code":"RMS","reason":"RED:Margin Shortfall","rejection_category":"RMS / Margin","source":"demo"},
    {"order_id":"DEMO-1003","eref":"503","exchange_order_id":"","time":"2026-09-07T09:15:04+00:00","exchange":"NSE","symbol":"GAMMA-EQ","side":"BUY","qty":50,"product":"C","type":"LMT","status":"OPEN","status_code":48,"account":"AC***-DMO","user":"USER***","broker":"DMO","region":"HO-DMO","price":412.0,"filled_qty":0,"cancelled_qty":0,"latency_ms":2.9,"code":"","reason":"","rejection_category":"","source":"demo"},
    {"order_id":"DEMO-1004","eref":"504","exchange_order_id":"EX-77821","time":"2026-09-07T09:14:58+00:00","exchange":"NFO","symbol":"NIFTY24SEPFUT","side":"SELL","qty":75,"product":"M","type":"LMT","status":"PENDING","status_code":109,"account":"AC***-DMO","user":"USER***","broker":"DMO","region":"HO-DMO","price":24150.0,"filled_qty":0,"cancelled_qty":0,"latency_ms":4.2,"code":"","reason":"","rejection_category":"","source":"demo"},
    {"order_id":"DEMO-1005","eref":"505","exchange_order_id":"","time":"2026-09-07T09:16:11+00:00","exchange":"NSE","symbol":"DELTA-EQ","side":"BUY","qty":100,"product":"C","type":"LMT","status":"REJECTED","status_code":56,"account":"AC***-DMO","user":"USER***","broker":"DMO","region":"HO-DMO","price":890.0,"filled_qty":0,"cancelled_qty":0,"latency_ms":6.4,"code":"EXCH","reason":"RED:Price out of permissible range","rejection_category":"Exchange Validation","source":"demo"},
]

DEMO_SESSIONS = [
    {"event":"login","active":True,"status":"Success","result":"Success","time":"2026-09-07T09:10:00+00:00","user_id":"6552010-CSB","broker":"CSB","region":"655-CSB","access_type":"TT","privilege":4,"access_group":"DEALER-DMO","segments":["NSE","NFO"],"products":["C","M"],"order_types":["LMT","MKT"],"app_version":"1.0.8","session_id":"abcde***","source_row":150,"source":"demo"},
    {"event":"login","active":True,"status":"Success","result":"Success","time":"2026-09-07T09:09:55+00:00","user_id":"FR855-FRT","broker":"FRT","region":"HO-FRT","access_type":"MOB","privilege":5,"access_group":"DEALER-FRT","segments":["NSE","BSE"],"products":["C","M"],"order_types":["MKT","LMT"],"app_version":"1.0.8","session_id":"bcdef***","source_row":149,"source":"demo"},
    {"event":"logout","active":False,"status":"Success","result":"Success","time":"2026-09-07T18:30:00+00:00","user_id":"FR855-FRT","broker":"FRT","region":"HO-FRT","access_type":"MOB","privilege":5,"access_group":"DEALER-FRT","segments":["NSE","BSE"],"products":["C","M"],"order_types":["MKT","LMT"],"app_version":"1.0.8","session_id":"bcdef***","source_row":220,"source":"demo"},
]

DEMO_TRADES = [
    {"trade_id":"T-DMO-9001","order_id":"DEMO-1001","time":"2026-09-07T09:15:03+00:00","exchange":"NSE","symbol":"ALPHA-EQ","side":"BUY","qty":10,"price":125.5,"value":1255.0,"account":"AC***-DMO","user":"USER***","broker":"DMO","source":"demo"},
]

DEMO_POSITIONS = [
    {"symbol":"ALPHA-EQ","exchange":"NSE","product":"C","net_qty":10,"buy_qty":10,"sell_qty":0,"avg_price":125.5,"ltp":126.2,"mtm":7.0,"broker":"DMO","account":"AC***-DMO","source":"demo"},
    {"symbol":"BETA","exchange":"BSE","product":"M","net_qty":-25,"buy_qty":0,"sell_qty":25,"avg_price":88.4,"ltp":87.9,"mtm":12.5,"broker":"DMO","account":"AC***-DMO","source":"demo"},
]

DEMO_HOLDINGS = [
    {"symbol":"ALPHA-EQ","exchange":"NSE","qty":500,"avg_price":118.2,"ltp":126.2,"value":63100.0,"pnl_pct":6.8,"broker":"DMO","account":"AC***-DMO","source":"demo"},
    {"symbol":"GAMMA-EQ","exchange":"NSE","qty":200,"avg_price":412.0,"ltp":405.5,"value":81100.0,"pnl_pct":-1.6,"broker":"DMO","account":"AC***-DMO","source":"demo"},
]

DEMO_EXCHANGES = [
    {"name":"NSE","status":"Healthy","latency_ms":3.2,"reject_rate":0.8,"heartbeat_age_s":2},
    {"name":"BSE","status":"Degraded","latency_ms":5.1,"reject_rate":1.8,"heartbeat_age_s":4},
    {"name":"NFO","status":"Healthy","latency_ms":2.9,"reject_rate":0.4,"heartbeat_age_s":1},
]

DEMO_INFRA = {
    "oms": {"status":"Healthy","cpu_pct":34,"memory_pct":58,"pods":6},
    "rms": {"status":"Healthy","cpu_pct":28,"memory_pct":44,"pods":4},
    "elasticsearch": {"status":"Connected","cluster_health":"green","nodes":3},
    "postgres": {"status":"Healthy","connections":12,"replication_lag_ms":0},
    "redis": {"status":"Healthy","memory_mb":128,"connected_clients":8},
}

DEMO_MARKET = {
    "symbols": [
        {"symbol":"ALPHA-EQ","exchange":"NSE","segment":"EQ","ltp":126.2,"change_pct":0.56,"bid":126.1,"ask":126.3,"bid_qty":4200,"ask_qty":3800,"spread_bps":15.8,"volume":184200,"open":124.8,"high":127.1,"low":124.2},
        {"symbol":"BETA","exchange":"BSE","segment":"EQ","ltp":87.9,"change_pct":-0.34,"bid":87.8,"ask":88.0,"bid_qty":2100,"ask_qty":1900,"spread_bps":22.7,"volume":92300,"open":88.4,"high":88.9,"low":87.5},
        {"symbol":"GAMMA-EQ","exchange":"NSE","segment":"EQ","ltp":412.5,"change_pct":1.12,"bid":412.2,"ask":412.8,"bid_qty":900,"ask_qty":1100,"spread_bps":14.5,"volume":56200,"open":408.0,"high":414.0,"low":407.2},
        {"symbol":"NIFTY24SEPFUT","exchange":"NFO","segment":"FUT","ltp":24152.0,"change_pct":0.18,"bid":24151.0,"ask":24153.0,"bid_qty":150,"ask_qty":180,"spread_bps":0.8,"volume":128400,"open":24110.0,"high":24180.0,"low":24095.0},
        {"symbol":"BANKNIFTY24SEPFUT","exchange":"NFO","segment":"FUT","ltp":51234.0,"change_pct":-0.09,"bid":51230.0,"ask":51238.0,"bid_qty":90,"ask_qty":120,"spread_bps":1.6,"volume":88400,"open":51280.0,"high":51320.0,"low":51190.0},
    ],
    "feeds": [
        {"name":"NSE CM","status":"Live","lag_ms":12,"packets_per_sec":18400,"last_tick":"09:16:18"},
        {"name":"BSE CM","status":"Live","lag_ms":18,"packets_per_sec":9200,"last_tick":"09:16:18"},
        {"name":"NFO F&O","status":"Live","lag_ms":9,"packets_per_sec":24600,"last_tick":"09:16:18"},
        {"name":"MCX","status":"Degraded","lag_ms":142,"packets_per_sec":3100,"last_tick":"09:16:12"},
    ],
    "segments": [
        {"name":"NSE EQ","symbols":3,"status":"Live","lag_ms":12},
        {"name":"BSE EQ","symbols":1,"status":"Live","lag_ms":18},
        {"name":"NFO","symbols":2,"status":"Live","lag_ms":9},
    ],
    "source": "demo",
}

DEMO_RISK = {
    "limits": [
        {"name":"Intraday margin","used_pct":62,"status":"OK"},
        {"name":"Symbol concentration","used_pct":78,"status":"Watch"},
        {"name":"Broker exposure","used_pct":41,"status":"OK"},
    ],
    "breaches": [{"id":"RB-101","severity":"P2","title":"Margin shortfall on BETA","time":"2026-09-07T09:15:02+00:00"}],
    "source": "demo",
}

DEMO_REPORTS = {
    "items": [
        {"id":"RPT-DAILY-OPS","title":"Daily Trading Operations","schedule":"06:30 IST","status":"Ready"},
        {"id":"RPT-REJECTIONS","title":"Rejection Summary","schedule":"Hourly","status":"Ready"},
        {"id":"RPT-SESSIONS","title":"Session Audit","schedule":"EOD","status":"Ready"},
    ],
    "source": "demo",
}

# Shaped exactly like a row of L_ORDERLATENCY<TS>.csv. Latencies are MICROSECONDS.
# OMS_EXCH_CONFIRMATION is derived from whole-second timestamps upstream, so real
# values cluster near second boundaries (~0 / ~2e6 / ~4e6 us) — see the note the
# endpoint returns. A blank EXCH_STATUS means the exchange never confirmed, and
# those rows carry OMS_EXCH_CONFIRMATION = 0 which must be excluded from averages.
DEMO_ORDER_LATENCY = [
    {"NOREN_ORD_NUM":"20260608001782","EXCH_SEG":"NSE","EXT_RMKS":"L043321890","OMS_STATUS":65,"OMS_LATENCY":2490.86,"EXCH_STATUS":48,"OMS_EXCH_CONFIRMATION":5255.34,"OMSUPDATETIME":1780889462,"EXCHUPDATETIME":1780889462},
    {"NOREN_ORD_NUM":"20260608001783","EXCH_SEG":"MCX","EXT_RMKS":"L637940252f51","OMS_STATUS":65,"OMS_LATENCY":3056.40,"EXCH_STATUS":48,"OMS_EXCH_CONFIRMATION":2005354.07,"OMSUPDATETIME":1780889518,"EXCHUPDATETIME":1780889520},
    {"NOREN_ORD_NUM":"20260608001784","EXCH_SEG":"MCX","EXT_RMKS":"L161849531acfd","OMS_STATUS":65,"OMS_LATENCY":1574.10,"EXCH_STATUS":48,"OMS_EXCH_CONFIRMATION":2002657.95,"OMSUPDATETIME":1780889505,"EXCHUPDATETIME":1780889507},
    {"NOREN_ORD_NUM":"20260608001785","EXCH_SEG":"NFO","EXT_RMKS":"L19283274eb35","OMS_STATUS":56,"OMS_LATENCY":1925.54,"EXCH_STATUS":"","OMS_EXCH_CONFIRMATION":0,"OMSUPDATETIME":1780889484,"EXCHUPDATETIME":0},
    {"NOREN_ORD_NUM":"20260608001786","EXCH_SEG":"NFO","EXT_RMKS":"L7741220ab","OMS_STATUS":48,"OMS_LATENCY":3349.80,"EXCH_STATUS":48,"OMS_EXCH_CONFIRMATION":4005114.22,"OMSUPDATETIME":1780889470,"EXCHUPDATETIME":1780889474},
    {"NOREN_ORD_NUM":"20260608001787","EXCH_SEG":"BFO","EXT_RMKS":"L2210943cc","OMS_STATUS":45,"OMS_LATENCY":1355.00,"EXCH_STATUS":"","OMS_EXCH_CONFIRMATION":0,"OMSUPDATETIME":1780889491,"EXCHUPDATETIME":0},
    {"NOREN_ORD_NUM":"20260608001788","EXCH_SEG":"NSE","EXT_RMKS":"L5590318de4","OMS_STATUS":56,"OMS_LATENCY":2371.90,"EXCH_STATUS":48,"OMS_EXCH_CONFIRMATION":2003991.60,"OMSUPDATETIME":1780889447,"EXCHUPDATETIME":1780889449},
    {"NOREN_ORD_NUM":"20260608001789","EXCH_SEG":"BSE","EXT_RMKS":"L8830127fa","OMS_STATUS":65,"OMS_LATENCY":2884.15,"EXCH_STATUS":48,"OMS_EXCH_CONFIRMATION":6120.48,"OMSUPDATETIME":1780889433,"EXCHUPDATETIME":1780889433},
]


def _percentile(values: list[float], pct: float) -> float:
    """Nearest-rank percentile: rank = ceil(pct/100 * n), 1-indexed.

    Must be ceil, not round. `round(x + 0.5)` looks equivalent but is
    round-half-to-even, which lands a whole rank too high on exact boundaries
    (p50 of 1..10 gave 6 instead of 5) and inflates every reported latency.
    """
    if not values:
        return 0.0
    ordered = sorted(values)
    rank = math.ceil((pct / 100.0) * len(ordered))
    idx = max(0, min(len(ordered) - 1, rank - 1))
    return round(ordered[idx], 2)


def _latency_payload(rows: list[dict[str, Any]], source: str) -> dict[str, Any]:
    """Aggregate raw latency rows into KPI + per-segment + table shapes.

    Unconfirmed rows (blank EXCH_STATUS) carry OMS_EXCH_CONFIRMATION = 0. Those
    zeros are excluded from every confirmation statistic — including them would
    drag the averages toward zero and understate real exchange round-trips.
    """
    oms = [float(r.get("OMS_LATENCY") or 0) for r in rows]
    confirmed = [float(r.get("OMS_EXCH_CONFIRMATION") or 0) for r in rows if float(r.get("OMS_EXCH_CONFIRMATION") or 0) > 0]
    unconfirmed = [r for r in rows if not str(r.get("EXCH_STATUS", "")).strip()]

    segments: dict[str, dict[str, Any]] = {}
    for r in rows:
        seg = r.get("EXCH_SEG") or "—"
        bucket = segments.setdefault(seg, {"segment": seg, "orders": 0, "oms": [], "conf": [], "unconfirmed": 0})
        bucket["orders"] += 1
        bucket["oms"].append(float(r.get("OMS_LATENCY") or 0))
        conf = float(r.get("OMS_EXCH_CONFIRMATION") or 0)
        if conf > 0:
            bucket["conf"].append(conf)
        if not str(r.get("EXCH_STATUS", "")).strip():
            bucket["unconfirmed"] += 1

    by_segment = sorted(
        (
            {
                "segment": b["segment"],
                "orders": b["orders"],
                "oms_p50_us": _percentile(b["oms"], 50),
                "oms_p95_us": _percentile(b["oms"], 95),
                "confirm_p50_us": _percentile(b["conf"], 50),
                "unconfirmed": b["unconfirmed"],
            }
            for b in segments.values()
        ),
        key=lambda x: x["orders"],
        reverse=True,
    )

    return {
        "items": [
            {
                "order_id": r.get("NOREN_ORD_NUM"),
                "segment": r.get("EXCH_SEG"),
                "ext_remarks": r.get("EXT_RMKS"),
                "oms_status": r.get("OMS_STATUS"),
                "oms_status_label": oms_status_label(r.get("OMS_STATUS")),
                "oms_latency_us": float(r.get("OMS_LATENCY") or 0),
                "exch_status": r.get("EXCH_STATUS"),
                "exch_status_label": exch_confirm_label(r.get("EXCH_STATUS")),
                "confirm_latency_us": float(r.get("OMS_EXCH_CONFIRMATION") or 0),
                "oms_update_time": r.get("OMSUPDATETIME"),
                "exch_update_time": r.get("EXCHUPDATETIME"),
                "confirmed": bool(str(r.get("EXCH_STATUS", "")).strip()),
            }
            for r in rows
        ],
        "count": len(rows),
        "summary": {
            "orders": len(rows),
            "oms_p50_us": _percentile(oms, 50),
            "oms_p95_us": _percentile(oms, 95),
            "oms_p99_us": _percentile(oms, 99),
            "oms_max_us": round(max(oms), 2) if oms else 0.0,
            "confirm_p50_us": _percentile(confirmed, 50),
            "confirm_p95_us": _percentile(confirmed, 95),
            "confirmed_orders": len(confirmed),
            "unconfirmed_orders": len(unconfirmed),
            "unconfirmed_pct": round((len(unconfirmed) / len(rows)) * 100, 1) if rows else 0.0,
        },
        "by_segment": by_segment,
        # Surfaced so the UI can label the OMS status column as provisional
        # rather than silently asserting a mapping nobody has confirmed.
        "oms_status_mapping_confirmed": OMS_STATUS_MAPPING_CONFIRMED,
        "notes": [
            "Latencies are microseconds.",
            "OMS_EXCH_CONFIRMATION derives from whole-second timestamps upstream, so values "
            "quantise near second boundaries and should not be read as sub-second precision.",
            "Unconfirmed orders report 0 and are excluded from confirmation statistics.",
        ],
        "source": source,
    }


def _demo_rejections() -> dict[str, Any]:
    from collections import Counter
    orders = [x for x in DEMO_ORDERS if x["status"] == "REJECTED"]
    group_map: dict[tuple[str, str], dict[str, Any]] = {}
    for o in orders:
        key = (o.get("code") or "—", o.get("reason") or "Unknown")
        if key not in group_map:
            group_map[key] = {
                "code": o.get("code") or "—",
                "reason": o.get("reason") or "Unknown",
                "category": o.get("rejection_category") or "Uncategorized",
                "count": 0,
                "trend": "—",
            }
        group_map[key]["count"] += 1
    groups = sorted(group_map.values(), key=lambda g: g["count"], reverse=True)
    categories = Counter(o.get("rejection_category") or "Uncategorized" for o in orders)
    return {
        "groups": groups,
        "orders": orders,
        "rejected_unique_orders": len(orders),
        "reject_rate": round(len(orders) / max(len(DEMO_ORDERS), 1) * 100, 2),
        "categories": [{"name": k, "count": v} for k, v in categories.most_common()],
        "source": "demo",
    }


@app.get("/health")
def health():
    return {
        "status": "ok",
        "demo_mode": DEMO_MODE,
        "journal_path": bool(_journal_path()),
        "journal_primary": settings.journal_primary,
        "data_source": "journal snapshot" if _use_journal_data() else ("demo" if DEMO_MODE else "elasticsearch"),
        "time": datetime.now(timezone.utc).isoformat(),
        "schema": "noren-v1",
    }


@app.get("/health/ready")
def ready():
    from app.readiness import readiness
    result = readiness()
    return JSONResponse(result, status_code=200 if result["status"] == "ready" else 503)


@app.get("/api/event-bus/status")
def event_bus_status(user=Depends(require("dashboard:read"))):
    return redis_status()


@app.get("/api/incidents")
def persisted_incidents(limit: int = Query(100, ge=1, le=500), status: str | None = None, user=Depends(require("incidents:read"))):
    if DEMO_MODE:
        return {"items": [], "count": 0, "source": "demo"}
    items = list_incidents(limit=limit, status=status)
    return {"items": items, "count": len(items), "source": "postgresql"}


@app.get("/api/rca/cases")
def persisted_rca_cases(limit: int = Query(100, ge=1, le=500), user=Depends(require("rca:read"))):
    if DEMO_MODE:
        return {"items": [], "count": 0, "source": "demo"}
    items = list_rca(limit=limit)
    return {"items": items, "count": len(items), "source": "postgresql"}


@app.get("/api/rca/cases/{order_id}")
def persisted_rca_case(order_id: str, user=Depends(require("rca:read"))):
    if DEMO_MODE:
        return {"order_id": order_id, "found": False, "source": "demo"}
    item = get_persisted_rca(order_id)
    return item or {"order_id": order_id, "found": False, "source": "postgresql"}


@app.get("/api/auth/config")
def auth_config():
    """Public OIDC bootstrap. Deliberately unauthenticated: the browser needs this
    before it can obtain a token. Contains no secrets -- a Keycloak public client
    id, realm and issuer are all discoverable from the login URL anyway."""
    return {
        "auth_disabled": settings.auth_disabled,
        "issuer": settings.keycloak_issuer,
        "authorization_endpoint": f"{settings.keycloak_issuer}/protocol/openid-connect/auth",
        "token_endpoint": f"{settings.keycloak_issuer}/protocol/openid-connect/token",
        "end_session_endpoint": f"{settings.keycloak_issuer}/protocol/openid-connect/logout",
        "client_id": settings.keycloak_client_id,
        "token_cookie": TOKEN_COOKIE,
    }


@app.get("/api/auth/me")
def auth_me(user=Depends(current_user)):
    return user


@app.get("/api/overview")
def overview(user=Depends(require("dashboard:read"))):
    from app.journal_snapshot import journal_overview as journal_overview_data

    if _use_journal_data():
        return journal_overview_data(_journal_path())
    if not DEMO_MODE:
        return _with_data_source(lambda: noren_overview(), lambda: journal_overview_data(_journal_path()))
    rejected = len([x for x in DEMO_ORDERS if x["status"] == "REJECTED"])
    return {
        "orders": len(DEMO_ORDERS), "complete": 0, "rejected": rejected,
        "reject_rate": round(rejected / len(DEMO_ORDERS) * 100, 2),
        "brokers": 1, "symbols": 2,
        "exchanges":[{"name":"NSE","events":1},{"name":"BSE","events":1}],
        "sessions":{"active_sessions":len(DEMO_SESSIONS),"unique_users":1,"unique_brokers":1},
        "yel":{"connected":True,"keys":["DEMO"]}, "source":"demo",
    }


@app.get("/api/sessions")
def sessions(user=Depends(require("sessions:read"))):
    from app.journal_snapshot import journal_sessions as journal_sessions_data

    if _use_journal_data():
        return journal_sessions_data(_journal_path())
    if DEMO_MODE:
        return {"items":DEMO_SESSIONS,"count":len(DEMO_SESSIONS),"source":"demo"}
    return _with_data_source(lambda: active_sessions(), lambda: journal_sessions_data(_journal_path()))


@app.get("/api/sessions/summary")
def sessions_summary(user=Depends(require("sessions:read"))):
    from app.journal_snapshot import journal_session_summary as journal_session_summary_data

    if _use_journal_data():
        return journal_session_summary_data(_journal_path())
    if DEMO_MODE:
        return {"active_sessions":1,"unique_users":1,"unique_brokers":1,"brokers":[{"name":"DMO","count":1}],"access_types":[{"name":"TT","count":1}],"segments":[{"name":"NSE","count":1},{"name":"NFO","count":1}],"versions":[{"name":"1.0.8","count":1}],"source":"demo"}
    return _with_data_source(lambda: session_summary(), lambda: journal_session_summary_data(_journal_path()))


@app.get("/api/sessions/login-trend")
def sessions_login_trend(interval: str = Query("30m"), user=Depends(require("sessions:read"))):
    from app.journal_snapshot import journal_login_trend as journal_login_trend_data

    if _use_journal_data():
        return journal_login_trend_data(_journal_path())
    if DEMO_MODE:
        return {"buckets":[],"source":"demo"}
    return _with_data_source(lambda: login_trend(interval), lambda: journal_login_trend_data(_journal_path()))


def _journal_snapshot():
    from app.journal_snapshot import load_journal
    path = settings.journal_path
    if not path:
        raise HTTPException(503, "Journal snapshot is not configured")
    try:
        return load_journal(path)
    except (OSError, ValueError, TypeError):
        raise HTTPException(503, "Journal snapshot could not be read")


@app.get("/api/journal/orders")
def journal_orders(size: int = Query(500, ge=1, le=10000), user=Depends(require("orders:read"))):
    from app.journal_snapshot import journal_orders as journal_orders_data

    _journal_snapshot()
    return journal_orders_data(settings.journal_path, size=size)


@app.get("/api/journal/orders/{order_id}/lifecycle")
def journal_order_history(order_id: str, user=Depends(require("orders:read"))):
    from app.journal_snapshot import journal_order_lifecycle

    _journal_snapshot()
    return journal_order_lifecycle(settings.journal_path, order_id)


@app.get("/api/orders")
def orders(
    status: str | None = None,
    exchange: str | None = None,
    broker: str | None = None,
    user_id: str | None = None,
    symbol: str | None = None,
    q: str | None = None,
    size: int = Query(100, ge=1, le=500),
    lookback: str = Query("24h", pattern=r"^[0-9]+[mhdw]$"),
    user=Depends(require("orders:read")),
):
    from app.journal_snapshot import journal_orders as journal_orders_data

    if _use_journal_data():
        return journal_orders_data(_journal_path(), size=size, status=status, exchange=exchange, symbol=symbol, q=q)
    if DEMO_MODE:
        items = DEMO_ORDERS
        if status: items = [x for x in items if x["status"].lower() == status.lower()]
        if exchange: items = [x for x in items if x["exchange"].lower() == exchange.lower()]
        if symbol: items = [x for x in items if x["symbol"].lower() == symbol.lower()]
        if q: items = [x for x in items if q.lower() in str(x).lower()]
        return {"items":items[:size],"count":len(items),"source":"demo"}
    return _with_data_source(
        lambda: live_orders(size=size, lookback=lookback, exchange=exchange, status=status, broker=broker, user_id=user_id, symbol=symbol, q=q),
        lambda: journal_orders_data(_journal_path(), size=size, status=status, exchange=exchange, symbol=symbol, q=q),
    )


@app.get("/api/orders/{order_id}/lifecycle")
def order_history(order_id: str, lookback: str = Query("30d", pattern=r"^[0-9]+[mhdw]$"), user=Depends(require("orders:read"))):
    from app.journal_snapshot import journal_order_lifecycle as journal_order_lifecycle_data

    if _use_journal_data():
        return journal_order_lifecycle_data(_journal_path(), order_id)
    if DEMO_MODE:
        events = [x for x in DEMO_ORDERS if x["order_id"] == order_id]
        return {"order_id":order_id,"events":events,"count":len(events),"source":"demo"}
    return _with_data_source(
        lambda: order_lifecycle(order_id, lookback=lookback),
        lambda: journal_order_lifecycle_data(_journal_path(), order_id),
    )


@app.get("/api/rejections")
def rejections(lookback: str = Query("24h", pattern=r"^[0-9]+[mhdw]$"), user=Depends(require("rejections:read"))):
    from app.journal_snapshot import journal_rejections as journal_rejections_data

    if _use_journal_data():
        return journal_rejections_data(_journal_path())
    if DEMO_MODE:
        return _demo_rejections()
    return _with_data_source(lambda: rejection_summary(lookback=lookback), lambda: journal_rejections_data(_journal_path()))


@app.get("/api/rca/order/{order_id}")
def order_rca(order_id: str, lookback: str = Query("30d", pattern=r"^[0-9]+[mhdw]$"), user=Depends(require("rca:read"))):
    from app.journal_snapshot import journal_rca as journal_rca_data

    if _use_journal_data():
        return journal_rca_data(_journal_path(), order_id)
    if DEMO_MODE:
        events = [x for x in DEMO_ORDERS if x["order_id"] == order_id]
        if not events:
            return {"order_id":order_id,"found":False,"source":"demo"}
        e = events[-1]
        return {"order_id":order_id,"found":True,"summary":{"status":e["status"],"exchange":e["exchange"],"symbol":e["symbol"],"category":e.get("rejection_category"),"code":e.get("code"),"probable_cause":e.get("reason") or e["status"],"confidence":0.90},"evidence":events,"source":"demo"}
    return _with_data_source(lambda: noren_rca(order_id, lookback=lookback), lambda: journal_rca_data(_journal_path(), order_id))


@app.get("/api/exchanges/yel")
def exchange_yel(user=Depends(require("exchange:read"))):
    from app.journal_snapshot import journal_yel_health as journal_yel_health_data

    if _use_journal_data():
        return journal_yel_health_data(_journal_path())
    if DEMO_MODE:
        return {"connected":True,"keys":["DEMO"],"source":"demo"}
    return _with_data_source(lambda: yel_health(), lambda: journal_yel_health_data(_journal_path()))


@app.get("/api/exchanges")
def exchanges(user=Depends(require("exchange:read"))):
    from app.journal_snapshot import journal_exchanges as journal_exchanges_data

    if _use_journal_data():
        data = journal_exchanges_data(_journal_path())
        items = []
        for row in data.get("items") or []:
            items.append({
                "name": row.get("name") or "—",
                "status": row.get("status") or "Healthy",
                "latency_ms": row.get("lag_ms") or 0,
                "reject_rate": row.get("reject_rate") or 0,
                "heartbeat_age_s": 0,
                "events": row.get("events") or 0,
            })
        return {"items": items, "count": len(items), "source": data.get("source")}
    if DEMO_MODE:
        return {"items": DEMO_EXCHANGES, "count": len(DEMO_EXCHANGES), "source": "demo"}
    overview_data = noren_overview()
    items = []
    total_events = sum(int(x.get("events") or 0) for x in overview_data.get("exchanges") or [])
    for row in overview_data.get("exchanges") or []:
        events = int(row.get("events") or 0)
        reject_rate = round((overview_data.get("reject_rate") or 0) * (events / total_events), 2) if total_events else 0
        items.append({
            "name": row.get("name") or "—",
            "status": "Healthy" if events else "No events",
            "latency_ms": 0,
            "reject_rate": reject_rate,
            "heartbeat_age_s": 0,
            "events": events,
        })
    return {"items": items, "count": len(items), "source": overview_data.get("source", "elasticsearch")}


@app.get("/api/order-book")
def order_book(
    size: int = Query(100, ge=1, le=500),
    lookback: str = Query("24h", pattern=r"^[0-9]+[mhdw]$"),
    user=Depends(require("orders:read")),
):
    from app.journal_snapshot import journal_orders as journal_orders_data

    if _use_journal_data():
        return journal_orders_data(_journal_path(), size=size, status="OPEN")
    if DEMO_MODE:
        items = [x for x in DEMO_ORDERS if x["status"] in {"OPEN", "PENDING", "TRIGGER_PENDING"}]
        return {"items": items[:size], "count": len(items), "source": "demo"}
    return _with_data_source(
        lambda: live_orders(size=size, lookback=lookback, status="OPEN"),
        lambda: journal_orders_data(_journal_path(), size=size, status="OPEN"),
    )


@app.get("/api/trades")
def trades(
    size: int = Query(100, ge=1, le=500),
    lookback: str = Query("24h", pattern=r"^[0-9]+[mhdw]$"),
    user=Depends(require("trades:read")),
):
    from app.journal_snapshot import journal_trades as journal_trades_data

    if _use_journal_data():
        return journal_trades_data(_journal_path(), size=size)
    if DEMO_MODE:
        return {"items": DEMO_TRADES[:size], "count": len(DEMO_TRADES), "source": "demo"}

    def _live_trades():
        data = live_orders(size=size, lookback=lookback, status="COMPLETE")
        items = [
            {
                "trade_id": f"T-{o.get('order_id')}",
                "order_id": o.get("order_id"),
                "time": o.get("time"),
                "exchange": o.get("exchange"),
                "symbol": o.get("symbol"),
                "side": o.get("side"),
                "qty": o.get("filled_qty") or o.get("qty"),
                "price": o.get("price"),
                "value": round(float(o.get("price") or 0) * float(o.get("filled_qty") or o.get("qty") or 0), 2),
                "account": o.get("account"),
                "user": o.get("user"),
                "broker": o.get("broker"),
                "source": data.get("source"),
            }
            for o in data.get("items", [])
        ]
        return {"items": items, "count": len(items), "source": data.get("source", "elasticsearch")}

    return _with_data_source(_live_trades, lambda: journal_trades_data(_journal_path(), size=size))


@app.get("/api/positions")
def positions(user=Depends(require("positions:read"))):
    if _use_journal_data():
        return {"items": [], "count": 0, "source": "journal snapshot", "note": "Position snapshots require RMS integration"}
    if DEMO_MODE:
        return {"items": DEMO_POSITIONS, "count": len(DEMO_POSITIONS), "source": "demo"}
    return {"items": [], "count": 0, "source": "elasticsearch", "note": "Position snapshots require RMS integration"}


@app.get("/api/holdings")
def holdings(user=Depends(require("holdings:read"))):
    if _use_journal_data():
        return {"items": [], "count": 0, "source": "journal snapshot", "note": "Holdings require back-office integration"}
    if DEMO_MODE:
        return {"items": DEMO_HOLDINGS, "count": len(DEMO_HOLDINGS), "source": "demo"}
    return {"items": [], "count": 0, "source": "elasticsearch", "note": "Holdings require back-office integration"}


@app.get("/api/order-latency")
def order_latency(user=Depends(require("latency:read"))):
    if _use_journal_data():
        return {
            "items": [],
            "count": 0,
            "source": "journal snapshot",
            "note": "Order latency KPIs require the L_ORDERLATENCY feed. Journal snapshots only expose per-event OMS interval fields on the Orders page.",
        }
    if DEMO_MODE:
        return _latency_payload(DEMO_ORDER_LATENCY, "demo")
    empty = _latency_payload([], "elasticsearch")
    empty["note"] = "Order latency requires the L_ORDERLATENCY feed to be ingested"
    return empty


@app.get("/api/infra")
def infra(user=Depends(require("infra:read"))):
    if _use_journal_data():
        elk = elk_status()
        return {
            "elasticsearch": {
                "status": "Connected" if elk.get("connected") else "Disconnected",
                "cluster_health": elk.get("cluster") or "unknown",
                "mode": elk.get("mode") or "journal-fallback",
            },
            "redis": {"status": "Unavailable", "streams": []},
            "postgres": {"status": "Unavailable", "migrations": "alembic"},
            "journal": {"status": "Loaded", "path": True},
            "source": "journal snapshot",
        }
    if DEMO_MODE:
        return DEMO_INFRA
    elk = elk_status()
    redis = redis_status()
    return {
        "elasticsearch": {
            "status": "Connected" if elk.get("connected") else "Disconnected",
            "cluster_health": elk.get("cluster") or "unknown",
            "mode": elk.get("mode"),
        },
        "redis": {
            "status": "Healthy" if redis.get("connected") else "Disconnected",
            "streams": redis.get("streams"),
        },
        "postgres": {"status": "Healthy", "migrations": "alembic"},
        "source": "live",
    }


@app.get("/api/market-data")
def market_data(user=Depends(require("market:read"))):
    if _use_journal_data():
        return {
            "symbols": [],
            "feeds": [],
            "segments": [],
            "source": "journal snapshot",
            "note": "Market data is not present in the journal snapshot. Enable TRUEDATA or ingest exchange ticks.",
        }
    if DEMO_MODE:
        return DEMO_MARKET
    snapshot = load_snapshot()
    if snapshot and snapshot.get("symbols"):
        return snapshot
    if settings.truedata_enabled:
        return {
            "symbols": [],
            "feeds": [],
            "segments": [],
            "source": "truedata",
            "note": "Waiting for market_data_worker snapshot — check TRUEDATA_* credentials and worker logs",
        }
    return {
        "symbols": [],
        "feeds": [],
        "segments": [],
        "source": "unconfigured",
        "note": "Set TRUEDATA_ENABLED=true and start the market_data_worker",
    }


@app.get("/api/risk")
def risk(user=Depends(require("risk:read"))):
    from app.journal_snapshot import journal_rejections as journal_rejections_data

    if _use_journal_data():
        rej = journal_rejections_data(_journal_path())
    elif DEMO_MODE:
        return DEMO_RISK
    else:
        rej = rejection_summary(lookback="24h")
    breaches = [
        {
            "id": f"RB-{i+1}",
            "severity": "P2",
            "title": f"{g.get('code')} · {g.get('reason')}",
            "time": None,
        }
        for i, g in enumerate((rej.get("groups") or [])[:5])
    ]
    return {"limits": [], "breaches": breaches, "source": rej.get("source", "elasticsearch")}


@app.get("/api/reports")
def reports(user=Depends(require("reports:read"))):
    if _use_journal_data():
        return {
            "items": [],
            "source": "journal snapshot",
            "note": "Scheduled reports are not configured for the local journal snapshot",
        }
    if DEMO_MODE:
        return DEMO_REPORTS
    return {"items": [], "source": "postgresql", "note": "Scheduled reports not configured"}


@app.get("/api/config")
def runtime_config(user=Depends(require("dashboard:read"))):
    return {
        "demo_mode": DEMO_MODE,
        "journal_path": bool(_journal_path()),
        "journal_primary": settings.journal_primary,
        "data_source": "journal snapshot" if _use_journal_data() else ("demo" if DEMO_MODE else "elasticsearch"),
        "auth_disabled": settings.auth_disabled,
        "schema": "noren-v1",
        "indices": {
            "orders": settings.noren_order_index,
            "login": settings.noren_login_index,
            "logout": settings.noren_logout_index,
            "yel": settings.noren_yel_index,
            "all": settings.noren_all_index,
        },
        "timestamp_field": settings.noren_timestamp_field,
        "price_divisor": settings.noren_price_divisor,
        "redis_label": settings.redis_public_label,
        "metrics_enabled": settings.metrics_enabled,
        "source": "journal snapshot" if _use_journal_data() else ("demo" if DEMO_MODE else "runtime"),
    }


@app.get("/api/elk/status")
def elasticsearch_status(user=Depends(require("logs:read"))):
    return elk_status()


@app.get("/api/elk/log-level-trend")
def elasticsearch_log_level_trend(interval: str = Query("5m"), user=Depends(require("logs:read"))):
    if DEMO_MODE:
        return {"buckets":[],"source":"demo"}
    return log_level_trend(interval)


@app.get("/api/elk/services")
def elasticsearch_services(user=Depends(require("logs:read"))):
    if DEMO_MODE:
        return {"items":[{"service":"ordupd","count":2},{"service":"login","count":1}],"source":"demo"}
    return service_breakdown()


@app.get("/api/logs/search")
def search_logs(
    q: str = Query("", description="Free-text / Elasticsearch query_string query"),
    size: int = Query(50, ge=1, le=500),
    index: str | None = Query(None, description="Optional allowed configured Noren index pattern"),
    user=Depends(require("logs:read")),
) -> dict[str, Any]:
    if _use_journal_data():
        return {
            "items": [],
            "count": 0,
            "source": "journal snapshot",
            "note": (
                "Raw Journal.log search is not exposed because source rows contain PAN, IP, "
                "session and contact fields. Use the masked order, rejection and session views."
            ),
        }
    if DEMO_MODE:
        items = [
            {"@timestamp":"2026-09-07T09:15:02Z","service":"noren-ordupd","level":"ERROR","exchange":"BSE","order_id":"DEMO-1002","message":"RED:Margin Shortfall"},
            {"@timestamp":"2026-09-07T09:10:00Z","service":"noren-login","level":"INFO","exchange":"NSE,NFO","order_id":"","message":"login Success"},
        ]
        if q: items = [x for x in items if q.lower() in str(x).lower()]
        return {"items":items[:size],"count":len(items[:size]),"source":"demo"}

    allowed = {
        settings.all_index, settings.noren_all_index, settings.noren_order_index,
        settings.noren_login_index, settings.noren_logout_index, settings.noren_yel_index,
    }
    selected = index if index in allowed else settings.noren_all_index
    return elk_search_logs(q=q, size=size, index=selected)


@app.get("/api/stream/orders")
async def stream_orders(request: Request, interval: float = Query(2.0, ge=1.0, le=30.0), user=Depends(require("orders:read"))):
    return StreamingResponse(event_stream("orders", interval, request.headers.get("last-event-id")), media_type="text/event-stream", headers={"Cache-Control":"no-cache","X-Accel-Buffering":"no"})

@app.get("/api/stream/rejections")
async def stream_rejections(request: Request, interval: float = Query(3.0, ge=1.0, le=30.0), user=Depends(require("rejections:read"))):
    return StreamingResponse(event_stream("rejections", interval, request.headers.get("last-event-id")), media_type="text/event-stream", headers={"Cache-Control":"no-cache","X-Accel-Buffering":"no"})

@app.get("/api/stream/exchange")
async def stream_exchange(request: Request, interval: float = Query(5.0, ge=1.0, le=60.0), user=Depends(require("exchange:read"))):
    return StreamingResponse(event_stream("exchange", interval, request.headers.get("last-event-id")), media_type="text/event-stream", headers={"Cache-Control":"no-cache","X-Accel-Buffering":"no"})

@app.get("/api/stream/market")
async def stream_market(request: Request, interval: float = Query(1.0, ge=0.5, le=30.0), user=Depends(require("market:read"))):
    return StreamingResponse(event_stream("market", interval, request.headers.get("last-event-id")), media_type="text/event-stream", headers={"Cache-Control":"no-cache","X-Accel-Buffering":"no"})


@app.get("/api/incidents/derived")
def derived_incidents(lookback: str = Query("15m", pattern=r"^[0-9]+[mhdw]$"), user=Depends(require("incidents:read"))):
    if DEMO_MODE: return {"items":[],"count":0,"source":"demo"}
    return incident_candidates(lookback=lookback)
