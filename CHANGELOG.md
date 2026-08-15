# Changelog

## 0.0.203 - 2026-08-15

### Added

- Added `shouldDehydrateQuery` filtering to query dehydration and router render or adapter options so applications can exclude server-only or sensitive successful queries from delivered HTML.
- Added namespace-preserving compiler and reactive DOM support for qualified JSX attributes such as `xlink:href`, `xml:lang`, and `xmlns:xlink`, including unsafe URL filtering for URL-bearing namespaced attributes.

### Changed

- Changed custom server action replay stores to an atomic asynchronous `claim()` contract. Claimed nonces are consumed once application code begins, concurrent replays return `409`, and capacity or store failures fail closed with `503`.
- Changed generated Cloudflare projects to enable `nodejs_compat` so the adapter can use native request-local storage. Without that runtime support, Cloudflare rendering is serialized with a one-time warning to preserve request query isolation.
- Changed external prerender and route cache entries to schema version 4 with separate document and client-navigation HTML plus request-scheme-aware HSTS metadata. Older entries are treated as misses, and custom stores must persist the new fields passed to `set`.
- Changed Flight serialization and decoding to preserve repeated object identity through shared references while rejecting cyclic object and server-reference graphs.

### Fixed

- Fixed React-compatible callback ref cleanup, component-owned bare effect replacement and disposal, late DOM ref adoption, delegated event deduplication, and CommonJS export parity.
- Fixed compiler and reactive DOM handling for JSX returned from arrow props, merged server prop evaluation, exact `dangerouslySetInnerHTML` payloads and source order, qualified attributes, and coerced unsafe URL values.
- Fixed prerendered and cached navigation responses so document and client-navigation variants cannot be confused, request origins and queries are not captured in shared hydration HTML, HSTS follows the consuming request scheme, and invalid navigation markers or security metadata fail closed across Node, Lambda, and Cloudflare adapters.
- Fixed query invalidation so explicit refetches do not duplicate in-flight work, auth guards so empty requirements fail closed, `mreact-router start` so `--port` overrides `PORT`, Cloudflare query-client isolation when native request-local storage is unavailable, and generated apps so local secret files are ignored.

## 0.0.202 - 2026-08-09

### Added

- Added opt-in forwarded HTTPS detection for Node deployments through `trustForwardedProto`, `--trust-forwarded-proto`, and `MREACT_ROUTER_TRUST_FORWARDED_PROTO=1`. The default remains disabled, TLS sockets take precedence, and proxy trust requires an overwriting trusted proxy with no direct access to the Node port.

### Changed

- Changed shared route cache and external prerender entries to a new fail-closed schema that preserves complete response and security headers. Custom Redis, KV, database, or prerender stores must persist every field passed to `set`; entries from older schemas are treated as misses and repopulated on demand.
- Changed static export to validate selected prerender paths, schema versions, shareability headers, and successful status codes before replacing the existing export directory.

### Fixed

- Fixed Node and Cloudflare built runtimes so middleware always runs before prerendered HTML is served, and fixed Cloudflare middleware rewrites so the rewritten destination is rematched instead of rendering the original protected route.
- Fixed shared route cache, build prerendering, and regeneration so request-dependent HTML is never replayed across visitors when loaders, pages, layouts, metadata, streaming content, external packages, cloned or reconstructed Requests, or response hooks observe request input.
- Fixed prerender and route cache replay for `Set-Cookie`, `Vary`, private or non-storable cache control, dynamic markers, HSTS, malformed HSTS settings, and streamed ISR entries, including fail-closed rejection of legacy artifacts by Node, Cloudflare, and static export adapters.
- Fixed rendered layout data isolation and React-compatible context ownership so concurrent requests and roots cannot observe another render's values.

## 0.0.201 - 2026-08-04

### Fixed

- Fixed client compiler runtime imports for owner-scoped memo conditionals nested in component children, JSX render props, and async-boundary branches so generated hydration code no longer references missing memo helpers.

## 0.0.200 - 2026-08-03

### Changed

- Kept compiler-generated memo-only dynamic branches on a lightweight reactive DOM insertion path so they do not pull keyed-list runtime code into client bundles.

### Fixed

- Fixed client compiler tracking for local values derived transitively from cell reads so JSX attributes, text, conditional branches, keyed lists, and Promise-driven updates stay consistent after cell changes while imperative and unsupported alias uses retain their safe fallback behavior.
- Fixed native compiled `memo()` conditionals so custom and default comparators preserve rendered DOM identity, keyed list nodes, alternate render values, and cleanup-scope ownership across equal and unequal prop updates.

## 0.0.199 - 2026-08-03

### Changed

- Improved compiled keyed list performance by specializing selected classes, property and text reads, delegated row events, and stable row reconciliation while preserving the normal application execution path.
- Reduced reactive core and reactive DOM allocation and cleanup overhead for effect dependencies, keyed row scopes, text bindings, and retained list records.

### Fixed

- Fixed compiled keyed list hydration and update semantics for delegated events, selected classes, aliased paths, escaped text, unsafe mutation fallbacks, duplicate replacements, and lazy subscription cleanup.
- Fixed React-compatible StrictMode class lifecycle replay so `componentDidMount()` and lifecycle-scheduled state updates run again after the simulated unmount, restoring class-driven animations such as Recharts bars.
- Fixed the public inline `effect()` callback type so generated declarations preserve the callback contract.

## 0.0.198 - 2026-07-25

### Fixed

- Fixed React-compatible SSR hydration for keyed list callbacks with conditional returns so server-rendered contents, hook state, and keyed identity remain stable through hydration and later reorders.
- Fixed compiled inline `memo()` wrappers and custom comparator semantics, including lexical evaluation, top-level `await`, TypeScript annotations, sequence expressions, and JSX inside comparators.

## 0.0.197 - 2026-07-24

### Added

- Added `mreact-router boundaries [appDir]` with deterministic versioned JSON output for inspecting every route and its statically traceable rendered server, client, shared, server-only, and unresolved components without creating build artifacts.
- Added the `analyzeAppBoundaries()`, `createBoundaryReport()`, boundary report formatter APIs, and `buildApp({ onBoundaryReport })` callback for programmatic boundary tooling.

### Changed

- Changed production App Router builds to print the full route-by-route component boundary report on every build while reusing the existing production source analysis.

## 0.0.196 - 2026-07-24

### Added

- Added the reactive intrinsic `domRef` lifecycle attribute for running browser callbacks after an element is committed, retargeting bindings to retained SSR nodes, and cleaning up on replacement, root disposal, and route navigation.
- Added development diagnostics that identify competing labeled computations writing the same cell before the generic reactive flush limit.

### Fixed

- Fixed non-list dynamic branch replacement and App Router navigation so the previous branch is disposed before its replacement renders, including when lifecycle cleanup throws.
- Fixed server JSX spread filtering so event-like attributes are rejected case-insensitively and omitted `domRef` getters are not evaluated.
- Fixed production client bundles so unminified Rolldown region comments do not expose absolute or project-relative application source paths while runtime package regions remain available.
- Fixed compiler runtime helper collisions and placeholder replacement so component-local `bindDomRef` bindings and matching user strings or identifiers remain intact.

