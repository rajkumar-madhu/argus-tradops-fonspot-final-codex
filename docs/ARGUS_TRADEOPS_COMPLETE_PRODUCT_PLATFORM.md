# Argus TradeOps

## Complete Product & Platform Document — Enterprise Production Baseline

**Noren OMS / Journal Observability, Correlation & Evidence**
Enterprise Production Baseline • Build-Ready • Standalone Product • Argus family

**Product positioning.** A standalone enterprise platform to know whether every Noren order was accepted, rejected, filled, delayed or never confirmed — with masked evidence, freshness honesty and no write path to trading systems.

| Document field  | Value                                                                                 |
| --------------- | ------------------------------------------------------------------------------------- |
| Product         | Argus TradeOps                                                                        |
| Family          | Argus (WeCrew Technology Solutions)                                                   |
| Version         | 2.1 — Enterprise Complete Baseline                                                    |
| Date            | 16 September 2026                                                                     |
| Classification  | Internal / customer solutioning — not a public API contract                           |
| Owner           | Product + Engineering (Argus TradeOps)                                                |
| Deployment      | Kubernetes, Docker Compose, VM; Elasticsearch + Redis + PostgreSQL                    |
| Audience        | Product, Engineering, Trading Ops, Risk, Infra/SRE, Auditor, Implementation, Security |
| Status          | Production product specification / shipped baseline                                   |
| Confidentiality | Internal / customer solutioning document                                              |

**Core promise.** TradeOps turns a Noren journal (and optional CSV latency/queue files) from opaque log volume into operational intelligence: **ingest → mask → correlate → investigate → prove — never place, cancel or modify an order.**

**North-star outcome.** For every important order an operator should answer five questions in seconds: Did it reach the exchange? What is its current status? Why was it rejected? How fresh is this view? What evidence can I show without exposing PAN, IP or client codes?

---

## Document control

| Item          | Details                                                                                                                                                                                                                  |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Purpose       | Define the complete product, technical platform, UX, APIs, data model, deployment, security, honesty contract and packaging for Argus TradeOps.                                                                          |
| Primary scope | Noren OMS journal (`ordupd`, `login`, `logout`, `yel_connected`), Elasticsearch `noren-*-intraday`, journal-file snapshot, CSV latency/queue analytics, derived incidents/RCA, Keycloak RBAC, multi-tenant data sources. |
| Out of scope  | Order placement / cancel / modify; P&L, MTM, turnover; general-purpose APM/SIEM; LinkedEye APM adapter control plane; WeCrew JobWatch; WeCrew SecureOps; AEGIS agent-trace products.                                     |
| Product model | Standalone read-only observability product. Sister Argus/AEGIS products remain separate; this document does not grant their screens or write actions.                                                                    |
| Honesty rule  | Failures are never zero. Missing evidence is `—` / `unavailable` / `DELAYED` / `OFFLINE`, never a green LIVE badge on demo or a silent fallback.                                                                         |
| Window rule   | Live pages mean **today’s IST orders** unless the operator picks a rolling lookback or a custom IST calendar date. A custom date is that day only — never a silent 7-day rollup.                                        |
| Intelligence  | Ranked ops findings are deterministic counts/rates from the loaded window. No rupees, no P&L, no external LLM.                                                                                                           |

### Change history

| Version | Date               | What changed                                                                                                                                 |
| ------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 2.0     | 15 September 2026  | Complete enterprise baseline: sources, RBAC, masking, k8s, honesty contract.                                                                 |
| 2.1     | 16 September 2026  | IST query windows; read-only ops coach; live-tenant first visit; UAT Harbor/kubectl operating path; sessions aligned to the dashboard window. |

---

## Table of contents

1. Executive Summary
2. Product Vision & Positioning
3. Problem Definition
4. Target Users & Personas
5. Supported Data Sources & Workloads
6. Product Modules (incl. Ops Coach)
7. Core Observability Model (incl. IST query windows)
8. Order Lifecycle & State Machine
9. Detection & Intelligence
10. Alerts & Incidents
11. RCA & Evidence
12. Remediation boundary (never)
13. User Experience & Screens
14. Platform Architecture
15. Data Architecture & Storage
16. Data Model
17. API & Event Contracts
18. Collectors & Integrations
19. Kubernetes Design
20. Local / VM Design
21. Multi-Tenancy & RBAC
22. Security & Compliance
23. Reliability, Scale & DR
24. Deployment Models
25. Observability of TradeOps
26. Reports, SLOs & Analytics
27. Commercial Packaging
28. Shipped Baseline & Release Plan
29. Test Strategy & Acceptance Criteria
30. Operating Model & Support
31. Future Roadmap
32. Product KPIs
33. Launch Checklist
34. Journal Discovery & Inventory
35. Trading Hours & Freshness Intelligence
36. Correlation & Business Process
37. Outcome Honesty & Data Quality
38. Monitoring-Path Reliability & Event Semantics
39. Configuration Drift
40. Safety Guardrails
41. Connector Framework
42. Security Hardening & Compliance Controls
43. Data Lifecycle, Privacy & Residency
44. Performance Engineering & Capacity Planning
45. Developer Experience
46. Entitlements & Licensing
47. Implementation, Migration & Onboarding
48. Operational Readiness & Support Runbooks
49. Accessibility, Localization & UX Quality
50. Requirements Traceability & Definition of Done
51. Final Production Acceptance Checklist
    Appendix A. Reference flows
    Appendix B. Sample APIs & events
    Appendix C. Suggested UI navigation

---

## 1. Executive Summary

Argus TradeOps is an enterprise **read-only** observability platform for a Noren trading journal. It answers what happened to orders, sessions and exchange connectivity using Elasticsearch (live), a mounted journal file (snapshot), or CSV latency/queue files — and it **never** sends an order to the OMS.

The product is intentionally focused. It does not replace a complete market-data terminal, RMS, back office or SIEM. It owns a difficult operational domain end-to-end: **Noren journal evidence**, with masking, freshness, correlation and role-gated dashboards.

| Capability             | TradeOps outcome                                                                             |
| ---------------------- | -------------------------------------------------------------------------------------------- |
| Inventory              | Unique orders (`NorenOrdNum`), venues, brokers, symbols from journal/ES.                     |
| Live monitoring        | **Today’s IST orders** by default; order list, rejections, YEL, sessions; SSE from Redis.    |
| Query window           | `today` / rolling `1h` `4h` `7d` `30d` / custom IST `YYYY-MM-DD` — that day only.            |
| Ops Coach              | Ranked findings (rejects, RMS, brokers, open/pending, YEL, sessions) from the loaded window. |
| Rejection intelligence | Category, masked reason, unique-order counts, P2 incident derivation.                        |
| Lifecycle / RCA        | Chronological `ordupd` events per order; persisted RCA cases.                                |
| Freshness              | LIVE / DELAYED / STALE / CLOSED / FILE-BASED / OFFLINE — never “demo”.                       |
| File analytics         | OMS latency CSV and queue-size CSVs as a separate, labelled path.                            |
| Evidence               | Allowlisted journal fields; PAN/IP/account masking; withheld free-text on bulk lists.        |
| Action                 | **None against the OMS.** Tenant admin writes are Keycloak-gated and cookie-refused.         |

---

## 2. Product Vision & Positioning

### 2.1 Vision

Make every Noren order, rejection and session **observable, explainable and auditable** across live Elasticsearch and file-based evidence — without ever becoming a trading system.

