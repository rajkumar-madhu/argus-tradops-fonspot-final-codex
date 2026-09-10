# Live Mission Control Overview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `/dashboard` as a TradesViz-style Mission Control multi overview with clear KPIs, a Live/Open/Rejected/Complete table (SSE on Live when elasticsearch), and three essential charts — plus a Shell live strip on Overview and Live Orders.

**Architecture:** Keep `dashboard/page.tsx` as the server data loader. Extract pure KPI/tab helpers for tests. Add a client `MissionControlTable` that reuses the orders SSE merge pattern from `LiveOrders`. Restructure `DashboardView` layout; add a compact `LiveStatusStrip` into `Shell` for `/dashboard` and `/orders` only.

**Tech Stack:** Next.js 15 App Router, React 19 client components, existing `openAuthenticatedEventSource`, hand-written CSS, `node --test` for pure helpers.

**Spec:** `docs/superpowers/specs/2026-09-09-live-mission-control-overview-design.md`

---

## File map

| File | Role |
|---|---|
| `frontend/lib/mission-control.ts` | Pure KPI defs + tab filter + third-panel choice |
| `frontend/tests/mission-control.test.mjs` | Unit tests for those helpers |
| `frontend/components/MissionControlTable.tsx` | Client multi-tab table + SSE on Live |
| `frontend/components/LiveStatusStrip.tsx` | Source / stream age strip |
| `frontend/components/DashboardView.tsx` | Mission Control layout |
| `frontend/components/Shell.tsx` | Mount strip on Overview + Live Orders |
| `frontend/app/globals.css` | Mission Control / strip styles |
| `frontend/lib/nav-model.ts` | Rename Overview label to Mission Control (optional, small) |

### Task 1: Pure helpers + tests

**Files:**
- Create: `frontend/lib/mission-control.ts`
- Create: `frontend/tests/mission-control.test.mjs`

- [x] **Step 1–4:** Helpers for KPI definitions, `filterOrdersByTab`, `thirdChartPanel`, `isLiveSource`; tests pass.

### Task 2: MissionControlTable client

**Files:**
- Create: `frontend/components/MissionControlTable.tsx`

- [x] Multi-tab Live/Open/Rejected/Complete; SSE merge on Live when source is elasticsearch; pause; link to `/orders`.

### Task 3: LiveStatusStrip + Shell

**Files:**
- Create: `frontend/components/LiveStatusStrip.tsx`
- Modify: `frontend/components/Shell.tsx`

- [x] Strip on `/dashboard` and `/orders`; honest badges; no fake LIVE on journal/demo.

### Task 4: Restructure DashboardView

**Files:**
- Modify: `frontend/components/DashboardView.tsx`
- Modify: `frontend/lib/nav-model.ts` (label)
- Modify: `frontend/app/globals.css`

- [x] Head Mission Control → KPIs with defs → MissionControlTable → 3 charts; demote briefing/bottom wall.

### Task 5: Verify

- [x] `cd frontend && npm test && npx tsc --noEmit`
- [ ] Manual: file preview still FILE-BASED; live stack shows LIVE when configured

**Commits:** deferred unless user asks.
