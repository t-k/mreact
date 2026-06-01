# Changelog

## Unreleased

## 0.0.116 - 2026-06-02

### Fixed

- Fixed Cloudflare Pages packaged workers so route-level client pages emit the full hydration contract, including `data-mreact-route-id`, route props JSON, and the current route module script, allowing public client routes such as `/login` to hydrate without app-specific bootstraps.
- Fixed Cloudflare Pages static asset allow-lists so generated client assets include shared chunks in addition to direct route entries, preventing 404 responses for transitive chunks loaded by hydrated client routes.

## 0.0.115 - 2026-06-01

### Fixed

- Fixed Cloudflare Pages packaged worker bundles so `node:module` `createRequire(import.meta.url)` references are replaced with a worker-safe shim when Node builtins are externalized, preventing first-request 500 responses under `wrangler pages dev` with `nodejs_compat`.

## 0.0.114 - 2026-06-01

### Fixed

- Fixed Cloudflare Pages packaged worker route facades so page component exports are resolved when the generated route component is called instead of during module initialization, preventing root routes such as `/` from keeping an `undefined` component binding and returning `No Cloudflare page component registered` before loaders can run.

## 0.0.113 - 2026-06-01

### Fixed

- Fixed Cloudflare Pages packaged worker route rendering so generated `CloudflareRouteComponent` exports are used when `default` and `App` live-binding accessors are present but unresolved, preventing root routes such as `/` from returning `No Cloudflare page component registered` before their loaders can redirect under `wrangler pages dev`.

## 0.0.112 - 2026-06-01

### Fixed

- Fixed Cloudflare Pages string route component modules so extracted shared layout routes no longer emit a duplicated `App`/`default` alias pair that the Pages worker bundler can split into an uninitialized binding, keeping routes such as `/login` renderable under `wrangler pages dev`.

## 0.0.111 - 2026-06-01

### Fixed

- Fixed Cloudflare Pages string route modules so `App` and `default` are exported through the same route-local wrapper function, preventing bundled Workers from binding one export to an uninitialized sentinel while sibling routes share an extracted layout chunk.

## 0.0.110 - 2026-06-01

### Fixed

- Fixed Cloudflare Pages packaged route facades so they read page component modules through namespace exports instead of named `componentDefault` / `componentApp` bindings, avoiding a bundled Worker symbol-resolution hazard that could leave routes such as `/login` with `No Cloudflare page component registered` when many sibling routes share an extracted layout chunk.

## 0.0.109 - 2026-06-01

### Fixed

- Fixed Cloudflare Pages route rendering so accessor-based page module exports are dereferenced once and retained before rendering, preventing `No Cloudflare page component registered` 500 responses for packaged Workers running under `wrangler pages dev` when sibling routes share an extracted layout chunk.

## 0.0.108 - 2026-06-01

### Fixed

- Fixed Cloudflare Pages packaged workers so generated route-local page component wrappers remain visible in the bundled `_worker.js`, making package output diagnostics match the intermediate Cloudflare route modules while preserving sibling routes that share an extracted layout chunk.

## 0.0.107 - 2026-06-01

### Fixed

- Fixed Cloudflare Pages packaged workers so sibling routes that directly call a shared auth shell continue to render when the route modules expose live-binding `default` / `App` / `slots` accessors.
- Fixed Cloudflare Pages route facade generation so routes that share an extracted layout or shell chunk get route-local page component wrappers instead of bare re-exports, preventing one route from returning `No Cloudflare page component registered` when many routes import the same shared layout.

## 0.0.106 - 2026-06-01

### Fixed

- Fixed Cloudflare Pages packaged workers so route-level CSS emitted into the client manifest is allow-listed by the generated static asset loader, preventing 404 responses for existing `/_mreact/client/assets/routes/*.css` files.
- Improved Cloudflare Pages missing-page-component 500 diagnostics by reporting the fixed `default` / `App` / `slots` export shapes while avoiding app-specific export-name disclosure, making clean rebuild reports easier to diagnose without exposing arbitrary module names.
- Added regression coverage for Cloudflare Pages routes that share a nested layout while rendering different page components and loaders, keeping both sibling routes renderable after bundling.

## 0.0.105 - 2026-06-01

### Fixed

- Fixed Cloudflare Pages route rendering so packaged Workers can recover page components preserved under generated function export names, preventing 500 responses for routes such as `/login` when multiple routes share the same component graph after bundling.

## 0.0.104 - 2026-06-01

### Fixed

- Fixed Cloudflare Pages packaging so generated `_worker.js` can preserve runtime dependency imports of Node builtins such as `node:util` for apps deployed with Cloudflare's `nodejs_compat` compatibility flag, covering common Protobuf runtimes like `protobufjs`.

## 0.0.103 - 2026-06-01

### Fixed

- Fixed Cloudflare production builds so colocated `*.test.*` and `*.spec.*` source files are not embedded in the generated Worker manifest, allowing `mreact-router package cloudflare-pages` to bundle `_worker.js` without pulling Vitest runtime code or Node builtins into the Pages artifact.

## 0.0.102 - 2026-06-01

### Fixed

- Fixed Cloudflare route module builds for pages with layout or template shells so browser-only SDKs reached through shared app-local wrapper modules are extracted into shared route chunks instead of being duplicated into every shell route artifact, reducing generated Worker and Cloudflare Pages bundle size for apps that lazy-load packages such as Firebase from multiple routes.

## 0.0.101 - 2026-06-01

### Fixed

- Fixed Cloudflare page component builds so shared dynamically imported dependencies are emitted as shared route chunks instead of being duplicated into each consuming route artifact, reducing generated Worker size for apps that lazy-load browser-only SDKs such as Firebase from multiple routes.

## 0.0.100 - 2026-05-31

### Fixed

- Fixed `mreact-router dev` Tailwind CSS v4 content detection so route source files are included when the router serves layout-imported CSS through the development CSS proxy, removing the need for app-authored `@source` workarounds in the common Vite plugin setup.

## 0.0.99 - 2026-05-31

### Fixed

- Fixed `@reckona/mreact-router/link` so `<Link>` typechecks as a JSX component again under the `@reckona/mreact` JSX runtime while preserving the native server-rendered anchor output path.

## 0.0.98 - 2026-05-31

### Added

- Added `mreact-router package aws-lambda --handler <entry>` so Lambda deployments can bundle custom app-local TypeScript handlers while keeping package imports external.
- Added `runWithAuthRequest()` to `@reckona/mreact-auth` for custom server handlers that need request-local auth claims outside the app router request lifecycle.
- Added query cache idle eviction through `createQuery({ gcTime })` and `queryClient.subscribe(..., { gcTime })`.
- Added `dispose()` to cells returned by `store.select()` so selectors created outside the framework cleanup lifecycle can release their subscription explicitly.
- Added build phase timing instrumentation through `BuildAppPhaseTiming` and `buildApp({ onBuildPhaseTiming })`.

### Changed

- Improved App Router production build throughput by parallelizing build phases, batching Cloudflare wrapper and server request artifact bundles, tuning server module artifact writes, and reusing generated route analysis where possible.
- Changed the router `Link` server implementation to emit native SSR output without pulling the React compatibility element path into server-only rendering.
- Changed form field bindings so `field.bind({ event: "change" })` can update from `onChange`, binding values are read live from form state, and concurrent `form.submit()` calls share the active submission.
- Changed `create-mreact-app` generated package names to stay npm-valid for hidden, punctuation-only, and very long target directories, and made older app upgrades leave JSONC `tsconfig.json` files untouched instead of throwing.

### Fixed

- Fixed production App Router builds so loader and server module dependencies that resolve assets relative to `import.meta.url` continue to see the original source file URL instead of the relocated build artifact URL.
- Fixed server action context and auth guard handling so session cookie options are honored by role and permission guards, server action authorization receives the request context, and server-side auth claims no longer leak through module-global state.
- Fixed Lambda adapter error responses so `onResponse` hooks still apply when `errorHandler` or the default 500 response handles a failure.
- Fixed CSP nonce behavior and diagnostics so route metadata warns when inline `<script>` or `<style>` output would be blocked by nonce-bearing directives, and documented the `metadata.head` nonce path for route-owned inline styles.
- Fixed current-route link state and programmatic navigation edge cases, including initial route matching, hash-only same-route navigation, POST navigation form handling, and native route matching.
- Fixed query lifecycle races so superseded fetches cannot overwrite newer data, canceled and removed queries abort in-flight work consistently, and removed entries notify observers with a reset pending state.
- Fixed React compatibility edge cases across context cleanup, events, hook state, deferred values, form controls, root lifecycle, and common API behavior.
- Fixed reactive DOM and compiler edge cases around list binding cleanup, DOM prop application, JSX logical-or evaluation, source maps, server streaming, and diagnostics.
- Fixed server rendering and streaming hardening around token handling, HTML helpers, server action edges, and current route link output.