### 2.2 Brand

| Element           | Definition                                                                                                                                                                               |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Product name      | Argus TradeOps                                                                                                                                                                           |
| Descriptor        | Noren OMS Journal Observability & Reliability                                                                                                                                            |
| Family            | Argus                                                                                                                                                                                    |
| Primary tagline   | Every order. Watched, understood, proven.                                                                                                                                                |
| Secondary tagline | Know what the journal recorded. Know why it was rejected. Never touch the book.                                                                                                          |
| Design            | Charcoal rail; gold `--brand` for actions only; teal `--signal` for data; Instrument Serif titles; IBM Plex Mono figures. **No dark theme.** No cobalt/navy primary inside `.app-shell`. |

### 2.3 Product principles

1. **Read-only is the product.** There is no place, cancel, modify, retry-order or “create incident on the OMS” path.
2. **Evidence over decoration.** Positions, holdings, P&L, market depth and RMS limits are shown only when a real source establishes them; the journal does not.
3. **Failures are never zero.** A missing YEL event is `connected: null`, not a P1 disconnect. A missing count is `—`.
4. **Mask at the edge.** PII is excluded in ES `_source` and masked in the normalizer; the explorer never searches withheld text.
5. **One ES poller.** Only the leader-elected collector loops on Elasticsearch. Browsers subscribe to Redis SSE.
6. **Same product on SaaS-style k8s and on-prem.** Runtime `API_URL` is injected per request; one image, many environments.
7. **Today means IST today.** Live counts are the Asia/Kolkata calendar day unless the operator asks otherwise.
8. **Coach, do not hallucinate.** Ranked findings are arithmetic on the loaded window. No LLM, no rupees, no invented LIVE.

---

## 3. Problem Definition

Broker OMS desks depend on Noren journals that are huge, partially structured, and hostile to ad-hoc Kibana. Operators otherwise grep files, wait on screenshots, or trust a dashboard that mixed demo constants with live indices.

| Operational problem                          | Typical impact                    | TradeOps response                                                              |
| -------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------ |
| Order rejected, reason is a wall of RMS text | Slow desk response; PII in Slack  | Categorise, mask, group, link to lifecycle.                                    |
| Job “looks live” but ES is empty             | False confidence                  | Freshness + source badge; journal fallback stamped `DELAYED`.                  |
| Browser count multiplies ES load             | Cluster saturation on a busy desk | Collector → Redis Streams → SSE.                                               |
| `.keyword` vs keyword mapping                | Empty aggregations until restart  | Field-caps resolution; empty caps are not cached.                              |
| Wrong price scale (CDS vs equity)            | Fake prices in rupees             | Per-segment divisor; unverified segments stay `null`.                          |
| PAN / IP in explorer search                  | Compliance incident               | Allowlisted search fields; masked projection.                                  |
| No owner of a spike                          | Alert fatigue                     | Derived incidents keyed by fingerprint; RCA before count increment.            |
| Mixing file CSV with live ticks              | Wrong SLA story                   | FILE-BASED vs LIVE vocabulary; separate `/order-latency` and `/queue-monitor`. |
| “Live” silently means last 7 days            | Inflated unique-order counts      | Default IST today; custom date is that IST day only.                           |

---

## 4. Target Users & Personas

| Persona        | Primary goals                                                    | Key screens                                   | Keycloak role |
| -------------- | ---------------------------------------------------------------- | --------------------------------------------- | ------------- |
| Trading ops    | Orders, fills, rejections, sessions                              | Overview, Live Orders, Rejections, RCA, Logs  | `trading_ops` |
| Risk           | Rejection categories, positions/holdings when sourced, risk page | Overview, Rejections, RCA, Risk               | `risk`        |
| Infra / SRE    | YEL, sessions, logs, incidents, latency/queues                   | Exchange, Infra, Logs, Incidents, OMS Latency | `infra_sre`   |
| Auditor        | Evidence, reports, no trading actions                            | All read routes including Reports             | `auditor`     |
| Super admin    | Tenants, grants, configuration                                   | Clients, Configuration                        | `super_admin` |
| Implementation | Wire ES/journal/CSV, Keycloak, k8s                               | Config, Data Quality, docs                    | `super_admin` |

`infra_sre` can open `/logs` (`logs:read`) but **cannot** load `ordupd` rows without `orders:read`. That is intentional.

---

## 5. Supported Data Sources & Workloads

| Source                           | `source` field           | When                                                       | What it establishes                                                                          |
| -------------------------------- | ------------------------ | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Elasticsearch `noren-*-intraday` | `elasticsearch`          | Live cluster + read-only credentials                       | Orders, rejections, sessions, YEL as indexed.                                                |
| Journal snapshot                 | `journal snapshot`       | `TRADEOPS_JOURNAL_PATH` readable; primary or live fallback | Historical `ordupd` / login / logout / yel_connected from one file, loaded once per process. |
| CSV analytics                    | `csv snapshot`           | File analytics store                                       | OMS latency rows and queue sizes only.                                                       |
| Demo constants                   | `demo` (UI: **OFFLINE**) | `TRADEOPS_DEMO_MODE` — **refused in production**           | Fixture UI only. Never labelled “demo” in the operator UI.                                   |

**Noren message types (journal contract):** `ordupd`, `login`, `logout`, `yel_connected`.

**Venues observed in the sample journal:** NSE, NFO, BSE, BFO, CDS. Price divisors: 100 for NSE/BSE/NFO/BFO/MCX; 10⁷ for CDS; unverified segments unscaled.

**Optional:** TrueData WebSocket (market-data worker) → Redis snapshot → `/api/market-data`. Browsers never talk to TrueData.

**Not established by the journal:** authoritative positions, holdings, portfolio cost, P&L, RMS limits, infrastructure SNMP, Level-5 depth, SLA/MTTR history.

---

## 6. Product Modules

| Module                        | Purpose                                                          | Route / API                                          |
| ----------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------- |
| Mission Control               | Order counts, reject rate, exchanges, sessions, YEL, freshness   | `/dashboard` · `GET /api/overview`                   |
| Live Orders                   | Filterable unique-order list, lifecycle drawer                   | `/orders` · `/api/orders` · SSE `/api/stream/orders` |
| Journal Orders                | File-backed list; 503 if file missing — never demo               | `/orders?source=journal` · `/api/journal/orders`     |
| Order Book                    | Book-shaped view from available sources; **no cancel**           | `/order-book`                                        |
| Trades / Positions / Holdings | Counts and quantities only — **no money**                        | `/trades` `/positions` `/holdings`                   |
| Rejections                    | Groups, masked reasons, unique rejected orders                   | `/rejections` · `/api/rejections`                    |
| RCA                           | Per-order evidence + persisted cases                             | `/rca` · `/api/rca/*`                                |
| Market Data                   | Snapshot ticks if worker enabled                                 | `/market-data`                                       |
| Exchange Health               | YEL keys; lookback-aligned with overview                         | `/exchange` · `/api/exchanges` `/api/exchanges/yel`  |
| Users & Sessions              | Login success observations                                       | `/sessions`                                          |
| Risk & Limits                 | Only what sources establish                                      | `/risk`                                              |
| Infrastructure                | ELK/API/Redis/Postgres health                                    | `/infra`                                             |
| Journal Explorer              | Faceted masked rows, histogram, CSV export via same-origin proxy | `/logs` · `/api/journal/explore`                     |
| Alerts & Incidents            | Derived spikes + persisted incidents                             | `/incidents`                                         |
| Reports                       | Read-only report payload                                         | `/reports`                                           |
| OMS Latency                   | CSV latency analytics                                            | `/order-latency`                                     |
| Queue Monitor                 | CSV queue sizes                                                  | `/queue-monitor`                                     |
| Data Quality                  | Source reconciliation                                            | `/data-quality`                                      |
| Configuration                 | Read-only runtime config                                         | `/configuration`                                     |
| Clients                       | Tenant registry & grants (`super_admin`)                         | `/admin/tenants`                                     |