## 0.0.195 - 2026-07-17

### Fixed

- Fixed App Router hydration for SSR-capable native client-boundary wrappers so components receive their original server-rendered children instead of their complete rendered fallback, preserving a single wrapper through hydration across nested boundaries, async children, empty children, raw-text elements, and template elements.
- Fixed client route resume after replacing a boundary template so stale SSR fallback siblings and boundary props scripts are removed without disturbing nested route ownership.

## 0.0.194 - 2026-07-13

### Added

- Added the `on-response.ts` and `on-response.mreact.ts` app conventions for applying a shared `onResponse(response, { request })` hook in development, built Node servers, prerendered responses, middleware short circuits, and built request runtimes. Explicit programmatic hooks continue to take precedence.

### Fixed

- Fixed Vite development diagnostics for generated client route transform failures so known route modules return the original error through a 500 JavaScript response and the Vite overlay instead of appearing as an ordinary 404. Unknown route modules continue to return 404.
- Fixed built response-hook lifecycle handling so artifact-only deployments load the prebuilt hook without the source tree, every response path applies the hook once, and request instrumentation records the final hooked status.

## 0.0.193 - 2026-07-13

### Added

- Added custom Cloudflare Pages Worker packaging through `mreact-router package cloudflare-pages --worker <entry>` and `packageCloudflarePagesArtifact({ workerEntry })`. Custom entries can import the package-time `mreact-router/generated-cloudflare` factory to reuse generated manifests, route rendering, and static asset wiring while configuring existing Cloudflare adapter options such as `onResponse`.

### Fixed

- Fixed App Router client route generation when a component has an early prologue return followed by a later return branch containing conditional nested JSX, preventing raw JSX from reaching Vite and preserving hydration.

## 0.0.192 - 2026-07-13

### Fixed

- Fixed App Router client route generation when an early component return is followed by local declarations and later component return branches, preventing raw JSX from reaching Vite and preserving reactive branch updates after hydration.

## 0.0.191 - 2026-07-11

### Changed

- Changed generated buffered and streaming AWS Lambda handlers to warm the same configurable `middleware`, `hot-route-requests`, `all`, or `none` policy during module initialization, while keeping ordinary handlers lazy until a valid event.
- Improved React-compatible scheduler callback burst scaling by replacing repeatedly sorted ready and delayed queues with stable min-heaps.

## 0.0.190 - 2026-07-10

### Added

- Added lifecycle-safe `refetchInterval` and `refetchIntervalInBackground` polling options to `@reckona/mreact-query`, with non-overlapping fetches, hidden-document pausing, and automatic observer cleanup.
- Added explicit tagged persistence records, hydration conflict policies, and `ready`, `status`, and `error` lifecycle signals to `@reckona/mreact-store`.
- Added the lightweight `@reckona/mreact-router/request` entrypoint for request and control-plane helpers without router build or Vite dependencies.

### Changed

- Expanded published TypeScript contracts across React compatibility, compiler, forms, query, reactive DOM, router, server, and Store entrypoints so public declaration graphs no longer depend on unexported named types.
- Changed preloaded AWS Lambda handlers to validate events before starting runtime work. Deployments that intentionally warm route runtime during initialization can now call `warmAwsLambdaRuntime()` explicitly.

### Fixed

- Fixed browser and server `Link` prop handling so supported DOM properties are preserved while string event attributes and other executable attribute names are rejected consistently.
- Fixed query invalidation ordering, polling disposal, request-scope cleanup, and page-state behavior so invalidations received during an active fetch schedule the required follow-up work without leaking lifecycle state.
- Fixed Store persistence hydration races, ambiguous legacy envelopes, migration and save failure reporting, notification ordering, and local-update conflict handling.
- Fixed browser auth claim refresh so changing accounts cannot retain claims from the previous session script.
- Fixed React-compatible render normalizer retention in optimized and packed consumer bundles while keeping native-only bundles isolated from compatibility code.
- Fixed App Router clean-install CLI linking, packed public type consumption, request-entrypoint dependency isolation, Lambda event rejection, and page route cache context isolation.
- Updated Vite, Conform, and esbuild requirements to patched versions that remove the addressed production dependency advisories.

## 0.0.189 - 2026-07-09

### Fixed

- Fixed App Router SSR fallback output for inferred client boundary components so JSX children passed to imported shell components remain visible in the initial HTML while boundary props serialization stays compatible.
- Fixed AWS Lambda payload validation so malformed events are rejected before runtime materialization or preload. Added `warmAwsLambdaRuntime()` for deployments that explicitly choose initialization-time runtime warming.

## 0.0.188 - 2026-07-09

### Changed

- Updated generated app and example TypeScript tooling to TypeScript 7 while keeping compiler API consumers on the TypeScript 6 compatibility package, so `tsc` can use the native TypeScript 7 compiler without breaking TypeDoc, API Extractor, JSX type checks, or App Router server action inference.

## 0.0.187 - 2026-07-05

### Added

- Added the `@reckona/mreact-reactive-dom/compat-normalize` subpath for installing React-compatible JSX render value normalization without pulling the compatibility normalizer into native DOM-only bundles.

### Changed

- Improved React-compatible compiler lowering for keyed root lists and reduced `@reckona/mreact-reactive-core` dependency tracking overhead for hot reactive update paths.
- Improved App Router client navigation and hydration defaults so server routes that render `Link` get the navigation runtime consistently while hydration avoids duplicate delegated event systems and unnecessary out-of-band fragment work.

### Fixed

- Fixed React-compatible development middleware rebundling so route-local middleware updates do not strand stale keyed memo row reconciliation behavior.
- Fixed React-compatible route hydration when JSX render values pass through layout children across multiple reactive DOM module copies.
- Fixed native DOM bundle isolation so React-compatible prop normalization helpers stay out of non-compat reactive DOM bundles.

## 0.0.186 - 2026-07-05

### Added

- Added shared DOM prop-name classification helpers for compiler and runtime integrations through `@reckona/mreact-shared`.

### Changed

- Expanded React-compatible compiler lowering for proven-safe prop reactive DOM blocks, including static same-module component composition, nested render values, structural conditionals, keyed lists, dynamic spread props, and server `createElement()` component inlining.
- Improved App Router stream loading shell behavior so loading fallback rendering waits for route loader startup instead of flushing before loader execution begins.

### Fixed

- Fixed React-compatible production lowering regressions around component-children helper imports, destructured prop alias rewrites, inline component prop substitution, nested binding disposal, spread event handlers, spread form props, hydration node consumption, and server map body purity.
- Fixed React-compatible DOM spread prop handling so function-valued event handlers remain interactive while string event attributes and unsafe form-control drift are still filtered.

## 0.0.185 - 2026-07-04

### Changed

- Improved React-compatible compiler prop reactive DOM block lowering so proven-safe host-only components can compile dynamic `aria-*`, `data-*`, URL-bearing, boolean, style, and SVG attributes through `bindProp()` while preserving DOM prop safety behavior.

## 0.0.184 - 2026-07-04

### Added

- Added the `@reckona/mreact-compat/server` subpath for server-safe element, hook, context, and `renderToString()` helpers without client root APIs.