## 0.0.97 - 2026-05-31

### Added

- Added an `/analytics` route to `examples/app-router` that demonstrates third-party analytics integration through `metadata.head`, per-request CSP nonces, CSP-safe JSON-LD, a local offline tag-manager stub, and SPA `page_view` tracking through `subscribeNavigationState()`.

### Fixed

- Fixed server rendering for dynamic component registry patterns so components selected from `import.meta.glob()` maps, object registries, and shared frame children render their HTML instead of stringifying as `[object Object]`.
- Fixed static export so copied public assets keep their root URL paths.
- Fixed MDX App Router builds and dev requests so frontmatter and TSX code fences are analyzed after Vite/MDX transforms instead of parsing raw `.mdx` as TSX.
- Fixed dev server rendering so the router's own Vite client transform is not reapplied while server-rendering page-imported app shells, preserving inferred client boundary placeholders.
- Fixed build-time parser errors so thrown parse failures include the real source file path, line, column, and parser codeframe instead of the placeholder `module.tsx`.

## 0.0.96 - 2026-05-30

### Changed

- Renamed `examples/react-compat-dashboard` to `examples/react-libraries` and reframed it as a showcase of real React-ecosystem libraries running unmodified on mreact through `.compat.tsx` boundaries. The Recharts dashboard moved to `/charts`, a new index at `/` links each demo, and the example adds a Lexical rich-text editor at `/editor` (with a full headings/lists/links/undo toolbar), a conform + Zod form at `/forms`, and a Radix UI dialog at `/dialog`.

### Fixed

- Fixed React-compatible portal rendering so Radix-style presence portals opened by an interaction stay mounted, stale portal nodes are removed only after a committed render, and failed renders restore the previous portal snapshot.
- Fixed React-compatible delegated event dispatch so a native event is processed once across roots and logical portal parent cycles cannot loop while building the event path.
- Fixed App Router client navigation so cross-origin anchors are left to the browser and cross-origin prefetch attempts are skipped instead of issuing navigation HTML requests.

## 0.0.95 - 2026-05-30

### Added

- Added a zero-dependency interactive `create-mreact-app` wizard that prompts for missing options in a TTY while preserving non-interactive defaults for scripts and CI.

### Changed

- Split `create-mreact-app` app templates from deploy targets. Templates are now `basic`, `tailwind`, and `dashboard`, while deploy scaffolds are selected separately with `--deploy cloudflare`, `--deploy container`, or `--deploy aws-lambda`.
- Changed the default `create-mreact-app` template to `basic` and added package-manager default detection from the invoking package manager user agent.

### Fixed

- Fixed Cloudflare scaffold selection so Cloudflare can be combined with any app template, including the Tailwind template.

## 0.0.94 - 2026-05-30

### Added

- Server-only routes now auto-detect `Link` usage and inject the navigation runtime without requiring `export const navigationRuntime = true`. The export remains as an override (`= false` forces it off, `= true` forces it on). Detection covers `Link` rendered transitively through components and layouts.

## 0.0.93 - 2026-05-29

### Changed

- Changed the primitive benchmark runner to execute framework cases in isolated worker processes so large benchmark batches avoid retaining cross-framework state.

### Fixed

- Fixed the React compatibility dashboard's Recharts rendering so bar, pie, and line chart data shapes remain visible across client hydration.
- Fixed the dashboard revenue bar chart so moving the pointer over the chart no longer removes the rendered bars.

## 0.0.92 - 2026-05-29

### Added

- Added CommonJS `require()` entrypoints for `@reckona/mreact`, `@reckona/mreact/jsx-runtime`, and `@reckona/mreact/jsx-dev-runtime` so CommonJS consumers receive the same React-flavored runtime surface as ESM consumers.
- Added `@reckona/mreact-dom/test-utils` with `act()` for React Testing Library compatibility, and added `@reckona/mreact-compat/hooks` for integrations that import hook APIs from a dedicated subpath.
- Added React compatibility benchmark adapters and filters so runtime hot paths can be compared against the React-compatible entrypoints.

### Changed

- Improved React-compatible rendering hot paths for keyed rows, host child reconciliation, append and clear operations, prop normalization, context reads, and delegated event listener bookkeeping.
- Updated generated AWS Lambda app scaffolds so `package:lambda` uses `mreact-router package aws-lambda --skip-runtime-dependency-check` before the documented production dependency install step.

### Fixed

- Fixed React-compatible behavior across portals, SVG delegated events, pointer coordinates on synthetic events, lexical editor roots, contentEditable attributes, strict-mode memo replay, callable component constructors, class component updates, context provider and consumer bailouts, passive effect scheduling, async `act()` settling, external store stabilization, and unmount cleanup.
- Fixed `@reckona/mreact` CommonJS namespace interop so dependencies that load React-like runtimes through `require()` can import the package and JSX runtime subpaths.
- Fixed server rendering hook paths for nested function components and improved React Flight row parsing coverage.

## 0.0.91 - 2026-05-27

### Fixed

- Fixed `startDevServer()` so App Router `importPolicy` settings loaded from `vite.config.ts` are applied to development server string and stream page component bundles. Streaming routes that use `<Await>` and server dependencies such as native or CommonJS database packages now match the CLI dev server path instead of bundling those packages into virtual page modules.

## 0.0.90 - 2026-05-27

### Fixed

- Fixed App Router project config defaults so apps that set `routesDir: "app"` no longer need to also set `allowedSourceDirs: ["app"]` for development route handler externalization and native/CommonJS packages. `routesDir: "src/app"` continues to default to the parent `src` source root.
- Fixed App Router hydration for mapped interactive content so action buttons inside hydrated list rows update the live DOM instead of mutating a detached client render tree after the handler runs.

## 0.0.89 - 2026-05-27

### Added

- Added `mreactRouter({ production: { dropClientConsole } })` so production App Router client route bundles can remove selected `console.*` calls. `true` drops `console.debug`, `console.info`, and `console.log` while preserving warnings and errors; arrays such as `["log"]` can select individual methods.

### Fixed

- Fixed JSX comment handling so client navigation and hydration preserve the intended layout and route marker synchronization when compiled route output contains JSX comments.

## 0.0.88 - 2026-05-27

### Added

- Added `examples/react-compat-dashboard`, a Recharts-backed App Router dashboard that exercises `.compat.tsx` client boundaries, native route handlers, seeded SQLite data, SPA navigation, and no-JavaScript SSR fallback coverage.

### Changed

- Improved development App Router module execution by sharing a Vite runner module graph, preserving CommonJS/ESM external package behavior, defining Node filename globals for bundled route handler code, and keeping bundled source modules off `data:` import URLs.
- Added a default React-style namespace export from `@reckona/mreact` and `@reckona/mreact-compat` for libraries that import React as a default object.
- Changed normal server output for compat client references so `.compat.tsx` boundaries hydrate on the client instead of being invoked by the server renderer.

### Fixed

- Fixed route handlers in development when app-local server modules import native or CommonJS packages such as `better-sqlite3`.
- Fixed React-compatible class component hydration and rendering for app-local `.compat.tsx` component references.
- Fixed Recharts compatibility by preserving compat client boundaries, keeping layout-sensitive boundary parents as root containers, excluding React entrypoints from Vite dependency optimization, unmounting compat roots before SPA navigation removes them, and filling compat runtime gaps for `Children.forEach`, `useImperativeHandle`, and `getDerivedStateFromProps`.

## 0.0.87 - 2026-05-27

### Added

- Added `createDevtools({ maxEvents })` to cap retained devtools event history while live subscribers continue receiving all events.

### Changed

- Improved hot paths across non-router packages, including auth permission checks, query observer notifications, store selectors, reactive cell internals, and virtual list/grid range calculations.
- Added the `bench:non-router` script for tracking non-router package performance.

### Fixed

- Fixed development App Router module sharing so loaders and route handlers can share app-local server modules without duplicating singleton state.
- Fixed development server module imports so bundled source modules no longer expose huge `data:text/javascript;base64,...` URLs through `import.meta.url`, preventing dependency diagnostics or stdout writes from dumping full bundles into Playwright workers.
- Fixed form Standard Schema issue aggregation to collect nested schema issues linearly instead of dropping or repeatedly traversing errors.
- Fixed devtools retained event history so long sessions are bounded by the configured event cap.
- Fixed infinite query cache cleanup so released page cache entries and in-flight next-page state do not remain retained after removal.
- Fixed virtual grid/list repeated-key lookup paths so repeated key scroll helpers avoid quadratic scans.
- Added browser regression coverage for development route hydration when route pages share app modules with loaders/API routes and when route pages import compat client boundaries.

