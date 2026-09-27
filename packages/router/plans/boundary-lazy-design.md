# Boundary JavaScript acquisition and activation design

Status: Proposed. No lazy boundary policy is implemented or available to users. The executable contracts in `test/boundary-lazy-contract.test.ts` are expected failures until the complete route, build, and browser path is verified.

## Scope and API

The first supported policy is `clientBoundaryPolicies: { "/route": { Counter: { fetch: "idle", activate: "interaction" } } }` in the app router project options. The route key is an exact route path and the reference key is the compiled client reference name. The policy applies to every instance of that reference on that route. Only compat references with serializable SSR props are eligible. Build validation must reject unknown routes, unknown references, duplicate reference names that resolve to different modules, and non-compat references. Rendering must reject a lazy boundary if its props prove nonserializable. The default is unchanged eager loading and immediate hydration. The policy must not be exposed as working until the production build and Vite dev server both honor it.

## Build and delivery

`config.ts` owns the public type and syntax normalization. `build.ts` and `vite.ts` resolve route/reference names after reference inference and pass the same validated policy to `buildClientRouteEntrySource`. The generated route entry statically imports only its scheduler and any eager references. Each lazy compat reference and its compat runtime are imported from a separate dynamic closure. Existing static route imports must not pull the lazy closure through another path. The production bundle maps each reference to its emitted chunk URL and that chunk's transitive static imports. This mapping is rendered into route data for initial HTML and subsequent navigation responses. The Vite dev path maps the reference to its transformed module URL. The browser scheduler adds `rel="modulepreload"` for these URLs at idle, with a timer fallback when idle callbacks are unavailable. Preloading fetches bytes without evaluating the module. The existing route entry and eager boundaries keep their current imports and timing when no policy is configured.

The generated manifest and rendered HTML must exclude the lazy closure from the initial static `modulepreload` set. The route's `dynamicImports` metadata must include it so delivery accounting and offline packaging retain the chunk. Reject a production build if a declared lazy reference remains in the route's static closure.

## Activation and event handling

The boundary runtime needs a single-placeholder hydration operation extracted from `__mreactHydrateClientBoundaries`. A capture listener identifies interaction inside the SSR comment range associated with one lazy placeholder, holds the first actionable event, imports that boundary, hydrates that instance, then replays the event once to its still-connected target. It must preserve native default behavior for links and submit controls and avoid duplicate actions. Multiple instances and multiple references activate independently. Idle preload must not execute module top-level code, component render, effects, or `hydrateRoot`.

The scheduler retains the exact route marker and placeholder identity captured when it starts. A route transition, same-route DOM replacement, or removed placeholder invalidates pending imports and queued events. It removes capture listeners and timers on activation or invalidation. A resolved import checks the generation and connected marker before hydration. It must not hydrate an old tree or replay into a different boundary. A failed import must leave SSR markup intact and report the error through the route hydration diagnostic path.

## Release gates

1. Turn both expected-failure contracts into ordinary passing tests. Verify a default route still produces the same static imports and behavior. In production, inspect the emitted graph and delivered HTML, not just generated entry source.
2. In a browser, delay the dynamic chunk response. Confirm idle preloading requests the chunk but produces no evaluation or hydration, then confirm the first pointer click and keyboard activation each update exactly once. Repeat with two boundaries and a static sibling.
3. Before activation, edit controlled and uncontrolled text inputs, check a checkbox, change a select, and focus/select text. After activation, verify values, checked state, selection, and focus. The compat input-preservation change must be integrated before this gate can pass. Include submit behavior and recovery after a malformed SSR marker.
4. Hold a dynamic import while navigating away, replacing the same route ID's DOM, and removing the placeholder. In each case, verify no stale `hydrateRoot`, replay, listener, or timer remains.
5. Measure minified and gzip bytes of the initial static closure and the later dynamic closure for the same compat fixture before and after the implementation. Measure a default route's initial bytes and interaction delay under the same conditions. Record each run separately and reject a meaningful default-path regression.
6. Run the focused Vitest and browser tests, Stryker for scheduler branches, `pnpm build`, `pnpm api:report:check`, `pnpm docs:api`, and `pnpm docs:api:check`; inspect and include intentional `etc/api/` and `docs/api/` changes.

## Current blockers

The existing entry imports every compat component and `hydrateRoot` statically, and `__mreactHydrateClientBoundaries` walks every placeholder in one call. The production manifest records dynamic chunk edges but has no route/reference-to-URL payload consumed by the hydration entry. The compat layer's early input preservation is being implemented separately. Shipping only the config field or dynamic import would silently break the specified fetch/activation separation or the first interaction, so the policy remains unavailable until the listed gates pass.
