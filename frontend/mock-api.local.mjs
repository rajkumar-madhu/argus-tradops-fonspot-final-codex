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
    price_scale: "verified",
    value_multiplier: 1,
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
  "/api/auth/me": { sub: "preview-user", roles: ["super_admin"], permissions: ["*"] },
  "/health": { status: "ok", demo_mode: true, time: new Date().toISOString(), schema: "noren-v1" },
  "/api/auth/config": {
    auth_disabled: true,
    registration_allowed: false,
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
  // ── File analytics + journal explorer ─────────────────────────────────────
  // Shapes mirror app/file_routes.py and app/journal_explore.py so /data-quality,
  // /order-latency (incl. Stage timing) and /logs render in the preview instead of
  // showing "unavailable". Numbers are fixtures, like every other route here.
  "/api/files/sources": {
    source: "csv snapshot",
    count: 3,
    unit: "us",
    latency_unit: "us",
    refresh_policy: "Startup snapshot. Restart the API after replacing source files.",
    items: [
      { name: "ORDERLATENCY20260907.csv", kind: "latency", instance: "latency", state: "Ready", bytes: 184320,
        rows: 1820, accepted: 1815, rejected: 5, duplicates: 0, invalid_values: 2, missing_values: 3,
        timestamp_mismatches: 0, processed_rows: 1820, accepted_rows: 1815, imported_at: "2026-09-07T03:31:00+00:00",
        sha256: "4f1c9b7e2a6d5308", duration_seconds: 0.42 },
      { name: "QueSize_QKBT1_20260907.csv", kind: "queue", instance: "QKBT1", state: "Partial data", bytes: 40960,
        rows: 420, accepted: 402, rejected: 18, duplicates: 0, invalid_values: 18, missing_values: 0,
        timestamp_mismatches: 0, processed_rows: 420, accepted_rows: 402, imported_at: "2026-09-07T03:31:01+00:00",
        sha256: "9c22ab40f1de7755", duration_seconds: 0.08 },
      { name: "ORDERLATENCYSORTED20260907.csv", kind: "hops", instance: "hops", state: "Ready", bytes: 12288,
        rows: 10, accepted: 10, rejected: 0, duplicates: 0, stages: 84, invalid_values: 0, missing_values: 0,
        timestamp_mismatches: 0, processed_rows: 10, accepted_rows: 10, imported_at: "2026-09-07T03:31:02+00:00",
        sha256: "1b07f5c6d9e34a21", duration_seconds: 0.03 },
    ],
  },
  "/api/files/latency": {
    source: "csv snapshot",
    unit: "us",
    count: 1815,
    unique_orders: 1640,
    bucket_seconds: 300,
    summary: {
      oms: { samples: 1815, p50: 412, p90: 1180, p95: 2340, p99: 8900, max: 96046 },
      confirmation: { samples: 1702, p50: 980, p90: 2450, p95: 4100, p99: 12400, max: 128300 },
    },
    choices: { segment: ["NSE", "BSE", "NFO"], status: ["COMPLETE", "REJECTED", "OPEN"] },
    facets: { segments: ["NSE", "BSE", "NFO"], statuses: ["COMPLETE", "REJECTED", "OPEN"] },
    trend: Array.from({ length: 8 }).map((_, i) => ({
      time: new Date(Date.parse("2026-09-07T03:30:00+00:00") + i * 300000).toISOString(),
      oms: [380, 402, 455, 610, 528, 470, 431, 415][i],
    })),
    by_segment: [
      { segment: "NSE", count: 1120, events: 1120, oms: { samples: 1120, p50: 395, p95: 2100, max: 41200 } },
      { segment: "BSE", count: 402, events: 402, oms: { samples: 402, p50: 430, p95: 2480, max: 18400 } },
      { segment: "NFO", count: 293, events: 293, oms: { samples: 293, p50: 470, p95: 3020, max: 96046 } },
    ],
    items: Array.from({ length: 10 }).map((_, i) => ({
      file: "ORDERLATENCY20260907.csv", fingerprint: `fp-${i}`, order_id: `26090700000${120 + i}`,
      segment: ["NSE", "BSE", "NFO"][i % 3], event_time: new Date(Date.parse("2026-09-07T03:31:00+00:00") + i * 4000).toISOString(),
      oms: [412, 380, 1180, 2340, 455, 610, 528, 470, 8900, 431][i], confirmation: [980, 1020, 2450, 4100, 1120, 1380, 1240, 1090, 12400, 1010][i],
      oms_status: ["COMPLETE", "COMPLETE", "REJECTED", "COMPLETE", "OPEN"][i % 5],
    })),
    notes: [
      "Rows are observations, not necessarily unique orders. Exact duplicate rows within each source are excluded.",
      "Source timestamps normalize to UTC; textual IST timestamps use Asia/Kolkata.",
    ],
  },
  "/api/files/hops": {
    source: "csv snapshot",
    unit: "us",
    orders: 10,
    note: "Stage codes are shown as recorded; stage names pending Noren definitions.",
    choices: { segment: ["NSE", "BSE"], instance: ["QKBT1", "QKBT2"] },
    stages: [
      { stage: "82", orders: 10, samples: 10, p50: 392.3, p90: 800, p95: 824.5, p99: 826.5, max: 826.5 },
      { stage: "79", orders: 10, samples: 10, p50: 235.3, p90: 600, p95: 644.3, p99: 644.3, max: 644.3 },
      { stage: "80", orders: 10, samples: 10, p50: 500, p90: 900, p95: 923.5, p99: 923.5, max: 923.5 },
      { stage: "46", orders: 10, samples: 10, p50: 1030, p90: 90000, p95: 94062, p99: 94062, max: 94062 },
      { stage: "47", orders: 10, samples: 10, p50: 1810, p90: 92000, p95: 95840, p99: 95840, max: 95840 },
      { stage: "50/49", orders: 4, samples: 4, p50: 1970, p90: 2500, p95: 2570, p99: 2570, max: 2570 },
    ],
    slowest: [
      { order_id: "26090700000017", segment: "NSE", instance: "QKBT2", stages: 8, span_us: 96046, first_start: "2026-09-07T03:31:04+00:00" },
      { order_id: "26090700000018", segment: "NSE", instance: "QKBT2", stages: 8, span_us: 95870, first_start: "2026-09-07T03:31:05+00:00" },
      { order_id: "26090700000027", segment: "BSE", instance: "QKBT1", stages: 9, span_us: 6770, first_start: "2026-09-07T03:31:06+00:00" },
      { order_id: "26090700000026", segment: "BSE", instance: "QKBT1", stages: 8, span_us: 6400, first_start: "2026-09-07T03:31:07+00:00" },
    ],
  },
  "/api/journal/explore": {
    source: "journal snapshot",
    msg_type: "ordupd",
    total: 18504,
    count: 10,
    limit: 10,
    offset: 0,
    columns: ["NorenTimeStamp_N", "NorenOrdNum", "ExchSeg", "TradSym", "TransType", "OrdStatus", "Qty", "PriceToFill", "RejReason"],
    search_fields: ["NorenOrdNum", "TradSym", "ExchSeg"],
    facets: [
      { field: "ExchSeg", truncated: false, values: [
        { value: "NSE", count: 11240, selected: false, label: null },
        { value: "BSE", count: 4302, selected: false, label: null },
        { value: "NFO", count: 2962, selected: false, label: null } ] },
      { field: "OrdStatus", truncated: false, values: [
        { value: "48", count: 7210, selected: false, label: "Open" },
        { value: "50", count: 6104, selected: false, label: "Complete" },
        { value: "56", count: 3190, selected: false, label: "Rejected" },
        { value: "98", count: 2000, selected: false, label: null } ] },
      { field: "TransType", truncated: false, values: [
        { value: "B", count: 12100, selected: false, label: "Buy" },
        { value: "S", count: 6404, selected: false, label: "Sell" } ] },
    ],
    histogram: {
      level_field: "OrdStatus",
      start: "2026-06-30T03:44:00+00:00",
      end: "2026-06-30T03:54:00+00:00",
      undated: 0,
      buckets: Array.from({ length: 10 }).map((_, i) => ({
        start: new Date(Date.parse("2026-06-30T03:44:00+00:00") + i * 60000).toISOString(),
        count: [1820, 1902, 1750, 1988, 1840, 1902, 1760, 1812, 1880, 1850][i],
        by: { "48": 720 + i * 4, "50": 610 + i * 3, "56": 320 - i * 2, "98": 170 },
      })),
    },
    items: Array.from({ length: 10 }).map((_, i) => ({
      source_line: 1204 + i,
      fields: {
        NorenTimeStamp_N: new Date(Date.parse("2026-06-30T03:44:01+00:00") + i * 3000).toISOString(),
        NorenOrdNum: `26063000000${120 + i}`,
        ExchSeg: ["NSE", "BSE", "NFO"][i % 3],
        TradSym: ["VAML-EQ", "SAKSOFT-EQ", "NIFTY07JUL26P24000", "KEC-EQ"][i % 4],
        TransType: i % 3 ? "B" : "S",
        OrdStatus: [48, 50, 56, 48, 50][i % 5],
        Qty: [50, 3, 10, 65, 100][i % 5],
        PriceToFill: [43849, 198370, 19380, 21300, 30535][i % 5],
        RejReason: i % 5 === 2 ? "RED:Margin shortfall [CNC]" : "",
      },
    })),
  },
  "/api/order-latency": {
    "items": [
      {
        "order_id": "20260608001782",
        "segment": "NSE",
        "ext_remarks": "L043321890",
        "oms_status": 65,
        "oms_status_label": "COMPLETE",
        "oms_latency_us": 2490.86,
        "exch_status": 48,
        "exch_status_label": "CONFIRMED",
        "confirm_latency_us": 5255.34,
        "oms_update_time": 1780889462,
        "exch_update_time": 1780889462,
        "confirmed": true
      },
      {
        "order_id": "20260608001783",
        "segment": "MCX",
        "ext_remarks": "L637940252f51",
        "oms_status": 65,
        "oms_status_label": "COMPLETE",
        "oms_latency_us": 3056.4,
        "exch_status": 48,
        "exch_status_label": "CONFIRMED",
        "confirm_latency_us": 2005354.07,
        "oms_update_time": 1780889518,
        "exch_update_time": 1780889520,
        "confirmed": true
      },
      {
        "order_id": "20260608001784",
        "segment": "MCX",
        "ext_remarks": "L161849531acfd",
        "oms_status": 65,
        "oms_status_label": "COMPLETE",
        "oms_latency_us": 1574.1,
        "exch_status": 48,
        "exch_status_label": "CONFIRMED",
        "confirm_latency_us": 2002657.95,
        "oms_update_time": 1780889505,
        "exch_update_time": 1780889507,
        "confirmed": true
      },
      {
        "order_id": "20260608001785",
        "segment": "NFO",
        "ext_remarks": "L19283274eb35",
        "oms_status": 56,
        "oms_status_label": "OPEN",
        "oms_latency_us": 1925.54,
        "exch_status": "",
        "exch_status_label": "NOT_CONFIRMED",
        "confirm_latency_us": 0.0,
        "oms_update_time": 1780889484,
        "exch_update_time": 0,
        "confirmed": false
      },
      {
        "order_id": "20260608001786",
        "segment": "NFO",
        "ext_remarks": "L7741220ab",
        "oms_status": 48,
        "oms_status_label": "AFTER_MARKET_ORDER",
        "oms_latency_us": 3349.8,
        "exch_status": 48,
        "exch_status_label": "CONFIRMED",
        "confirm_latency_us": 4005114.22,
        "oms_update_time": 1780889470,
        "exch_update_time": 1780889474,
        "confirmed": true
      },
      {
        "order_id": "20260608001787",
        "segment": "BFO",
        "ext_remarks": "L2210943cc",
        "oms_status": 45,
        "oms_status_label": "REJECTED",
        "oms_latency_us": 1355.0,
        "exch_status": "",
        "exch_status_label": "NOT_CONFIRMED",
        "confirm_latency_us": 0.0,
        "oms_update_time": 1780889491,
        "exch_update_time": 0,
        "confirmed": false
      },
      {
        "order_id": "20260608001788",
        "segment": "NSE",
        "ext_remarks": "L5590318de4",
        "oms_status": 56,
        "oms_status_label": "OPEN",
        "oms_latency_us": 2371.9,
        "exch_status": 48,
        "exch_status_label": "CONFIRMED",
        "confirm_latency_us": 2003991.6,
        "oms_update_time": 1780889447,
        "exch_update_time": 1780889449,
        "confirmed": true
      },
      {
        "order_id": "20260608001789",
        "segment": "BSE",
        "ext_remarks": "L8830127fa",
        "oms_status": 65,
        "oms_status_label": "COMPLETE",
        "oms_latency_us": 2884.15,
        "exch_status": 48,
        "exch_status_label": "CONFIRMED",
        "confirm_latency_us": 6120.48,
        "oms_update_time": 1780889433,
        "exch_update_time": 1780889433,
        "confirmed": true
      }
    ],
    "count": 8,
    "summary": {
      "orders": 8,
      "oms_p50_us": 2371.9,
      "oms_p95_us": 3349.8,
      "oms_p99_us": 3349.8,
      "oms_max_us": 3349.8,
      "confirm_p50_us": 2002657.95,
      "confirm_p95_us": 4005114.22,
      "confirmed_orders": 6,
      "unconfirmed_orders": 2,
      "unconfirmed_pct": 25.0
    },
    "by_segment": [
      {
        "segment": "NSE",
        "orders": 2,
        "oms_p50_us": 2371.9,
        "oms_p95_us": 2490.86,
        "confirm_p50_us": 5255.34,
        "unconfirmed": 0
      },
      {
        "segment": "MCX",
        "orders": 2,
        "oms_p50_us": 1574.1,
        "oms_p95_us": 3056.4,
        "confirm_p50_us": 2002657.95,
        "unconfirmed": 0
      },
      {
        "segment": "NFO",
        "orders": 2,
        "oms_p50_us": 1925.54,
        "oms_p95_us": 3349.8,
        "confirm_p50_us": 4005114.22,
        "unconfirmed": 1
      },
      {
        "segment": "BFO",
        "orders": 1,
        "oms_p50_us": 1355.0,
        "oms_p95_us": 1355.0,
        "confirm_p50_us": 0.0,
        "unconfirmed": 1
      },
      {
        "segment": "BSE",
        "orders": 1,
        "oms_p50_us": 2884.15,
        "oms_p95_us": 2884.15,
        "confirm_p50_us": 6120.48,
        "unconfirmed": 0
      }
    ],
    "oms_status_mapping_confirmed": false,
    "notes": [
      "Latencies are microseconds.",
      "OMS_EXCH_CONFIRMATION derives from whole-second timestamps upstream, so values quantise near second boundaries and should not be read as sub-second precision.",
      "Unconfirmed orders report 0 and are excluded from confirmation statistics."
    ],
    "source": "demo"
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
    price_divisors: { NSE: 100, BSE: 100, NFO: 100, BFO: 100, MCX: 100, CDS: 10000000 },
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

/** One order's stage timeline (backend: csv_store.hop_order) — offsets in microseconds. */
function hopTrace(orderId) {
  const stages = [
    { stage: "46", position: 4, duration_us: 94062, start_us: 0, end_us: 94062 },
    { stage: "47", position: 5, duration_us: 95840, start_us: 120, end_us: 95960 },
    { stage: "82", position: 1, duration_us: 824.5, start_us: 95960, end_us: 96784.5 },
    { stage: "79", position: 2, duration_us: 644.3, start_us: 96784.5, end_us: 97428.8 },
  ];
  return {
    order_id: orderId, segment: "NSE", instance: "QKBT2",
    files: ["ORDERLATENCYSORTED20260907.csv"],
    first_start: "2026-09-07T03:31:04+00:00",
    span_us: 96046, stages,
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
  if (basePath.startsWith("/api/files/hops/")) {
    const orderId = decodeURIComponent(basePath.slice("/api/files/hops/".length));
    return { type: "hopTrace", orderId };
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
      if (key.type === "hopTrace") return json(res, 200, hopTrace(key.orderId));
      if (key.type === "stream") return handleStream(req, res, key.kind);
    }
    return json(res, 200, staticRoutes[key]);
  })
  .listen(Number(process.env.PORT || 8001), () => console.log(`mock api on :${process.env.PORT || 8001}`));
