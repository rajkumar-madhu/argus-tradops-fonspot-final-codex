# Reference screen inventory

Reviewed 2026-09-09 from the actual `images ref/` directory. All 67 files map to the 45 unique images below; duplicates were identified by SHA-256. Each unique image was visually reviewed. Reference numbers correspond to ignored `output/audit/references-*.jpg` contact sheets. Original images remain unchanged.

Argus TradeOps is the requested identity. Reference branding and unsupported measurements or execution controls are not copied.

| # | Reference image (and byte-identical aliases) | Closest route | Component / qualification |
|---|---|---|---|
| 1 | AEGIS Trace Explorer Dashboard.png | Out of scope | AI agent trace product |
| 2 | AEGIS TradeOps Mission Control Dashboard(1).png | /dashboard | DashboardView; queue and latency summaries |
| 3 | AEGIS TradeOps Mission Control Dashboard.png | /dashboard | DashboardView |
| 4 | AEGIS TradeOps Order Trace Dashboard.png | /orders | LiveOrders lifecycle; no measured eight-hop trace |
| 5 | Argus TradOps Command Center Dashboard(1).png<br>a_clean_high_resolution_screenshot_mockup_of_a.png | /dashboard | DashboardView; canonical Argus information architecture |
| 6 | Argus TradOps Market Operations Dashboard.png | /market-data, /order-book | MarketDataView, OrderBookView |
| 7 | ChatGPT Image Sep 7, 2026, 01_16_35 PM.png<br>ChatGPT Image Sep 7, 2026, 01_19_05 PM.png<br>TradeOps Market Data Dashboard.png | /market-data | MarketDataView |
| 8 | ChatGPT Image Sep 7, 2026, 01_16_53 PM.png<br>ChatGPT Image Sep 7, 2026, 01_19_33 PM.png<br>ChatGPT Image Sep 7, 2026, 01_19_49 PM.png<br>TradeOps Infrastructure Monitoring Dashboard.png | /infra | Infrastructure page; metrics integration unavailable |
| 9 | ChatGPT Image Sep 7, 2026, 01_17_00 PM (1).png | /incidents | IncidentsView |
| 10 | ChatGPT Image Sep 7, 2026, 01_17_00 PM.png<br>ChatGPT Image Sep 7, 2026, 01_19_41 PM.png<br>ChatGPT Image Sep 7, 2026, 01_19_59 PM.png<br>TradeOps Alerts & Incidents Dashboard.png | /incidents | IncidentsView |
| 11 | ChatGPT Image Sep 7, 2026, 01_18_02 PM (1).png | /orders | LiveOrders |
| 12 | ChatGPT Image Sep 7, 2026, 01_18_02 PM.png<br>TradeOps Live Order Monitoring Dashboard.png | /orders | LiveOrders |
| 13 | ChatGPT Image Sep 7, 2026, 01_18_11 PM.png<br>TradeOps Live Order Monitoring Dashboard(1).png | /orders | LiveOrders |
| 14 | ChatGPT Image Sep 7, 2026, 01_18_17 PM (1).png | Out of scope | Security operations product |
| 15 | ChatGPT Image Sep 7, 2026, 01_18_17 PM.png | Out of scope | Security operations product |
| 16 | ChatGPT Image Sep 7, 2026, 01_18_27 PM.png<br>TradeOps Trading Operations Dashboard.png | /dashboard | DashboardView |
| 17 | ChatGPT Image Sep 7, 2026, 01_18_36 PM (1).png<br>ChatGPT Image Sep 7, 2026, 01_18_36 PM (2).png | /orders | LiveOrders |
| 18 | ChatGPT Image Sep 7, 2026, 01_18_36 PM.png<br>TradeOps Live Orders Dashboard.png | /orders | LiveOrders |
| 19 | ChatGPT Image Sep 7, 2026, 01_18_41 PM.png | /trades, /sessions | Trader P&L unavailable; journal trades/session observations only |
| 20 | ChatGPT Image Sep 7, 2026, 01_18_45 PM (1).png | /positions | Positions page; requires RMS |
| 21 | ChatGPT Image Sep 7, 2026, 01_18_45 PM.png | /positions | Positions page; requires RMS |
| 22 | ChatGPT Image Sep 7, 2026, 01_18_51 PM.png<br>TradeOps Holdings Analytics Dashboard.png | /holdings | Holdings page; requires back office |
| 23 | ChatGPT Image Sep 7, 2026, 01_18_56 PM.png<br>ChatGPT Image Sep 7, 2026, 01_18_57 PM.png | /rejections | RejectionsView |
| 24 | ChatGPT Image Sep 7, 2026, 01_19_01 PM.png<br>TradeOps RCA Analysis Dashboard.png | /rca | RcaView |
| 25 | ChatGPT Image Sep 7, 2026, 01_19_13 PM.png | /exchange | ExchangeView; no authoritative uptime series |
| 26 | ChatGPT Image Sep 7, 2026, 01_19_20 PM.png<br>ChatGPT Image Sep 7, 2026, 01_19_21 PM.png<br>TradeOps User Sessions Dashboard.png | /sessions | SessionsView |
| 27 | ChatGPT Image Sep 7, 2026, 01_19_21 PM (1).png | /sessions | SessionsView |
| 28 | ChatGPT Image Sep 7, 2026, 01_19_28 PM.png<br>ChatGPT Image Sep 7, 2026, 01_19_46 PM.png<br>TradeOps Risk & Limits Dashboard.png | /risk | Risk page; exposure unavailable |
| 29 | ChatGPT Image Sep 7, 2026, 01_19_33 PM (1).png | /infra | Infrastructure page |
| 30 | ChatGPT Image Sep 7, 2026, 01_19_54 PM.png | /logs | Logs page; masked/allowlisted access |
| 31 | ChatGPT Image Sep 7, 2026, 01_20_08 PM.png | /configuration | Configuration page; read-only |
| 32 | ChatGPT Image Sep 7, 2026, 01_20_18 PM.png<br>TradeOps User Sessions Dashboard(1).png | /sessions | SessionsView |
| 33 | ChatGPT Image Sep 7, 2026, 01_20_35 PM.png | / | Landing page |
| 34 | ChatGPT Image Sep 8, 2026, 12_16_26 PM.png | Architecture reference | Kubernetes tenant isolation; not a route |
| 35 | INDMONEY TradOps Operations Dashboard.png | /dashboard, /order-latency, /queues, /data-quality | File-backed operations information architecture |
| 36 | LinkedEye APM Adapter Monitoring Dashboard.png | /exchange, /infra | ExchangeView; adapter process telemetry unavailable |
| 37 | LinkedEye APM Adapter Status Dashboard.png | /exchange, /infra | ExchangeView; adapter process telemetry unavailable |
| 38 | LinkedEye APM Trading Operations Dashboard.png | /exchange, /infra | ExchangeView; no retry execution actions |
| 39 | Mission Control Trading Operations Dashboard.png | /dashboard | DashboardView |
| 40 | Professional Order Book Trading Dashboard.png | /order-book | OrderBookView; no cancel button or invented depth |
| 41 | TradeOps Command Center Dashboard.png | /dashboard | DashboardView |
| 42 | TradeOps Real-Time Trading Dashboard.png | /dashboard | DashboardView |
| 43 | TradeOps Trading Operations Dashboard(1).png | /dashboard | DashboardView |
| 44 | WeCrew SecureOps Security Dashboard.png | Out of scope | AppSec/CSPM product |
| 45 | b6a18eab-88d2-474a-ae31-a5fcacec5e74.png | /exchange, /infra | ExchangeView; adapter telemetry unavailable |
