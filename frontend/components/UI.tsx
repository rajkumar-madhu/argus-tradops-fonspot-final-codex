import FilterableTable from "@/components/FilterableTable";
import { fmt } from "@/lib/format";

export function Card({ title, children, action }: { title?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="panel">
      {title && (
        <div className="panel-head">
          <b>{title}</b>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function KPI({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: string; tone?: "up" | "down" | "warn" | "" }) {
  return (
    <div className={`kpi ${tone || ""}`}>
      <span>{label}</span>
      <b>{value}</b>
      {sub && <small>{sub}</small>}
    </div>
  );
}

export function PageHead({
  title,
  subtitle,
  badge,
  badgeTone = "",
}: {
  title: string;
  subtitle?: string;
  badge?: string;
  badgeTone?: "ok" | "warn" | "";
}) {
  return (
    <section className="page-head">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {badge && <span className={`pill ${badgeTone}`}>{badge}</span>}
    </section>
  );
}

export function StatusBadge({ value }: { value: string }) {
  const key = String(value || "").toLowerCase();
  return <span className={`order-status ${key}`}>{value}</span>;
}

export function Status({ value }: { value: string }) {
  const v = value.toLowerCase();
  const c =
    v.includes("health") || v.includes("complete") || v.includes("active") || v.includes("live") || v.includes("connected") || v.includes("ready")
      ? "good"
      : v.includes("warn") || v.includes("pending") || v.includes("degraded") || v.includes("watch")
        ? "warn"
        : v.includes("reject") || v.includes("down") || v.includes("fail")
          ? "bad"
          : "neutral";
  return <span className={`status ${c}`}>{value}</span>;
}

export function Severity({ value }: { value: string }) {
  const v = String(value || "").toUpperCase();
  const cls = v.startsWith("P1") ? "p1" : v.startsWith("P2") ? "p2" : "p3";
  return <span className={`sev ${cls}`}>{value}</span>;
}

export function SourceTag({ source }: { source?: string }) {
  if (!source) return null;
  return <span className="source-tag">Source: {source}</span>;
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="empty-state">
      <b>{title}</b>
      <p>{body}</p>
    </div>
  );
}

export function DataTable({
  columns,
  rows,
  rowKey,
  onRowClick,
  selectedId,
  className = "orders-table",
}: {
  columns: { key: string; label: string; render?: (row: any) => React.ReactNode }[];
  rows: any[];
  rowKey: (row: any, index: number) => string;
  onRowClick?: (row: any) => void;
  selectedId?: string;
  className?: string;
}) {
  return <FilterableTable
    className={className}
    columns={columns.map(({key, label}) => ({key, label}))}
    rows={rows.map((row, index) => ({
      id: rowKey(row, index),
      values: row,
      cells: columns.map(c => c.render ? c.render(row) : row[c.key] == null ? "—" : typeof row[c.key] === "object" ? JSON.stringify(row[c.key]) : String(row[c.key])),
    }))}
    selectedId={selectedId}
    onSelect={onRowClick}
  />;
}

export function OrderDetailPanel({ order }: { order: any }) {
  if (!order?.order_id) {
    return <EmptyState title="No order selected" body="Select a row to inspect Noren correlation fields and rejection evidence." />;
  }
  const fields: [string, unknown][] = [
    ["Order", order.order_id],
    ["Eref", order.eref],
    ["Exchange Order", order.exchange_order_id || "—"],
    ["Exchange", order.exchange],
    ["Symbol", order.symbol],
    ["Broker", order.broker],
    ["Account", order.account],
    ["User", order.user],
    ["Product", order.product],
    ["Type", order.type],
    ["Side", order.side],
    ["Qty", order.qty],
    ["Filled", order.filled_qty ?? 0],
    ["Price", order.price ?? "—"],
    ["Status", order.status],
    ["Status Code", order.status_code],
    ["Latency", order.latency_ms == null ? "—" : `${order.latency_ms} ms`],
    ["Region", order.region || "—"],
  ];
  return (
    <dl className="order-detail">
      {fields.map(([k, v]) => (
        <div key={String(k)}>
          <dt>{k}</dt>
          <dd>{String(v ?? "—")}</dd>
        </div>
      ))}
      {order.reason && (
        <div className="rejection-box">
          <b>{order.code || "Reject"} · {order.rejection_category}</b>
          <span>{order.reason}</span>
        </div>
      )}
    </dl>
  );
}

export { fmt };

/** Icon-tile KPI used by the overview dashboard (label, big value, delta line, tinted icon). */
export function KpiCard({
  label,
  value,
  delta,
  deltaTone = "",
  sub,
  tone = "blue",
  icon,
}: {
  label: string;
  value: React.ReactNode;
  delta?: React.ReactNode;
  deltaTone?: "up" | "down" | "warn" | "";
  sub?: React.ReactNode;
  tone?: "blue" | "green" | "red" | "amber" | "purple" | "teal";
  icon: React.ReactNode;
}) {
  return (
    <div className="kpi-card">
      <div className="kpi-card-body">
        <span className="kpi-card-label">{label}</span>
        <b className="kpi-card-value">{value}</b>
        {(delta || sub) && (
          <small className={`kpi-card-delta ${deltaTone}`}>
            {delta}
            {delta && sub ? " " : ""}
            {sub && <span className="kpi-card-sub">{sub}</span>}
          </small>
        )}
      </div>
      <span className={`kpi-tile tile-${tone}`}>{icon}</span>
    </div>
  );
}