### 6.1 Packaging (suggested)

| Edition             | Included                                                                                              |
| ------------------- | ----------------------------------------------------------------------------------------------------- |
| TradeOps Essentials | Journal/ES orders, rejections, sessions, explorer, freshness, Keycloak.                               |
| TradeOps Pro        | SSE live path, collector + correlation, incidents/RCA persistence, file analytics, TrueData snapshot. |
| TradeOps Enterprise | Multi-tenant, HA manifests, audit-oriented auditor role, long retention via ES ILM, External Secrets. |

There is **no** “Autonomous trading add-on”. Remediation of the book is out of product.

### 6.2 Ops Coach (shipped)

The Overview desk briefing is a **read-only ops coach**: ranked findings from the loaded query window, inspired by journal-style coaching UIs but **not** a copy of P&L, strategy scoring or an external LLM.

| Rule                         | Behaviour                                                                                          |
| ---------------------------- | -------------------------------------------------------------------------------------------------- |
| Input                        | Unique-order totals, reject categories/groups, brokers above desk average, YEL, active sessions.   |
| Output                       | At most eight cards: `critical` / `watch` / `clear`, each with a deep-link.                        |
| Order                        | Rejects first, then RMS categories, non-RMS, rejection code, brokers, open/pending, YEL, sessions. |
| Money                        | **Forbidden.** Counts, unique-order rates and percentages only.                                    |
| LLM / third-party AI         | **Forbidden.** Deterministic TypeScript (`frontend/lib/desk-briefing.ts`).                         |
| Empty window                 | One `clear` card: “No exception signal in loaded observations” — **not** a live-health assertion.  |
| Missing YEL                  | No disconnect card unless a `yel_connected` observation exists and is disconnected.                |
| Sessions                     | “No active sessions” is a watch on the window, not a connectivity outage.                          |

Sessions on the dashboard use the same `lookback` / `day` query as overview (`GET /api/sessions?...`). Journal-source pages still do not subscribe to SSE.

---

## 7. Core Observability Model

```
Journal / ES / CSV
        │
        ▼
   Source arbiter (_with_data_source)
        │
        ├── elasticsearch (live)
        ├── journal snapshot (file, lru_cache)
        └── demo (import-time, non-production)
        │
        ▼
   Normalizer + mask
        │
        ▼
   Freshness classifier ── LIVE | DELAYED | STALE | CLOSED | FILE-BASED | OFFLINE
        │
        ▼
   Operator UI (never the word "demo")
```

### 7.1 Minimum order identity

| Field              | Required           | Notes                                                              |
| ------------------ | ------------------ | ------------------------------------------------------------------ |
| `NorenOrdNum`      | Yes                | Unique order; list `collapse` + cardinality `count` vs `returned`. |
| `OrdStatus`        | Yes                | Numeric; mapped in `normalizer.order_status()`.                    |
| `NorenTimeStamp_N` | Yes for event time | Not `@timestamp` (ingest time).                                    |
| `ExchSeg`          | For price scale    | Missing → unverified price.                                        |
| `RejReason`        | When rejected      | Masked after category/code derived.                                |

### 7.2 Query windows (shipped)

Live ES pages answer **“today’s orders in Asia/Kolkata”** unless the operator changes the window. Implementation: `backend/app/query_window.py` and `frontend/lib/query-window.ts`.

| Operator choice     | API                         | Interval                                                                 |
| ------------------- | --------------------------- | ------------------------------------------------------------------------ |
| Default / Today     | `day=<IST YYYY-MM-DD>`      | IST midnight → next IST midnight (half-open UTC `[gte, lt)`).            |
| Custom date         | `day=YYYY-MM-DD`            | That IST calendar day **only**. Not a 7-day lookback ending on that day. |
| Rolling             | `lookback=1h\|4h\|7d\|30d`  | Elasticsearch `now-{lookback}`. A leftover `day` on the form is ignored. |
| `lookback=today`    | resolved to today’s IST day | Wins over a stale `day` field.                                           |

`NorenTimeStamp_N` is the range field for orders/rejections/overview. A silent 7-day default is a **defect**: it inflated unique-order counts (e.g. ~872k over 7d vs ~36k since 09:15 IST on a live Finspot-ind desk).

Journal snapshots stay file-scoped; they do not pretend to be “today” when the file is a historical day.

Lifecycle and RCA routes still take a rolling `lookback` (default `30d`) so an order’s evidence is not truncated to today.

---

## 8. Order Lifecycle & State Machine

Documented `OrdStatus` codes (row and facet labels must match in backend `STATUS_LABELS` and `frontend/lib/journal-explore.ts`):

| Code          | Label           |
| ------------- | --------------- |
| 56, 65        | REJECTED        |
| 52            | CANCELLED       |
| 50            | COMPLETE        |
| 48            | OPEN            |
| 54            | TRIGGER_PENDING |
| 109, 110, 115 | PENDING         |

Undocumented codes **98** and **88** appear in the real journal. They are **untranslated**, never guessed.

```
NEW / PENDING → OPEN / TRIGGER_PENDING → COMPLETE
                              │
                              ├→ REJECTED (56/65)
                              └→ CANCELLED (52)
```

Lifecycle API: chronological `ordupd` for one `NorenOrdNum`. Truncation is declared when more than 500 events exist.

**Latency kinds (do not conflate):**

| `latency_kind`           | Meaning                                                                        |
| ------------------------ | ------------------------------------------------------------------------------ |
| `oms_latency`            | Measured OMS → exchange confirmation (CSV / dedicated feed).                   |
| `journal_event_interval` | Gap between Noren original and current event timestamps — **not** network RTT. |

OMS_STATUS labels on the latency CSV are **provisional** (`OMS_STATUS_MAPPING_CONFIRMED = false`).

---

## 9. Detection & Intelligence

| Detector               | Logic                                                             | Severity guidance                             |
| ---------------------- | ----------------------------------------------------------------- | --------------------------------------------- |
| Rejection spike        | Unique rejected orders in lookback ≥ 10                           | P2; ≥ 100 → P1 `REJECTION_SPIKE`              |
| YEL disconnected       | `yel_health().connected is False` (keys empty)                    | P1 `YEL_CONNECTIVITY`                         |
| YEL no evidence        | `connected is None`                                               | Data gap, **not** P1                          |
| Reject rate unmeasured | `_reject_rate` returns `None`                                     | Data gap                                      |
| Stale during session   | Newest event older than threshold inside `TRADEOPS_TRADING_HOURS` | STALE                                         |
| Quiet after hours      | Same quiet, outside session                                       | CLOSED                                        |
| Live→journal fallback  | Exception or demo-shaped live result                              | Payload `fallback`; badge DELAYED             |
| Inflated “today” count | Default lookback was rolling 7d                                   | Defect — must be IST calendar day             |
| Empty field_caps       | GET `_field_caps` with `fields: {}`                               | Bare field name, **not cached** as `.keyword` |
| Price unverified       | Unknown segment divisor                                           | `price` null; UI “raw · unverified scale”     |

