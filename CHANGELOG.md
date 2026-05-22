# Changelog

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
