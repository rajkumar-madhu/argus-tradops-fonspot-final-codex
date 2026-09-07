/**
 * Index ticker shown on the landing page, the auth pages and inside the app top bar.
 * Values are a fixed demo snapshot (the mockups use the same numbers); the strip is
 * deliberately not wired to /api/market-data yet.
 */
export const INDICES = [
  { name: "NIFTY 50", value: "25,415.80", delta: "+597.55", pct: "+2.41%", up: true },
  { name: "NIFTY BANK", value: "53,037.60", delta: "+1,173.25", pct: "+2.26%", up: true },
  { name: "SENSEX", value: "83,258.91", delta: "+1,173.28", pct: "+1.43%", up: true },
  { name: "INDIA VIX", value: "12.84", delta: "-0.42", pct: "-3.17%", up: false },
  { name: "USDINR", value: "83.92", delta: "+0.04", pct: "+0.05%", up: true },
] as const;

export default function MarketTicker({ variant = "bar" }: { variant?: "bar" | "strip" }) {
  const items = variant === "bar" ? INDICES.slice(0, 3) : INDICES;
  return (
    <div className={`ticker-${variant}`} aria-label="Market indices (demo feed)">
      {variant === "strip" && <span className="ticker-tag">DEMO FEED</span>}
      {items.map((i) => (
        <span className="tick" key={i.name}>
          <span className={`tick-dot ${i.up ? "up" : "down"}`} />
          <b>{i.name}</b>
          <strong>{i.value}</strong>
          <em className={i.up ? "up" : "down"}>
            {i.up ? "▲" : "▼"} {i.delta} ({i.pct})
          </em>
        </span>
      ))}
    </div>
  );
}
