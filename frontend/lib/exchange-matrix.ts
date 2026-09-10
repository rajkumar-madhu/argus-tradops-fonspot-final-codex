export type MatrixCell = {
  client: string;
  exchange: string;
  orders: number;
  rejected: number;
  yelConnected: boolean;
  /**
   * Order evidence only. OBSERVED means orders (or a YEL key) were seen for this
   * client and venue; REJECTION_HEAVY means most of those orders were rejected.
   * Neither establishes adapter health — the journal carries no adapter telemetry.
   */
  status: "OBSERVED" | "REJECTION_HEAVY" | "NONE";
  lastObserved?: string;
  lastRejection?: string;
};

const DEFAULT_EXCHANGES = ["NSE", "NFO", "CDS", "BSE", "BFO", "MCX"];

function parseYelKey(key: string): { exchange?: string; client?: string } {
  const raw = String(key || "").trim();
  if (!raw) return {};
  const parts = raw.split(/[:|/\-]/).map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) return { exchange: parts[0], client: parts[1] };
  if (/^[A-Z]{2,5}$/.test(parts[0])) return { exchange: parts[0] };
  return { client: parts[0] };
}

/** Build client × exchange adapter matrix from journal orders and YEL keys. */
export function buildAdapterMatrix(orders: any[], yelKeys: string[] = []) {
  const clientSet = new Set<string>();
  const exchangeSet = new Set<string>(DEFAULT_EXCHANGES);
  const counts = new Map<string, { orders: number; rejected: number; lastTime?: string }>();
  const yelPairs = new Set<string>();

  for (const key of yelKeys) {
    const { exchange, client } = parseYelKey(key);
    if (exchange) exchangeSet.add(exchange);
    if (client) clientSet.add(client);
    if (exchange && client) yelPairs.add(`${client}::${exchange}`);
    if (exchange && !client) {
      for (const c of clientSet) yelPairs.add(`${c}::${exchange}`);
    }
  }

  for (const o of orders) {
    const client = String(o.user || o.broker || "").trim();
    const exchange = String(o.exchange || "").trim();
    if (!client || !exchange) continue;
    clientSet.add(client);
    exchangeSet.add(exchange);
    const k = `${client}::${exchange}`;
    const row = counts.get(k) || { orders: 0, rejected: 0 };
    row.orders += 1;
    if (String(o.status).toUpperCase() === "REJECTED") row.rejected += 1;
    row.lastTime = o.time || row.lastTime;
    counts.set(k, row);
  }

  const clients = Array.from(clientSet).sort().slice(0, 12);
  const exchanges = Array.from(exchangeSet).sort();

  const cells: MatrixCell[] = [];
  for (const client of clients) {
    for (const exchange of exchanges) {
      const k = `${client}::${exchange}`;
      const row = counts.get(k);
      const ordersN = row?.orders || 0;
      const rejected = row?.rejected || 0;
      const yelConnected = yelPairs.has(k) || (yelKeys.length > 0 && yelKeys.some((key) => key.includes(exchange)));
      let status: MatrixCell["status"] = "NONE";
      if (ordersN > 0) {
        status = rejected > ordersN * 0.5 ? "REJECTION_HEAVY" : "OBSERVED";
      } else if (yelConnected) {
        status = "OBSERVED";
      }
      cells.push({
        client,
        exchange,
        orders: ordersN,
        rejected,
        yelConnected,
        status,
        lastObserved: ordersN && rejected < ordersN ? row?.lastTime : undefined,
        lastRejection: rejected ? row?.lastTime : undefined,
      });
    }
  }

  const rejectionHeavy = cells.filter((c) => c.status === "REJECTION_HEAVY").length;
  const observed = cells.filter((c) => c.status === "OBSERVED").length;

  return {
    clients,
    exchanges,
    cells,
    summary: {
      observedPairs: observed + rejectionHeavy,
      observed,
      rejectionHeavy,
    },
  };
}

export function infraAsProcesses(infra: Record<string, any>) {
  const scripts = [
    { name: "collector.py", key: "redis", host: "tradeops-worker" },
    { name: "correlation_worker.py", key: "postgres", host: "tradeops-worker" },
    { name: "api.main", key: "elasticsearch", host: "tradeops-api" },
    { name: "journal_loader.py", key: "journal", host: "local" },
  ];
  return scripts.map((s) => {
    const v = infra[s.key] || {};
    const status = String(v.status || "Unknown");
    // Dependency reachability does not establish process state or exit code.
    return {
      name: s.name,
      host: s.host,
      pid: "—",
      status: "UNAVAILABLE",
      cpu_pct: v.cpu_pct ?? "—",
      memory_pct: v.memory_pct ?? "—",
      uptime: "—",
      last_heartbeat: "—",
      last_execution: "—",
      response_ms: v.replication_lag_ms ?? "—",
      exit_code: "—",
      remarks: `Process telemetry unavailable; dependency status: ${status}`,
    };
  });
}

export function buildExecutionLogs(rejections: any[], infra: Record<string, any>) {
  const lines: { time: string; level: string; process: string; message: string }[] = [];
  for (const r of (rejections || []).slice(0, 6)) {
    lines.push({
      time: r.time ? String(r.time).slice(11, 19) : "—",
      level: "ERROR",
      process: "rms_validator",
      message: `${r.order_id || "—"} · ${String(r.reason || "").replace(/^RED:/, "").slice(0, 100)}`,
    });
  }
  for (const [k, v] of Object.entries(infra || {})) {
    if (typeof v !== "object" || !v) continue;
    const status = String((v as any).status || "");
    if (/unavailable|disconnect/i.test(status)) {
      lines.push({
        time: "—",
        level: "ERROR",
        process: k,
        message: `${k} status: ${status}`,
      });
    } else {
      lines.push({
        time: "—",
        level: "INFO",
        process: k,
        message: `${k} status: ${status}`,
      });
    }
  }
  return lines.slice(0, 20);
}
