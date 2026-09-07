// Design-system entry point, consumed by /design-sync (cfg.entry).
//
// Exports only the presentational components — the ones free of Next.js
// routing, the OIDC/session layer and the SSE client. Shell, AuthShell,
// LiveOrders, RejectionsView and MarketDataView are deliberately absent:
// they import next/navigation or @/lib/stream and cannot render outside
// the running app.
export * from "./components/Charts";
export * from "./components/UI";
// `KPI` is all-caps, which the sync pipeline classifies as a constant rather
// than a component. Re-exported as `Kpi` so it ships; same component.
export { KPI as Kpi } from "./components/UI";
export { default as MarketTicker } from "./components/MarketTicker";
export { default as LandingPreview } from "./components/LandingPreview";
export { default as OverviewOrders } from "./components/OverviewOrders";
export { default as OrderBookView } from "./components/OrderBookView";
