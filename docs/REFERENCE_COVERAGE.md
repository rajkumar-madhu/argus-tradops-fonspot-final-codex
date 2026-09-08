# Reference and data coverage audit

Audit date: 2026-09-08. This audit covers every repository image and spreadsheet/data source discovered with an unignored file scan. Reference values are illustrative unless independently present in the journal/API.

## Inventory

### Reference images (29 files; 21 unique pixel images)

All 28 files in `images ref/` are 1536×1024 except the 1024×1536 landing page. Eight are byte-identical duplicates:

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

### Generated comparison images (29)

`output/playwright/` contains: `auth-callback.png`, `configuration.png`, `dashboard.png`, `exchange.png`, `filter-check-dashboard.png`, `filter-check-log-search.png`, `forgot-password.png`, `holdings.png`, `home.png`, `incidents.png`, `infra.png`, `logs.png`, `market-data.png`, `order-book.png`, `order-latency.png`, `orders.png`, `positions.png`, `rca.png`, `reference-1.png`, `reference-2.png`, `reference-3.png`, `rejections.png`, `reports.png`, `risk.png`, `sessions.png`, `signin.png`, `signup.png`, `trades.png`, and `verify.png`.

The remaining 11 of 69 discovered images are Playwright/browser package logos under `.ds-sync/`; they are dependency assets, not product or design references.

### Spreadsheet and raw data files

- `Journal_Converted.xlsx` — 10,553,579 bytes; corrupt. `zipfile.is_zipfile` is false; both ZIP validation and openpyxl fail with `Bad magic number for central directory`. It was inspected read-only and not repaired.
- `L_ORDERLATENCY20260624095454.csv` — readable UTF-8 CSV, 25 data rows, consistently 9 columns. Headers: `NOREN_ORD_NUM`, `EXCH_SEG`, `EXT_RMKS`, `OMS_STATUS`, `OMS_LATENCY`, `EXCH_STATUS`, `OMS_EXCH_CONFIRMATION`, `OMSUPDATETIME`, `EXCHUPDATETIME`.
- `mirae-finspot-management-console-elk/Journal.log` — 26,153,152 bytes, 18,675 valid JSON lines and zero invalid lines.

No other `.xlsx`, `.xls`, `.csv`, or `Journal.log` file was found.

## Journal source coverage

Message types are `ordupd` 18,504, `login` 149, `logout` 14, and `yel_connected` 8. Order venues are NSE, NFO, BSE, BFO, and CDS. The journal supports order state/lifecycle, fills/trades, rejection evidence, session observations and YEL keys. It does **not** establish authoritative positions, holdings, portfolio cost, P&L, market ticks/depth, RMS limits, infrastructure metrics, persisted incidents, SLA/MTTR, or report delivery.

Sensitive raw fields include PAN, IP, session identifiers, mobile/email and nested user details. Raw journal rows must not be returned by general log search. Normalized pages must continue masking account/user/session/network identifiers and excluding sensitive `_source` fields.

## Route-to-reference coverage