## 0.0.86 - 2026-05-26

### Fixed

- Fixed SPA navigation after route-handler mutations so hydrated route cell state is reset when fresh loader props arrive, preventing pages from reusing stale client-side props after returning from a detail view to a revalidated list.

## 0.0.85 - 2026-05-26

### Added

- Added a document-level hydration readiness signal for App Router client routes: hydrated route scripts now set `data-mreact-hydrated="true"` on `document.documentElement` and dispatch `mreact:hydrated` with `{ routeId }`.

### Fixed

- Fixed stale SPA navigation after client-side mutations by clearing cached navigation HTML after successful non-GET/HEAD client `fetch()` calls and bypassing cached route HTML for the next navigation fetch, so loader-rendered pages with `revalidate` or runtime `cacheControl()` are re-requested after ordinary route-handler mutations.
- Added regression coverage for catch-all route handler streams.

## 0.0.84 - 2026-05-26

### Changed

- Shortened the root README deployment section and moved detailed Node/container, AWS Lambda, Cloudflare, CDN asset, and source map deployment guidance into the dedicated `docs/deploy/` pages.

### Fixed

- Fixed App Router client route source generation so static imports used only by server-only route exports such as `loader()` and metadata are removed from the browser route module after those exports are stripped, preventing Vite's client dependency optimizer from discovering server-only packages such as database drivers.
- Fixed Playwright test discovery when running from a Claude Code `.claude/worktrees/<name>` checkout so the current worktree's tests are not ignored by the root config.

## 0.0.83 - 2026-05-26

### Added

- Added `@reckona/mreact-virtual`, a reactive virtualization package for large fixed or measured lists and responsive grids, including keyed entries, spacer telemetry, visible ranges, scroll helpers, and a 10,000-photo `examples/virtual-grid` demo with bounded DOM E2E coverage.
- Added `createInfiniteQuery()` to `@reckona/mreact-query` for cursor timelines that keep pages, page params, `hasNextPage`, and concurrent next-page dedupe in the query cache.
- Added optional `refetchOnWindowFocus` and `refetchOnReconnect` hooks to query observers and infinite query observers.

### Changed

- Improved AWS Lambda route artifact and preload behavior so direct handlers avoid unnecessary all-route work on first requests, redirects, middleware-only paths, and warm manifest reads.
- Changed package publish verification to dry-run the actual publish target set and verify only the packed tarballs, allowing a new JavaScript-only package to be published after existing packages at the same version were already released.

### Fixed

- Fixed the virtual-grid example so native viewport scrolling and the Page up, Page down, Jump to end, and Back to top buttons keep the rendered range and the actual scroll container synchronized.
- Fixed App Router route scanning so `.vite` and `node_modules` directories inside an app directory are ignored instead of being interpreted as route roots.

## 0.0.82 - 2026-05-25

### Added

- Added the public compiler `analyzeBoundaryGraph()` API for tracing route and module boundary decisions, including module/export classifications, rendered client boundaries, inferred server action sites, diagnostics, and trace reasons.

### Fixed

- Fixed App Router client boundary inference for rendered components imported through renamed barrel re-exports such as `export { Counter as Widget } from "./Counter"`, so the route manifest includes the barrel import instead of leaving the route server-only.
- Fixed production server action manifest inference for namespace form actions such as `<form action={actions.save}>`, so the referenced export is registered without requiring a direct named import.

## 0.0.81 - 2026-05-25

### Fixed

- Fixed App Router production client bundles for explicit `"use client"` pages that render imported interactive children inside imported layouts while the parent shell also contains client boundaries, so the route component is no longer emitted as `undefined` and imported form/client logic hydrates correctly.

## 0.0.80 - 2026-05-25

### Fixed

- Fixed client compilation for components that initially return `null` and then declare local fallthrough values before their JSX root return, so browser-event-driven App Router client boundaries such as install and service worker update banners can materialize after reactive cell updates.

## 0.0.79 - 2026-05-25

### Fixed

- Added regression coverage for adjacent initially hidden App Router client boundaries that materialize independently after browser install, offline, and service worker update events.

## 0.0.78 - 2026-05-25

### Fixed

- Fixed client-side dynamic SVG attribute bindings so generated SVGs with expression-bound `viewBox`, `className`, and SVG geometry attributes update through DOM attributes instead of assigning to read-only SVG DOM properties.
- Added regression coverage for initially hidden client boundaries that materialize after external `window` event callbacks update reactive cells.

## 0.0.77 - 2026-05-25

### Changed

- Improved production App Router rendering for routes whose build manifest proves there are no inferred form server actions by skipping an extra source parse/scan on the request path.
- Reduced reactive DOM event binding allocation by appending event metadata in place when a generated element receives multiple event handlers.

## 0.0.76 - 2026-05-24

### Added

- Added `mreact-router package cloudflare-pages --from .mreact --out .mreact/pages` to create Cloudflare Pages advanced mode output with a bundled `_worker.js`, copied route assets, public assets, and an artifact manifest.
- Added `mreact-router dev --port <port>` so one-off development and E2E runs can override `PORT` and `vite.config.ts` `server.port` without a separate config file.

## 0.0.75 - 2026-05-24

### Added

- Added `mreact-router start` host binding and Host header policy controls, including `--host`, `--host-policy`, `--allowed-hosts`, `HOST`, `MREACT_ROUTER_HOST_POLICY`, and `MREACT_ROUTER_ALLOWED_HOSTS`.

### Changed

- Changed generated container deployments to set `HOST=0.0.0.0`, `MREACT_ROUTER_HOST_POLICY=strict`, and `PORT=8080`, so published container ports can reach the Node server without implicitly trusting arbitrary Host headers.
- Extended generated App Router import policies to include optional runtime packages declared by transitive server dependencies, covering native runtime packages when Lambda handlers use `importPolicy: "generated"`.

### Fixed

- Fixed development client route modules with early JSX returns so Vite receives lowered JavaScript for query-served route modules instead of untransformed JSX.

## 0.0.74 - 2026-05-24

### Fixed

- Fixed App Router server action inference so typed form action registries, including member expressions such as `actions.save`, are lowered into server action references and included in production manifests.
- Fixed production client route bundles so inferred form action implementations are excluded from the browser dependency graph while preserving the server-side action manifest entry.

## 0.0.73 - 2026-05-24

### Fixed

- Fixed client JSX child lowering for nested JSX-producing expressions such as `condition && (kind === "link" ? <a /> : <button />)` and JSX arrays stored in component body variables, preserving real DOM nodes instead of rendering URL text or `[object HTML...]` strings.

## 0.0.72 - 2026-05-24

### Fixed

- Fixed development and built client route runtime resolution under pnpm strict dependency layouts so mreact runtime internals keep native reactive cells instead of being captured by route state preservation, avoiding `undefined` props in keyed list rows that render local components after async `cell()` updates.

## 0.0.71 - 2026-05-24

### Fixed

- Fixed client route list hydration for `Array.prototype.map()` callbacks that use the third `array` parameter, so nested local components receive the expected row props after async `cell()` updates instead of seeing `undefined` values.
- Fixed hydrated list updates to insert against the marker's current live DOM parent, preserving list item insertion after hydration has moved compiler markers from the detached template into the document.

## 0.0.70 - 2026-05-24

### Fixed

- Fixed development client route hydration so mreact runtime internals keep their own native reactive cells instead of being captured by route state preservation, avoiding stale keyed list item proxies when conditional maps reveal object rows that pass props into local components.

## 0.0.69 - 2026-05-24

### Fixed

- Fixed client route compilation for route-local derived arrays such as `const groups = getMediaMonthGroups()` where the helper reads `cell()` state, so mapped object rows keep fresh props when async cell updates reveal a conditional list and pass values into local components.
- Added regression coverage for route-local mapped object rows that pass props and event handlers to local components after async client route state updates.

## 0.0.68 - 2026-05-24

### Fixed

- Fixed published runtime sourcemaps so package `.js.map` files inline their source content, avoiding Vite development warnings about pnpm symlinked package sourcemap sources being outside the package boundary.
- Extended publish tarball verification to require source content in runtime `.js.map` files so future package sourcemaps remain quiet in Vite development servers.