### Changed

- Improved React-compatible DOM update performance by caching repeated DOM attribute shapes and reducing empty delegated event promotion and release batching overhead.
- Improved React-compatible server rendering performance by caching HTML attribute name classification for repeated host prop names.
- Improved `@reckona/mreact-reactive-dom` owned keyed list reorders so fully reused keyed records are reordered in place instead of falling back to parent replacement.
- Improved App Router client route output so navigation runtime loading can be deferred from minified client route bundles while preserving client navigation behavior.
- Improved `@reckona/mreact-query` structural sharing and `@reckona/mreact-store` listener bookkeeping hot paths to reduce avoidable allocation during cache equality checks and listener unsubscribe churn.

### Fixed

- Fixed delayed delegated event handling for disconnected template nodes so delegated handlers remain interactive before and after the nodes connect to the main document.
- Fixed App Router client navigation cache invalidation and navigation runtime descriptor handling for client routes.
- Fixed App Router static prerender evaluation so `import.meta.url` text inside bundled string literals is not rewritten as a module URL.
- Fixed fresh builds of `@reckona/mreact-compat` by declaring its reactive DOM workspace dependency.

## 0.0.183 - 2026-07-03

### Added

- Added generated App Router route params declarations. `.mreact/routes.d.ts` now exports `AppRouteParams<Path>` and `AppRouteParamMap`, and the generated `@reckona/mreact-router/link` augmentation carries both route paths and params.
- Added `onRenderError` to `renderAppRequest()` options so custom integrations can observe route render failures before the error boundary response is produced.

### Changed

- Improved `@reckona/mreact-forms` reactivity so field state and field-array bindings update at field granularity instead of rebinding the whole form for every keystroke.
- Improved `@reckona/mreact-query` observer notifications with structural sharing and result equality checks, reducing rerenders for stale-only notifications and equal refetch results.
- Improved React-compatible Flight serialization by adding a synchronous fast path for plain payloads and falling back to async work only when thenables or async values are encountered.
- Improved App Router production builds with an incremental output cache that reuses unchanged build artifacts when source inputs, public assets, route declarations, and build options match.
- Improved App Router development HMR by invalidating only affected module graph scope for source edits instead of walking and invalidating the whole graph on each update.
- Improved `@reckona/mreact-compat` initial mount performance for static host-only subtrees by extending the initial host-only fiber path beyond direct text children.
- Improved `@reckona/mreact-devtools` overlay output from a raw event feed into summarized state tables for reactive cells, query entries, and store snapshots.

## 0.0.182 - 2026-07-02

### Added

- Added `form.fieldArray(name)` to `@reckona/mreact-forms`, with stable keyed rows and `append`, `insert`, `move`, `remove`, and `swap` helpers for array-valued form fields.
- Added dependent field validation descriptors to `@reckona/mreact-forms` so validators can declare `deps` and revalidate when related fields change or blur.
- Added descriptor-based `@reckona/mreact-store` persistence with `load`, `save`, `version`, and `migrate`, including hydration without immediate resave and serialized asynchronous saves.
- Added `refetchOnInvalidate` to `@reckona/mreact-query` observers so active queries can refetch when their key is invalidated.

### Changed

- Improved App Router development route rendering by caching page and metadata module imports until app source files change, reducing repeated dev document request latency.
- Improved `@reckona/mreact-virtual` span grid scrolling so layout spans are not recomputed when only the scroll offset changes.
- Improved React-compatible Flight serialization for primitive array payloads by avoiding unnecessary promise work on primitive leaves.
- Improved `@reckona/mreact-store` notification hot paths by avoiding listener snapshot allocation while preserving unsubscribe safety during notifications.
- Improved compiler and Vite diagnostic delivery so warn-level diagnostics retain structured file and location data without being promoted to fatal Vite errors.
- Improved React-compatible package source exports used by Next.js integrations.
- Improved `@reckona/mreact-query` cache updates so `setQueryData()` can accept an updater function based on the previous cached value.
- Improved `@reckona/mreact-auth` optional authorization helpers so `tryRequireRole()` and `tryRequirePermission()` accept custom session cookie options.
- Improved reactive flush limit diagnostics for easier debugging of runaway reactive update loops.

### Fixed

- Hardened server action request checks so Origin and Referer validation, production action allowlists, and CSRF cookie names fail closed outside local development and test environments.
- Fixed compiler parse diagnostics so JavaScript parse failures keep codeframes and are not misclassified as JSX parse errors outside JSX contexts.
- Hardened compiler event attribute diagnostics and out-of-band HTML reordering for safer server output.
- Fixed route cache and built asset safety gaps in App Router runtimes.
- Fixed query auth form and store behavior gaps, including cross-tab query data sharing warnings for unscoped channels.
- Hardened redirect helpers against control characters and server action secret configuration against weak secrets.
- Fixed generated package tarball validation so published bin executability is checked.

## 0.0.181 - 2026-06-22

### Changed

- Hardened React-compatible Flight row parsing so deeply nested row payloads and cyclic chunk references fail with deterministic Flight decode errors instead of native stack overflows.
- Hardened JSON server action dispatch so `args` and `bound` payloads are rejected before validation, authorization, or action invocation when they exceed default structural limits or contain prototype-shaped keys.
- Hardened Cloudflare built App Router runtime so app middleware runs before protected page and server route modules, including requests with middleware-subrequest or client-navigation headers.

## 0.0.180 - 2026-06-22

### Changed

- Hardened App Router route HTML caching so requests with unknown non-public headers are treated as private and do not read from or write to the shared route cache.
- Hardened React-compatible server cache scopes so Node runtimes use AsyncLocalStorage for concurrent SSR and Flight renders, while runtimes without AsyncLocalStorage fail closed instead of sharing async cache scope state.

### Fixed

- Fixed Cloudflare query-client fallback isolation so Workers without AsyncLocalStorage serialize fallback query-client scopes after the fallback storage is installed.
- Fixed compiler and server-rendered URL attribute safety for imperative DOM lowering, SSR output, server-stream output, spread attributes, `srcset`/`imageSrcSet`, and `<object data>`/`codebase`, including non-string URL-like values.
- Fixed App Router form server actions so body size limits are enforced while streaming form and multipart bodies without relying on `Content-Length`.
- Fixed default server action request context so `clientIp` is not derived from attacker-controlled forwarded headers without a trusted proxy boundary.
- Fixed cookie serialization to enforce `__Secure-` and `__Host-` prefix invariants.
- Fixed form validation error merging so Standard Schema issue paths using dangerous object keys are routed to root errors instead of throwing.

## 0.0.179 - 2026-06-21

### Fixed

- Fixed production App Router JSON server actions so CSRF validation accepts the `__Host-mreact.csrf` cookie emitted by the router and rejects the development `mreact.csrf` cookie name in production.

## 0.0.178 - 2026-06-20

### Added

- Added `.mreact/public-assets.d.ts` generation for App Router builds, exposing a type-only `mreact:public-assets` module with discovered public asset paths for runtime-free `import type` and `satisfies` checks.
- Added `logger` support to App Router Vite plugin and middleware options so integrations can receive router diagnostics from dev-server rendering paths.

