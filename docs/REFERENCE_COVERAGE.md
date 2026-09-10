# Reference and data coverage audit

Audit date: 2026-09-08; image inventory re-counted 2026-09-09 after a second batch of references landed. This audit covers every repository image and spreadsheet/data source discovered with an unignored file scan. Reference values are illustrative unless independently present in the journal/API.

## Inventory

### Reference images (67 files; 45 unique pixel images)

Re-counted 2026-09-09. `images ref/` holds 114.4 MB, of which 37.1 MB is byte-identical duplication. The folder is gitignored, so none of this is in history. It arrived in two batches.

#### First batch — 2026-09-07 (28 files, 21 unique)

All 1536×1024 except the 1024×1536 landing page. Eight are byte-identical duplicates:

- `01_16_35 PM` Market Data (duplicate: `01_19_05 PM`)
- `01_16_53 PM` Infrastructure (duplicates: `01_19_33 PM`, `01_19_49 PM`)
- `01_17_00 PM` Alerts & Incidents (duplicates: `01_19_41 PM`, `01_19_59 PM`)
- `01_18_02 PM` Live Orders, lifecycle layout
- `01_18_11 PM` Live Orders, analytics layout
- `01_18_17 PM` WeCrew Sentinel security screen (not a TradeOps route)
- `01_18_27 PM` Trading Operations Dashboard
- `01_18_36 PM` Live Orders, detail/depth layout
- `01_18_41 PM` Traders Dashboard
- `01_18_45 PM` Positions
- `01_18_51 PM` Holdings
- `01_18_56 PM` Order Rejections (duplicate: `01_18_57 PM`)
- `01_19_01 PM` RCA Analysis
- `01_19_13 PM` Exchange Health
- `01_19_20 PM` User Sessions (duplicate: `01_19_21 PM`)
- `01_19_28 PM` Risk & Limits (duplicate: `01_19_46 PM`)
- `01_19_54 PM` Logs Explorer
- `01_20_08 PM` Configuration
- `01_20_18 PM` Users & Sessions, journal layout
- `01_20_35 PM` TradeOps landing page
- `mirae-finspot-management-console-elk/Codex Image 8 Sept 2026, 11_29_08.png` is a separate Argus TradeOps market workspace reference.

The exact filenames all begin `images ref/ChatGPT Image Sep 7, 2026, ` followed by the time above. No reference file was modified.

#### Second batch — 2026-09-08, ~23:37–23:41 (39 files, 24 new unique)

Added after the original audit. It falls into four groups.

**1. Renames of first-batch images (12 files, zero new content).** Byte-identical copies under descriptive names — `TradeOps RCA Analysis Dashboard.png` == `01_19_01 PM`, `TradeOps Risk & Limits Dashboard.png` == `01_19_28 PM`, and likewise for Market Data (`01_16_35`), Infrastructure (`01_16_53`), Alerts & Incidents (`01_17_00`), Live Order Monitoring (`01_18_02`), Live Order Monitoring(1) (`01_18_11`), Trading Operations (`01_18_27`), Live Orders (`01_18_36`), Holdings Analytics (`01_18_51`), User Sessions (`01_19_20`) and User Sessions(1) (`01_20_18`). These account for most of the duplicated bytes and can be deleted without loss.

**2. First-batch screens redrawn in a unified TradeOps shell (7 files).** The `(1)`-suffixed `ChatGPT Image Sep 7, 2026, …` files are new images, not higher-resolution copies: the same screens rendered in the newer TradeOps design system (navy rail, market ticker header, dense tables). Spot-checked: `01_18_45 PM (1)` is Positions and `01_18_17 PM (1)` is the WeCrew Sentinel security screen. Others follow their first-batch siblings: `01_17_00 (1)` Alerts, `01_18_02 (1)` Live Orders, `01_18_36 (1)` Live Orders detail, `01_19_21 (1)` Sessions, `01_19_33 (1)` Infrastructure. Note `01_18_36 PM (1)` and `(2)` are identical to each other.

**3. Competing product brandings (17 files, 14 unique).** These are separate design directions, not variants of one system:

| Family | Files | Character |
|---|---|---|
| **TradeOps** (Trading Observability Platform) | Command Center, Real-Time Trading, Trading Operations(1), Professional Order Book | Light, navy rail, nav matching the current routes almost 1:1; subtitled "Real-time monitoring for Noren Trader / OMS / RMS / Exchange / Infrastructure". Order Book adds Level-5 depth. |
| **AEGIS TradeOps** (© WeCrew Technologies, v2.1.0) | Mission Control ×3 (incl. `Mission Control Trading Operations Dashboard.png`, 1582×994 variant), Order Trace | Deeper IA than the app has: OMS Latency, Queue Monitor, Exchange/FIX, Evidence Center, Data Pipeline. Order Trace is a single-order 8-hop latency waterfall with correlated logs and an AI RCA summary. |
| **Argus TradOps** (© WeCrew Technology Solutions) | Command Center(1) (== `a_clean_high_resolution_screenshot_mockup_of_a.png`), Market Operations | Command Center is the deepest nav of any reference. Market Operations is the workspace already cited for `/order-book` and `/market-data`, and is the only reference that labels its own data honestly ("DEMO DATA • NOT LIVE", "Market feed: simulated", "ELK: not connected"). |
| **LinkedEye APM** (Live Trading Monitoring Platform v2.4.1) | Adapter Status, Adapter Monitoring, Trading Operations, `b6a18eab-…png` | Dark, very dense, 1672×941 / 1623×969. All four render the same Adapter Status screen (client × exchange adapter matrix, process table, execution logs) in three chrome variants: left rail, desktop menu bar, and tabbed. |
| **INDMONEY TradOps** | Operations Dashboard | Closest to this repo's actual data reality: a "Live (Files)" badge and a source-health panel listing `ORDERLATENCY` CSV, `QueSize_NSE2` CSV and `Journal.log`. |

**4. Out of scope for TradeOps (3 files).** `WeCrew SecureOps Security Dashboard.png` is an AppSec/CSPM product (findings, attack paths, SBOM). `AEGIS Trace Explorer Dashboard.png` is a different AEGIS — "AI Agent Observability", with token usage, model cost and MCP tool calls. `ChatGPT Image Sep 8, 2026, 12_16_26 PM.png` (1312×1199) is not a UI mockup at all but a multi-tenant Kubernetes RBAC/firewall architecture diagram.

**Resolved 2026-09-09:** the current request explicitly selects Argus TradeOps. Keep the established identity and light default; preserve the navy theme as an optional preference. Other products remain information-architecture references only.

Two references depict actions this system must never offer: `Professional Order Book` has a **Cancel Order** button, and the AEGIS/Sentinel screens have **Create Incident**. The read-only invariant wins over pixel parity.

### Generated comparison images (29)

`output/playwright/` contains: `auth-callback.png`, `configuration.png`, `dashboard.png`, `exchange.png`, `filter-check-dashboard.png`, `filter-check-log-search.png`, `forgot-password.png`, `holdings.png`, `home.png`, `incidents.png`, `infra.png`, `logs.png`, `market-data.png`, `order-book.png`, `order-latency.png`, `orders.png`, `positions.png`, `rca.png`, `reference-1.png`, `reference-2.png`, `reference-3.png`, `rejections.png`, `reports.png`, `risk.png`, `sessions.png`, `signin.png`, `signup.png`, `trades.png`, and `verify.png`.

The remaining 11 of 69 discovered images are Playwright/browser package logos under `.ds-sync/`; they are dependency assets, not product or design references.

### Spreadsheet and raw data files

- `Journal_Converted.xlsx` — 10,553,579 bytes; corrupt. `zipfile.is_zipfile` is false; both ZIP validation and openpyxl fail with `Bad magic number for central directory`. It was inspected read-only and not repaired.
- `L_ORDERLATENCY20260624095454.csv` — readable UTF-8 CSV, 25 data rows, consistently 9 columns. Headers: `NOREN_ORD_NUM`, `EXCH_SEG`, `EXT_RMKS`, `OMS_STATUS`, `OMS_LATENCY`, `EXCH_STATUS`, `OMS_EXCH_CONFIRMATION`, `OMSUPDATETIME`, `EXCHUPDATETIME`.
- `mirae-finspot-management-console-elk/Journal.log` — 26,153,152 bytes, 18,675 valid JSON lines and zero invalid lines.