## 0.0.67 - 2026-05-24

### Fixed

- Fixed published package sourcemaps so mreact packages include their referenced `src` files, avoiding Vite development warnings about missing or outside-package sourcemap sources when apps consume mreact from `node_modules`.
- Added publish tarball verification for `.js.map` and `.d.ts.map` source entries so future releases cannot ship sourcemaps that point to missing package files.

## 0.0.66 - 2026-05-24

### Fixed

- Fixed reactive DOM boolean property cleanup so `bindProp()` and `bindSpreadProps()` clear reflected properties such as `hidden` and `disabled` when the bound value becomes `false`, `null`, or `undefined`, keeping built client-boundary hydration in sync with the DOM attribute state.

## 0.0.65 - 2026-05-24

### Fixed

- Fixed App Router client boundary dependencies so app-local helper modules without JSX, such as shared locale state or i18n utilities imported by AppShell controls, keep their named exports in development and built client-route dependency transforms instead of being collapsed to an empty module.

## 0.0.64 - 2026-05-24

### Fixed

- Fixed server JSX lowering for MDX and other compat runtime components inside body-statement JSX paths, including conditional branches that read from local aliases such as `const p = props.data.post`, so imported MDX components render through compat SSR instead of stringifying as `[object Object]`.
- Added regression coverage for built and dev App Router layout AppShell client boundaries, including async `cell()` updates that remove boolean `hidden` attributes after hydration.

## 0.0.63 - 2026-05-24

### Fixed

- Fixed Vite development serving for app-local client boundary dependencies that import server-only utility modules, so lowercase route helper exports such as auth guards are no longer validated as components.
- Fixed Vite development module resolution for generated `@reckona/mreact-compat` and `@reckona/mreact-compat/jsx-dev-runtime` imports under pnpm strict dependency layouts.
- Added regression coverage for AppShell client boundaries with reactive boolean `hidden` attributes and MDX compat children mixed with sibling JSX in server output.

## 0.0.62 - 2026-05-24

### Fixed

- Fixed Vite development client boundary dependencies so app-local `"use client"` components imported by server-rendered app shells are transformed by the mreact client compiler before Vite serves them, avoiding React JSX runtime imports and visible `[object Object]` text in hydrated AppShell controls.

## 0.0.61 - 2026-05-24

### Fixed

- Fixed development client route assets so TypeScript-only syntax such as generic `cell<T>()` calls and typed event handler parameters is stripped before Vite parses the emitted JavaScript.
- Fixed built App Router client chunks so dynamic import preload helpers use the configured client asset base, avoiding `/assets/chunks/...` 404s when built output is served from `/_mreact/client/` or a CDN `assetBaseUrl`.

## 0.0.60 - 2026-05-24

### Fixed

- Fixed dev client route bundles so app-local modules shared by multiple hydrated routes resolve to a single browser module instance during navigation.
- Fixed server rendering for page-imported MDX components by treating `.mdx` component imports as React-compatible nodes and rendering them through the compat server renderer instead of stringifying them as `[object Object]`.
- Fixed server lowering for JSX map callbacks that return ternary JSX branches, preserving real list children and client-boundary placeholders inside lists instead of emitting a malformed dynamic expression.

## 0.0.59 - 2026-05-24

### Changed

- Changed production App Router client builds to bundle all client route entries in one graph with shared chunks, so app-local module singletons imported by multiple client routes keep the same browser module instance across SPA navigation.

### Fixed

- Fixed static prerender path generation so `generateStaticParams()` imports receive configured Vite plugin transforms, covering MDX-style and custom content modules imported by dynamic prerendered routes.
- Fixed Cloudflare client asset allow-listing for shared production client route chunks.

## 0.0.58 - 2026-05-23

### Fixed

- Fixed direct `renderAppRequest()` and static route rendering so loaders, metadata modules, layouts, and pages continue to receive user Vite plugin transforms when source modules import plugin-handled content.
- Fixed client output for nullable conditional component branches, including exported components that return `null`, so placeholders and branch updates stay stable during hydration and later reactive updates.
- Fixed dynamic branch and list item cleanup so reactive bindings created inside removed branches are disposed before stale child prop reads can run against nullable parent state.

## 0.0.57 - 2026-05-23

### Fixed

- Fixed static prerender and direct `renderAppRequest()` rendering so route loaders, metadata, and layout/page client inference honor user Vite plugin transforms for plugin-handled non-JavaScript imports.
- Fixed client route inference for layouts with CSS side-effect imports so configured Vite plugins do not cause CSS files to be parsed as JavaScript.
- Added regression coverage for client routes that render JSX from block-bodied `Array.prototype.map()` callbacks.

## 0.0.56 - 2026-05-23

### Fixed

- Fixed App Router client route inference and client builds so user Vite plugin transforms are applied when route components import plugin-handled non-JavaScript modules such as MDX-like content files.
- Fixed `.compat.tsx` client boundary hydration from reactive route components so imported React-compatible components using refs and hooks mount through the compat root instead of being rejected during router builds.

## 0.0.55 - 2026-05-23

### Added

- Added React-compatible JSX and event type exports through `@reckona/mreact`, including `JSX.Element`, `FormEvent`, `FormEventHandler`, `JSXEvent`, and `JSXEventHandler`.

### Fixed

- Fixed form `onSubmit` typing so `event.currentTarget` is inferred as `HTMLFormElement` for application code using the `@reckona/mreact` JSX runtime.
- Fixed server JSX lowering for early conditional route branches that depend on aliases declared before the branch, avoiding runtime reference errors when the branch returns before the normal JSX body.
- Fixed SPA route navigation cleanup so route-scoped reactive `effect()` work is disposed when the app-router client leaves the route.
- Coalesced burst `invalidateQueries()` observer notifications per query entry in a microtask while keeping invalidated entries stale immediately.

## 0.0.54 - 2026-05-23

### Added

- Added inferred form server actions: imported functions passed to `<form action={action}>` are lowered and registered without requiring a top-level `"use server"` directive. Inferred form actions include a hidden action token bound to the CSRF token and form nonce; multi-instance deployments should share `MREACT_SERVER_ACTION_SECRET`.
- Added `getServerRuntimeState()` and Node server `onUpgrade` hooks so custom Node servers can attach WebSocket upgrades and share server-only runtime state across independently bundled route artifacts.
- Added `MultipartStreamPart.fixedLengthStream()` for Workers APIs such as R2 that require known-length upload streams.
- Added compiler form-action reference helpers used by the router to lower real JSX form actions without touching string literals or comments.

### Changed

- Changed `createQuery()` to auto-fetch empty queries in the browser by default while keeping server render observe-only semantics. Use `autoFetch: false` when a route must only consume loader-prefetched query state.
- Extended the Cloudflare router compatibility shim so generated route modules can import multipart parsing and runtime state helpers from `@reckona/mreact-router`.

### Fixed

- Fixed client route rendering for nested ternary branches that depend on local aliases of `cell().get()` values, so route content stays reactive after updates.
- Fixed server action JSON dispatch so inferred form-only actions are excluded from the JSON action registry.
- Fixed form action lowering so text containing `<form action={...}>` is left as text instead of being rewritten as JSX metadata.
- Fixed static route import analysis to treat plugin-handled non-JavaScript imports as opaque instead of attempting source-module resolution.

## 0.0.53 - 2026-05-23

### Added

- Added `parseMultipartStream()` to `@reckona/mreact-router` so route handlers can read multipart text fields and stream large file parts to object storage with per-field and total byte limits instead of buffering uploads through `request.formData()`.

### Fixed

- Fixed keyed client lists that read nested object properties such as `member.user.displayName`, preserving updates for JSON-like rows without adding overhead to the normal keyed-list hot path.
- Fixed adjacent dynamic text expressions separated by static text so client output preserves JSX source order, for example `used / limit` labels no longer render the separator at the end.
- Fixed prebundled server component artifacts so user Vite plugins are forwarded when pages import plugin-transformed content modules such as MDX-like files.
- Fixed route-local `opengraph-image.tsx` under catch-all parents so the metadata route is matched before the catch-all page on Node, Cloudflare, and the native route matcher.

## 0.0.52 - 2026-05-23

### Added

- Added route-local dynamic `opengraph-image.tsx`, `.ts`, `.jsx`, and `.js` metadata conventions, including automatic `og:image` fallback metadata when a page does not define its own image.
- Added `MetadataImage` and widened `RouteMetadata.openGraph.image` / `images` to accept Next-style image objects with a required `url` field.

### Changed