## 0.0.177 - 2026-06-20

### Changed

- Improved App Router client navigation so in-flight server-rendered navigation HTML prefetches can be reused by the following navigation instead of issuing a duplicate request.
- Improved `@reckona/mreact-reactive-dom` static keyed single-node list updates by reducing key scans for same-order and simple swap updates.

### Fixed

- Fixed App Router client navigation cache invalidation so revalidated paths also drop matching in-flight prefetched HTML before stale responses can populate the navigation cache.

## 0.0.176 - 2026-06-19

### Changed

- Improved built App Router request startup and preload behavior by sharing built runtime materialization across concurrent cold callers, persisting server module closure manifests, splitting request and render artifact loading, and reusing manifest-derived client asset allowlists across Node and Cloudflare runtimes.
- Improved AWS Lambda App Router first-hit behavior so direct handlers keep default background preload focused on middleware/shared request work, hot-route request preloads warm only request-plane modules, and page render artifacts are loaded only when rendering proceeds.
- Bounded client navigation prefetch history for route HTML and modulepreload scripts so long browsing sessions do not retain unbounded prefetched URL/script sets.

### Fixed

- Fixed built App Router fast paths so public assets, middleware redirects, and loader redirects can complete without importing matched page render artifacts or render-only dependencies.
- Fixed built server module artifact loading so older manifests without closure data can still fall back to source import closure discovery for request artifact hydration.

## 0.0.175 - 2026-06-19

### Changed

- Improved React-compatible compiler-lowered static reactive DOM block rows and keyed memo row reconciliation for table-style append, remove, selection, and partial-update paths by batching prop-cell updates, using compiler-proven memo compare props, and avoiding unnecessary row component/comparator work.
- Improved React-compatible prop reactive DOM block lowering so independent prop bindings can update through narrower reactive subscriptions and generated event handlers can evaluate the latest reactive props without rebinding listeners on every prop update.

### Fixed

- Fixed React-compatible reactive prop-cell invalidation so property-presence checks and same-reference shallow object prop mutations can update the subscribed reactive DOM block effects without rerunning unrelated prop effects.

## 0.0.174 - 2026-06-19

### Changed

- Improved `@reckona/mreact-reactive-dom` static keyed single-node list hot paths for append, remove, swap, selected-class, direct text binding, and scope cleanup work used by DOM-heavy keyed table operations.
- Improved `@reckona/mreact-reactive-core` direct cell subscription cleanup and notification paths by reading cached source values directly and avoiding unnecessary pending-queue deletion work.

### Fixed

- Fixed `bindStaticKeyedSingleNodeList()` append fast paths so renderer exceptions cannot leave detached appended records or selected-class entries in retained list state.

## 0.0.173 - 2026-06-19

### Added

- Added a React Flow compatibility lab for `@xyflow/react` that compares React and mreact DOM summaries, screenshots, interaction outcomes, and coverage-ledger obligations across canvas, handle, controlled state, drag, connect, reconnect, viewport, selection, deletion, toolbar, dynamic handle, visibility, appearance, custom edge portal, and large graph scenarios.

### Fixed

- Fixed React-compatible `useState()` dispatch and `useSyncExternalStore()` subscription identities so setter references and external-store subscriptions remain stable across renders while still reading the latest snapshot function.
- Fixed retained reactive DOM row cleanup so deleted fiber subtrees dispose only unretained reactive block resources and preserve resources owned by retained keyed rows.
- Fixed React-compatible portal namespace handling so portals from SVG-owned subtrees render HTML children into HTML target containers, while SVG containers keep SVG namespace behavior.
- Fixed React-compatible portal retention for memoized custom edge subtrees so retained portal labels stay mounted across memo bailouts, covering React Flow `EdgeLabelRenderer` custom edge labels.

## 0.0.172 - 2026-06-18

### Added

- Added React-compatible JSX runtime exports for compiler reactive DOM blocks and reactive state binding metadata, plus the `effect` export from `@reckona/mreact-reactive-dom`, for compiler-generated reactive DOM integrations.

### Changed

- Improved React-compatible keyed memo row reconciliation for same-order list updates, including compiler-lowered static reactive DOM block rows that can update through prop cells without re-invoking the row component.
- Improved React-compatible compiler lowering for safe state text, prop, and event bindings so generated compat DOM blocks update through the reactive DOM runtime while effect-sensitive shapes keep the normal compatibility reconciler path.

### Fixed

- Fixed React-compatible prop-driven reactive DOM blocks so event handlers update when props change instead of keeping the initial listener.
- Fixed React-compatible portal and ref-driven focus timing so layout-effect-triggered host rerenders flush before passive effects, matching React-facing focus behavior for Radix-style portal content.
- Fixed dependency-free memo bailout cleanup so retained memo subtree hook instances remain active when a parent layout effect schedules a deferred selector update.

## 0.0.171 - 2026-06-18

### Changed

- Removed the `@reckona/mreact-devtools` runtime dependency from `@reckona/mreact-query` while preserving optional query devtools event emission through an installed global devtools hook.

## 0.0.170 - 2026-06-17

### Added

- Added `selector()` to `@reckona/mreact-reactive-core` for keyed boolean selection where only the previous and next selected keys notify subscribers when a source value changes.
- Added low-level `@reckona/mreact-reactive-dom` helpers for selector-backed class binding, static keyed single-node lists, template element creation, and opt-in event/prop binding metadata used by compiler-style DOM integrations.

### Changed

- Improved reactive DOM keyed list, text, prop, event, and selector-class hot paths by reducing per-row bookkeeping, batching delegated event release, deferring delegated event promotion, and binding direct cell reads where possible.
- Improved React-compatible keyed list and memo bailout hot paths by reducing child reconciliation scans, instance prefix allocation, memo dependency checks, `createElement()` prop copying, and child-node synchronization work.

### Fixed

- Fixed `bindStaticKeyedSingleNodeList()` so lists mounted before an embedded marker preserve unrelated sibling nodes during initial render and empty-list transitions.
- Fixed React-compatible dependency-free memo row swaps so keyed rows keep the correct DOM order without forcing unnecessary subtree work.

## 0.0.169 - 2026-06-15

### Added

- Added `bindList()` `itemMode: "static"` for low-level DOM integrations that render immutable keyed row snapshots while preserving append, remove, clear, and reverse DOM identity without per-row object tracking.

### Changed

- Built App Router server manifests now include a compiled route matcher artifact, letting production runtimes preserve dynamic params, nested routes, catch-all routes, route handlers, metadata routes, and not-found behavior without request-time route ordering and segment compilation.

### Fixed

- Fixed `@reckona/mreact-compat` `ReactCompatNode` typing so nested `createElement()` calls with heterogeneous intrinsic props, event-handler props, and concrete function component return elements type-check without local widening casts while preserving top-level component prop validation.
- Fixed `@reckona/mreact-compat` `createElement()`, JSX runtime, `memo()`, and `cloneElement()` typing so ordinary props interfaces without `Record<string, unknown>` index signatures are accepted while required and unknown props remain checked.

## 0.0.168 - 2026-06-14

### Fixed

