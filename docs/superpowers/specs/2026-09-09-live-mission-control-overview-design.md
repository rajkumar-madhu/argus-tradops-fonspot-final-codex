# Live Mission Control Overview — Design

Date: 2026-09-09  
Status: draft for review  
Product: Argus TradeOps (read-only Noren trading observability)

## Goal

Make the top of the product a **live trading operations monitor**, not a static briefing page. `/dashboard` becomes a TradesViz-style **multi all-in-one overview**: clear KPIs, a multi-mode live table, and a small set of essential charts — wired to the real live stack (Elasticsearch → collector → Redis → SSE) when available, and honest about snapshot/offline sources when not.

Inspiration (layout and clarity only): [TradesViz new multi overview](https://www.tradesviz.com/blog/new-overview-type-multi/). TradeOps does **not** become a PnL journal.

## Non-goals

- Marketing landing rewrite (`/`).
- Keycloak self-registration (“Registration not allowed” remains an IdP policy).
- Inventing positions, holdings, portfolio P&L, win %, profit factor, or trading calendars the journal/ES cannot prove.
- Cancel / modify / place orders (read-only invariant).
- Fake LIVE badges, synthetic ticks, or simulated stream age on journal/demo sources.
- Pixel-matching PNG mockups as the source of truth (code + live behaviour win).

## Constraints and invariants

- Read-only toward trading systems; ES credentials stay read-only.
- Three data sources remain: `elasticsearch` (live), `journal snapshot`, `demo`. Operator UI never renders the word “demo” (`LIVE` / `FILE-BASED` / `OFFLINE`).
- Only the collector polls ES on a loop; browser SSE reads Redis streams.
- Latency labels stay honest (`oms_latency` vs `journal_event_interval`).
- Existing permissions / `ROLE_ROUTES` parity; Overview stays on the routes operators already can see.

## Product promise

TradeOps’s primary desk job is **live, read-only monitoring** of orders, rejections, exchange/YEL connectivity, and (where configured) OMS latency / queue depth. Investigation routes (RCA, logs, infra) remain secondary.

## Shell: always-on live strip

**v1 scope:** Overview (`/dashboard`) and Live Orders (`/orders`). Other Shell routes can inherit later without blocking Overview.

| Element | Live (`elasticsearch`) | Journal / demo |
|---|---|---|
| Source badge | `LIVE` | `FILE-BASED` / `OFFLINE` |
| Stream health | Connected / degraded / disconnected from SSE or last collector publish | Hidden or “Snapshot — not a live feed” |
| Last update age | Age of last SSE/heartbeat or overview refresh | Snapshot window label only |
| Venue dots | Derived from exchange/YEL observations | Same when data exists; no invented health |

No market ticker of invented NIFTY/BANK/SENSEX quotes unless TrueData/Redis snapshot is actually configured and fresh.

## `/dashboard` → Mission Control (multi overview)

Layout top → bottom, TradesViz multi pattern adapted for ops:

### 1. Page head

- Title: **Mission Control**.
- Subtitle: short read-only ops line (orders / rejects / exchange), not marketing copy.
- Source badge + short meta line (window / journal range).
- Lookback / QueryWindow only when live ES path is active (unchanged rule).

### 2. KPI strip (essential, defined)

Five metrics only; each has a one-line definition in UI (tooltip or caption), TradesViz-style clarity:

| KPI | Definition |
|---|---|
| Total orders | Unique orders in the current observation set / lookback |
| Complete | Orders in complete status |
| Rejected | Unique rejected orders |
| Open / pending | Open + trigger-pending / pending counts |
| Reject rate | Rejected ÷ total (0% if total is 0) |

No win %, profit factor, closed/realized/unrealized PnL, or account value.

On live mode, KPIs refresh from SSE deltas and/or bounded refetch of overview; on snapshot, static for the loaded file.

### 3. Multi-table (primary surface)

One panel with tabs (navigation efficiency — fewer clicks to `/orders` / `/rejections`):

| Tab | Content |
|---|---|
| Live | Streaming / recent order events (reuse `LiveOrders` / orders stream patterns) |
| Open | Filtered open / pending |
| Rejected | Rejected rows / evidence-friendly columns |
| Complete | Completed fills |

Behaviour:

- **Live tab + elasticsearch:** subscribe via existing `openAuthenticatedEventSource` / `/api/stream/...`; pause control allowed; never advertise live stream on journal/demo.
- **Other tabs:** client filter of loaded rows and/or existing list APIs with status filters.
- Deep link: “Open full Live Orders →” to `/orders` with filters preserved where practical.
- Each tab may keep local UI state (columns density, page) without inventing a new persistence backend in v1 (session/`localStorage` acceptable).

### 4. Below-fold charts (two–three max)

Keep only essential, binned-from-real-rows charts:

1. Order flow trend (total / complete / rejected)
2. Status mix (donut)
3. Top rejection reasons if any rejects exist; otherwise exchange health (exactly one third panel)

Remove **desk briefing** as the above-the-fold hero. Secondary panels (sessions list, infra checklist, WAN charts) move below these three or remain on dedicated routes — do not restore a dense widget wall on Overview.

### 5. File source strip

Existing CSV/journal coverage strip may remain as a quiet secondary banner when file analytics are configured; it must not claim live freshness.

## Real live stack (required for `LIVE`)

Operators (or local env) must run:

- `TRADEOPS_DEMO_MODE=false`
- `TRADEOPS_JOURNAL_PRIMARY=false`
- Reachable Elasticsearch (read-only) + Redis + Postgres as required by API/workers
- Collector (leader-elected) publishing to Redis streams
- API serving SSE; frontend using runtime `API_URL` / `__TRADEOPS_CONFIG__`

File preview (`scripts/start-file-preview.sh`) keeps the **same layout** with `FILE-BASED` and no SSE subscription on Live tab.

## Nav / IA

- Desk → Overview (`/dashboard`) = this Mission Control multi overview.
- Desk → Live Orders (`/orders`) = full filter desk (unchanged role as deep workspace).
- Optional later: Overview mode dropdown (TradesViz-style) for alternate layouts — **out of v1**.

## Implementation sketch (not a plan)

Primary touch points expected in the follow-on plan:

- `frontend/components/DashboardView.tsx` — restructure to KPI → multi-table → charts
- `frontend/components/LiveOrders.tsx` / `lib/stream.ts` — reuse for Live tab
- `frontend/components/Shell.tsx` — live strip
- `frontend/app/dashboard/page.tsx` — data loading / client boundary as needed for SSE
- CSS in `frontend/app/globals.css` / dashboard theme — density and hierarchy only; preserve TradeOps tokens
- Tests: pure helpers for KPI defs / tab filters; frontend `node --test`; no fake live assertions on journal fixtures
- Docs: short note in AGENTS/CLAUDE or FILE_ANALYTICS only if operator start path changes

Backend changes only if SSE/overview contracts are insufficient; prefer reuse of existing stream kinds and order list filters.

## Success criteria

1. With live stack up, `/dashboard` shows `LIVE`, updating Live-tab rows and KPI/stream age within a few collector intervals.
2. With file preview, same layout, `FILE-BASED`, no live stream / pause affordance claiming a feed.
3. KPI definitions visible and match the table above.
4. Multi-table tabs switch without leaving Overview; full desk still at `/orders`.
5. No PnL / win-rate / cancel-order affordances added.
6. Existing unit tests pass; add coverage for new pure helpers.

## Open questions (resolved for v1)

| Question | Decision |
|---|---|
| PNG mockups as source of truth? | No — code + live behaviour |
| UX-only vs real live? | Real live when stack is up |
| TradesViz PnL stats? | No — ops KPIs only |
| Separate `/mission-control` route? | No — replace Overview content on `/dashboard` |
| Overview type dropdown? | Defer |

## Approval

Approved in conversation 2026-09-09 (multi overview + real live + product-top Mission Control). Awaiting review of this written spec before implementation planning.