| Route | Reference | Coverage | Current data source and evidence |
|---|---|---|---|
| `/` | Landing (`01_20_35`) | Close visually | Marketing-only. Testimonials and performance claims remain illustrative and need approval/evidence before publication. |
| `/dashboard` | Dashboard (`01_18_27`) | Close | Journal overview/orders/rejections/sessions/exchanges/infra; charts are binned from returned rows. |
| `/orders` | Live Orders (`01_18_02`, `01_18_11`, `01_18_36`) | Close | Journal snapshot or ES API. Table, filters, selection, lifecycle and evidence exist. Historical market depth is explicitly unavailable. |
| `/order-book` | Argus market workspace; sidebar-only in PNG set | Partial | Journal open/pending orders, not exchange level-2 depth. |
| `/trades` | Traders (`01_18_41`) only loosely related | Partial | Journal completed fills. No dedicated trader performance route because journal cannot prove P&L/turnover performance. |
| `/positions` | Positions (`01_18_45`) | Partial / data missing | API returns no rows in journal mode; RMS integration required. UI now stops before rendering synthetic MTM history. |
| `/holdings` | Holdings (`01_18_51`) | Partial / data missing | API returns no rows in journal mode; back-office integration required. UI no longer invents history, cap or sector allocation. |
| `/rejections` | Rejections (`01_18_56`) | Close | Journal rejected orders grouped by code/category with selected evidence. |
| `/rca` | RCA (`01_19_01`) | Close layout, partial semantics | Rule-based classification from rejection/lifecycle evidence. SLA, customer impact, RCA duration and fallback confidence are no longer claimed. Non-overview tabs remain placeholders. |
| `/market-data` | Market Data (`01_16_35`) and Argus workspace | Partial / data missing | Journal has no market ticks. TrueData/Redis snapshot is unconfigured; any journal-derived values must remain clearly indicative order evidence, not market prices. |
| `/exchange` | Exchange Health (`01_19_13`) | Close layout, partial telemetry | Journal venue/order/YEL evidence. No measured uptime or reliable latency history; client×exchange matrix is derived, not adapter monitoring. |
| `/sessions` | Sessions (`01_19_20`, `01_20_18`) | Close | 149 login + 14 logout observations. History does not prove current activity. |
| `/risk` | Risk (`01_19_28`) | Partial | Journal rejection groups can show possible breaches; exposure, margin, VaR, limits and stress tests require RMS/risk integration. |
| `/infra` | Infrastructure (`01_16_53`) | Partial / data missing | Journal and dependency status only. Synthetic WAN chart removed; resource history/topology require Prometheus/Kubernetes integrations. |
| `/logs` | Logs (`01_19_54`) | Partial / deliberately restricted | Live ES when configured. In journal mode raw search is withheld because source rows contain sensitive data; normalized pages expose safe evidence. |
| `/incidents` | Alerts (`01_17_00`) | Close layout, partial persistence | Rejection/YEL-derived alerts plus Postgres incidents when available. MTTR and SLA history unavailable; synthetic SLA percentage removed. |
| `/reports` | No dedicated full-screen PNG | Partial / unconfigured | Journal mode now returns no report fixtures. No scheduler or Email/S3 delivery is claimed. |
| `/configuration` | Configuration (`01_20_08`) | Partial, intentionally read-only | Runtime source, indices and dependency status. No unsafe edit/test-connect controls. |
| `/order-latency` | Separate CSV/dashboard reference | Partial | CSV is valid but is not ingested while journal snapshot is primary; page correctly reports the missing feed. |
| `/signin`, `/signup`, `/forgot-password`, `/verify`, `/auth/callback` | No operational reference | Implemented | Keycloak/public auth flow; not part of the operations screenshot comparison. |

Shared shell alignment is close: navy rail, compact light workspace, top context/search bar, semantic status colors, dense panels and tables. Exact pixel parity is not claimed; references contain unsupported actions such as New Order/Create Incident and invented financial/operational values that must not be copied.

## Runtime source and demo leakage

The local API on port 8001 reports `demo_mode=true`, `journal_primary=false`, but automatically selects `journal snapshot` because the configured Elasticsearch URL is the local placeholder and `Journal.log` exists. `/api/elk/status` reports disconnected/demo; ELK is **not connected**.

Journal-backed endpoints cover overview, orders, order book, trades, rejections, exchanges, sessions, derived risk evidence, market unavailability and basic infra status. Before this audit, `/api/logs/search` and `/api/reports` leaked demo fixtures in this mixed mode. The endpoint ordering is now corrected: journal mode returns a privacy-safe unavailable result for raw log search and an empty unconfigured report catalog. The running API must be restarted to load these code changes.

Persisted RCA/incidents still return empty demo-labelled responses while `TRADEOPS_DEMO_MODE=true`; views distinguish derived journal evidence from persisted data. Production must disable demo mode and authentication bypass and configure read-only Elasticsearch, Redis/Postgres and Keycloak credentials.

## Remaining gaps

1. Add authoritative integrations before implementing positions, holdings, risk exposure/limits, market depth, infra history/topology, SLA/MTTR or report delivery.
2. Add a dedicated Traders route only if a trusted trader-performance/position source exists.
3. Replace or remove unverified landing-page testimonials and performance statistics before public release.
4. Rename exchange matrix “success/failure” to “observed/rejection-heavy” unless real adapter health telemetry is added.
5. Implement dedicated RCA tabs or remove inert tab controls.
6. Restart the API and refresh matched route screenshots after concurrent journal-field work settles.
