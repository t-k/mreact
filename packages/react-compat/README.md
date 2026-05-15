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
- `@reckona/mreact-compat/jsx-runtime` and `./jsx-dev-runtime` provide JSX
  runtime entrypoints.
- `@reckona/mreact-compat/scheduler` exposes the scheduler-compatible API.
- `@reckona/mreact-compat/flight` and `./internal` are framework integration
  entrypoints.

## Notes

The compatibility runtime is useful for drop-in React-like behavior. The faster
compiled app path is owned by the compiler, router, server, and reactive DOM
packages.