P2 rejection categories consumed by the correlation worker must match `normalizer.rejection_category()` exactly: RMS / Margin, RMS / Circuit Limit, RMS / Freeze Qty, RMS / Risk Block, RMS / Holdings, RMS / Regulatory, Market State, Gateway / YEL, OMS / Order Rule, Cancellation, Exchange, Other.

---

## 10. Alerts & Incidents

TradeOps is **not** a general pager. Incidents are:

1. **Derived** (`/api/incidents/derived`) from rejection volume and YEL.
2. **Persisted** (`incidents` table) by the correlation worker, keyed by `sha256(type|key)` so retries do not inflate counts. RCA is built **before** incident upsert.

SSE kinds: `orders`, `rejections`, `exchange`, `incidents`, `rca`, `dlq`. Envelope: JSON under field `json` with `kind` / `published_at` / `payload`.

Non-default tenants do **not** get live SSE, persisted incident lists, or `/api/files/*` (collector/CSV are default-tenant only).

---

## 11. RCA & Evidence

| Input                 | Use                            |
| --------------------- | ------------------------------ |
| Order lifecycle       | Status, qty, price, timestamps |
| Masked `RejReason`    | After code/category extracted  |
| Exchange / YEL        | Gateway context                |
| Persisted `rca_cases` | Keyed by `order_id`            |

Bulk order lists use `evidence=false` at ≥ 1 000 rows so `journal_fields` (about half the bytes) are dropped unless the page renders them. List routes use `ListJSONResponse` (`json.dumps`) for large payloads.

Journal explorer `RejReason`: mask client codes, balances, shortfalls, holdings, PAN, phone, IP; keep circuit prices, freeze qty and bracketed product group. `OrdRemarks` / `FixRemarks` stay `[redacted]`.

---

## 12. Remediation boundary (never)

JobWatch-style auto-remediation **does not exist** here.

| Action                        | TradeOps                                                                  |
| ----------------------------- | ------------------------------------------------------------------------- |
| Place / cancel / modify order | Forbidden. No API. Mockups with Cancel Order are rejected.                |
| Retry CronJob / rerun batch   | N/A                                                                       |
| Create OMS incident           | Forbidden. “Create Incident” on AEGIS/Sentinel mockups is out of product. |
| Tenant create/update/grants   | Allowed for `super_admin` only, **Bearer + JSON body**, not cookie-only.  |

Elasticsearch credentials must remain **read-only**.

---

## 13. User Experience & Screens

### 13.1 Primary navigation

Rail groups (filtered by JWT roles):

- **Desk** — Overview, Live Orders, Order Book, Trades, Positions, Holdings
- **Investigate** — Rejections, RCA & Analysis
- **Coverage** — Market Data, Exchange Health, Users & Sessions, Risk & Limits
- **Platform** — Infrastructure, Logs Explorer, Alerts & Incidents, Reports, OMS Latency, Queue Monitor, Data Quality, Configuration, Clients

Ctrl+K command palette is **navigation only** (pages, order id → `/rca` or `/orders`, journal `q` → `/logs`). Every `NAV_GROUPS` route has `ROUTE_KEYWORDS`.

### 13.2 Screen inventory (shipped)

| Route                              | Establishes                                | Must not show                                |
| ---------------------------------- | ------------------------------------------ | -------------------------------------------- |
| `/` `/signin` `/signup`            | SSO truth                                  | Fake local-account form when OIDC is the IdP |
| `/dashboard`                       | Overview + IST window + ops coach + YEL    | Invented LIVE on file/demo; rupees; LLM copy |
| `/orders`                          | Unique orders, lifecycle                   | Unmasked PAN; money totals as P&L            |
| `/trades` `/positions` `/holdings` | Counts / qty / per-unit price when sourced | `money()` / `inr()` / MTM / turnover         |
| `/rejections`                      | Masked reasons, categories                 | Raw client codes                             |
| `/rca`                             | Evidence bundle                            | Guesses for codes 98/88                      |
| `/logs`                            | Masked explorer                            | Raw log search of PAN/IP on journal source   |
| `/order-latency` `/queue-monitor`  | CSV units as recorded                      | Claiming journal-event-interval is OMS RTT   |
| `/admin/tenants`                   | Registry/grants                            | Credential values in JSON                    |

### 13.3 Design tokens (non-negotiable)

- Text: `var(--ink)` / `var(--muted)`
- Warning fill: `--amber`; warning text: `--amber-ink` (amber fails WCAG as small text)
- Brand fill: `--brand`; brand text: `--brand-ink`
- 0 contrast failures at 1440px and 390px

### 13.4 Query window control

`QueryWindow` on Overview, Live Orders and Trades. Label shows **Today** or the selected IST date. Custom date uses a date picker; applying it sets `lookback=custom` and `day=YYYY-MM-DD`.

---

## 14. Platform Architecture

```
Noren Journal → Filebeat → Logstash (noren_filebeat.conf)
        → Elasticsearch noren-<msg_type>-intraday
        → collector (leader-elected; ONLY loop poller of ES)
        → Redis Streams
        → correlation worker (consumer group)
        → PostgreSQL incidents / rca_cases
        → FastAPI (Redis SSE; on-demand ES/journal)
        → Next.js 15 App Router
```

**Invariant:** do not add a second periodic ES poller.

### 14.1 Technology stack (shipped)

| Layer          | Choice                                                     |
| -------------- | ---------------------------------------------------------- |
| UI             | Next.js 15, React 19, hand-written CSS (`app/globals.css`) |
| API            | FastAPI, Python 3, `ListJSONResponse` for bulk lists       |
| Auth           | Keycloak RS256 JWT; PKCE code + cookie `tradeops_token`    |
| Search         | Elasticsearch 7.x compatible GET `_field_caps`             |
| Streams        | Redis Streams + consumer groups + DLQ                      |
| OLTP           | PostgreSQL (ON CONFLICT upserts)                           |
| Metrics        | Prometheus (`/metrics`; worker ports 9108–9110)            |
| File analytics | SQLite cache per replica (CSV)                             |
| Market         | Optional TrueData worker → Redis snapshot                  |

---

## 15. Data Architecture & Storage

| Store             | Holds                                                       | Notes                                                                                |
| ----------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Elasticsearch     | Journal events                                              | Read-only API keys; ILM 45-day example; `-history` unread.                           |
| Journal file      | Raw JSON lines                                              | `lru_cache`; ~4.6× file size RAM; do not point at 3.5 GB `Journal.log` at repo root. |
| Redis             | Streams, leader lease, market snapshot, dedupe fingerprints | SSE fan-out                                                                          |
| PostgreSQL        | `incidents`, `rca_cases`, `tenants`, `tenant_grants`        | Alembic; `AUTO_CREATE_SCHEMA=false`                                                  |
| SQLite (optional) | CSV analytics                                               | Not a live tick store                                                                |

Journal snapshot memory: 26 MB sample ≈ 92 MB RSS + ≈ 28 MB explorer index. Size API memory from the journal you actually mount.

---

## 16. Data Model (logical)

**Order (normalized):** `order_id` (`NorenOrdNum`), status, status_code, exchange, symbol, broker, user (masked), qty, price / price_raw / price_scale, reason (masked), code, rejection_category, timestamps, `journal_fields` (allowlist).

