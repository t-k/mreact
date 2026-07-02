# @reckona/mreact-store

`@reckona/mreact-store` provides global and shared state primitives for mreact.
It builds on `cell` from `@reckona/mreact-reactive-core` and keeps selectors,
actions, transactions, and persistence as small composable pieces.

## Basic Usage

```ts
import { createStore, shallowEqual } from "@reckona/mreact-store";

const counter = createStore({ count: 0, label: "counter" });

const count = counter.select((state) => state.count);
const snapshot = counter.select((state) => ({ label: state.label }), shallowEqual);

counter.set((state) => ({ count: state.count + 1 }));
```

## Core APIs

- `createStore()` creates a store with state and actions.
- `store.select()` subscribes to a reactive slice of store state and returns a selected cell with `dispose()` for code that creates selectors outside the framework cleanup lifecycle.
- `store.subscribe()` observes changes from outside the framework runtime.
- `store.transaction()` batches multiple updates into one notification.
- `createRequestStoreFactory()` creates request-isolated store instances.
- The `persist` option connects store state to a storage adapter. Pass a callback for write-only persistence, or use `{ load, save, version, migrate }` when the store should hydrate and migrate saved state.

## Positioning

Use `@reckona/mreact-query` for server state, `@reckona/mreact-forms` for form
state, and `@reckona/mreact-store` for application-wide UI or domain state.
