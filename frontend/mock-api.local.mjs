// Stand-in for the FastAPI backend in demo mode (pip install is blocked in this sandbox).
// Serves the same response shapes as backend/app/main.py DEMO_* branches.
import http from "node:http";

const base = Date.parse("2026-09-07T09:15:00+00:00");
const syms = ["ALPHA-EQ", "BETA", "GAMMA-EQ", "DELTA-EQ", "NIFTY24SEPFUT", "RELIANCE-EQ", "INFY-EQ", "TCS-EQ"];
const orders = Array.from({ length: 74 }).map((_, i) => {
  const st = ["OPEN", "COMPLETE", "COMPLETE", "REJECTED", "PENDING", "COMPLETE", "OPEN"][i % 7];
  const rej = st === "REJECTED";
  return {
    order_id: `24092300000${100 - i}`,
    eref: String(500 + i),
    exchange_order_id: rej ? "" : `EX-${77800 + i}`,
    time: new Date(base + i * 47000).toISOString(),
    exchange: ["NSE", "BSE", "NFO", "NSE"][i % 4],
    symbol: syms[i % syms.length],
    side: i % 3 ? "BUY" : "SELL",
    qty: [10, 25, 50, 75, 100][i % 5],
    product: ["C", "M", "I"][i % 3],
    type: i % 4 ? "LMT" : "MKT",
    status: st,
    status_code: rej ? 56 : 48,
    account: "AC***-DMO",
    user: "USER***",
    broker: "DMO",
    region: "HO-DMO",
    price: rej ? 0 : 100 + i * 3.25,
    filled_qty: st === "COMPLETE" ? [10, 25, 50, 75, 100][i % 5] : 0,
    cancelled_qty: 0,
    latency_ms: Math.round((2 + (i % 9) * 0.7) * 10) / 10,
    code: rej ? (i % 2 ? "RMS" : "EXCH") : "",
    reason: rej ? (i % 2 ? "RED:Margin Shortfall" : "RED:Price out of permissible range") : "",
    rejection_category: rej ? (i % 2 ? "RMS / Margin" : "Exchange Validation") : "",
    report_type: st === "REJECTED" ? "REJ" : st === "COMPLETE" ? "FILL" : "ACK",
    source: "demo",
  };
});
const rejected = orders.filter((o) => o.status === "REJECTED");
const openOrders = orders.filter((o) => ["OPEN", "PENDING", "TRIGGER_PENDING"].includes(o.status));

function rejectionsPayload() {
  const groupMap = {};
  const catMap = {};
  for (const o of rejected) {
    const key = `${o.code}|${o.reason}`;
    if (!groupMap[key]) {
      groupMap[key] = {
        code: o.code || "—",
        reason: o.reason || "Unknown",
        category: o.rejection_category || "Uncategorized",
        count: 0,
        trend: "—",
      };
    }
    groupMap[key].count += 1;
    const cat = o.rejection_category || "Uncategorized";
    catMap[cat] = (catMap[cat] || 0) + 1;
  }
  const groups = Object.values(groupMap).sort((a, b) => b.count - a.count);
  const categories = Object.entries(catMap)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
  return {
    total: rejected.length,
    count: rejected.length,
    source: "demo",
    groups,
    orders: rejected,
    rejected_unique_orders: rejected.length,
    reject_rate: Math.round((rejected.length / orders.length) * 10000) / 100,
    categories,
  };
}