- Changed catch-all route params such as `$...slug` to expose arrays of decoded path segments at runtime, matching `generateStaticParams()` values and the public `RouteParams` type.
- Forwarded route-agnostic user Vite plugins from `vite.config.ts` into router build bundles so MDX-like content transforms and custom loaders can participate in prerender, server, client, and Cloudflare outputs.

### Fixed

- Fixed prerendered loader and route metadata bundles so they honor the same project import policy and allowed source directories as the regular build path.
- Fixed Cloudflare builds for metadata conventions by registering generated route modules for `robots.ts`, `sitemap.ts`, `manifest.ts`, and dynamic Open Graph image modules.
- Fixed Cloudflare catch-all pages that call `notFound()` so generated route modules return 404 responses instead of 500 errors.
- Fixed static file convention asset placement so crawler, icon, and Open Graph assets are emitted at the served `.mreact/client` root instead of under an unreachable `public/` subdirectory.
- Fixed server-rendered runtime component aliases such as `const Body = props.data.post.Content; return <Body />`, covering common content/blog component selection patterns without requiring hand-maintained import conditionals.
- Fixed keyed reactive DOM lists that render browser object values such as `File` so same-key updates do not crash with `Reflect.get called on non-object`.
- Fixed Cloudflare route bundles that import CSRF helpers from `@reckona/mreact-router` by moving the helpers behind a Node-free `csrf` module and re-exporting them through the Cloudflare compat shim.

## 0.0.51 - 2026-05-23

### Added

- Added public route-handler CSRF helpers (`createFormCsrfToken`, `formCsrfCookie`, `formCsrfFieldName`, and `validateFormCsrf`) so custom multipart upload handlers can reuse the router's cookie/hidden-field CSRF convention.

### Changed

- Improved the Cloudflare create-mreact-app template with build-before-dev Wrangler scripts, Workers type support, a `worker-env.d.ts` binding stub, commented R2 binding guidance, and a dynamic default page instead of prerender-by-default.

### Fixed

- Fixed lowercase JSX helper function calls and trusted `dangerouslySetInnerHTML={{ __html }}` server rendering for application-owned inline bootstraps.
- Fixed generated Cloudflare route handlers so `route.ts` method exports receive decoded params, the original request, the matched route, `context.env`, and the Worker execution context.
- Fixed generated Cloudflare dynamic pages so page metadata can override layout titles and pages without route metadata keep the layout's literal title.
- Added regression coverage for keyed object list rendering across unrelated route-owned `cell()` updates.

## 0.0.50 - 2026-05-23

### Changed

- Improved `create-mreact-app` workspace example scaffolding so projects created under `examples/<name>` use the `@reckona/example-<name>` package convention, local `workspace:*` ranges, and the query, reactive DOM, test utility, Playwright, and `tsx` dependencies needed for non-trivial App Router examples.

### Fixed

- Fixed App Router loader and route metadata builds for CommonJS/ESM interop cases such as Firebase Admin Firestore, while preserving thrown or returned `Response` control flow from loaders.
- Fixed `<Await>` rendering in layouts, imported layout components, and imported server components, including top-level conditional renderer bodies and renderer component references, so streamed out-of-order fragments render HTML instead of disappearing or stringifying objects.
- Fixed development client route asset diagnostics and bundle isolation for `.client.tsx` boundaries, so routes with server-only Node imports outside the client boundary do not pull those imports into the browser bundle and build failures return actionable 500 responses instead of bare 404s.
- Fixed dynamic route hydration normalization for changing route content and added regression coverage for layout/imported Await shapes.

## 0.0.49 - 2026-05-22

### Added

- Added `invokeRouteHandler()` to `@reckona/mreact-test-utils` for unit-testing app-router route handlers while converting `redirect()`, `notFound()`, and thrown `Response` control flow into assertable `Response` objects.

### Changed

- Changed the default status for throw-based `redirect(location)` to HTTP 303 so auth and form redirects after POST continue as GET requests by default; pass `{ status: 307 }` when method-preserving redirects are required.

### Fixed

- Added a regression test for loader-data-driven function-call route content passed through layout children, covering the hydration normalizer crash shape reported during app migration.

## 0.0.48 - 2026-05-22

### Fixed

- Fixed App Router hydration for routes that mix route-owned `cell()` state or event handlers with imported client boundaries, so file inputs and other route-level handlers continue to resume and update after the boundary placeholders hydrate.

## 0.0.47 - 2026-05-22

### Changed

- Clarified App Router client boundary documentation so `.client.tsx` files and component-level `"use client";` directives are described as the same hydrated boundary marker shape, while route-level `"use client";` remains the whole-route hydration escape hatch.
- Improved `create-mreact-app` starter DX for workspace detection, generated `typecheck` and `lint` scripts, and post-create guidance for running the app and handling pnpm build-script approval.

### Fixed

- Fixed App Router client route inference for route-side client data loading hidden behind same-module browser-only helpers, so routes that update `cell()` state from client startup code emit the required client route bundle without a manual route-level `"use client";`.
- Fixed reactive text expression updates so hydration replaces the existing text node instead of appending a second copy on later state changes.
- Fixed dashboard template login and logout flows so generated projects work out of the box with the starter middleware, auth actions, and devtools file layout.
- Fixed TypeScript import policy parsing for valid async generic arrow exports and preserved reactivity for `cell.get()` aliases inside conditional route lists.
- Fixed app-local server modules that read `import.meta.url` in dev so transformed modules still expose a `file:` URL suitable for `fileURLToPath()`.

## 0.0.46 - 2026-05-22

### Changed

- Simplified published benchmark result directories so workflow-generated public reports for the same run are written side by side, while local investigation microbenchmarks stay out of the published workflow output.

### Fixed

- Fixed App Router client route hydration for route-local component props backed by `cell.get()`, so extracted interactive controls can pass reactive checked/value props and event handler props through helper components without freezing the initial value.
- Fixed App Router client bindings that use a local `const` alias assigned from `cell.get()`, so conditional UI, dynamic attributes, and component props remain reactive when state is read into a local variable before JSX.
- Fixed route-local components that initially return `null`, so client hydration no longer inserts visible `"null"` text and later `cell` updates can render the component output.

## 0.0.45 - 2026-05-22

### Fixed

- Fixed App Router dev client route assets for interactive routes that also export `loader` as a typed function declaration, so the dev server strips server-only route exports before client route reference analysis and bundle generation.

## 0.0.44 - 2026-05-22

### Changed

- Clarified App Router client inference documentation for route-local uppercase helper components reached from supported JSX or function-call render shapes.

### Fixed

- Fixed App Router client route inference for route-local uppercase helper components such as `ThemeToggle()` that contain `cell()` state, event handlers, or browser globals, so direct function-call UI rendered from a page hydrates as the route client component.

## 0.0.43 - 2026-05-22

### Added

- Added `generateMetadata({ data, params, request })` for App Router pages and layouts so route metadata can depend on resolved loader data while static `metadata` remains the base and fallback.
- Added App Router root file conventions for `robots.ts`, `sitemap.ts`, and `manifest.ts`, plus static crawler/install assets such as `robots.txt`, `sitemap.xml`, `manifest.webmanifest`, `favicon.ico`, `icon.*`, `apple-icon.*`, and `opengraph-image.*`.
- Added conservative default security response headers for rendered routes and `metadata.security` controls for content type, referrer, permissions, frame, and HSTS policies.
- Added server-target JSX spread attribute support for HTML and SVG elements, including JSX alias normalization and the same escaping, URL filtering, and event/ref dropping rules as normal dynamic attributes.
- Added `removeQueries()` to `@reckona/mreact-query`, mutation context values returned from `onMutate`, and `createMemorySessionStore({ maxEntries, sweepIntervalMs })` options.
- Added `bench:html-escape` and `bench:request-fastpaths` benchmark commands, and exposed the request fast-path benchmark through the manual GitHub Actions benchmark workflow.

### Changed

- Hardened AWS Lambda request normalization so production handlers default to strict Host validation, forwarded host/proto headers are trusted only when explicitly configured, and `allowedHosts` is required for public deployments.
- Improved route cache and SPA navigation cache behavior, including lower-overhead cache clock reads and stronger memory cache bounds for navigation payloads and route HTML entries.
- Replaced brittle source-text tests with behavioral coverage across forms, query mutation lifecycle, observer churn, reactive core batching edges, and public entrypoint surfaces.

### Fixed