- Fixed `create-mreact-app --src-dir` generated TypeScript projects so `npm run typecheck` recognizes the generated ESM `vite.config.ts` path helpers by adding Node types and avoiding `__dirname`.

## 0.0.167 - 2026-06-14

### Changed

- Improved React-compatible keyed append and reorder commits by avoiding deleted-subtree cleanup work when the update does not delete fibers.

## 0.0.166 - 2026-06-14

### Added

- Added `syncQueryClientAcrossTabs()` to `@reckona/mreact-query`, allowing same-origin browser tabs to share scoped query invalidations, removals, optional successful data updates, and Web Locks-backed focus/reconnect single-flight handoffs when callers provide a scoped channel and query allowlist.

### Changed

- Refreshed the query cross-tab sync documentation and June 13 benchmark artifacts so the docs site covers the new browser cache coordination behavior and current benchmark run data.

### Fixed

- Fixed AWS Lambda App Router builds for dynamic routes with inferred server action forms so stable form-action placeholders can keep render server modules prebuilt instead of forcing a production dynamic server transform path.

## 0.0.165 - 2026-06-13

### Added

- Added a UI primitives compatibility lab that compares React and mreact DOM summaries, screenshots, interaction outcomes, and coverage-ledger obligations across Ark UI, Base UI, Headless UI, React Aria, React Spectrum, and Zag JS fixtures.

### Changed

- Limited benchmark result commits to the main branch so branch validation does not publish benchmark artifacts.
- Extended `runWithEventPriority()` with an optional deferred-flush hook used by the React-compatible event runtime.

### Fixed

- Fixed React-compatible portal, ref, event, external store, host append, and text cleanup behavior for UI primitive libraries that rely on custom documents, forwarded refs, retained fibers, and precise child reconciliation.

## 0.0.164 - 2026-06-13

### Changed

- Improved primitive reactive runtime performance for keyed row replacement, keyed list append paths, stable computed fan-in recalculation, and source writes with subscribers.
- Improved React-compatible primitive row updates by trimming keyed append reconciliation work and avoiding form-specific post-child prop handling for ordinary host elements.

## 0.0.163 - 2026-06-13

### Added

- Added a Radix UI compatibility lab that compares React and mreact runtime DOM summaries and screenshots across Radix primitives, interactions, and coverage-ledger obligations.

### Changed

- Updated benchmark workflow dispatch authentication and refreshed June 13 benchmark result artifacts so benchmark pages can reflect the latest run data.

### Fixed

- Fixed React-compatible synthetic pointer and mouse events so button, coordinate, modifier, key, pointer, touch, and related-target fields are preserved for Radix-style interaction handlers.

## 0.0.162 - 2026-06-13

### Fixed

- Improved React-compatible server output for `createElement()` conditionals and `renderToString(View)` wrappers so App Router string and stream routes can compile lowerable compat trees directly instead of paying per-request compat renderer overhead.

## 0.0.161 - 2026-06-13

### Added

- Added a Recharts compatibility lab that compares React and mreact runtime screenshots, DOM summaries, coverage ledgers, and Recharts prop coverage reports across representative chart, tooltip, legend, polar, hierarchy, animation, and interaction fixtures.
- Added published API reference site assets, documentation search/navigation assets, and benchmark result pages so the documentation site can expose package APIs and current performance runs through GitHub Pages.

### Changed

- Improved the benchmark workflow with framework filtering and refreshed benchmark result artifacts for the June 12 run, making cross-framework and mreact-specific benchmark comparisons easier to scan.
- Expanded the root documentation site content around mreact's client inference model, docs navigation, API reference readability, and benchmark presentation.

### Fixed

- Fixed React-compatible class component lifecycle updates, PureComponent child reuse, nested SVG child reconciliation, and `cloneElement()` default prop handling so Recharts Line, Radar, Tooltip, Legend, polar, hierarchy, and synchronized tooltip fixtures now match React screenshots in the compatibility lab.

## 0.0.160 - 2026-06-12

### Changed

- Updated the OXC parser and transform toolchain to 0.135.0, bringing stricter JavaScript and TypeScript syntax diagnostics, upstream parser hot-path improvements, and current transform/codegen fixes into the compiler path.
- Refreshed the local development and deployment toolchain, including Vitest 4.1.8, Wrangler 4.100.0, Miniflare 4.20260611.0, Oxlint 1.69.0, Oxfmt 0.54.0, and the generated Cloudflare starter dependency ranges.
- Expanded the benchmark harness with additional framework adapters, runtime-backed primitive adapter coverage, browser benchmark coverage for app frameworks, and lightweight router client bundle probes so future performance changes can be compared across a wider set of baselines.

## 0.0.159 - 2026-06-12

### Fixed

- Fixed AWS Lambda route first-hit latency by emitting shared request chunks for runtime packages, so middleware, loader, and metadata artifacts evaluate one shared dependency graph per execution environment instead of re-evaluating a bundled copy on every route's first hit.

## 0.0.158 - 2026-06-11

### Fixed

- Reduced AWS Lambda route first-hit work by bundling request/control runtime packages into Lambda request artifacts and by keeping inferred server action implementation graphs out of GET render artifacts.

## 0.0.157 - 2026-06-11

### Fixed

- Fixed streamed out-of-order `<Await>` fragments so the browser waits for a parse-complete completion marker before replacing placeholders, preventing partially parsed list rows from being applied during Cloudflare Worker streaming.
- Refreshed the Hacker News Cloudflare example to use the current Wrangler version, Cloudflare compatibility date, and `buildTargets: ["cloudflare"]` project configuration.

## 0.0.156 - 2026-06-11

### Fixed

- Fixed Cloudflare Workers and Cloudflare Pages SSR so request-scoped query clients are available to page render helpers that call `getQueryClient()` during server rendering, not only to loaders or components that read `props.queryClient`.

## 0.0.155 - 2026-06-11

### Fixed

- Fixed React-compatible vendor chunk loading for prerendered routes so server prerender modules can resolve shared compat vendor chunks instead of failing when the page runs during the build.

## 0.0.154 - 2026-06-10

### Changed

- Improved React-compatible server rendering for static `createElement()` trees by compiling them through the server string pipeline, reducing runtime work for compat-heavy server output.
- Reduced App Router client bundle duplication by sharing compat vendor chunks only for route artifacts that actually use compat client references.
- Reduced reactive-core and reactive DOM hot-path overhead with leaner source subscriber storage, cached devtools sampling, shared cell write paths, smaller keyed list records, and a keyed list tail-append fast path.
- Kept reactive-core devtools write hooks statically dead in production client route bundles, avoiding unnecessary production client code.

### Fixed

- Fixed dynamic route client script prefetch probing so each route variant is matched against its own fixture params instead of reusing another variant's params.
- Fixed React-compatible keyed child reuse beyond benchmark-shaped props, so keyed list updates with more general prop shapes keep the correct row identity.
- Limited production prebuild warnings to real prebuild gaps instead of warning for expected dynamic transform paths.

## 0.0.153 - 2026-06-10

### Added

- Added `runWithAuthRequest(fn, { config })` request-scoped auth configuration overrides so custom server handlers and multi-tenant integrations can change auth redirects or claim serialization without mutating process-wide defaults.
- Added a package dist size check script used by `pnpm size` and `pnpm size:check`, reporting raw and gzip totals for publishable package outputs.

