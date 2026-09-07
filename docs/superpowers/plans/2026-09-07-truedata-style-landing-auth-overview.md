# TradeOps UI refresh (landing, auth, overview) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `/`, `/signin`, `/signup`, `/dashboard` and the shared app top bar to match the mockups in `images ref/` with a TrueData-style landing structure.

**Architecture:** Next.js App Router pages stay server components where they are today; new presentational components (`MarketTicker`, `LandingPreview`, `KpiCard`, SVG charts) are pure and dependency-free; one new client component (`OverviewOrders`) handles client-side filtering and paging of rows the server already fetched. All styling is appended to `app/globals.css` as new sections; the old landing/auth CSS section is replaced.

**Tech Stack:** Next.js 15.2, React 19, TypeScript 5.7, lucide-react icons, hand-written CSS. Backend runs in demo mode (`TRADEOPS_DEMO_MODE=true`, `AUTH_DISABLED=true`) for verification.

Spec: `docs/superpowers/specs/2026-09-07-truedata-style-landing-auth-overview-design.md`

Verification loop used by every task (no test suite exists):

```bash
cd frontend && npx tsc --noEmit -p tsconfig.json
```

Expected: no output (clean). Then visual check at http://localhost:3100 (see `.claude/launch.json`: `frontend` + `mock-api`).

---

## File map

| File | Responsibility |
| --- | --- |
| `frontend/components/MarketTicker.tsx` | New. Static index ticker, `strip` and `bar` variants. |
| `frontend/components/LandingPreview.tsx` | New. CSS-built dashboard preview card for the hero. |
| `frontend/components/Charts.tsx` | Add `AreaChart`, `Donut`, `HBarList`, `MiniBars`; keep existing exports. |
| `frontend/components/UI.tsx` | Add `KpiCard`. |
| `frontend/components/Shell.tsx` | New top bar (ticker, clock, search, bell, profile). Sidebar unchanged. |
| `frontend/components/AuthShell.tsx` | Rebuilt split layout with ticker strip. |
| `frontend/components/OverviewOrders.tsx` | New client component: filter bar + paged table for the dashboard. |
| `frontend/app/page.tsx` | Landing page rewrite. |
| `frontend/app/signin/page.tsx` | Restyled card, same Keycloak logic. |
| `frontend/app/signup/page.tsx` | Restyled form, Keycloak registration redirect. |
| `frontend/app/dashboard/page.tsx` | Overview rewrite. |
| `frontend/lib/oidc.ts` | Add `registrationUrl()` helper. |
| `frontend/app/globals.css` | New sections: top bar v2, KPI icon cards, charts v2, overview grids, landing v2, auth v2. |
| `.claude/launch.json` | Dev server entries for browser preview. |

---

### Task 1: Shared primitives (ticker, KPI card, charts)

**Files:**
- Create: `frontend/components/MarketTicker.tsx`
- Modify: `frontend/components/UI.tsx` (append `KpiCard`)
- Modify: `frontend/components/Charts.tsx` (append `AreaChart`, `Donut`, `HBarList`, `MiniBars`)

- [x] Step 1: Write `MarketTicker.tsx` exporting `INDICES` constant and `MarketTicker({variant})`.
- [x] Step 2: Append `KpiCard({label,value,delta,tone,icon,sub})` to `UI.tsx`; `tone` selects the icon tile colour class `tile-blue|green|red|amber|purple|teal`.
- [x] Step 3: Append the four SVG chart components to `Charts.tsx`. `AreaChart` takes `series: {name, points:number[], cls}[]` and `labels: string[]`, normalises to a 430x140 viewBox. `Donut` takes `slices: {label, value, cls}[]`. `HBarList` takes `rows: {label, value, pct, cls?}[]`.
- [x] Step 4: `npx tsc --noEmit` clean.

### Task 2: Shared app top bar

**Files:**
- Modify: `frontend/components/Shell.tsx:63-85`
- Modify: `frontend/app/globals.css` (replace `/* ── Top market bar ── */` block)

