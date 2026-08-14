# @reckona/mreact-compat

`@reckona/mreact-compat` implements the React-compatible runtime used by
`@reckona/mreact`, `@reckona/mreact-dom`, and the compatibility benchmark path.
It includes element creation, hooks, context, roots, scheduling, reconciliation,
hydration, Suspense, and JSX runtimes.

## Basic Usage

Most applications should import from `@reckona/mreact` instead:

```ts
import { createElement, useState } from "@reckona/mreact";
```

Use `@reckona/mreact-compat` directly only when testing or integrating the
compatibility runtime.

## Exports

- `@reckona/mreact-compat` exposes the core compatibility APIs.
- The main entrypoint includes a React-style default namespace export for dependencies that import React as an object.
- `@reckona/mreact-compat/jsx-runtime` and `./jsx-dev-runtime` provide JSX
  runtime entrypoints.
- `@reckona/mreact-compat/hooks` exposes the hook runtime APIs for integrations that import hooks from a dedicated subpath.
- `@reckona/mreact-compat/scheduler` exposes the scheduler-compatible API.
- `@reckona/mreact-compat/server` exposes server-safe element, hook, context, and string rendering helpers without client root APIs.
- `@reckona/mreact-compat/flight` and `./internal` are framework integration
  entrypoints.

## React 19.2.6 Coverage

The compatibility gate compares the public React, React DOM, React DOM client,
and React DOM server export sets against React 19.2.6. New upstream exports must
be classified before they can be ignored.

Covered behavior families:

| Area | Coverage |
| --- | --- |
| Element APIs | `createElement`, `cloneElement`, fragments, refs, `Children`, and JSX runtimes |
| Components | Function components, class components, `memo`, `forwardRef`, `lazy`, `StrictMode`, `Activity`, and `Profiler` |
| Hooks | State, reducer, context, effects, layout/insertion effects, memo/callback, refs, imperative handles, IDs, transitions, deferred values, external stores, actions, optimistic state, `use`, and `useEffectEvent` |
| DOM roots | `createRoot`, `hydrateRoot`, unmounting, synthetic events, portals, form controls, and hydration mismatch handling |
| Server rendering | `renderToString`, `renderToStaticMarkup`, `renderToReadableStream`, `renderToPipeableStream`, `resume`, and `resumeToPipeableStream` |
| Resource hints | `preconnect`, `prefetchDNS`, `preload`, `preloadModule`, `preinit`, and `preinitModule` |
| Flight | React Flight row parsing, model token decoding, server references, client references, binary chunks, and protocol coverage assertions |

Flight decoding restores the identity of repeated object references. Mutating one decoded alias therefore affects every path that referenced the same server-side object.

Run the focused compatibility checks with:

```bash
pnpm test:react-conformance
pnpm exec vitest run packages/react-compat/test/react-official-conformance.test.ts packages/react-compat/test/react-official-suite-gate.test.ts
```

Known limits:

- This is a React-like compatibility runtime, not a byte-for-byte React
  reconciler. The tests assert observable behavior for the supported surface.
- A bare reactive-core `effect()` created synchronously in a component render is owned by that root, replaced on the next committed render, and disposed on unmount. Effects created later in event handlers or asynchronous continuations must be disposed explicitly; use a React effect hook when the lifetime belongs to a component.
- The app-router compiler path is separate from the React-compatible runtime.
  Compiler and router behavior is covered by their own tests.
- `useId()` returns opaque underscore-delimited ids such as `_R_0_` and `_r_0_` instead of React's colon-delimited internal shape. The runtime keeps SSR and hydration ids stable through its hydrated-id map, but code should not parse the id string.
- React private internals such as `__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE`
  are intentionally classified as private, not implemented as public API.

## Notes

The compatibility runtime is useful for drop-in React-like behavior. The faster
compiled app path is owned by the compiler, router, server, and reactive DOM
packages.