const staticRoutes = {
  "/health": { status: "ok", demo_mode: true, time: new Date().toISOString(), schema: "noren-v1" },
  "/api/auth/config": {
    auth_disabled: true,
    issuer: "",
    authorization_endpoint: "",
    token_endpoint: "",
    end_session_endpoint: "",
    client_id: "",
    token_cookie: "tradeops_token",
  },
  "/api/overview": {
    orders: orders.length,
    complete: orders.filter((o) => o.status === "COMPLETE").length,
    rejected: rejected.length,
    reject_rate: Math.round((rejected.length / orders.length) * 10000) / 100,
    brokers: 6,
    symbols: syms.length,
    exchanges: [{ name: "NSE", events: 37 }, { name: "BSE", events: 18 }, { name: "NFO", events: 19 }],
    sessions: { active_sessions: 342, unique_users: 186, unique_brokers: 6 },
    yel: { connected: true, keys: ["DEMO"] },
    source: "demo",
  },
  "/api/orders": { items: orders, count: orders.length, source: "demo" },
  "/api/rejections": rejectionsPayload(),
  "/api/exchanges": {
    items: [
      { name: "NSE", status: "Healthy", latency_ms: 12, reject_rate: 0.8, heartbeat_age_s: 2, events: 12400, uptime_pct: 99.99 },
      { name: "NFO", status: "Healthy", latency_ms: 14, reject_rate: 0.4, heartbeat_age_s: 1, events: 9800, uptime_pct: 99.99 },
      { name: "BSE", status: "Warning", latency_ms: 45, reject_rate: 1.8, heartbeat_age_s: 4, events: 6200, uptime_pct: 99.95 },
      { name: "MCX", status: "Healthy", latency_ms: 18, reject_rate: 0.3, heartbeat_age_s: 2, events: 3100, uptime_pct: 99.95 },
      { name: "CDS", status: "Healthy", latency_ms: 20, reject_rate: 0.2, heartbeat_age_s: 3, events: 1800, uptime_pct: 99.98 },
      { name: "BSE F&O", status: "Healthy", latency_ms: 16, reject_rate: 0.5, heartbeat_age_s: 2, events: 4400, uptime_pct: 99.97 },
    ],
    count: 6,
    source: "demo",
  },
  "/api/sessions": {
    items: [
      { user_id: "ADMIN1-ICI", broker: "ICI", region: "SOUTH", access_type: "TT", privilege: 4, access_group: "DEALER-ICI", segments: ["NSE", "NFO"], products: ["C", "M"], app_version: "1.0.8", session_id: "abcde***", time: "2026-09-07T08:11:12+00:00", active: true },
      { user_id: "ADMIN1-GPS", broker: "GPS", region: "SOUTH", access_type: "WEB", privilege: 2, access_group: "DEALER-GPS", segments: ["NSE"], products: ["C"], app_version: "1.0.7", session_id: "fghij***", time: "2026-09-07T08:44:44+00:00", active: true },
      { user_id: "ADMIN1-VNK", broker: "VNK", region: "NORTH", access_type: "API", privilege: 3, access_group: "API-VNK", segments: ["NFO", "CDS"], products: ["M", "I"], app_version: "1.0.8", session_id: "klmno***", time: "2026-09-07T09:06:38+00:00", active: true },
      { user_id: "ADMIN1-ACC", broker: "ACC", region: "WEST", access_type: "TT", privilege: 4, access_group: "DEALER-ACC", segments: ["NSE", "BSE"], products: ["C"], app_version: "1.0.6", session_id: "pqrst***", time: "2026-09-07T11:31:27+00:00", active: true },
      { user_id: "ADMIN1-MEM", broker: "MEM", region: "NORTH", access_type: "MOBILE", privilege: 1, access_group: "MOBILE-MEM", segments: ["NSE"], products: ["C"], app_version: "1.0.8", session_id: "uvwxy***", time: "2026-09-07T12:02:09+00:00", active: true },
    ],
    count: 5,
    source: "demo",
  },
  "/api/sessions/summary": {
    active_sessions: 342,
    unique_users: 186,
    unique_brokers: 6,
    source: "demo",
    brokers: [{ name: "ICI", count: 98 }, { name: "GPS", count: 72 }, { name: "VNK", count: 64 }, { name: "ACC", count: 58 }, { name: "MEM", count: 50 }],
    access_types: [{ name: "TT", count: 142 }, { name: "WEB", count: 86 }, { name: "API", count: 64 }, { name: "MOBILE", count: 50 }],
    segments: [{ name: "NSE", count: 210 }, { name: "NFO", count: 98 }, { name: "BSE", count: 34 }],
    versions: [{ name: "1.0.8", count: 220 }, { name: "1.0.7", count: 82 }, { name: "1.0.6", count: 40 }],
  },
  "/api/sessions/login-trend": {
    buckets: [
      { time: "08:00", count: 18 },
      { time: "08:15", count: 42 },
      { time: "08:30", count: 86 },
      { time: "08:45", count: 124 },
      { time: "09:00", count: 98 },
      { time: "09:15", count: 156 },
      { time: "09:30", count: 132 },
      { time: "09:45", count: 118 },
      { time: "10:00", count: 94 },
      { time: "10:15", count: 76 },
    ],
    source: "demo",
  },
  "/api/positions": {
    items: [
      { symbol: "ALPHA-EQ", exchange: "NSE", product: "C", net_qty: 10, buy_qty: 10, sell_qty: 0, avg_price: 125.5, ltp: 126.2, mtm: 7.0, broker: "DMO", account: "AC***-DMO", source: "demo" },
      { symbol: "BETA", exchange: "BSE", product: "M", net_qty: -25, buy_qty: 0, sell_qty: 25, avg_price: 88.4, ltp: 87.9, mtm: 12.5, broker: "DMO", account: "AC***-DMO", source: "demo" },
      { symbol: "GAMMA-EQ", exchange: "NSE", product: "C", net_qty: 50, buy_qty: 75, sell_qty: 25, avg_price: 412.0, ltp: 405.5, mtm: -325.0, broker: "ICI", account: "AC***-ICI", source: "demo" },
      { symbol: "NIFTY24SEPFUT", exchange: "NFO", product: "I", net_qty: -2, buy_qty: 0, sell_qty: 2, avg_price: 25420.0, ltp: 25415.8, mtm: 8.4, broker: "GPS", account: "AC***-GPS", source: "demo" },
      { symbol: "RELIANCE-EQ", exchange: "NSE", product: "C", net_qty: 100, buy_qty: 100, sell_qty: 0, avg_price: 2890.5, ltp: 2912.0, mtm: 2150.0, broker: "VNK", account: "AC***-VNK", source: "demo" },
      { symbol: "INFY-EQ", exchange: "NSE", product: "C", net_qty: -30, buy_qty: 10, sell_qty: 40, avg_price: 1785.2, ltp: 1790.0, mtm: -144.0, broker: "ACC", account: "AC***-ACC", source: "demo" },
    ],
    count: 6,
    source: "demo",
  },
  "/api/holdings": {
    items: [
      { symbol: "ALPHA-EQ", exchange: "NSE", qty: 500, avg_price: 118.2, ltp: 126.2, value: 63100.0, pnl_pct: 6.8, broker: "DMO", account: "AC***-DMO", source: "demo" },
      { symbol: "GAMMA-EQ", exchange: "NSE", qty: 200, avg_price: 412.0, ltp: 405.5, value: 81100.0, pnl_pct: -1.6, broker: "DMO", account: "AC***-DMO", source: "demo" },
      { symbol: "RELIANCE-EQ", exchange: "NSE", qty: 150, avg_price: 2650.0, ltp: 2912.0, value: 436800.0, pnl_pct: 9.9, broker: "ICI", account: "AC***-ICI", source: "demo" },
      { symbol: "HDFCBANK-EQ", exchange: "NSE", qty: 300, avg_price: 1580.0, ltp: 1625.5, value: 487650.0, pnl_pct: 2.9, broker: "GPS", account: "AC***-GPS", source: "demo" },
      { symbol: "INFY-EQ", exchange: "NSE", qty: 400, avg_price: 1820.0, ltp: 1790.0, value: 716000.0, pnl_pct: -1.6, broker: "VNK", account: "AC***-VNK", source: "demo" },
    ],
    count: 5,
    source: "demo",
  },
  "/api/trades": {
    items: orders
      .filter((o) => o.status === "COMPLETE")
      .map((o) => ({
        trade_id: `T-${o.order_id}`,
        order_id: o.order_id,
        time: o.time,
        exchange: o.exchange,
        symbol: o.symbol,
        side: o.side,
        qty: o.filled_qty || o.qty,
        price: o.price,
        value: Math.round(Number(o.price || 0) * Number(o.filled_qty || o.qty || 0) * 100) / 100,
        account: o.account,
        user: o.user,
        broker: o.broker,
        source: "demo",
      })),
    count: orders.filter((o) => o.status === "COMPLETE").length,
    source: "demo",
  },
  "/api/order-book": { items: openOrders, count: openOrders.length, source: "demo" },
  "/api/market-data": {
    symbols: [
      { symbol: "ALPHA-EQ", exchange: "NSE", segment: "EQ", ltp: 126.2, change_pct: 0.56, bid: 126.1, ask: 126.3, bid_qty: 4200, ask_qty: 3800, spread_bps: 15.8, volume: 184200, open: 124.8, high: 127.1, low: 124.2 },
      { symbol: "BETA", exchange: "BSE", segment: "EQ", ltp: 87.9, change_pct: -0.34, bid: 87.8, ask: 88.0, bid_qty: 2100, ask_qty: 1900, spread_bps: 22.7, volume: 92300, open: 88.4, high: 88.9, low: 87.5 },
      { symbol: "GAMMA-EQ", exchange: "NSE", segment: "EQ", ltp: 412.5, change_pct: 1.12, bid: 412.2, ask: 412.8, bid_qty: 900, ask_qty: 1100, spread_bps: 14.5, volume: 56200, open: 408.0, high: 414.0, low: 407.2 },
      { symbol: "NIFTY24SEPFUT", exchange: "NFO", segment: "FUT", ltp: 24152.0, change_pct: 0.18, bid: 24151.0, ask: 24153.0, bid_qty: 150, ask_qty: 180, spread_bps: 0.8, volume: 128400, open: 24110.0, high: 24180.0, low: 24095.0 },
    ],
    feeds: [
      { name: "NSE CM", status: "Live", lag_ms: 12, packets_per_sec: 18400, last_tick: "09:16:18" },
      { name: "BSE CM", status: "Live", lag_ms: 18, packets_per_sec: 9200, last_tick: "09:16:18" },
      { name: "NFO F&O", status: "Live", lag_ms: 9, packets_per_sec: 24600, last_tick: "09:16:18" },
    ],
    segments: [
      { name: "NSE EQ", symbols: 3, status: "Live", lag_ms: 12 },
      { name: "BSE EQ", symbols: 1, status: "Live", lag_ms: 18 },
      { name: "NFO", symbols: 2, status: "Live", lag_ms: 9 },
    ],
    source: "demo",
  },
  "/api/risk": {
    limits: [
      { name: "Intraday margin", used_pct: 62, status: "OK" },
      { name: "Symbol concentration", used_pct: 78, status: "Watch" },
      { name: "Broker exposure", used_pct: 41, status: "OK" },
    ],
    breaches: [{ id: "RB-101", severity: "P2", title: "Margin shortfall on BETA", time: "2026-09-07T09:15:02+00:00" }],
    source: "demo",
  },
  "/api/reports": {
    items: [
      { id: "RPT-DAILY-OPS", title: "Daily Trading Operations", schedule: "06:30 IST", status: "Ready" },
      { id: "RPT-REJECTIONS", title: "Rejection Summary", schedule: "Hourly", status: "Ready" },
      { id: "RPT-SESSIONS", title: "Session Audit", schedule: "EOD", status: "Ready" },
    ],
    source: "demo",
  },
  "/api/config": {
    demo_mode: true,
    auth_disabled: true,
    schema: "noren-v1",
    indices: { orders: "noren-ordupd-intraday", login: "noren-login-intraday", logout: "noren-logout-intraday", yel: "noren-yel-intraday", all: "noren-*" },
    timestamp_field: "@timestamp",
    price_divisor: 100,
    redis_label: "redis",
    metrics_enabled: false,
    source: "demo",
  },
  "/api/event-bus/status": { connected: true, streams: { orders: 74, rejections: 11, exchange: 6, market: 4 }, source: "demo" },
  "/api/elk/status": { connected: true, cluster: "green", mode: "demo", source: "demo" },
  "/api/elk/log-level-trend": { buckets: [], source: "demo" },
  "/api/elk/services": { items: [{ service: "ordupd", count: 42 }, { service: "login", count: 18 }, { service: "logout", count: 12 }], source: "demo" },
  "/api/logs/search": {
    items: [
      { "@timestamp": "2026-09-07T09:15:02Z", service: "noren-ordupd", level: "ERROR", exchange: "BSE", order_id: "24092300000097", message: "RED:Margin Shortfall" },
      { "@timestamp": "2026-09-07T09:10:00Z", service: "noren-login", level: "INFO", exchange: "NSE,NFO", order_id: "", message: "login Success" },
      { "@timestamp": "2026-09-07T09:14:58Z", service: "noren-ordupd", level: "WARN", exchange: "NFO", order_id: "24092300000099", message: "Pending acknowledgement" },
      { "@timestamp": "2026-09-07T09:16:11Z", service: "noren-ordupd", level: "ERROR", exchange: "NSE", order_id: "24092300000095", message: "RED:Price out of permissible range" },
    ],
    count: 4,
    source: "demo",
  },
  "/api/incidents": { items: [], count: 0, source: "demo" },
  "/api/incidents/derived": { items: [], count: 0, source: "demo" },
  "/api/exchanges/yel": { connected: true, keys: ["DEMO"], source: "demo" },
  "/api/infra": {
    oms: { status: "Healthy", cpu_pct: 42, memory_pct: 58, pods: 6 },
    rms: { status: "Healthy", cpu_pct: 51, memory_pct: 44, pods: 4 },
    elasticsearch: { status: "Connected", cluster_health: "green", nodes: 3 },
    postgres: { status: "Healthy", connections: 12, replication_lag_ms: 0 },
    redis: { status: "Healthy", memory_mb: 128, connected_clients: 8 },
  },
};

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

