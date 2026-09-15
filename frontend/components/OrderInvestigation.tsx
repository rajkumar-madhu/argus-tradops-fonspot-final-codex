import Link from "next/link";
import { AnnotatedSeries, ChartEmpty } from "@/components/Charts";
import { EmptyState } from "@/components/UI";
import { orderPriceText, priceText } from "@/lib/format";
import { istStamp, istTime } from "@/lib/journal-explore";
import { inr } from "@/lib/risk-overview";
import {
  bandsFor, duration, explain, intervals, markersFor, orderValue, priceSeries, summarise,
  type OrderEvent,
} from "@/lib/order-investigation";

/** Dense label → value rows. A missing value is "—", never a fabricated zero. */
function Facts({ title, rows }: { title: string; rows: [string, React.ReactNode][] }) {
  return (
    <section className="oi-facts">
      <h3>{title}</h3>
      <dl>
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value === null || value === undefined || value === "" ? "—" : value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/**
 * Single-order investigation: what was ordered, what the OMS and RMS recorded,
 * and — where the rejection text carries a circuit band — the order's price
 * drawn against the limit it broke.
 */
export default function OrderInvestigation({
  orderId, events, source, error,
}: {
  orderId: string;
  events: OrderEvent[];
  source?: string | null;
  error?: string | null;
}) {
  if (error) return <EmptyState title="Unable to load this order" body={error} />;
  if (!events.length) {
    return (
      <EmptyState
        title={`No recorded events for ${orderId}`}
        body="This order id is not in the current source. Check the order number, or switch to the journal snapshot if it is a historical order."
      />
    );
  }

  const s = summarise(events);
  const latest = s.latest!;
  const value = orderValue(latest);
  const series = priceSeries(s.events);
  const labels = s.events.map((e) => istTime(e.time));
  const bands = bandsFor(s.band, Number(latest.price) || null);
  const markers = markersFor(s.events);
  const gaps = intervals(s.events);
  const { observed, inference } = explain(s);
  const status = String(latest.status || "").toUpperCase();
  const tone = status === "REJECTED" ? "bad" : status === "COMPLETE" ? "ok" : "neutral";
  const filled = Number(latest.filled_qty || 0);
  const qty = Number(latest.qty || 0);

  return (
    <div className="order-investigation">
      <header className="oi-head">
        <div className={`oi-value tone-${tone}`}>
          <b>{value === null ? orderPriceText(latest) : inr(value)}</b>
          <span>{value === null ? "Order price" : "Order value"}</span>
        </div>
        <div className="oi-identity">
          <h2>{latest.symbol || "—"}</h2>
          <p>
            {latest.exchange || "—"} · {latest.side || "—"} {qty ? qty.toLocaleString("en-IN") : "—"}
            {filled ? ` · ${filled.toLocaleString("en-IN")} filled` : ""} · {latest.product || "—"} · {latest.type || "—"}
          </p>
          <div className="oi-tags">
            <span className={`order-status ${status.toLowerCase()}`}>{status || "UNKNOWN"}</span>
            {latest.rejection_category && <span className="oi-tag">{latest.rejection_category}</span>}
            {latest.code && <span className="oi-tag mono">{latest.code}</span>}
            {source && <span className="oi-tag muted">{source}</span>}
          </div>
        </div>
        <div className="oi-when">
          <div><dt>First event</dt><dd>{istStamp(s.first?.time)}</dd></div>
          <div><dt>Latest event</dt><dd>{istStamp(latest.time)}</dd></div>
          <div><dt>Recorded span</dt><dd>{duration(s.spanMs)}</dd></div>
        </div>
        <nav className="oi-actions" aria-label="Related views">
          <Link href={`/orders?order=${encodeURIComponent(orderId)}`}>Order feed</Link>
          <Link href={`/rca?order_id=${encodeURIComponent(orderId)}`}>RCA</Link>
          <Link href={`/logs?q=${encodeURIComponent(orderId)}`}>Journal explorer</Link>
          <Link href={`/rejections`}>Rejections</Link>
        </nav>
      </header>

      <div className="oi-grid">
        <div className="oi-col">
          <Facts
            title="Order"
            rows={[
              ["Order no.", <span className="mono" key="o">{orderId}</span>],
              ["Eref", <span className="mono" key="e">{latest.eref}</span>],
              ["Exchange order no.", <span className="mono" key="x">{latest.exchange_order_id}</span>],
              ["Account", latest.account],
              ["User", latest.user],
              ["Broker", latest.broker],
            ]}
          />
          <Facts
            title="Instrument"
            rows={[
              ["Symbol", latest.symbol],
              ["Segment", latest.exchange],
              ["Product", latest.product],
              ["Order type", latest.type],
              ["Side", latest.side],
            ]}
          />
          <Facts
            title="Quantity and price"
            rows={[
              ["Quantity", qty ? qty.toLocaleString("en-IN") : null],
              ["Filled", `${filled.toLocaleString("en-IN")} / ${qty ? qty.toLocaleString("en-IN") : "—"}`],
              ["Cancelled", latest.cancelled_qty ? Number(latest.cancelled_qty).toLocaleString("en-IN") : null],
              ["Price", orderPriceText(latest)],
              ["Fill price", orderPriceText(latest, "fill_price")],
              ["Order value", value === null ? "Not established for this segment" : inr(value)],
            ]}
          />
        </div>

        <div className="oi-col">
          <Facts
            title="Lifecycle"
            rows={[
              ["Events recorded", s.events.length],
              ["States seen", markers.map((m) => m.label).join(" → ") || "—"],
              ["Recorded span", duration(s.spanMs)],
              ["Longest gap", duration(Math.max(0, ...gaps.filter((g): g is number => g !== null)) || null)],
              ["Exchange time", latest.exchange_time ? istStamp(latest.exchange_time) : null],
            ]}
          />
          {s.band ? (
            <Facts
              title="Circuit band quoted by the RMS"
              rows={[
                ["Quoted price", s.band.current === null || s.band.current === undefined ? null : priceText(s.band.current)],
                ["Upper circuit", s.band.upper === null || s.band.upper === undefined ? null : priceText(s.band.upper)],
                ["Lower circuit", s.band.lower === null || s.band.lower === undefined ? null : priceText(s.band.lower)],
                ["Breach", s.band.breach ? <b className="tone-bad" key="b">{s.band.breach} the band</b> : "Inside the band"],
              ]}
            />
          ) : (
            <section className="oi-facts">
              <h3>Circuit band</h3>
              <p className="oi-note">The rejection text for this order does not quote a price band.</p>
            </section>
          )}
          {s.freeze?.allowed ? (
            <Facts
              title="Freeze quantity"
              rows={[
                ["Exchange allows", s.freeze.allowed.toLocaleString("en-IN")],
                ["Requested", s.freeze.requested ? s.freeze.requested.toLocaleString("en-IN") : null],
              ]}
            />
          ) : null}
        </div>

        <div className="oi-col oi-chart">
          <section className="oi-facts">
            <h3>Price against the recorded limits</h3>
            {series.some((v) => v !== null) ? (
              <AnnotatedSeries
                points={series}
                labels={labels}
                bands={bands}
                markers={markers}
                unit={latest.price_scale === "unverified" ? "raw units" : "INR"}
                valueLabel="Order price"
              />
            ) : (
              <ChartEmpty message="No priced event for this order (market orders carry no limit price)." />
            )}
            <p className="oi-note">
              Reference lines are the circuit band the RMS quoted in its own rejection text and this
              order&apos;s price. Points are recorded journal events, not market ticks — there is no
              market-depth feed behind this chart.
            </p>
          </section>

          <section className="oi-facts">
            <h3>What the evidence supports</h3>
            <ul className="oi-observed">
              {observed.length ? observed.map((o) => <li key={o}>{o}</li>) : <li>No classified state recorded for this order.</li>}
            </ul>
            {inference ? (
              <p className="oi-inference"><b>Inference</b> {inference}</p>
            ) : (
              <p className="oi-note">No inference is drawn: the recorded evidence does not establish a single cause.</p>
            )}
            {latest.reason && (
              <p className="oi-reason">
                <span>RMS text</span>
                {latest.reason}
                <small>Client codes, balances and holdings are masked; market figures are kept.</small>
              </p>
            )}
          </section>
        </div>
      </div>

      <section className="panel oi-events">
        <div className="panel-head">
          <b>Recorded events</b>
          <span className="sub">{s.events.length} events · gap is journal event spacing, not measured latency</span>
        </div>
        <div className="table-scroll" tabIndex={0} aria-label="Recorded events for this order">
          <table className="orders-table">
            <thead>
              <tr>{["#", "Time (IST)", "Status", "Report", "Qty", "Filled", "Price", "Gap", "Reason"].map((h) => <th key={h}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {s.events.map((e, i) => (
                <tr key={`${e.time}-${i}`}>
                  <td>{i + 1}</td>
                  <td className="mono">{istTime(e.time)}</td>
                  <td><span className={`order-status ${String(e.status || "").toLowerCase()}`}>{e.status || "—"}</span></td>
                  <td>{e.report_type ?? "—"}</td>
                  <td className="num">{e.qty ?? "—"}</td>
                  <td className="num">{e.filled_qty ?? 0}</td>
                  <td className="num">{orderPriceText(e)}</td>
                  <td className="num">{duration(gaps[i])}</td>
                  <td className="ref-reason" title={String(e.reason || "")}>{e.reason || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
