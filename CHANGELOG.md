# Changelog

## 0.0.5 - Unreleased

### Added

- Added client-route script prefetching for app-router navigations, including intent and viewport modes with reduced-data and slow-connection guards.
- Added `Link`, `linkProps`, and per-link navigation controls for prefetching, full reloads, scroll preservation, and View Transition opt-in.
- Added app-router navigation state subscriptions through `getNavigationState()` and `subscribeNavigationState()`.
- Added `@reckona/mreact-router/link` and `@reckona/mreact-router/navigation-state` subpaths for more granular client helper imports.
- Added `onResponse` hooks across the built app renderer and deployment adapters so apps can set global response headers in one place.
- Added `@reckona/mreact-router/app-router-globals` for TypeScript projects that use route globals such as `<Slot />`.

### Changed

- Improved client-side app-router navigation so route payloads, head metadata, route-data scripts, and scroll restoration stay synchronized without a full page reload.
- Updated generated app-router starter projects to include the app-router global type declarations in `tsconfig.json`.

### Fixed

- Preserved thrown `Response` objects from route handlers and page loaders so redirects, errors, and custom responses pass through unchanged.
- Avoided treating lowercase helper exports in page modules as route conventions during route compilation.

## 0.0.4 - 2026-05-18

### Added

- Added dedicated URL safety regression tests covering unsafe schemes, encoded control characters, `srcdoc`, `srcset`, and meta refresh handling.
- Added raw sample retention and percentile reporting for primitive benchmarks.

### Fixed

- Fixed generated `create-mreact-app` app-router projects so `pnpm dev` starts the mreact router development server instead of raw Vite.
- Removed duplicate starter template title tags so generated route metadata owns the document title.
- Documented pnpm 10 `approve-builds` warnings in generated pnpm project READMEs.
- Stabilized React conformance scheduling checks and cleaned the lint output.

## 0.0.3 - 2026-05-18

### Added

- Added AWS Lambda response streaming adapter support alongside the buffered Lambda adapter.
- Added query retry, retry delay, cancellation, and AbortSignal support.
- Added stable package subpaths for router session/native escape helpers, compat event priority, and reactive runtime state.
- Added development-only opt-in logging for deferred stream errors ignored after abort.

### Changed

- Improved client boundary inference diagnostics and public compiler diagnostic formatting.
- Shared server string/stream emit helpers to keep URL, attribute, and style serialization behavior aligned.
- Expanded static style object optimization with an OXC AST fallback for comments and string literal keys.
- Made router Host header trust policy explicit through `allowedHosts` and `hostPolicy`.
- Updated benchmark results for 2026-05-17 and documented resumability benchmark interpretation.

### Fixed

- Hardened server actions with body-size limits, Origin/Referer validation, and allowlist manifest checks.
- Rejected unsupported compiler `ref={...}` usage with diagnostics instead of silently dropping it.
- Improved stream abort/backpressure behavior and capped computed flush loops.
- Avoided internal package entrypoint dependencies in workspace integrations where stable subpaths are available.

## 0.0.2 - 2026-05-17

### Changed

- Improved primitive benchmark performance for mreact list updates, keyed appends, computed scheduling, and selected-row updates.
- Stabilized primitive benchmark reporting by aligning runner defaults and adding gap-from-first-place columns to result tables.
- Split router interaction benchmarks into initial JS/CPU cost, first interaction before network idle, first interaction after network idle, and second interaction latency.
- Clarified benchmark interpretation for resumability-oriented frameworks such as Qwik and Marko.
- Updated README benchmark links and added a GitHub Actions latest benchmark reference.

### Fixed

- Fixed `@reckona/create-mreact-app --help` output so the published CLI exposes expected help behavior.
- Avoided redundant computed queueing and extra row label subscriptions in hot primitive benchmark paths.

### CI

- Switched npm publishing workflow to GitHub Actions trusted publishing with OIDC.
- Kept native platform artifacts in the publish workflow for Linux, macOS, and Windows package publishing.
