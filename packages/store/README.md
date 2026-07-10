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
- The `persist` option connects store state to a storage adapter. Pass a callback for write-only persistence, or use `{ load, save, version, migrate }` when the store should hydrate and migrate saved state. Persisted envelopes are version-tagged so ordinary application values shaped like `{ state, version }` remain ordinary state. To read a legacy untagged `{ state, version }` record during migration, set `acceptLegacyPersistedState: true`; this opt-in prevents domain state from being guessed as an envelope.
- `store.persistence.ready` resolves after initial hydration, while `store.persistence.status` and `store.persistence.error` expose load, migrate, or later save failures without producing unhandled promise rejections. A local update made during hydration wins by default; choose `hydrationConflict: "replace"`, `"merge"`, or a resolver when persisted data should take precedence or be combined deliberately.

## Positioning

Use `@reckona/mreact-query` for server state, `@reckona/mreact-forms` for form
state, and `@reckona/mreact-store` for application-wide UI or domain state.