- Fixed App Router server rendering for spread-heavy helper components and SVG children while preserving unsafe URL and raw `srcDoc` protections.
- Fixed SPA navigation and route memory caches so cross-route navigation, redirects, and route cache invalidation avoid stale payloads.
- Fixed form reset so pending field-level async validation generations are invalidated when a form is reset.
- Fixed query optimistic update rollback ergonomics by passing `onMutate` context into `onError` and `onSettled`, and ensured `removeQueries()` aborts in-flight requests and resets subscribed observers.
- Avoided unnecessary cookie URI decoding for raw cookie values without percent escapes in router cookie parsing and server action CSRF cookie reads.

## 0.0.42 - 2026-05-22

### Changed

- Documented the App Router compiler server target limitation for JSX spread attributes and the recommended migration path of explicit server-rendered attributes or helper components.

### Fixed

- Fixed JSX text named entities such as `&rsaquo;`, `&rsquo;`, and `&hellip;` so compiler server, stream, client, and compat output render decoded characters instead of visible literal entity text.
- Fixed route-local helper components that return SVG JSX from early `if` branches so server and stream routes render child SVG elements instead of `[object Object]`.

## 0.0.41 - 2026-05-22

### Added

- Added a `viteConfig` option to `startDevServer()` so programmatic dev server callers that already loaded a Vite config can preserve CSS plugins and other route-agnostic Vite settings.

### Fixed

- Fixed `mreact-router dev` so the CLI passes the loaded Vite config into the dev server, ensuring the mreact dev CSS endpoint returns compiled CSS for Tailwind/PostCSS pipelines instead of raw directives such as `@tailwind` or `@apply`.
- Fixed function-call component hydration so reactive `class` and spread props are retargeted from the client-created resume tree to the live server DOM, allowing delegated events and subsequent reactive updates to affect the visible element.

## 0.0.40 - 2026-05-21

### Changed

- `mreact-router dev` now preserves route-agnostic Vite plugins and CSS settings from `vite.config.ts`, so development CSS transforms such as PostCSS and Tailwind-style processing are applied when serving App Router pages.

### Fixed

- Fixed route-level uppercase component function calls inside fragment roots so imported interactive components hydrate without a `replaceWith` crash and their event handlers attach correctly.
- Fixed development HTML for App Router CSS imports by linking route styles through an mreact dev CSS proxy that returns `text/css` while still passing through Vite's CSS transform pipeline.

## 0.0.39 - 2026-05-21

### Added

- Added `defer()` and `DeferredLoaderData` for App Router loaders, allowing routes that render `<Await>` to return critical data immediately while non-critical promise fields stream through route-local Await boundaries.
- Added `@reckona/mreact-router/stream-list` with `streamList()` for ordered progressive list batching while keeping `<Await>` boundaries visible to the stream compiler.

### Changed

- Inferred streaming output for routes that render `<Await>` directly or through app-local server components, while keeping `export const stream = true` available for explicit streaming.
- Updated the Hacker News example to dogfood deferred user submissions and progressive feed batches.

### Fixed

- Preserved mapped `<Await>` boundaries in server stream output, including progressive list recipes that render sibling Await boundaries from `Array.map()`.
- Fixed page loaders that throw a standard `Response`, including redirects, so they short-circuit rendering instead of becoming a 500 response. Cloudflare route-module loaders now follow the same behavior.

## 0.0.38 - 2026-05-21

### Fixed

- Fixed App Router dev HTML for CSS imported from layouts outside the route directory, preserving Vite source stylesheet URLs such as `/src/global.css` instead of rewriting them to router client asset URLs.

## 0.0.37 - 2026-05-21

### Added

- Added App Router stylesheet asset support for CSS imported from pages, layouts, and templates. Production builds emit hashed route CSS assets under `.mreact/client/assets/routes/` and rendered HTML links them automatically; Vite dev links the source CSS directly.

### Fixed

- Fixed top-level same-module helper components that return JSX from `switch` branches, so helpers such as document block renderers can be called from route JSX without unsupported top-level JSX diagnostics or escaped server HTML.

## 0.0.36 - 2026-05-21

### Fixed

- Fixed `create-mreact-app upgrade` so existing app-router projects get `@reckona/mreact-router/app-router-globals` added to `tsconfig.json`, allowing layouts to use `<Slot />` without manual global type declarations.
- Fixed imported app-local client components that receive event handler props from a parent client route, preserving callable function props by falling back to full route hydration only when boundary props are not JSON-serializable.
- Fixed exported client components that return root-level conditional JSX such as `return sent.get() ? <SuccessView /> : <ResetForm />`, including server string and streamed server output support.

## 0.0.35 - 2026-05-21

### Fixed

- Fixed delegated click handling for imported JSX client boundaries cloned from templates, so browser clicks on hydrated boundary controls dispatch through the live document after the boundary is inserted.

## 0.0.34 - 2026-05-21

### Changed

- Documented the supported imported-component client inference shapes, including direct uppercase function-call route returns.

### Fixed

- Fixed strict package-manager installs for router client route builds by declaring the router's direct dependency on `@reckona/mreact-reactive-dom`.
- Fixed hydration crashes when imported client boundaries render conditional or dynamic nodes before later text bindings.
- Fixed imported app-local client boundary event handlers so boundary hydration preserves interactive updates.
- Fixed client route inference and bundle generation for routes that return an imported uppercase component function call such as `return LegalPage({ page })`.

## 0.0.33 - 2026-05-21

### Fixed

- Fixed development client route bundles under strict package managers by declaring the router's direct dependency on `@reckona/mreact-reactive-core`.
- Fixed imported app-local client components outside the route directory so client route bundles compile those dependencies to DOM-producing output instead of hydrating compat JSX objects such as `[object Object]`.

## 0.0.32 - 2026-05-21

### Added

- Added a Hacker News example that exercises App Router streaming, route handlers, router `Link` navigation, Tailwind styling, E2E coverage, and generated Cloudflare Worker deployment.
- Added a router build-time benchmark with run-numbered result output so repeated before/after build measurements can be compared without overwriting same-day results.

### Changed

- Improved automatic client boundary inference so rendered app-local components in pages, layouts, templates, wrappers, static registries, computed keys, namespace references, and single-candidate selections can be inferred more precisely while keeping server-only imports out of client bundles.
- Shared compiler module context across router inference and transforms, reducing repeated AST/module analysis work during builds and request rendering.
- Documented and stabilized the compiler internal analysis entrypoint used by the router for monorepo integration.

### Fixed

- Fixed Cloudflare and streamed `<Await>` output involving router `Link` components, mapped list rows, conditional links, repeated placeholders, and generated route modules so streamed fragments preserve user links and navigation can fall back cleanly when full route-marker HTML is not available.
- Fixed Cloudflare generated Worker route handling for dynamic pages, public/client assets, and server route method exports including `GET`, `POST`, and `ALL`.
- Fixed stale client inference source-cache reuse after app-local component files change in the same process.

## 0.0.31 - 2026-05-20

### Changed

- Changed direct AWS Lambda handlers to default background preload to middleware and shared runtime only, reducing cold first-hit contention from all-route preload work while keeping preloaded Lambda handlers on full init-time preload by default.
- Split built server module artifacts into request/control and render artifacts and moved compiled module bodies into hashed `.mjs` files, so loader and middleware redirects can avoid reading page render bundles before rendering is needed.

## 0.0.30 - 2026-05-20

### Added

- Added AWS Lambda preload wait controls so direct handlers can wait for hot-route preload on the first request or only before page rendering, with `preloadWaitMs` timing for request-level and render-level attribution.

### Fixed

- Fixed conditional `Link` rendering inside streamed `<Await>` renderers so user links and other compat components are preserved in Cloudflare stream output.
- Prebundled Node and AWS Lambda server component artifacts so first page renders can import matching built `string` and `stream` component modules without request-time rebundling.

## 0.0.29 - 2026-05-20

### Fixed

- Fixed Cloudflare streamed output when mapped rows inside `<Await>` renderers include router `Link` components, preserving the resolved out-of-order fragment content and link attributes at runtime.

## 0.0.28 - 2026-05-20

### Added

- Added Cloudflare generated Worker support for App Router server routes, so `route.ts` method exports are bundled into Workers-safe route modules and dispatched by the generated Worker.
- Added standard router CLI help entrypoints for `mreact-router --help`, `mreact-router help`, `mreact-router help build`, and command-level `--help` usage.

### Fixed

- Fixed `Link` rendering inside streamed `<Await>` renderers by allowing stream-only page artifacts when the fallback string artifact cannot represent the Await inner component.
- Fixed built runtime preloading for stream routes whose string artifact is intentionally omitted, so Node and Lambda preloads can still warm the stream artifact without re-triggering the unsupported string transform.