- [x] Step 1: Add a `Clock` client subcomponent inside `Shell.tsx` (`useEffect` + `setInterval`, renders `--:--:--` until mounted).
- [x] Step 2: Replace the `<header className="marketbar">` body with env pill, `<MarketTicker variant="bar"/>`, clock/date block, search box, bell with badge, avatar, profile, sign in/out.
- [x] Step 3: Restyle `.marketbar` in CSS (56px, white, bottom border, flex, gap 18px).
- [x] Step 4: `npx tsc --noEmit` clean; open `/orders` in the browser to confirm other pages still render.

### Task 3: Overview dashboard

**Files:**
- Create: `frontend/components/OverviewOrders.tsx`
- Modify: `frontend/app/dashboard/page.tsx` (rewrite)
- Modify: `frontend/app/globals.css` (add `/* ── Overview v2 ── */`)

- [x] Step 1: `OverviewOrders` client component. Props `rows: any[]`. State: filters `{exchange, product, status, side, symbol, user, account}`, `page`. Derived options from rows. 10 rows per page. Renders filter bar, table, "Showing a to b of N", pager.
- [x] Step 2: Rewrite `dashboard/page.tsx`: parallel fetch of overview, orders(size=200), rejections, exchanges, sessions, infra; compute counts by status; bucket orders by 5-minute bins for `AreaChart`; build donut slices; build reason rows; render the five sections from the spec. Each section checks `apiError()` and renders `EmptyState`.
- [x] Step 3: CSS for `.overview-head`, `.kpi-grid.six` icon cards, `.overview-row-4`, `.overview-bottom`, filter bar, pager.
- [x] Step 4: `npx tsc --noEmit` clean; screenshot `/dashboard` and compare with `images ref` Overview mockup.

### Task 4: Auth shell, sign in, sign up

**Files:**
- Modify: `frontend/components/AuthShell.tsx` (rewrite)
- Modify: `frontend/app/signin/page.tsx`
- Modify: `frontend/app/signup/page.tsx`
- Modify: `frontend/lib/oidc.ts` (append `registrationUrl`)
- Modify: `frontend/app/globals.css` (replace auth CSS)

- [x] Step 1: `registrationUrl(cfg)` returns `null` when `auth_disabled` or no `authorization_endpoint`; otherwise `authorization_endpoint.replace(/\/auth$/, "/registrations")` plus `client_id`, `redirect_uri`, `response_type=code`, `scope`.
- [x] Step 2: Rebuild `AuthShell` (ticker strip, ink panel with brand, headline, proof points, mini KPI card; right column card slot).
- [x] Step 3: Restyle `signin/page.tsx` (same state machine; new markup: heading, SSO button with lock icon, divider, note, sign-up link).
- [x] Step 4: Restyle `signup/page.tsx`; on submit call `fetchAuthConfig()` inside try/catch and go to `registrationUrl` or `/verify`.
- [x] Step 5: `npx tsc --noEmit` clean; screenshot `/signin`, `/signup`, `/verify`.

### Task 5: Landing page

**Files:**
- Create: `frontend/components/LandingPreview.tsx`
- Modify: `frontend/app/page.tsx` (rewrite)
- Modify: `frontend/app/globals.css` (replace landing CSS)

- [x] Step 1: `LandingPreview` static card (mini sidebar, KPI tiles, `MiniBars`, five-row table).
- [x] Step 2: Rewrite `page.tsx` with the ten sections from the spec, anchors `#platform`, `#observability`, `#deployment`, `#customers`.
- [x] Step 3: CSS `/* ── Landing v2 ── */` including the 900px breakpoint rules.
- [x] Step 4: `npx tsc --noEmit` clean; screenshot `/` and compare with the landing mockup.

### Task 6: Final verification

- [x] Step 1: `cd frontend && npm run build` succeeds.
- [x] Step 2: Backend stand-in `frontend/mock-api.local.mjs` on :8101 (pip is blocked in the sandbox), frontend dev on :3100.
- [x] Step 3: Screenshots of `/`, `/signin`, `/signup`, `/dashboard`, and spot-check `/orders`, `/rejections`, `/configuration` for the new top bar.
