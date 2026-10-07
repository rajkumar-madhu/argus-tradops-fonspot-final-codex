# Calendar, queue, latency and order details update

Implemented on `release/uat-20261007`, preserving UAT tenant support. This feature update has not been deployed.

References: DEV `/calendar`, and the user-supplied repository files `messagequeue-dashboard.html` and `latency-dashboard.html`. Their operational controls and charts are implemented using the existing accessible Argus light palette and navigation.

The calendar adds day cards, tenant selection, masked account/exchange/service/date filters, previous/next windows, an accessible day dialog with timeline/rejections/incidents, historical order drill-downs, and authenticated CSV/XLSX export. Dashboard permission does not grant order evidence; source gaps and capped queries are explicit. Service categories are inferred from recorded rejection categories rather than an independent service inventory.

Latency adds IST session presets, measured p50/mean/max OMS charts, event volume and confirmation charts, toggles, accessible chart tables, segment cards/comparison, histogram and source interpretation. Queue monitoring adds the same session controls, combined and individual source charts, backlog statistics, related OMS/confirmation latency and segment breakdown. Queue depths are never summed across potential aliases; averages of per-message queue depths are intentionally replaced with backlog measurements. No correlation between an order and a queue record is inferred.

The existing Python daily importer writes MySQL analytics tables. The API uses a separate SELECT-only account; cached, bounded snapshots reuse the verified query contract. Environment configuration and optional setup SQL are documented in `DAILY_INGESTION.md`. Database analytics remain restricted to the existing default tenant; no shared records are exposed to other tenants. Original CSVs and trading systems are never modified by API requests.

Live Orders is renamed Order Details. Selecting an order opens an accessible pop-out showing masked evidence and its recorded lifecycle, with close, Escape and focus restoration.

Validation: 248 backend unit tests and 231 frontend tests passed; backend/frontend production image builds passed. An isolated MySQL 8.4 integration imported 20 synthetic latency records and 40 queue observations across two lines, then read them through a SELECT-only account and authenticated API. Repeated imports were checked for idempotence. Browser checks covered session filtering, queue charts, calendar evidence and order pop-out dismissal. No customer database connection or real-data import was performed.