**Incident:** `fingerprint` sha256(`type|key`), severity, occurrence count, evidence JSON.

**RCA case:** keyed by `order_id`.

**Tenant:** id, ES URL via `credentials_ref` (files on disk, never in DB), journal path confinement, grants on username / email / `sub`.

**Event envelope:** `{ kind, published_at, payload }` in stream field `json`.

---

## 17. API & Event Contracts

All JSON list/detail payloads that read trading data include `source`. New endpoints must implement elasticsearch / journal / demo via `_with_data_source`.

### 17.1 Core REST (authenticated)

| Method         | Path                                              | Permission (typical)                                                     |
| -------------- | ------------------------------------------------- | ------------------------------------------------------------------------ |
| GET            | `/health` `/health/ready`                         | Unscoped; ready never leaks exception text                               |
| GET            | `/metrics`                                        | Unauthenticated on API port — **block at ingress**                       |
| GET            | `/api/auth/config` `/api/auth/me`                 | Session                                                                  |
| GET            | `/api/overview` `/api/freshness` `/api/config`    | dashboard; overview accepts `lookback` / `day`                           |
| GET            | `/api/orders` `/api/orders/{id}/lifecycle`        | `orders:read`; list accepts `lookback` / `day`                           |
| GET            | `/api/journal/orders` … `/lifecycle`              | `orders:read`; 503 if file missing                                       |
| GET            | `/api/journal/explore`                            | Per `msg_type` (`orders:read` / `sessions:read` / `exchange:read`)       |
| GET            | `/api/rejections`                                 | `rejections:read`                                                        |
| GET            | `/api/rca/order/{id}` `/api/rca/cases`            | `rca:read`                                                               |
| GET            | `/api/sessions` `/summary` `/login-trend`         | `sessions:read`; list/summary accept the same `lookback` / `day` window  |
| GET            | `/api/exchanges` `/api/exchanges/yel`             | `exchange:read`                                                          |
| GET            | `/api/stream/{orders,rejections,exchange,market}` | SSE; `?access_token=` fallback; 404 for non-default tenant on live kinds |
| GET            | `/api/files/*`                                    | File analytics; 503 off default tenant                                   |
| GET            | `/api/tenants`                                    | Caller’s grant list                                                      |
| GET/POST/PATCH | `/api/admin/tenants`…                             | `tenants:admin`; writes need header token + JSON                         |

403 `detail` is an object (`permission`, `granted_by`, `app_roles`, `client_id`) for admin-actionable UI.

### 17.2 Event envelope

```json
{
  "kind": "rejections",
  "published_at": "2026-09-15T03:30:00Z",
  "payload": {}
}
```

Collector publishes only when a JSON fingerprint at `tradeops:dedupe:*` changes.

---

## 18. Collectors & Integrations

| Component          | Role                                                    |
| ------------------ | ------------------------------------------------------- |
| Filebeat           | Tail journal; corrected `filebeat.noren.yml` in `elk/`  |
| Logstash           | `noren_filebeat.conf`; `document_id`; PII not indexed   |
| Collector worker   | Loop: live orders, rejection summary, YEL; leader lease |
| Correlation worker | RCA then incident upsert; DLQ after max attempts        |
| Market-data worker | Optional TrueData; Redis snapshot                       |
| Prometheus         | API + workers 9108 / 9109 / 9110                        |
| Keycloak           | OIDC                                                    |

**Do not** poll ES from the API on a timer. On-demand queries for lists/lifecycle/RCA are allowed.

---

## 19. Kubernetes Design

- Namespace hardcoded `tradeops` in base manifests; overlays `deploy/prod` and `deploy/uat` set namespace + image **digests**.
- `RELEASE_REQUIRED` tag fails pull if digest forgotten.
- Restricted security context: non-root 10001, drop ALL caps, read-only root, RuntimeDefault seccomp.
- PDB `minAvailable: 1`; HPA on API only (leader-elected workers are standbys).
- Topology spread.
- `preStop sleep 5`; uvicorn drain 20s (SSE never ends on its own).
- Migrate Job before each rollout; `ttlSecondsAfterFinished`.
- Optional Secret `tradeops-tenant-secrets` mounted at `/etc/tradeops/tenant-secrets` (`defaultMode` 288).
- NetworkPolicy starter: replace `192.0.2.x` placeholders before default-deny.
- SSE: disable proxy response buffering (`X-Accel-Buffering: no` already set); long idle timeout.

---

## 20. Local / VM Design

```bash
./start-local.sh          # API :8001, UI :3000
docker compose up --build
./scripts/dev-preview.sh start   # mock API :8101, UI :3100
./scripts/start-file-preview.sh  # file console :3102 / :8102
```

`AUTH_DISABLED=true` and `TRADEOPS_DEMO_MODE=true` are **local-only**. Production startup refuses both when `TRADEOPS_ENV=production`.

`NEXT_PUBLIC_*` is build-time. Pods inject `window.__TRADEOPS_CONFIG__` from `API_URL`. Server components may use `INTERNAL_API_URL`.

---

## 21. Multi-Tenancy & RBAC

**Tenant** = ES cluster and/or journal file + grants. Unset `TRADEOPS_MULTI_TENANT` → implicit tenant `default`. Enabling the flag **refuses** demo mode.

- Bind (async): `X-TradeOps-Tenant` → `?tenant=` → cookie `tradeops_tenant`.
- Caches and ES clients key on `tenancy.current_id()`.
- Credentials: files `<TRADEOPS_TENANT_SECRETS_DIR>/<ref>.es_api_key` (or username/password). Never in Postgres or admin JSON.
- Production: keep flag false until `tenant_grants` includes Lemonn operators for `default`. Missing secrets dir refused when flag is on in production.
- `/health` and `/metrics` always `default`.

**First visit.** `switcherModel` adopts a **live Elasticsearch** tenant when the cookie is missing or not in the grant list. An explicit cookie for a journal-primary tenant (`default` / Lemonn) is left alone. The API can only fall back to `default`; the browser must store the adopted id once so Finspot-ind operators see today’s ES orders rather than the June 30 file.

Typical UAT pairing:

| Tenant id      | Data                         | First-visit behaviour                          |
| -------------- | ---------------------------- | ---------------------------------------------- |
| `finspot-ind`  | Live ES (Noren intraday)     | Preferred when no valid cookie                 |
| `default`      | Journal-primary historical   | Kept if the operator already selected it       |

Non-default tenants still do not get collector SSE, persisted incidents/RCA lists, or `/api/files/*`.

### Roles → permissions (shipped)

| Role          | Permissions                                                                                                                                 |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `super_admin` | `*`                                                                                                                                         |
| `trading_ops` | dashboard, orders, trades, positions, holdings, rejections, rca, market, exchange, sessions, logs, latency                                  |
| `risk`        | dashboard, positions, holdings, rejections, rca, risk, market                                                                               |
| `infra_sre`   | dashboard, exchange, infra, logs, incidents, rca, sessions, latency                                                                         |
| `auditor`     | dashboard, orders, trades, positions, holdings, rejections, rca, market, exchange, sessions, risk, infra, logs, incidents, reports, latency |

Frontend `ROLE_ROUTES` must stay in parity (`tests/test_auth.py`).

---

## 22. Security & Compliance