function cors(req, res) {
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Headers", "authorization, content-type");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
}

function lifecycle(orderId) {
  const events = orders.filter((o) => o.order_id === orderId);
  if (!events.length) {
    const fallback = orders.find((o) => o.order_id.endsWith(orderId.slice(-3))) || orders[0];
    return { order_id: orderId, events: fallback ? [fallback] : [], count: fallback ? 1 : 0, source: "demo" };
  }
  return { order_id: orderId, events, count: events.length, source: "demo" };
}

function rca(orderId) {
  const events = orders.filter((o) => o.order_id === orderId);
  if (!events.length) return { order_id: orderId, found: false, source: "demo" };
  const e = events[events.length - 1];
  return {
    order_id: orderId,
    found: true,
    summary: {
      status: e.status,
      exchange: e.exchange,
      symbol: e.symbol,
      category: e.rejection_category,
      code: e.code,
      probable_cause: e.reason || e.status,
      confidence: 0.9,
    },
    evidence: events,
    source: "demo",
  };
}

function routeKey(pathname) {
  if (staticRoutes[pathname]) return pathname;
  const basePath = pathname.split("?")[0];
  if (staticRoutes[basePath]) return basePath;
  if (basePath.startsWith("/api/orders/") && basePath.endsWith("/lifecycle")) {
    const orderId = decodeURIComponent(basePath.slice("/api/orders/".length, -"/lifecycle".length));
    return { type: "lifecycle", orderId };
  }
  if (basePath.startsWith("/api/rca/order/")) {
    const orderId = decodeURIComponent(basePath.slice("/api/rca/order/".length));
    return { type: "rca", orderId };
  }
  if (basePath.startsWith("/api/stream/")) {
    const kind = basePath.slice("/api/stream/".length);
    return { type: "stream", kind };
  }
  // Ignore query strings on known prefixes
  for (const key of Object.keys(staticRoutes)) {
    if (pathname === key || pathname.startsWith(key + "?")) return key;
  }
  return null;
}

