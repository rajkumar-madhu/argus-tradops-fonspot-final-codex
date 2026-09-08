# TradeOps reference UI implementation plan

> **For agentic workers:** Use subagent-driven-development for independent tasks and check-work for final verification. Preserve others' edits. No commits or deployment are required.

**Goal:** Turn the inspected TradeOps image references into a consistent, usable read-only operations UI with verified filters and honest data sources.

**Architecture:** Preserve Next.js server pages and FastAPI contracts. A client grid receives serializable raw row values plus server-rendered cell nodes, so existing formatters remain server-compatible. Pure filter/sort/CSV helpers are unit tested. Supported API query lookbacks stay server-owned; snapshot table filters are explicitly scoped to loaded rows.

**Tech stack:** Next.js 15, React 19, TypeScript, native Node test runner, FastAPI, Playwright browser verification.

- [x] Runtime/query repair. Own layout.tsx, logs/page.tsx, signin/page.tsx, regression HTTP script. Reproduce build-vs-runtime mismatch and /logs?q no-match first. Force request-time config; forward encoded query, preserve q, and use safe errors. Test against built app with runtime API distinct from build environment.
- [x] Shared grid. Own lib/table-filters.ts, components/FilterableTable.tsx, UI.tsx and tests/table-filters.test.mjs. Tests cover combined filters, masked values, zero/false values, missing dates, inclusive UTC bounds, stable sort, and CSV formula escaping. Render a toolbar, matching-row count, sorting, pagination/reset and selection-preserving row buttons.
- [ ] Operational integration. Add shared grid to LiveOrders; use existing DataTable on other pages. Add supported lookback controls for orders/rejections/trades/dashboard; refresh-only source notes on snapshot pages. Remove duplicate headings. Preserve selected order and show source-provided unknown/empty states.
- [x] Reference styling and shell. Own Shell.tsx, MarketTicker.tsx, layout font role fixes and globals.css. Native global search form to /logs?q; Ctrl/Cmd+K focus; mobile menu; honest source badge. Apply navy/blue/light palette and compact sans-serif typography without breaking table scrolling.
- [ ] Data honesty and latency views. Label illustrative charts, avoid synthetic live depth, use source-provided fields, add latency tabs backed by available rows and note unavailable queues/history.
- [ ] Verification. Run `cd frontend && npm test`; run isolated production build and runtime HTTP checks; browser all routes plus grid/query/navigation interactions at desktop and mobile. Check work with verifier, fix actionable issues, and record exact limitations.

Use the inspected browser failures as the initial failing integration cases. No database mutations, order writes, remote deployment, or source-control commits are part of this change.


## Checkpoint after image-folder recheck

Operational integration is implemented for shared tables and live orders, source query windows, snapshot refresh and selected-order links. A separate local historical journal view is implemented with masked rows and lifecycle evidence; see `docs/JOURNAL_DATA_CONTRACT.md`. Latency segment/status filtering is provided by the shared grid; the fuller reference tab layouts remain outstanding.

Functional verification passes: 11 frontend tests, 2 journal tests, isolated production build, 6 runtime HTTP checks, 24 browser route renders, journal filter/pagination/selection and mobile navigation. The independent reviewer could not run because of its usage limit. The full visual sign-off remains blocked on the recorded composition gaps and durable screenshot archiving in `design-qa.md`.
