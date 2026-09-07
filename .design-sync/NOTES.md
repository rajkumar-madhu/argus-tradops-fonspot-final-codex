# design-sync notes — tradeops-observability-ui

## Repo shape

- This is a **Next.js app**, not a published design system. There is no `dist/`, and
  `frontend/package.json` is private with no `main`/`module`/`exports`/`types`.
- `frontend/ds-entry.tsx` is a **sync-only entry point** added for this pipeline. It re-exports
  just the presentational components. It is not imported by the app — if you delete it, the sync
  breaks; if you add a portable component, add it there too.
- Do **not** let the converter use synth-entry mode here. Synth mode does `export *` from every
  file under `components/`, which pulls `Shell.tsx` and `AuthShell.tsx` in, and those import
  `next/navigation` / `next/link` — Next's router has no business in a browser IIFE. Always pass
  `--entry ./frontend/ds-entry.tsx` (also pinned as `cfg.entry`).
- `PKG_DIR` is resolved by walking up from `--entry` to the nearest `package.json` with a `name`.
  Without `--entry` the build dies with `ENOENT .../node_modules/tradeops-observability-ui/package.json`,
  because the package is never self-installed into its own `node_modules`.

## Excluded components (deliberate)

`Shell`, `AuthShell`, `LiveOrders`, `RejectionsView`, `MarketDataView` are excluded via
`componentSrcMap: null`. They depend on `next/navigation`, `@/lib/oidc`, `@/lib/session` or the
SSE client in `@/lib/stream`, and cannot render outside the running app.

## `KPI` ships as `Kpi`

`isComponentName` in `lib/dts.mjs` rejects `/^[A-Z][A-Z0-9_]+$/`, so the all-caps `KPI` export was
silently classified as a constant and dropped (build log: `excluded 1 enum/type/context/hook`).
`ds-entry.tsx` re-exports it as `Kpi`. The app still calls it `KPI` — that name difference is
intentional, not drift. Same for any future all-caps component export.

## Environment gotchas on this machine

- `npm` fails with `Your cache folder contains root-owned files` — pass
  `--cache "$TMPDIR/npmcache"`. Permanent fix: `sudo chown -R 501:20 ~/.npm`.
- `~/.cache` is not writable in the agent sandbox. Playwright browsers were installed to
  `.ds-sync/ms-playwright` via `PLAYWRIGHT_BROWSERS_PATH`; export that same variable when running
  `package-validate.mjs` or the browser is not found.
- **The sandbox blocks `listen()` on every address and port.** `package-validate.mjs`'s render
  check serves previews over a local HTTP server, so it dies with
  `Error: listen EPERM ... 127.0.0.1` before chromium ever launches. `storybook/http-serve.mjs`
  (the `.review.html` server) cannot run here either. Both work in a normal terminal.

## Known render warns

- `[RENDER_SKIPPED]` — the render check has **never** run in this environment (see above). This is
  not a triaged warn; it means no preview has been machine-verified. Re-run validate in a real
  terminal to clear it.
- `[FONT_MISSING] "Inter"` — `globals.css:36` sets `font-family: Inter, ui-sans-serif, system-ui, …`
  and `globals.css` itself carries no `@font-face`. **This is a bundling gap, not an app bug.** The
  app loads Inter correctly via `next/font/google` in `app/layout.tsx` (`inter.className` on
  `<body>`), which self-hosts the woff2 under `.next/static/media/`. Because design-sync ships only
  `globals.css`, that `@font-face` layer never reaches the bundle, so designs built from this DS
  fall back to system-ui while the real app does not.
  Fix options, in order of preference:
  1. Commit Inter woff2 files under `frontend/fonts/` with a hand-written `@font-face` css and
     point `cfg.extraFonts` at it — ships the font, matches the app exactly.
  2. A Google-Fonts `@import` in a design-sync-only stylesheet (downgrades the warn to the
     informational `[FONT_REMOTE]`). Do **not** add this to `globals.css` — the app self-hosts
     deliberately, and an `@import` would add a runtime third-party request it does not have today.
  3. `cfg.runtimeFontPrefixes: ["Inter"]` merely silences the warn; the font still would not render
     in designs. Least honest option.
  Do not reuse the hashed woff2 in `.next/static/media/` — those names change every build and
  `.next` is gitignored.

## Re-sync risks

- `ds-entry.tsx` and `componentSrcMap` are a hand-maintained pair. A component added to
  `frontend/components/` appears in neither automatically — it will silently not sync.
- All 21 components currently ship the **floor card**; no previews have been authored in
  `.design-sync/previews/`. Authoring is the standing incremental improvement.
- `cssEntry` is the app's entire `app/globals.css` (63 KB), not a curated stylesheet. Any app-level
  CSS change ships to the design system verbatim, including page-specific rules that mean nothing
  outside the app.
- No `projectId` is pinned yet — the upload never happened (DesignSync needs `/design-login` from
  an interactive session). The next run creates the project and must record the pin.