- Read-only ES.
- Mask: `mask_account`, `mask_id`, `mask_ip`, `mask_reason` + `_source.excludes`.
- Order search: `simple_query_string` on an allowlist (no `PanNum` probing).
- JWT from header, cookie, or SSE query param; uvicorn `--no-access-log`.
- CORS: explicit origins, fail closed on wildcards.
- 401 → sign-in; 403 → permission page (status preserved); verification outage → 503 without clearing session.
- Return path after login restricted to application routes.
- Prometheus `/metrics` not public.
- Readiness checks never return exception strings (connection strings leak).

---

## 23. Reliability, Scale & DR

| Topic       | Baseline                                                                             |
| ----------- | ------------------------------------------------------------------------------------ |
| Collector   | Multi-replica; one lease holder polls ES                                             |
| Correlation | Horizontal via consumer group; pending reclaim; DLQ                                  |
| API         | HPA; list serialisation tuned for 10k-row orders                                     |
| SSE         | Buffering off; idle timeout; replica reconnect                                       |
| Postgres    | Backup/restore is the incident/RCA durability story; Redis is not enough             |
| Journal RAM | Size limit to mounted file; 3.5 GB journal needs ~16 GB class                        |
| DR          | Rebuild from ES + journal file + Postgres dump; Redis streams rebuild from collector |

Compose `k8s/data-services.yaml` is **not** production HA. Use CloudNativePG / Redis HA references or managed services.

---

## 24. Deployment Models

| Model                 | Use                                                        |
| --------------------- | ---------------------------------------------------------- |
| Docker Compose        | Local / UAT convenience                                    |
| Kubernetes + overlays | UAT (`deploy/uat`) and prod (`deploy/prod`)                |
| Manual Harbor + kubectl | Current Finspot UAT path when GitOps source is missing   |
| File-preview scripts  | Isolated CSV/journal console without mixing `.next` caches |

Images: `your-registry/tradeops-backend` / frontend placeholders until digest-pinned.

### 24.1 UAT operating path (Finspot)

Argo/GitOps against `finspot-prod-devops` has been **404 / Unknown**. Until that source exists, UAT is a **manual** roll:

| Item        | Value                                                                                          |
| ----------- | ---------------------------------------------------------------------------------------------- |
| Registry    | `harbor.finspot.in/common-application/tradeops-{backend,frontend}`                             |
| Tag         | `uat-YYYYMMDD-<gitsha>-r1` (example: `uat-20260915-bd61e96-r1`)                                |
| Cluster     | kube context `fs-prod-cp-ps`                                                                   |
| Namespace   | `argus-tradeops-uat`                                                                           |
| Default     | Journal-primary Lemonn file                                                                    |
| Live desk   | Tenant `finspot-ind` (read-only ES)                                                            |

Do not claim GitOps as the production promotion path until the repository and Argo application exist. Overlay image placeholders remain `RELEASE_REQUIRED` until a digest is set.

---

## 25. Observability of TradeOps

| Signal                     | Where                                                                                                     |
| -------------------------- | --------------------------------------------------------------------------------------------------------- |
| API RPS / latency / status | `/metrics` labelled by **route template** (`_metrics_path`), never raw URLs (cardinality + order-id leak) |
| Collector runs             | `tradeops_collector_runs_total` — alert if not increasing                                                 |
| Stream pending             | `tradeops_redis_stream_pending`                                                                           |
| DLQ                        | DLQ growth                                                                                                |
| Leadership                 | Lease holder                                                                                              |
| Worker liveness            | Metrics port (process up ≠ loop healthy)                                                                  |
| Structured logs            | One JSON object per line                                                                                  |

---

## 26. Reports, SLOs & Analytics

Shipped `/reports` is a read model, not a GIPS performance engine.

**Suggested operational SLOs (desk):**

- Freshness LIVE during session when ES is the source and events exist.
- Reject rate displayed only when measured.
- Explorer export goes through same-origin proxy (token cookie).
- File analytics units remain source units until the producer confirms (September latency unit unverified).

---

## 27. Commercial Packaging

Positioned as **OMS observability for Noren desks** (Lemonn / Finspot-class). Entry: journal file + Keycloak. Expansion: live ES, SSE, IST-today operations, ops coach, multi-tenant, TrueData snapshot, CSV latency.

Do not sell “full RMS”, “P&L blotter”, or “order gateway”. Those claims are false.

---

## 28. Shipped Baseline & Release Plan

### Shipped (this repository)

- Three-source arbiter, masking, field map, list performance
- Collector / correlation / optional market worker
- Keycloak RBAC + middleware
- Multi-tenant registry (flag off in prod ConfigMap; UAT can enable with grants)
- Live-tenant first visit (prefer ES tenant when cookie missing)
- IST-today query window; custom calendar day isolation
- Read-only ops coach on Overview (counts/rates only)
- Sessions API aligned to the dashboard window
- File analytics
- Argus light UI, no dark theme
- k8s hardening manifests
- Manual UAT Harbor tags when GitOps is unavailable

### Next (product, not promises in this binary)

- Confirmed OMS_STATUS map for latency CSV
- Positions/holdings when an RMS/back-office read API exists
- Non-default tenant SSE/RCA if a customer funds per-tenant collectors
- Digest-pinned UAT/prod images via GitOps once the source repo exists
- Restore Argo sync for `argus-tradeops-uat` when `finspot-prod-devops` is valid

---

## 29. Test Strategy & Acceptance Criteria

| Layer                  | How                                                                                            |
| ---------------------- | ---------------------------------------------------------------------------------------------- |
| Backend                | `cd backend && python -m unittest tests/test_*.py` (not `discover` — `tests` is not a package) |
| Frontend               | `cd frontend && npm test` (`lib/` helpers + layout assertions)                                 |
| Types                  | `npx tsc --noEmit` (no ESLint in frontend)                                                     |
| Auth parity            | `tests/test_auth.py` vs `ROLE_ROUTES`                                                          |
| No money on flow pages | `tests/no-money-on-flow-pages.test.mjs`                                                        |
| Query windows          | `tests/test_query_window.py`; `frontend/tests/query-window.test.mjs`                           |
| Ops coach              | `frontend/tests/dashboard-data.test.mjs` (rank, RMS, sessions, no rupees)                      |
| List payload size      | `tests/list-payloads.test.mjs` (`evidence=false` at ≥1000 rows)                                |
| Field caps cache       | `tests/test_field_resolution.py`                                                               |
| Live source            | `python3 scripts/verify-live-data.py`                                                          |
| UI runtime             | `python3 scripts/test-runtime-ui.py`                                                           |

UI behaviour beyond helpers is **not** in unit tests; exercise pages.

### 29.1 Production acceptance (must)

- `TRADEOPS_ENV=production` refuses demo and `AUTH_DISABLED`.
- ES keys read-only.
- No Cancel Order / place order.
- Freshness never LIVE on journal fallback.
- Live default window is IST today; a custom `day` is that IST date only.
- Ops coach shows no rupees and no LLM copy.
- Images digest-pinned.
- `/metrics` not on public ingress.

---

## 30. Operating Model & Support

| Function | Owns                                                                                                   |
| -------- | ------------------------------------------------------------------------------------------------------ |
| Desk     | Trading ops on orders/rejections; IST window and ops-coach cards                                       |
| Platform | SRE on collector lease, ES, Redis, Keycloak, Harbor rolls                                              |
| Security | Masking, grants, secrets dir                                                                           |
| Vendor   | WeCrew / Finspot implementation for UAT GitOps boundary (see `docs/LOGIN_INVESTIGATION_2026-09-13.md`) |