## 0.0.27 - 2026-05-20

### Added

- Added `mreact-router build --target=aws-lambda`, emitting a generated preloaded Lambda handler and `.mreact/server/import-policy.json` alongside the Node-compatible server/client build output.
- Added `mreact-router package aws-lambda --from .mreact --out .lambda`, which creates a minimal Lambda asset directory with `.mreact`, `mreact-handler.mjs`, copied package metadata/lockfiles, and a size manifest.
- Added generated Lambda import policy support via `importPolicy: "generated"` and `{ fromManifest: true }` on the AWS Lambda adapter.
- Added a generated Cloudflare Worker artifact at `.mreact/cloudflare/worker.mjs` for `mreact-router build --target=cloudflare`, removing the need for hand-written Worker adapter glue in standard deployments.
- Added numbered same-day benchmark result directories such as `benchmarks/results/2026-05-20/001` so repeated measurements are not overwritten.

### Changed

- Replaced the router's direct esbuild bundling path with the shared Vite/Rolldown build pipeline for server action, loader, metadata, route handler, client route, and Cloudflare route module builds.
- Updated `create-mreact-app` AWS Lambda scaffolds to use the generated Lambda build/package path and generated import policy by default.
- Updated the Cloudflare scaffold and app-router example documentation to use the generated Worker artifact instead of a source-level Worker entrypoint.

## 0.0.26 - 2026-05-20

### Fixed

- Preserved visible first paint for Cloudflare streamed HTML responses by marking mreact stream responses with `Cache-Control: no-transform` and `Content-Encoding: identity` so Workers compression does not gzip-buffer the shell before `<Await>` placeholders can render.
- Added `placeholderAs` for streamed `<Await>` placeholders and switched route loading boundaries to a block placeholder host, making list and section skeletons semantically valid without repeated fallback text in every boundary.

## 0.0.25 - 2026-05-20

### Fixed

- Avoided failed Cloudflare client navigations that downloaded a full document before falling back by returning an immediate reload signal for route-module navigation requests.
- Skipped non-navigation-compatible Cloudflare prerendered HTML bodies during client navigation while preserving prerendered responses that already contain `data-mreact-route-id` markers.

## 0.0.24 - 2026-05-20

### Fixed

- Fixed out-of-order streaming `<Await>` placeholders so fallback content is rendered visibly in browsers before the streamed fragment is reordered into place.
- Added DOM-level coverage for rejected `<Await>` values to verify `catch` content replaces the visible placeholder after client-side out-of-order fragment reordering.

## 0.0.23 - 2026-05-20

### Added

- Added `preload: { mode: "hot-route-requests", routes }` for AWS Lambda handlers, warming middleware and selected route request modules without evaluating page/layout render modules during Lambda initialization.
- Added deeper render timing diagnostics for page and layout work, including page module load, page component render, route slot render, layout source read, layout transform, layout module load, layout component render, and layout slot split phases.
- Added buffered Lambda response drain sub-phases (`streamReadMs` and `streamConcatMs`) and included buffered/streaming response timing columns in the local Lambda route latency benchmark.

### Changed

- Drained buffered AWS Lambda proxy responses with an explicit reader and copy step instead of `Response.arrayBuffer()`, making response conversion work observable and avoiding an extra copy for single-chunk bodies.

### Fixed

- Removed duplicate page/layout `request` artifacts when dedicated loader or metadata artifacts are available, reducing built server module artifact size for Lambda and Node deployments.
- Kept loader-only artifacts free of page-only dependencies while preserving side-effect-only imports conservatively.

## 0.0.22 - 2026-05-19

### Fixed

- Split built loader and route metadata artifacts so loader redirects do not evaluate metadata-only dependencies before a page render needs metadata.
- Reuse build-time route source analysis summaries in built Node and AWS Lambda runtimes, reducing first-hit `sourceAnalysisMs` work and adding `sourceAnalysisArtifactMs` timing when the summary is used.
- Include `sourceAnalysisArtifactMs` in the local Lambda route latency benchmark report.

## 0.0.21 - 2026-05-19

### Fixed

- Split page render exports out of route request artifacts, so loader redirects and route metadata imports no longer evaluate page-only dependencies before a page render is needed.
- Emit route render timing for built middleware redirects and responses that return before dynamic route rendering.

## 0.0.20 - 2026-05-19

### Added

- Added a local AWS Lambda route latency benchmark for cold health checks, first redirects, and warm redirects using API Gateway HTTP API v2-style events.

### Changed

- Split route render timing for loader and middleware work into module-load and user-code execution phases, so high `loaderWaitMs` and `middlewareMs` values can be attributed more precisely.

## 0.0.19 - 2026-05-19

### Changed

- Improved AWS Lambda route timing diagnostics so `timings: true` also forwards route-level `router:render:timing` events for route matching, middleware, loader wait, page render, layout render, metadata, and response construction phases.
- Documented that static middleware `config.matcher` and `config.id` values are checked before importing the middleware module in built Lambda and Node paths.

### Fixed

- Avoided importing built middleware modules when a static `config.matcher` excludes the request or route-local middleware controls skip the matching middleware id, reducing health-check and unrelated route first-hit work.
- Deferred page component server transforms and render imports until after loaders settle for non-stream routes and stream routes without a loading boundary, so loader redirects can return without page render artifact work.

## 0.0.18 - 2026-05-19

### Changed

- Split AWS Lambda response timing diagnostics so buffered handlers report `streamDrainMs` and `bodyEncodeMs`, while streaming handlers report `streamWaitMs` and `streamWriteMs` alongside their existing total response phases.
- Updated AWS Lambda timing documentation to clarify how buffered proxy responses attribute streamed `<Await>` body drain time.

### Fixed

- Fixed generated Cloudflare route modules so both string and `stream = true` built routes preserve app-router layout/template shells and named slots instead of rendering only the matched page inside an empty document.

## 0.0.17 - 2026-05-19

### Added

- Added route-local CSP controls so pages can replace, remove, or disable inherited CSP directives for narrow integration routes.
- Added sanitized router error-boundary context with request id, route id, trace id, and development-only debug details.
- Added router instrumentation hooks with W3C trace context parsing for request, middleware, and loader timing integrations.
- Added route-local middleware skip controls for globally registered middleware with stable ids.
- Added auth session refresh and revoke helpers that synchronize auth claims with router session rotation and deletion.
- Added an opt-in in-page devtools overlay with Reactive, Query, and Router tabs.
- Added a dashboard starter template and an upgrade subcommand to `@reckona/create-mreact-app`, plus the initial codemod registry.
- Added route loader data inference, component-focused test utilities, query lifecycle hooks, form field bindings, computed equality options, async batching, router runtime cache stats, and production client source map controls.

### Changed

- Improved compiler JSX heuristics and diagnostics, including invalid JSX suggestions and better source locations.
- Optimized reactive DOM event handling, keyed moves, router header/cookie handling, and streaming backpressure propagation.
- Reduced GitHub Actions artifact storage: CI no longer uploads native build artifacts, publish artifacts are retained for one day, and benchmark workflow results are committed to `benchmarks/results` instead of stored as Actions artifacts.
- Updated benchmark results and reporting for the 2026-05-19 primitive run.

### Fixed

- Fixed Lambda and app-router cold path behavior with route module preloading strategies, native package verification, and first-byte profiling.
- Fixed streamed component children containing `<Await>` and avoided Buffer-specific behavior in edge streaming sinks.
- Fixed router session id generation so auth/session helpers can be bundled into Cloudflare route modules without a Node `crypto` dependency.
- Fixed compiler diagnostic and source-map quality issues found during the 2026-05-19 issue pass.

## 0.0.16 - 2026-05-19

### Changed

- Excluded platform-specific native addon packages from local pnpm workspace project discovery, removing expected unsupported-platform warnings from normal workspace and example commands while keeping the packages available for CI artifact staging and npm publishing.

### Fixed

- Fixed built app rendering so middleware redirects, rewrites, and responses are resolved before loading the matched page route artifact. This avoids expensive first-hit page artifact reads and evaluation for routes that are short-circuited by middleware, such as unauthenticated Lambda redirects.

## 0.0.15 - 2026-05-19

### Added

- Added opt-in AWS Lambda phase timing diagnostics with `timings: true`, emitting `router:request:timing` debug events for event normalization, runtime directory preparation, render, and response conversion phases.

### Changed

