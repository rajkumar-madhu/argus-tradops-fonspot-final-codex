# Order latency stage timing — Implementation Plan

> For agentic workers: execute task-by-task; checkbox (`- [ ]`) syntax tracks progress.

**Goal:** ingest `ORDERLATENCYSORTED*.csv` stage timings and show them on `/order-latency`.
**Architecture:** new `hops` kind in the existing read-only CSV store → two GET routes → one
server component on the existing page. **Stack:** FastAPI + SQLite cache, Next.js 15 server
components, stdlib unittest, node --test.
**Spec:** `docs/superpowers/specs/2026-09-11-order-latency-stage-timing-design.md`

## Task 0 — Guard real data
- [ ] `.gitignore`: add `ORDERLATENCYSORTED*.csv` next to the other CSV dump rules.

## Task 1 — Ingest (`backend/app/csv_store.py`, `backend/tests/test_hops.py`)
- [ ] Failing tests: parse sample-shaped rows (8–9 stages, empty groups, trailing field);
      malformed group rejects row; mismatch counted; duplicates counted; `ORDERLATENCYSORTED`
      not treated as latency; filename with a space; removed file drops its hops.
- [ ] `hops` table + indexes in `__init__`; `_hop_kind` discovery in `ingest()`; hop branch in
      `_ingest_file` sharing the scaffolding; delete hops on failure/removal.
- [ ] Tests pass; full backend suite green.

## Task 2 — Queries and routes (`csv_store.py`, `file_analytics.py`, `file_routes.py`)
- [ ] Failing tests for `hops_summary()` (percentiles, stage order, slowest orders, facets) and
      `hop_order()` (offsets, unknown order → None).
- [ ] Implement; add `GET /api/files/hops` and `GET /api/files/hops/{order_id}` (`latency:read`,
      order id validated).

## Task 3 — UI (`frontend/lib/stage-timing.ts`, `components/StageTiming.tsx`, page, CSS)
- [ ] Failing `tests/stage-timing.test.mjs`: µs formatting, log bar width, timeline geometry,
      dominant-stage rule.
- [ ] Helpers; `StageTiming` component; mount in `app/order-latency/page.tsx`; CSS with tokens.

## Task 4 — Verify
- [ ] Backend suite, `tsc`, `npm test`.
- [ ] Copy the sample into the preview CSV dir, start `file-preview`, check `/order-latency` and
      `/data-quality` against the sample's known numbers (slowest 26071700000017, 96.05 ms span,
      stage 46 = 94.06 ms).