The original inventory above is historical. The current delivery includes `ORDERLATENCY_08-Sep-2026.csv` (509,100 events) and ten `QueSize_*.csv` sources (17,250 observations; four zero-byte files). See FILE_ANALYTICS.md and REFERENCE_SCREEN_INVENTORY.md for the current inventory and contract.

## Journal source coverage

Message types are `ordupd` 18,504, `login` 149, `logout` 14, and `yel_connected` 8. Order venues are NSE, NFO, BSE, BFO, and CDS. The journal supports order state/lifecycle, fills/trades, rejection evidence, session observations and YEL keys. It does **not** establish authoritative positions, holdings, portfolio cost, P&L, market ticks/depth, RMS limits, infrastructure metrics, persisted incidents, SLA/MTTR, or report delivery.

Sensitive raw fields include PAN, IP, session identifiers, mobile/email and nested user details. Raw journal rows must not be returned by general log search. Normalized pages must continue masking account/user/session/network identifiers and excluding sensitive `_source` fields.

## Route-to-reference coverage

| Route | Reference | Coverage | Current data source and evidence |
|---|---|---|---|
| `/` | Landing (`01_20_35`) | Close visually | Marketing-only. No customer is quoted and the stat strip carries no invented numbers; the workflow cards describe supported workflows by team. |
| `/dashboard` | Dashboard (`01_18_27`) | Close | Journal overview/orders/rejections/sessions/exchanges/infra; charts are binned from returned rows. |
| `/orders` | Live Orders (`01_18_02`, `01_18_11`, `01_18_36`) | Close | Journal snapshot or ES API. Table, filters, selection, lifecycle and evidence exist. Historical market depth is explicitly unavailable. |
| `/order-book` | Argus market workspace; sidebar-only in PNG set | Partial | Journal open/pending orders, not exchange level-2 depth. |
| `/trades` | Traders (`01_18_41`) only loosely related | Partial | Journal completed fills. No dedicated trader performance route because journal cannot prove P&L/turnover performance. |
| `/positions` | Positions (`01_18_45`) | Partial / data missing | API returns no rows in journal mode; RMS integration required. UI now stops before rendering synthetic MTM history. |
| `/holdings` | Holdings (`01_18_51`) | Partial / data missing | API returns no rows in journal mode; back-office integration required. UI no longer invents history, cap or sector allocation. |
| `/rejections` | Rejections (`01_18_56`) | Close | Journal rejected orders grouped by code/category with selected evidence. |
| `/rca` | RCA (`01_19_01`) | Close layout, partial semantics | Rule-based classification from rejection/lifecycle evidence. SLA, customer impact, RCA duration and fallback confidence are no longer claimed. The four tabs each select a real subset of that evidence; `Insights` was removed for lack of a source. |
| `/market-data` | Market Data (`01_16_35`) and Argus workspace | Partial / data missing | Journal has no market ticks. TrueData/Redis snapshot is unconfigured; any journal-derived values must remain clearly indicative order evidence, not market prices. |
| `/exchange` | Exchange Health (`01_19_13`) | Close layout, partial telemetry | Journal venue/order/YEL evidence. No measured uptime or reliable latency history; client×exchange matrix is derived, not adapter monitoring — cells are `OBSERVED`/`REJECTION_HEAVY`, never success/failure. |
| `/sessions` | Sessions (`01_19_20`, `01_20_18`) | Close | 149 login + 14 logout observations. History does not prove current activity. |
| `/risk` | Risk (`01_19_28`) | Partial | Journal rejection groups can show possible breaches; exposure, margin, VaR, limits and stress tests require RMS/risk integration. |
| `/infra` | Infrastructure (`01_16_53`) | Partial / data missing | Journal and dependency status only. Synthetic WAN chart removed; resource history/topology require Prometheus/Kubernetes integrations. |
| `/logs` | Logs (`01_19_54`) | Partial / deliberately restricted | Live ES when configured. In journal mode raw search is withheld because source rows contain sensitive data; normalized pages expose safe evidence. |
| `/incidents` | Alerts (`01_17_00`) | Close layout, partial persistence | Rejection/YEL-derived alerts plus Postgres incidents when available. MTTR and SLA history unavailable; synthetic SLA percentage removed. |
| `/reports` | No dedicated full-screen PNG | Partial / unconfigured | Journal mode now returns no report fixtures. No scheduler or Email/S3 delivery is claimed. |
| `/configuration` | Configuration (`01_20_08`) | Partial, intentionally read-only | Runtime source, indices and dependency status. No unsafe edit/test-connect controls. |
| `/order-latency` | Argus/AEGIS/INDMONEY latency workspace | Implemented | Indexed CSV observations, p50/p90/p95/p99/max, shared server filters, source provenance and filtered export. |
| `/queue-monitor` | AEGIS/INDMONEY queue workspace | Implemented | Instance-specific trends, latest/peak, stale/empty states, p99 anomalies and export. |
| `/data-quality` | INDMONEY source health / AEGIS pipeline | Implemented | File discovery, validation counters, duplicate reconciliation and original source hashes. |
| `/signin`, `/signup`, `/forgot-password`, `/verify`, `/auth/callback` | No operational reference | Implemented | Keycloak/public auth flow; not part of the operations screenshot comparison. |