### Changed

- Clarified the documented `batchAsync()` scheduling contract and the React-compatible `useId()` id format divergence.

### Fixed

- Fixed App Router stream loading routes whose loaders redirect, return a `Response`, or call `notFound()` so router control-flow settles before page render artifacts are loaded, while ordinary pending data loaders still stream the loading shell immediately.
- Fixed prebuilt stream server artifacts so `serverAwaitHydration` metadata must match before the artifact or external module file is reused.
- Fixed React-compatible `useImperativeHandle()` timing so insertion effects do not see the handle, while parent layout effects do.
- Fixed React-compatible server rendering so `readOnly` attribute casing matches React DOM server output.
- Fixed OXC server string list rendering so list renderer body statements are preserved.
- Fixed keyed reactive DOM list cleanup so stale keyed rows are removed even when a disposer throws, without double-disposing records.
- Fixed duplicate form submissions to return an explicit duplicate result instead of sharing a pending promise through an unsound cast.
- Hardened router render internals by replacing inline CSP tag scanning with a linear scanner, including import policy in composed metadata cache keys, and warning when production falls back to dynamic server transforms.
- Fixed out-of-order SSR placeholders to reject async placeholder callbacks in development and fixed buffered list children so deferred work is attached to the parent stream instead of delaying the shell.
- Updated `create-mreact-app` migration advisories for recent package layout, route CSS asset, Lambda packaging, and starter counter changes.

## 0.0.152 - 2026-06-09

### Fixed

- Fixed App Router production builds for content-heavy prerendered sites so generated static params reuse the build-time server module cache instead of re-evaluating the same server component bundles for every generated path, avoiding default Node heap OOMs and reducing build memory use.
- Fixed production route CSS builds so Tailwind source-root filtering is injected before user CSS plugins transform route stylesheets, matching development CSS filtering and preventing route bundle builds from scanning unrelated project files.

## 0.0.151 - 2026-06-09

### Fixed

- Fixed generated `.mreact/routes.d.ts` so it no longer declares a non-existent runtime `routes` value. The generated declaration now registers discovered route paths with the router `Link` types, allowing concrete `<Link href="...">` values to be checked without importing a generated runtime module.

## 0.0.150 - 2026-06-09

### Added

- Added single-flight mutation responses for browser-enhanced App Router server action forms: when an action mutates data, calls `revalidatePath()` for the current route, and returns normally, the POST response can carry fresh navigation HTML marked with `x-mreact-action-single-flight`, allowing the browser to update the visible route without a second GET while preserving the existing `x-mreact-revalidate` fallback for unsupported flows.

## 0.0.149 - 2026-06-09

### Added

- Added `definePage<typeof loader>()` to `@reckona/mreact-router` so route pages can infer `props.data` from the sibling loader return type and `props.params` from the loader context without repeating the data shape in the page props annotation.
- Added `throwNotFound()` as an explicit alias for `notFound()` in `@reckona/mreact-router`, preserving the existing 404 control-flow behavior while making non-returning loader branches easier to read.

## 0.0.148 - 2026-06-08

### Added

- Changed the default `@reckona/create-mreact-app` basic and Tailwind starters to render a small `cell`-based counter on the home page, giving new projects an immediately interactive example instead of a static hello page.
- Added Playwright coverage that scaffolds a generated app, starts the mreact dev server, and verifies that the generated counter hydrates and updates in the browser.

### Fixed

- Fixed the App Router Vite development reactive devtools stub so client route hydration no longer fails when reactive-core imports `currentReactiveDevtools()`.
- Added a route hydration console diagnostic that reports `mreact: route hydration failed for route "..."` when hydration code throws after the route module has loaded, making the remaining static server HTML and missing interactivity easier to understand during development.

## 0.0.147 - 2026-06-08

### Added

- Added compact default progress output for `mreact-router build`, including route discovery, server output, client output, artifact writing, and the final route count with total duration. Programmatic `buildApp()` callers can use `onBuildProgress` to receive the same coarse build phase events without parsing CLI output, and build failures now include the active build phase when one is known.

## 0.0.146 - 2026-06-07

### Fixed

- Fixed router `Link` server rendering so string children are always escaped as text, closing a raw-HTML heuristic that could interpret entity-encoded markup as trusted link content. Compiler-generated router `Link` children now use an explicit trusted-HTML wrapper for framework-owned SSR output.
- Fixed compiler-proven React-compatible direct text bindings so structural state uses are detected before the fast path is emitted and generated helper names avoid collisions with component-local bindings.
- Fixed React-compatible hydration semantics for `useSyncExternalStore()` initial server snapshots, post-hydration `useId()` client IDs, uncontrolled form `defaultValue`/`defaultChecked` preservation, and controlled form live-state updates after child reconciliation.
- Fixed native route matcher catch-all params so encoded slashes preserve segment boundaries without double decoding, and malformed percent escapes return no match instead of throwing.
- Fixed reactive DOM keyed list reuse so replaced object rows, primitive rows, reordered index/items closures, and style object property removals update without leaving stale DOM, while preserving strict JavaScript value semantics for list renderer arguments.

## 0.0.145 - 2026-06-07

### Added

- Added a compiler diagnostic for async client components so unsupported async client rendering is reported during compilation instead of being left to fail later.

### Changed

- Improved React-compatible compiled text bindings so compiler-proven direct state text children carry binding metadata through the JSX runtime and host reconciler, preserving targeted text updates without re-diffing unrelated host props.
- Moved router benchmark ranking sections that only compare mreact app-router variants after cross-framework rankings, making the benchmark report easier to scan for framework comparisons first.

## 0.0.144 - 2026-06-07

### Fixed

- Improved `@reckona/mreact-reactive-dom` keyed `bindList()` initial browser rendering by claiming empty marker-only parents with a single whole-parent replacement instead of inserting each row one at a time, reducing the `primitive-browser` create 1k rows median from 1.1ms to 0.9ms in the release verification run.

## 0.0.143 - 2026-06-07

### Fixed

- Fixed `@reckona/mreact-query` hydration so dehydrated `updatedAt` timestamps are preserved on the browser cache, making `staleTime` measure freshness from the server fetch time instead of the hydration time.
- Clarified query hydration docs and the App Router query example so default browser observers are described as stale-while-revalidate on mount, while examples that want no mount refetch pass `staleTime`.

## 0.0.142 - 2026-06-07

### Added

- Added typed route URL helpers for the App Router: `href()` builds encoded internal route URLs from patterns such as `"/users/:id"` and build output now writes `.mreact/routes.d.ts` with the discovered route path union.

### Changed

- Changed App Router production builds to emit only Node-compatible server/client artifacts by default. Cloudflare Workers, AWS Lambda, or all adapter artifacts now require an explicit `--target`, `buildTargets`, or `buildApp({ targets })` opt-in.
- Hardened App Router metadata handling across Node and Cloudflare by validating static and generated metadata before head/header emission, rejecting unsafe head attributes and URL schemes, and applying metadata CSP/security headers to Cloudflare page responses, including generated string/stream route modules and pages that return a `Response`.
- Hardened request-scoped server query state so server integrations without installed `AsyncLocalStorage` fail instead of falling back to shared module-level query client state.