- Split built app server module artifacts out of `.mreact/server/manifest.json` into `.mreact/server/server-modules/*.json`, keeping the manifest small while preserving preload support and lazy-loading only the matched route artifact closure when needed.
- Updated AWS Lambda deployment documentation to describe external server module artifacts, matched-route artifact loading, and timing diagnostics.

### Fixed

- Fixed Cloudflare stream output for conditional list/map bodies so async conditional render paths keep JSX list output instead of compiling to an empty response.
- Fixed repeated stream component instances containing `<Await>` so out-of-order placeholder and fragment ids are unique per rendered boundary instance.
- Fixed repeated React Suspense out-of-order boundaries with the same compiled ids by assigning per-sink boundary and segment ids.
- Fixed `mreact-router dev` startup on occupied ports so it rejects with an actionable `PORT=<free-port>` message instead of crashing with an unhandled `EADDRINUSE` server error.

## 0.0.14 - 2026-05-19

### Changed

- Prebundled production app-router request modules for loaders, middleware, route handlers, and route metadata during `mreact-router build`, reducing first-hit work for AWS Lambda and other Node deployments.
- AWS Lambda adapters now start built runtime preloading in the background without blocking the first request on unrelated route modules, and preload built request modules serially to cap peak memory use.

### Fixed

- Fixed Cloudflare generated route modules for `stream = true` pages, including route-local `<Await>` boundaries and local server-component imports.
- Updated generated AWS Lambda deployment documentation so Node-only Lambda builds use `mreact-router build --target=node` and `buildTargets: ["node"]`.

## 0.0.13 - 2026-05-19

### Added

- Added explicit app-router build targets via `mreact-router build --target=node`, `--target=cloudflare`, and `buildApp({ targets })`, with `buildTargets` support in router project config.
- Added built runtime preloading for AWS Lambda adapters so route loaders, middleware, route handlers, and generated runtime modules can be bundled before the first matched request on warmable runtimes.

### Changed

- Updated generated app-router, Tailwind, container, AWS Lambda, and Cloudflare project scripts so target-specific deployments build only the artifacts they need.
- Documented Node-only and Cloudflare-only build target guidance across the root README, router README, create-mreact-app README, and app-router example.

### Fixed

- Fixed Node/AWS Lambda app-router builds that previously generated Cloudflare route modules and attempted to bundle Node-only server dependencies for Workers.
- Fixed built route handler and loader source bundling for `.ts`, `.mts`, `.cts`, `.mreact.ts`, and JSX source modules by selecting the correct esbuild stdin loader from the source filename.
- Fixed Cloudflare route module generation for `stream = true` routes by failing the build with an explicit unsupported-stream error instead of emitting incomplete string-rendered output.
- Fixed `Await` renderer validation so component references inside unsupported stream renderers report `MR_UNSUPPORTED_AWAIT_INNER_COMPONENT` instead of compiling to empty output.

## 0.0.12 - 2026-05-18

### Added

- Added `mreact-router dev --log=requests`, `mreact-router start --log=requests`, and `MREACT_ROUTER_LOG=requests` for compact request logs across dev, Node, AWS Lambda, Cloudflare, and edge runtimes.
- Added server-only app-router navigation runtime support via `export const navigationRuntime = true`, enabling prefetch and client-side navigation without promoting the whole route to a hydrated client route.
- Added `Await` to `@reckona/mreact-router/app-router-globals` so shared app-router `.tsx` files can typecheck `<Await>` alongside `<Slot>`.

### Changed

- Improved AWS Lambda deployment guidance and `create-mreact-app --deploy aws-lambda` output for minimal artifacts, pnpm hoisted production installs, symlink counts, actual file-byte checks, and read-only `outDir` deployments.
- `createAwsLambdaRequestHandler()` and the streaming Lambda handler now treat the deployed `outDir` as read-only and materialize generated runtime files under a writable runtime directory, with a `node_modules` symlink back to the deployed package root.
- Production built runtimes now cache loader, middleware, and route handler modules across warm requests, avoiding repeated request-time bundling in Lambda-style deployments.

### Fixed

- Fixed stream routes that render `<Await>` inside imported or transitive local server components, preventing `[object Promise]` output while preserving the fast path when no out-of-order boundary can render.
- Fixed nested `<Await>` renderers so the server stream compiler reports `MR_UNSUPPORTED_NESTED_AWAIT` instead of silently dropping the inner boundary.
- Changed Cloudflare route module and loader generation to fail the production build when Workers-safe modules cannot be bundled, rather than writing runtime placeholder modules.

## 0.0.11 - 2026-05-18

### Changed

- Updated the Cloudflare app scaffold and example worker to import the generated `.mreact/cloudflare/route-modules.mjs` registry instead of requiring hand-written dynamic route module maps or Vite-only `import.meta.glob` transforms.

### Fixed

- Fixed server rendering of router `Link` components inside imported shared server components and imported `renderXxx()` helper calls so they no longer render `[object Object]` or escaped HTML.
- Fixed `mreact-router build` for Cloudflare Workers by emitting Workers-safe route module chunks for dynamic and non-prerendered App Router pages, with explicit warnings and fallback modules for routes that import unsupported Node-only dependencies.

## 0.0.10 - 2026-05-18

### Fixed

- Fixed root Playwright test discovery when the repository checkout itself lives under `.worktrees`.
- Fixed generated `create-mreact-app` Vite configs so router project paths resolve from the generated project directory in programmatic dev-server launches.
- Updated router configuration examples to include explicit `projectRoot` settings.

## 0.0.9 - 2026-05-18

### Fixed

- Fixed built app middleware detection when apps are built from a configured `routesDir` such as `src/app`.
- Documented `importPolicy.allowedPackages` for AWS Lambda adapters and scaffolded Lambda handlers so production apps can allow server-side npm dependencies explicitly.
- Documented that production server-side app modules should use relative imports instead of tsconfig-only path aliases when import policy is enforced.
- Fixed `create-mreact-app --src-dir` templates so generated NodeNext projects use an explicit `.js` extension for the local `app-info` import.

## 0.0.8 - 2026-05-18

### Fixed

- Fixed app-router server rendering when a page imports local server components that receive JSX children, preventing layout slots from rendering `[object Object]` or escaped child HTML.
- Applied the same local server-component dependency transform to stream routes so imported server components render consistently across string and streaming SSR paths.

## 0.0.7 - 2026-05-18

### Fixed

- Fixed source app rendering and dev SSR for allowed CommonJS server dependencies whose dependency closure requires Node built-ins such as `events`.
- Avoided client-boundary inference warnings for lowercase server helper imports whose implementation details look client-like, keeping server-only config/auth/query helpers out of client boundary diagnostics.

## 0.0.6 - 2026-05-18

### Changed

- `mreact-router dev` now honors `server.port` from `vite.config.ts` when `PORT` is not set.
- Development server requests now allow packages declared in the application `package.json` so server-only loaders, handlers, and auth helpers can import normal application dependencies without weakening production import policy defaults.

### Fixed

- Fixed dynamic route handlers so method exports receive `{ params }` as their second argument.
- Fixed published pnpm dependency resolution for transitive `@reckona/mreact-*` imports so packages such as `@reckona/mreact-query` resolve their own nested dependencies from the importing package directory.
- Kept loader-only server imports out of client-boundary inference in the production build path.

## 0.0.5 - 2026-05-18

### Added

- Added client-route script prefetching for app-router navigations, including intent and viewport modes with reduced-data and slow-connection guards.
- Added `Link`, `linkProps`, and per-link navigation controls for prefetching, full reloads, scroll preservation, and View Transition opt-in.
- Added app-router navigation state subscriptions through `getNavigationState()` and `subscribeNavigationState()`.
- Added `@reckona/mreact-router/link`, `@reckona/mreact-router/navigation-state`, and `@reckona/mreact-router/app-router-globals` subpaths for more granular client helper imports and route global typing.
- Added `onResponse` hooks across the built app renderer and deployment adapters so apps can set global response headers in one place.

### Changed

- Improved client-side app-router navigation so route payloads, head metadata, route-data scripts, and scroll restoration stay synchronized without a full page reload.
- Updated generated app-router starter projects to include the app-router global type declarations in `tsconfig.json`.

### Fixed

- Preserved thrown `Response` objects from route handlers and page loaders so redirects, errors, and custom responses pass through unchanged.
- Avoided treating lowercase helper exports in page modules as route conventions during route compilation.
- Avoided client-boundary warnings for server-only imports that are used only by stripped route loader exports.
- Fixed app-router source bundling from published `@reckona/mreact-router` dist so internal package aliases resolve to scoped package folders such as `@reckona/mreact-query` instead of monorepo-only folder names.

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