Shared shell alignment is close: navy rail, compact light workspace, top context/search bar, semantic status colors, dense panels and tables. Exact pixel parity is not claimed; references contain unsupported actions such as New Order/Create Incident and invented financial/operational values that must not be copied.

## Runtime source and demo leakage

The local API on port 8001 reports `demo_mode=true`, `journal_primary=false`, but automatically selects `journal snapshot` because the configured Elasticsearch URL is the local placeholder and `Journal.log` exists. `/api/elk/status` reports disconnected/demo; ELK is **not connected**.

Journal-backed endpoints cover overview, orders, order book, trades, rejections, exchanges, sessions, derived risk evidence, market unavailability and basic infra status. Before this audit, `/api/logs/search` and `/api/reports` leaked demo fixtures in this mixed mode. The endpoint ordering is now corrected: journal mode returns a privacy-safe unavailable result for raw log search and an empty unconfigured report catalog. The running API must be restarted to load these code changes.

Persisted RCA/incidents still return empty demo-labelled responses while `TRADEOPS_DEMO_MODE=true`; views distinguish derived journal evidence from persisted data. Production must disable demo mode and authentication bypass and configure read-only Elasticsearch, Redis/Postgres and Keycloak credentials.

## Remaining gaps

Blocked on data sources that do not exist yet:

1. Add authoritative integrations before implementing positions, holdings, risk exposure/limits, market depth, infra history/topology, SLA/MTTR or report delivery.
2. Add a dedicated Traders route only if a trusted trader-performance/position source exists.
3. Restart the API and refresh matched route screenshots after concurrent journal-field work settles. Needs a running stack, so it cannot be done from a sandboxed session.

### Closed 2026-09-11

- **Landing-page testimonials and performance statistics.** The stat strip already carried no
  invented numbers. The remaining problem was presentational: three role-based workflow
  descriptions were still rendered as `<blockquote>` with an avatar initial and a name under a
  "Customers" nav anchor, which reads as customer quotes even though nobody is quoted. They are
  now plain `.workflow-card` articles under a `#workflows` anchor labelled "Workflows", with the
  quotation and avatar styling deleted.
- **Exchange matrix “success/failure”.** The visible copy had already been corrected to
  "rejection-heavy … this is order evidence, not adapter telemetry", but `lib/exchange-matrix.ts`
  still modelled cells as `SUCCESS`/`FAILED` with `lastSuccess`/`lastFailure`, and computed a
  `summary.successPct` — an adapter success rate no telemetry backs. Cell status is now
  `OBSERVED` / `REJECTION_HEAVY` / `NONE` with `lastObserved`/`lastRejection`, and the
  percentage is gone (nothing consumed it); the summary reports observed and rejection-heavy
  counts only.
- **Inert RCA tab controls.** `Insights` is removed — the journal establishes no insight source,
  so the tab had nothing to render. `Overview`, `Order RCA`, `System RCA` and `Trend Analysis`
  now each select a real subset of the same journal evidence instead of showing a "dedicated
  panels coming in a later release" footnote: Order RCA shows the case table with the per-order
  lifecycle, logs and actions; System RCA shows the KPIs with the category and resolution
  donuts; Trend Analysis shows the KPIs with the RCA trend.
- **Two fabricated RCA deltas.** The KPI grid hardcoded `−18%` ("vs previous day") on Incidents
  Analyzed and `+2` on Repeat Issues. Neither was computed from any source; both are replaced by
  labels describing what the number actually is.
