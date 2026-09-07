# TradeOps UI refresh: landing, sign-in, sign-up, overview dashboard

Date: 2026-09-07
Status: approved

## Goal

Restyle four screens of the Next.js frontend so they match the reference mockups in
`images ref/` (ChatGPT-generated TradeOps screens) and borrow the page structure of
https://www.truedata.in (ticker strip, white nav, hero with product preview, module
grid, stats, testimonial, CTA band, multi-column footer).

Screens in scope:

1. Landing page `/`
2. Sign in `/signin`
3. Sign up `/signup` (plus `/verify` and `/forgot-password` keep working with the new shell)
4. Overview dashboard `/dashboard`, including the shared app top bar rendered by `components/Shell.tsx`

Out of scope: every other module page (Live Orders, Positions, Holdings, Rejections, RCA,
Exchange Health, Sessions, Risk, Infra, Logs, Alerts, Reports, Configuration, Market Data).
They keep their current markup. They do inherit the new shared top bar and any shared
CSS token changes, which must not break them.

## Constraints

- Keep the repo conventions: Next.js 15 App Router, React 19, hand-written CSS in
  `app/globals.css`, `lucide-react` icons, no state library, no chart library.
- Authentication stays Keycloak Authorization Code + PKCE via `lib/oidc.ts`. No password
  form is wired to a backend. `AUTH_DISABLED=true` must still short-circuit to the dashboard.
- The system stays read-only. No new write endpoints. No new backend endpoints at all; the
  dashboard uses `/api/overview`, `/api/orders`, `/api/rejections`, `/api/exchanges`,
  `/api/sessions`, `/api/infra`.
- Server components keep calling `getJSON()` from `lib/api.ts`. Errors from the API render
  the existing `EmptyState`, never a crash.
- Responsive down to 900px using the existing breakpoint pattern.

## Visual language (from the mockups)

- Light surface `#f6f8fb`, white panels with 1px `#d8e2ef` borders and 8px radius.
- Sidebar dark ink gradient (unchanged). Top bar white, 56px, with an environment pill,
  three index tickers (NIFTY 50, NIFTY BANK, SENSEX with green/red deltas), clock and date,
  a search input, bell with badge, avatar and user name/role.
- KPI cards: label, large value, delta line, icon tile in the top-right (blue, green, red,
  amber, purple, teal tints).
- Panels: bold title row, optional "View All ›" link, 14px content.
- Status chips: Completed green, Rejected red, Pending amber, Open blue.
- Landing: white background, blue `#0c79ef` primary buttons, dark ink band, blue CTA band.
- Index tickers show fixed demo values (NIFTY 50 25,415.80 +597.55, NIFTY BANK 53,037.60
  +1,173.25, SENSEX 83,258.91 +1,173.28) and are labelled as a demo feed. They are not
  wired to `/api/market-data` in this iteration.

## Components

### `components/MarketTicker.tsx` (new, server-safe)

Renders the index strip. Props: `variant: "strip" | "bar"`. `strip` is the full-width bar
used on landing and auth pages; `bar` is the inline version inside the app top bar. Data is
a constant array in the component.

### `components/Charts.tsx` (extended)

Pure SVG, no dependencies:

- `AreaChart({series, labels})` stacked lines with soft fills for total / executed / rejected.
- `Donut({slices, centerLabel, centerValue})` with legend.
- `HBarList({rows})` label, bar, value, for rejection reasons and system health.
- `MiniBars` for the landing hero preview.

Existing `OrdersTrendChart` and `BandwidthChart` stay exported so other pages keep building.

### `components/UI.tsx` (extended)

- `KpiCard({label, value, delta, tone, icon})` implements the icon-tile KPI.
- Existing exports unchanged.

### `components/Shell.tsx` (top bar only)

Replace the current market bar content with: env pill, `MarketTicker variant="bar"`, clock
(client-side, updates every second) and date, search input (visual only, `Ctrl+K` hint),
bell with badge, avatar, name and role, sign in/out link. Sidebar unchanged.

### `components/AuthShell.tsx` (rebuilt)

Ticker strip on top, then a two-column layout: left ink panel (brand, headline, subtitle,
three proof points, mini KPI preview card), right centred white card. Accepts the same
`title`, `subtitle`, `children` props so `/verify` and `/forgot-password` keep working.

### `components/LandingPreview.tsx` (new)

CSS-built dashboard preview for the hero: sidebar list, three KPI tiles, small area chart,
a table of five orders. Static content.

## Pages

### `/` landing

Sections in order: ticker strip, nav, hero, integrations row, platform modules (6 cards),
Real-time Observability + AI-Powered RCA split, dark deployment band (Cloud, On-Premise,
Hybrid plus Enterprise Ready list), stats + testimonial, CTA band, footer (Product,
Resources, Company, Support columns, legal line). Nav links point to section anchors.
"Get Started" and "Start Free Trial" go to `/signup`; "Sign In" and "Book a Demo" go to
`/signin`.

### `/signin`

Card: "Welcome back", SSO button, auth-disabled Continue button, error line, role note,
link to `/signup`. Logic is the existing `fetchAuthConfig` + `login()` flow, unchanged.

### `/signup`

Card: two-column form (Full Name, Work Email, Company, Phone, Password, Confirm Password),
terms checkbox, "Create Account". On submit: if `fetchAuthConfig()` returns an
`authorization_endpoint`, redirect to the same URL with `/auth` replaced by
`/registrations`, carrying `client_id`, `redirect_uri`, `response_type=code`,
`scope=openid profile email`. If auth is disabled or config fails, go to `/verify` as today.
Form values are never posted anywhere.

### `/dashboard`

Server component. Fetches overview, orders (`size=200`), rejections, exchanges, sessions,
infra in parallel. Layout:

1. Page head: title, subtitle, time-range buttons (1H 4H 1D 1W 1M Custom, visual), refresh,
   "+ New Dashboard" (visual).
2. Six `KpiCard`s: Total Orders, Executed, Rejected (with reject rate), Pending, Active
   Users, Brokers Online.
3. Row of four panels: Orders Trend (`AreaChart` from orders bucketed into 5-minute bins by
   `time`), Order Distribution (`Donut` of executed / rejected / pending / open), Top
   Rejection Reasons (`HBarList` from rejections groups), Exchange Health (table from
   exchanges items: name, status chip, latency, reject rate).
4. Live Orders panel: `LiveOrdersTable` client component with filter bar (Exchange, Product,
   Status, Side selects, Symbol/User/Account text inputs, Search and Reset), 10 rows per
   page with "Showing x to y of N" and page buttons. Filtering and paging are client-side on
   the rows passed from the server. Auto-refresh toggle is visual only; the streaming table
   remains on `/orders`.
5. Bottom row: Network Bandwidth (`BandwidthChart`, labelled sample), Recent Exchange
   Messages (rejected orders' reason lines), Active Sessions (sessions items), System Health
   (`HBarList` from infra: OMS, RMS, Elasticsearch, Postgres, Redis).

Any API error on a section renders `EmptyState` for that section only.

## Error handling

- `getJSON` already returns `_error`; each dashboard section checks `apiError()`.
- Sign-up registration redirect wraps config fetch in try/catch and falls back to `/verify`.
- The clock in the top bar guards `window` and only runs in `useEffect`.

## Verification

There is no test suite. Done means:

- `cd frontend && npm run build` succeeds with no type errors.
- Backend running in demo mode with `AUTH_DISABLED=true`; frontend dev server on :3000.
- Browser screenshots of `/`, `/signin`, `/signup`, `/dashboard` compared side by side with
  the reference images; every other module page still renders with the new top bar.