function handleStream(req, res, kind) {
  const url = new URL(req.url, "http://x");
  const interval = Math.max(1, Number(url.searchParams.get("interval") || (kind === "rejections" ? 3 : 2)));
  cors(req, res);
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  let i = 0;
  const push = () => {
    const streamed_at = new Date().toISOString();
    if (kind === "rejections") {
      const o = { ...rejected[i % rejected.length], streamed_at };
      res.write(`event: rejections\ndata: ${JSON.stringify(o)}\n\n`);
    } else if (kind === "orders") {
      const o = { ...orders[i % orders.length], streamed_at };
      res.write(`event: orders\ndata: ${JSON.stringify(o)}\n\n`);
    } else if (kind === "exchange") {
      const x = staticRoutes["/api/exchanges"].items[i % 6];
      res.write(`event: exchange\ndata: ${JSON.stringify({ ...x, streamed_at })}\n\n`);
    } else if (kind === "market") {
      const s = staticRoutes["/api/market-data"].symbols[i % 4];
      res.write(`event: market\ndata: ${JSON.stringify({ ...s, streamed_at })}\n\n`);
    } else {
      res.write(`: heartbeat\n\n`);
    }
    i += 1;
  };
  push();
  const timer = setInterval(push, interval * 1000);
  req.on("close", () => clearInterval(timer));
}

http
  .createServer((req, res) => {
    cors(req, res);
    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      return res.end();
    }
    const url = new URL(req.url || "/", "http://x");
    const key = routeKey(url.pathname);
    if (!key) return json(res, 404, { detail: "not found", path: url.pathname });
    if (typeof key === "object") {
      if (key.type === "lifecycle") return json(res, 200, lifecycle(key.orderId));
      if (key.type === "rca") return json(res, 200, rca(key.orderId));
      if (key.type === "stream") return handleStream(req, res, key.kind);
    }
    return json(res, 200, staticRoutes[key]);
  })
  .listen(Number(process.env.PORT || 8001), () => console.log(`mock api on :${process.env.PORT || 8001}`));