### Fixed

- Fixed production server action dispatch to fail closed when no generated or explicit action allow-list is present. Direct integrations that intentionally expose every registered server action must now opt in with `allowedActions: "any"`.
- Fixed silent middleware skip ID typos by validating configured skip IDs against discovered middleware IDs during build and render setup.
- Added a diagnostic when a route renders `Link` while explicitly exporting `navigationRuntime = false`, making the client-navigation opt-out visible during build and development.

## 0.0.141 - 2026-06-06

### Added

- Added real-browser primitive benchmarks for create, update, select, and clear DOM operations, including mreact, React-compatible mreact, React, Solid, and Qwik coverage, while reporting Marko as unsupported until a stable standalone client compiler/runtime fixture is available.
- Expanded router benchmark coverage for concurrent throughput and p99 latency, RSS deltas, SSR HTML payload bytes, server-only and minimal-opt-out client bundle sizes, loader client navigation, and back-forward restoration.

### Changed

- Improved benchmark comparability by adding peer framework adapters, preserving unsupported cases explicitly, and keeping browser/router benchmark outputs suitable for repeated local runs without committing generated results.
- Reduced React-compatible event target mount overhead by avoiding generic event-name normalization for common delegated event props and by skipping unnecessary tag-name lowercasing for non-`meta` elements.

## 0.0.140 - 2026-06-06

### Added

- Added a primitive `source write 1k` benchmark that directly measures 1,000 fine-grained source writes for mreact, Solid, and Solid v2 while reporting frameworks without an equivalent source primitive as unsupported.

### Changed

- Improved benchmark methodology for primitive and router comparisons by tightening DOM lifecycle isolation, browser probe coverage, build output size reporting, fixture reuse, and benchmark caveats for cases that are not direct source-write comparisons.
- Reduced reactive update overhead across computed fan-in tracking, DOM event binding, keyed list updates, empty clears, DOM scope disposal, and same-order keyed children.
- Reduced React-compatible mount and update overhead for initial DOM props, event props, removed fiber subtrees, and keyed record updates.

### Fixed

- Fixed router benchmark variant fixture reuse so repeated framework variants no longer share mutable benchmark fixtures between runs.
- Fixed route hydration for components with a single event binding after the reactive DOM event metadata optimization, preserving click and input handlers when the generated client route resumes existing server DOM.

## 0.0.139 - 2026-06-06

### Added

- Added `safeFilename` to streamed multipart file parts so upload handlers can keep the raw submitted `filename` for display or auditing while using a normalized storage key for buckets and filesystems.

### Changed

- Improved router development and built-request performance by sharing route scans, route matchers, source reads, route CSS discovery, client navigation inference, server action inference, layout shell static work, route metadata loading, and server action manifest inference across request/build hot paths where the inputs are unchanged.
- Reduced hot-path allocation and repeated work across reactive-core effects, keyed DOM reconciliation, query notifications and key hashing, React-compatible JSX/host prop updates, forms dirty tracking, virtual row measurement, server HTML escaping, server buffer growth, and compiler route-source helpers.
- Improved client navigation work by avoiding full-body history snapshots, starting matching client route script preloads earlier, deduplicating repeated prefetches, and synchronizing route data scripts by stable IDs.

### Fixed

- Hardened server and router security behavior for cyclic Flight chunk references, unsafe URL schemes, `srcdoc` and string event-handler SSR sinks, middleware trailing-slash matching, rewrite target validation, malformed native route matcher escapes, user-varying route cache responses, oversized server action form bodies, query client request isolation, multipart parser defaults, static export path traversal, and prototype-pollution-shaped form/store keys.
- Fixed router `Link` escaping and client/server URL-safety parity, Cloudflare/native HTML escape parity, production devtools hook installation defaults, and generic 500 bodies for development/render fallback errors unless verbose errors are explicitly enabled.

## 0.0.138 - 2026-06-05

### Added

- Added a one-time browser console warning from `@reckona/mreact-reactive-core` when a second copy of its runtime evaluates in the same page, naming both module paths and pointing at `optimizeDeps.exclude`, so duplicate-copy setups that silently break cross-package cell tracking are diagnosed instead of failing quietly. Server, module runner, and test realms stay silent.

### Fixed

- Fixed the router Vite plugin to exclude every client-importable `@reckona/mreact*` runtime package from dev `optimizeDeps` prebundling instead of only `@reckona/mreact`, so apps importing family packages such as `@reckona/mreact-query` or `@reckona/mreact-virtual` from the published registry no longer get a second inlined reactive-core copy that breaks cell tracking and bypasses the plugin's react/react-dom alias resolution in dev. User-level `optimizeDeps.exclude` entries compose with the plugin list.

## 0.0.137 - 2026-06-05

### Added

- Added a view transition page to the reactive-primitives example plus a real-browser Playwright test and reactive-dom unit tests pinning the update scheduling contract: cell updates made inside a `document.startViewTransition` update callback are committed before the callback promise settles, so the browser captures the post-update DOM. Documented the scheduling guarantee in the reactive-core and mreact-dom READMEs.

### Changed

- Replaced the load-sensitive wall-clock assertion in the AWS Lambda hot-route preload redirect test with a deterministic gate the test controls, so the redirect-never-waits-for-preload property fails by timeout on regression instead of flaking under parallel test load.

### Fixed

- Fixed `flushSync` to drain pending reactive-core computed propagation and queued effect computations before returning, so cell-driven DOM bindings in compiled components commit synchronously instead of waiting for the scheduled microtask. This makes the React `flushSync` guidance for `document.startViewTransition` update callbacks work verbatim with cells, although mreact's default microtask flush already lands before the new-state snapshot capture.
- Fixed `@reckona/mreact-virtual` so cell reads inside the `items`, `scrollOffset`, `viewportSize`, and `getColumnCount` thunks are tracked reactively: updating a cell-backed source now recomputes `entries`, `range`, `visibleRange`, and the spacer cells without an explicit `refresh()` call, eliminating silently stale virtual windows when realtime updates merge into the items cell. Outputs are equality-deduplicated so unchanged windows no longer notify subscribers, snapshots compute lazily, `refresh()` remains for non-reactive sources, and the imperative scroll helpers keep observing the latest items without subscribing their caller.

## 0.0.136 - 2026-06-05

### Fixed

- Fixed App Router inferred client boundary SSR fallback eligibility for guarded browser-global reads such as `if (typeof window !== "undefined") return window.location.pathname;`. Eligibility is now decided by an AST guard analysis covering guarded if/ternary branches, short-circuited logical expressions, and statements after guarded early exits, so plain imported `cell()` components using the standard isomorphic current-path idiom keep their navigation HTML in the initial SSR response instead of rendering a placeholder-only boundary. Unguarded browser-global reads and aliased guard conditions the analyzer cannot follow remain ineligible.

## 0.0.135 - 2026-06-05

### Fixed