---

## 31. Future Roadmap

| Horizon | Item                                            | Constraint                          |
| ------- | ----------------------------------------------- | ----------------------------------- |
| Near    | Confirmed latency status map                    | Do not guess                        |
| Near    | Tenant-secrets operational runbook in each site | Flag stays false until grants exist |
| Near    | GitOps source for UAT/prod overlays             | Do not fake Argo while 404          |
| Mid     | RMS-sourced positions                           | Separate connector; still read-only |
| Mid     | Per-tenant collectors                           | New leadership keys; cost           |
| Out     | Write path to OMS                               | **Never**                           |
| Out     | Dark theme                                      | Contrast failed; removed            |
| Out     | External LLM desk coach                         | Deterministic counts only           |

---

## 32. Product KPIs

| KPI                                   | Intent                                                 |
| ------------------------------------- | ------------------------------------------------------ |
| Time-to-evidence for a rejected order | Lifecycle + masked reason in one click                 |
| Time-to-today’s desk picture          | Overview on IST today without a 7d rollup              |
| False LIVE rate                       | Must be ~0 (freshness tests)                           |
| ES QPS from UI                        | Must not scale with browser count                      |
| Masking incidents                     | Zero PAN/IP in explorer/export                         |
| Empty aggregation incidents           | Field-caps cache must not pin `.keyword` on empty caps |
| DLQ depth                             | Poison journal/ES messages isolated                    |

---

## 33. Launch Checklist

- [ ] Keycloak client, roles, redirect URIs, JWKS reachable (User-Agent `TradeOps-Observability/1.1`)
- [ ] `CORS_ORIGINS` explicit
- [ ] ES URL + read-only key
- [ ] Redis + Postgres HA or accepted risk
- [ ] Alembic migrate Job
- [ ] Digest-pinned images
- [ ] Ingress SSE timeouts / buffering
- [ ] `/metrics` blocked externally
- [ ] Journal path sized for RAM **or** unset
- [ ] `TRADEOPS_MULTI_TENANT=false` until grants
- [ ] NetworkPolicy CIDRs real
- [ ] Trading hours / fresh-live seconds set for the desk timezone
- [ ] Default live window is IST today; operators know how to pick a date
- [ ] Filebeat/Logstash corrected pipeline (`elk/`) if this cluster still has the four P0 defects

---

## 34. Journal Discovery & Inventory

Sample `Journal.log` (reference, 26 MB): 18,675 valid JSON lines — `ordupd` 18,504, `login` 149, `logout` 14, `yel_connected` 8; 7,592 unique orders; timestamps 2026-06-30 03:44–03:53 UTC. Historical evidence, not a live feed.

`Journal_Converted.xlsx` is corrupt as supplied; use the raw journal.

Explorer facets: never masked/withheld fields. `q` searches `SEARCH_FIELDS` only. Histogram split `by` on `LEVEL_FIELDS` (`OrdStatus` / `ReqStatus`), which must also be facet fields.

---

## 35. Trading Hours & Freshness Intelligence

`/api/freshness` (`app/freshness.py`) + `freshnessBadge()`:

| State      | Meaning                                           |
| ---------- | ------------------------------------------------- |
| LIVE       | Newest event within `TRADEOPS_FRESH_LIVE_SECONDS` |
| DELAYED    | Behind live threshold, or live→journal fallback   |
| STALE      | Quiet **during** trading hours                    |
| CLOSED     | Quiet **outside** `TRADEOPS_TRADING_HOURS`        |
| FILE-BASED | Journal or CSV snapshot                           |
| OFFLINE    | No source / demo / disconnected                   |

Query window and freshness are independent: a FILE-BASED journal for 2026-06-30 is still FILE-BASED if the operator picks that date; LIVE requires a fresh ES event inside `TRADEOPS_FRESH_LIVE_SECONDS`, not merely “today” on the control.

---

## 36. Correlation & Business Process

Correlation worker consumes `rejections` and `exchange` streams. Builds RCA **before** incident upsert. Fingerprint prevents double-count on retry.

Order identity is `NorenOrdNum` throughout. Collapse on list queries so `count` (unique) ≠ `returned` (rows).

---

## 37. Outcome Honesty & Data Quality

| Claim              | Allowed when                                            |
| ------------------ | ------------------------------------------------------- |
| “LIVE”             | Fresh ES (or equivalent) within threshold, not fallback |
| Rupee price        | Segment has established divisor                         |
| Rupee value        | qty × price × `value_multiplier` (null on CDS)          |
| Position / holding | Not from journal alone                                  |
| YEL down           | Keys present and empty — not missing index              |
| OMS latency        | Latency dataset, labelled `oms_latency`                 |

Data Quality page reconciles file sources; missing feeds are unavailable, not zero.

---

## 38. Monitoring-Path Reliability & Event Semantics

- Event time: `NorenTimeStamp_N`.
- `@timestamp`: ingest; sort for `yel_connected`.
- Collector interval: `COLLECTOR_INTERVAL_SECONDS`; sleep via `shutdown.wait()`, never `time.sleep()`.
- Dedupe: skip identical fingerprints.
- SSE: `openAuthenticatedEventSource`; journal pages do not subscribe.

---

## 39. Configuration Drift

`/configuration` is read-only. Settings dataclass is frozen at import; env changes need restart.

Index template `elk/noren-index-template.json` applies to **new** indices only. Do not mutate production mappings in place.

---

## 40. Safety Guardrails

1. No OMS write client in the repo.
2. ES credentials read-only.
3. Admin tenant writes: header token + JSON (`header_token_required`).
4. Journal path for non-default tenants must resolve inside `TRADEOPS_TENANT_JOURNAL_DIR`.
5. `scripts/auth-fixture.py` is loopback-only; never deploy.
6. Mockups lose to the read-only invariant.

---

## 41. Connector Framework

| Tier        | Connector               | Status                     |
| ----------- | ----------------------- | -------------------------- |
| Core        | Elasticsearch Noren     | Shipped                    |
| Core        | Journal file            | Shipped                    |
| Core        | CSV latency/queues      | Shipped                    |
| Optional    | TrueData                | Shipped behind flag        |
| Optional    | Prometheus queries      | Infra page; empty if unset |
| Not product | OMS order API           | Forbidden                  |
| Future      | RMS / back office reads | Separate, still read-only  |

---

## 42. Security Hardening & Compliance Controls

See §22 and `PRODUCTION_HARDENING.md`. Threat notes:

| Abuse                         | Control                           |
| ----------------------------- | --------------------------------- |
| Order-id in Prometheus labels | `_metrics_path()` templates       |
| PAN search                    | Allowlisted `simple_query_string` |
| Cookie CSRF on tenant writes  | Header-only writes                |
| Token in access logs          | `--no-access-log` pinned by test  |
| Demo in production            | Startup refuse                    |

---

## 43. Data Lifecycle, Privacy & Residency

- ES ILM example: daily rollover, 45-day delete.
- Journal snapshot is process memory, not a second warehouse.
- CSV cache is replica-local.
- Masking is the privacy control; residency follows where ES/Postgres/journal are deployed (on-prem for sovereign desks).
- Tenant secrets are files, not rows.

---

## 44. Performance Engineering & Capacity Planning

