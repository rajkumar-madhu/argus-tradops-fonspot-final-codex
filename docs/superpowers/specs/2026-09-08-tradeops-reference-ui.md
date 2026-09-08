# TradeOps reference UI and functional controls

Approved direction: the user's “go” follows the inspected image-reference map and its implementation order. Preserve the TradeOps read-only Noren architecture and existing routes. Use the 20 unique PNG screens as layout/field references and the supplied latency HTML for latency. Do not copy unverified data, trading mutations, financial calculations, or testimonial claims from mockups.

Visual system: navy rail #10243a, blue selection #0866ef, work area #f5f8fc, white surfaces, ink #102444, green #00885a, red #d6384a. IBM Plex Sans for headings/body, tabular figures for numeric cells. Left-aligned compact workspaces with persistent navigation, source context, filter toolbar, table and adjacent order evidence.

Deliverables:
1. Request-time public-page API configuration and working logs query forwarding with preserved inputs and explicit error states.
2. Shared table filtering, facet selectors, loaded-row date filtering, sort, pagination, reset, and safe filtered CSV export; preserve server rendering and existing per-row detail interactions.
3. Apply shared controls to operational tables; add them to live orders and market/rejection lists. Persist selected order through order links and expose RCA/log investigation links. Avoid inventing unsupported market history.
4. Replace inert global search with a working log-search form and Ctrl/Cmd+K focus. Replace false environment/connectivity claims with API-derived source/status. Align typography, blue accent, rail, responsive navigation and dense tables with image references.
5. Wire supported query lookbacks and refresh. For snapshots without history support, clearly state the limitation instead of pretending range buttons work.
6. Latency gets segment/status filters, supported data views and existing source precision notes. Reports/configuration remain read-only; integrations that require additional data stay explicit.
7. Regression checks, isolated production build, browser interaction/route checks, and independent verification. Keep source modifications uncommitted for user review.