- Fixed App Router inferred client boundary SSR fallback eligibility for plain imported components that call `cell()` state and start browser-only work behind a `typeof window === "undefined"` guard, preserving navigation and app-shell HTML in production SSR while keeping direct browser-global render reads out of fallback eligibility.

## 0.0.134 - 2026-06-05

### Fixed

- Fixed the standalone tarball smoke release gate so packed mreact tarballs remain pinned to local file URLs while external registry dependencies can resolve with fresh package metadata in CI. This release carries the 0.0.133 changes after the previous publish workflow stopped before npm publishing.

## 0.0.133 - 2026-06-05

### Added

- Added `pnpm publish:standalone-smoke` and wired `pnpm publish:verify` plus the npm publish workflow to smoke-test packed tarballs in a standalone app before release publishing.

### Changed

- Documented the App Router client inference contract for guarded browser globals, static object registry aliases, dynamic registry diagnostics, generated import policy union semantics, and release-scoped browser/workerd verification.

### Fixed

- Hardened inferred client boundary SSR fallback detection for additional optional callback guard, destructuring, forwarding, alias, generic, barrel, and hydration handoff patterns while keeping guarded browser-global access out of SSR fallback eligibility.
- Fixed and covered server HTML emission parity across sync, streaming, and React-compatible server rendering for parser-sensitive text, style objects, raw HTML opt-ins, void elements, comment-adjacent markers, hostile JSON payloads, and edge child values.
- Fixed build and deployment closure hazards for generated client assets, CSS `url()` references, static export assets, Cloudflare route registries and route re-exports, relocated `import.meta.glob()` output, Vite define parity, CJS loader dependencies, root/subpath runtime imports, generated import policy runtime packages, and public asset path traversal.
- Added runtime smoke coverage for packaged AWS Lambda artifacts and standalone npm-style installs, and improved built artifact error quality for missing or corrupted production outputs.
- Strengthened keyed hydration/reconciliation behavior for duplicate/coerced keys, nested keyed lists, keyed fragments, mapped null items followed by siblings, and input focus/state preservation across unrelated parent updates.

## 0.0.132 - 2026-06-04

### Fixed

- Fixed App Router inferred client boundary SSR fallback eligibility for imported static components that alias optional callback props and guard the interactive branch, preserving real initial HTML for serializable checklist-style props with links and disabled buttons before hydration.

## 0.0.131 - 2026-06-04

### Fixed

- Fixed App Router loader and Vite development SSR bundles so `@reckona/mreact` root runtime imports resolve to ESM workspace source instead of leaving the CommonJS package entry in SSR output, preventing `exports is not defined` failures for routes that combine loaders with top-level runtime imports such as `memo`.
- Fixed synchronous server JSX emission so inferred client boundary fallbacks inside component children render the same SSR fallback output as streaming server JSX emission.

## 0.0.130 - 2026-06-04

### Fixed

- Fixed App Router inferred client boundary fallback detection for imported JSX components whose nested DOM event handlers guard destructured optional callback props, preserving concrete SSR timeline card, image, and transitive presentational markup before hydration when the callback is `undefined` during server rendering.

## 0.0.129 - 2026-06-04

### Fixed

- Fixed App Router inferred client boundary fallback detection so imported JSX components that forward optional callback props through nested same-module components can still server-render concrete SSR fallback DOM when the final DOM event handler is guarded to be `undefined` during SSR. This keeps timeline cards, image markup, and transitive presentational children in the initial HTML before hydration.

## 0.0.128 - 2026-06-04

### Fixed

- Fixed Cloudflare route module rendering so page loaders receive the same request-scoped `queryClient` used by page rendering and serialized query-state handoff, matching the Node renderer behavior for `context.queryClient.fetchQuery()`.
- Fixed imported client boundary fallback inference for presentational components whose callback props are explicitly `undefined` during SSR, keeping media cards and images visible in the initial HTML before hydration attaches the interactive boundary.

## 0.0.127 - 2026-06-03

### Added

- Added span-aware `createVirtualGrid()` support with `getItemSpan()` for deterministic row-major quilt grids, including `column`, `colSpan`, and `rowSpan` entry metadata, SSR-safe spacer projection, scroll restoration, API reports, and documentation for supported and unsupported layout models.

## 0.0.126 - 2026-06-03

### Fixed

- Fixed built Node serving so `mreact-router start .mreact`, `renderBuiltAppRequest()`, and `createBuiltRequestRuntime()` automatically read `.mreact/server/import-policy.json` and allow generated runtime packages when bundling built server modules for production-like smoke checks.

## 0.0.125 - 2026-06-03

### Fixed

- Added router hydration regression coverage for route-level client pages that render mapped fragments followed by siblings and nested same-module component text, keeping SSR DOM order and paragraph text stable across browser hydration and client-side locale updates.

## 0.0.124 - 2026-06-03

### Fixed

- Fixed server-rendered HTML void elements such as `<br>`, `<input>`, and `<meta>` in the app-router compiler and `@reckona/mreact-server` HTML helper so SSR output no longer emits explicit closing tags that browsers can parse as extra elements before hydration.

## 0.0.123 - 2026-06-03

### Fixed

- Added router SSR regression coverage for imported server components that render TypeScript discriminated unions with `switch (props.block.kind)`, keeping normal document-renderer helpers compatible with `renderAppRequest`, `mreact-router dev`, and build-time route transforms.

## 0.0.122 - 2026-06-03

### Fixed

- Fixed App Router special 404 and error boundary responses so CSS imported by the rendered boundary and its layouts is linked in both production builds and the Vite development server, preventing unstyled first paint for `not-found.tsx` pages.
- Added regression coverage for standard `not-found.tsx` boundary files so unmatched routes and loader `notFound()` calls keep resolving the same supported file convention as route discovery.
- Fixed keyed JSX `.map()` render values in dynamic client branches so unrelated parent state updates preserve existing keyed DOM nodes instead of recreating media card subtrees.

## 0.0.121 - 2026-06-02

### Fixed

- Fixed inferred client boundaries that are safe to server-render so their SSR fallback HTML remains visible before hydration, preserving route shell and navigation content while explicit client islands still render as placeholders.
- Fixed server JSX component children that return `null`, `undefined`, or boolean values so they are omitted instead of rendering literal text such as `null`.

## 0.0.120 - 2026-06-02

### Fixed

- Fixed Cloudflare Pages server bundles so Vite `define` values, including `import.meta.env.*` aliases and plain define identifiers, are applied to generated loader and server route modules before `_worker.js` is packaged.

## 0.0.119 - 2026-06-02

### Fixed

- Fixed `renderAppRequest({ env })` so page route loaders receive the same adapter `env` object as server route handlers, matching Cloudflare Pages loader behavior and allowing Node-side SSR tests to exercise binding-dependent loaders.

## 0.0.118 - 2026-06-02

### Fixed

- Fixed inferred client boundary wrappers so server-renderable JSX children remain visible as SSR DOM instead of being serialized only inside the boundary props payload, including streamed routes and hydration of the wrapper behavior.

## 0.0.117 - 2026-06-02

### Fixed

- Fixed the client JSX transform so array expression children that contain typed block-body `.map()` renderers can lower nested anchor JSX without leaving TypeScript annotations or malformed arrow callbacks in the emitted browser code.

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