| Path          | Note                                                    |
| ------------- | ------------------------------------------------------- |
| `/api/orders` | `ListJSONResponse`; `evidence=false` on large lists     |
| Field caps    | Cache successes only; empty GET must not pin `.keyword` |
| Sessions      | TTL cache; active_sessions scan capped                  |
| Rejections    | `max_orders` for UI; collector passes `None`            |
| Explorer      | Inverted index on already-masked projections            |
| Frontend      | No state library; server `getJSON` + client SSE         |

Load tests should include 10k-row order lists on a CPU-capped API pod (the original regression).

---

## 45. Developer Experience

- Runtime config: `window.__TRADEOPS_CONFIG__`
- `getJSON` / `lib/api-result.ts` for `{_error}`
- Same-origin export proxy for journal CSV
- `ds-entry.tsx` exports presentational components only (no `next/navigation` / stream)
- Docs: `NOREN_FIELD_MAP.md`, `docs/JOURNAL_DATA_CONTRACT.md`, `EVENT_BUS_ARCHITECTURE.md`, `docs/FILE_ANALYTICS.md`

No public SDK for order entry (there is no order entry).

---

## 46. Entitlements & Licensing

Entitlement is Keycloak role + optional `tenant_grants`. Super admin sees every tenant. File analytics and live SSE are default-tenant features in the current build.

---

## 47. Implementation, Migration & Onboarding

1. Local Compose with demo/auth-disabled **or** journal primary.
2. Point ES at a read-only key; verify `scripts/verify-live-data.py`.
3. Keycloak; disable `AUTH_DISABLED`.
4. Correct Filebeat/Logstash if ingest is still the supplied defective pair.
5. k8s: secrets, migrate, pin digests, SSE ingress.
6. Multi-tenant only after grants and secrets mount.

UAT GitOps ownership is external; see login investigation doc.

---

## 48. Operational Readiness & Support Runbooks

| Symptom                                  | Check                                                       |
| ---------------------------------------- | ----------------------------------------------------------- |
| Empty overview aggregations after deploy | Field-caps cache / mapping; restart after empty-caps bugfix |
| LIVE on a file                           | Bug — should be FILE-BASED or DELAYED                       |
| 403 with orders hidden on /logs          | Expected for `infra_sre`                                    |
| SSE 401                                  | Cookie / `access_token`; no access logs                     |
| Collector silent                         | Leadership metric; ES; interval vs SIGTERM                  |
| API OOM                                  | Journal file too large                                      |
| CDS prices in millions                   | Divisor not applied                                         |
| Unique orders look like a week of flow   | Window is 7d — switch to Today / pick an IST date           |

---

## 49. Accessibility, Localization & UX Quality

- WCAG AA for text: use `--*-ink` tokens, not fill colours.
- Light theme only.
- Times on order table labelled IST.
- Copy: never “demo”.
- Localization: English operator UI in this baseline; no i18n framework shipped.

---

## 50. Requirements Traceability & Definition of Done

| ID    | Requirement                               | Evidence                           |
| ----- | ----------------------------------------- | ---------------------------------- |
| TO-1  | No OMS writes                             | Architecture; no order endpoints   |
| TO-2  | Three sources + `source` field            | `_with_data_source`; `/api/config` |
| TO-3  | Masking                                   | normalizer + explorer tests        |
| TO-4  | Sole ES loop poller                       | collector; regression test         |
| TO-5  | Role/route parity                         | `test_auth.py`                     |
| TO-6  | No money on positions/trades              | frontend test                      |
| TO-7  | Freshness vocabulary                      | `data-source.ts` / freshness tests |
| TO-8  | Empty field_caps not cached as `.keyword` | `test_field_resolution.py`         |
| TO-9  | Production refuses demo/auth bypass       | config tests                       |
| TO-10 | Tenant writes not cookie-only             | tenancy tests                      |
| TO-11 | Live default = IST today; custom day only | `query_window` + frontend tests    |
| TO-12 | Ops coach: counts only, no rupees/LLM     | `desk-briefing` + dashboard tests  |
| TO-13 | First visit prefers live ES tenant        | `switcherModel` tenant tests       |

### 50.1 Definition of done — every production feature

- Handles elasticsearch, journal, and demo/fallback honestly
- Permission mirrored in `ROLE_ROUTES`
- No PII in new fields without mask + exclude
- Metrics labelled by template
- Tests or an explicit “UI-only, exercise manually” note

---

## 51. Final Production Acceptance Checklist

- [ ] Read-only ES credentials verified
- [ ] Production env refuses demo and auth bypass
- [ ] Images pinned by digest
- [ ] Migrate Job succeeded
- [ ] Freshness correct on live, delayed, file, closed
- [ ] Rejection masking sampled
- [ ] SSE works through ingress
- [ ] `/metrics` internal only
- [ ] No cancel/place in UI
- [ ] Field-caps empty-index behaviour verified (bare field, retry)
- [ ] Journal RAM sized
- [ ] Keycloak roles mapped
- [ ] Backup/restore of Postgres rehearsed
- [ ] Live Overview is IST today (not a silent 7d)
- [ ] Custom date shows that IST day only
- [ ] Ops coach sampled: no rupees, no “AI” vendor copy

---

## Appendix A. Reference flows

**Live desk, today.** Tenant `finspot-ind` → Overview `day=<IST today>` → ops coach cards → Live Orders for the same window → SSE while source is elasticsearch.

**Custom date.** QueryWindow custom → `day=YYYY-MM-DD` → that IST day only (not 7d).

**Rejected order.** Overview reject rate (or `—`) → Rejections group → order id → lifecycle + RCA → masked reason → optional journal explorer on `ordupd`.

**Missing YEL.** Exchange Health → `connected: null` → data gap, not AUTO-YEL-DOWN.

**File desk.** FILE-BASED badge → `/orders?source=journal` without SSE → latency/queues on CSV pages.

**Live desk.** Collector lease → Redis publish on fingerprint change → browser EventSource.

---

## Appendix B. Sample APIs & events

`GET /api/orders?size=100&evidence=false&day=2026-09-16`

```json
{
  "items": [{ "order_id": "…", "status": "REJECTED", "source": "elasticsearch" }],
  "count": 36000,
  "returned": 100,
  "source": "elasticsearch"
}
```

Omit `day` and the API still resolves to **IST today**. `lookback=7d` is an explicit operator choice, not the default.

`GET /health/ready` — bounded 2s checks; demo mode ready immediately; no exception text.

---

## Appendix C. Suggested UI navigation

Desk → Investigate → Coverage → Platform, as `NAV_GROUPS`. Command palette for power users. Tenant switcher prefers a live ES tenant on first visit; an explicit journal-tenant cookie is not overwritten.

---

## Related engineering docs

| Doc                             | Role                                 |
| ------------------------------- | ------------------------------------ |
| `AGENTS.md` / `CLAUDE.md`       | Implementation invariants            |
| `NOREN_FIELD_MAP.md`            | Field translation and price evidence |
| `docs/JOURNAL_DATA_CONTRACT.md` | What the journal proves              |
| `EVENT_BUS_ARCHITECTURE.md`     | Streams and safety                   |
| `PRODUCTION_HARDENING.md`       | k8s / HA / multi-tenant enablement   |
| `docs/FILE_ANALYTICS.md`        | CSV path                             |
| `docs/REFERENCE_COVERAGE.md`    | Mockups vs product identity          |
| `elk/README.md`                 | Filebeat/Logstash P0 corrections     |

---

_Argus TradeOps v2.1 — Enterprise Complete Baseline. Read-only Noren observability. 16 September 2026._
