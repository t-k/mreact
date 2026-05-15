# store

Three minimal demos of `@reckona/mreact-store`, a centralized state
container built on top of the reactive primitives. The store works
with plain JS objects, exposes a `ReadonlyCell` for its full state,
shallow-merges patches via `set` / `update`, replaces the whole state
via `replace`, and gives you derived cells via `select`. A
non-reactive `subscribe` is available for side effects that should
not participate in the reactive graph.

## Run

```bash
pnpm install
pnpm dev    # http://localhost:5176/index.html
```

Open `/cart.html` in one tab and `/selectors.html` (or
`/subscribe.html`) in another. The pages share a single store instance,
so changes you make in one tab are immediately visible in the others.

## Tour

| URL | Demonstrates | Look at |
|---|---|---|
| `/cart.html` | `createStore<T>(initial)` + `set` / `update` / `replace` | `src/Cart.tsx`, `src/store.ts` |
| `/selectors.html` | `store.select((state) => slice)` returning a `ReadonlyCell` | `src/Selectors.tsx` |
| `/subscribe.html` | `store.subscribe((next, previous) => …)` — non-reactive listener | `src/Subscribe.tsx` |

## Anatomy

```
src/
├── store.ts             # createStore + helper actions (addLine, setQuantity, ...)
├── Cart.tsx             # mutating page (set / update / replace)
├── Selectors.tsx        # derived-cell page (select)
├── Subscribe.tsx        # listener page (subscribe)
├── cart-entry.ts
├── selectors-entry.ts
└── subscribe-entry.ts
```

The store is created once at the module top level of `src/store.ts`.
Every page that imports it reuses the same instance through Vite's
module cache; that is why changes propagate across tabs.

## Related code in the framework

- `packages/store/src/index.ts` — `createStore`, `Store<T>`, the
  shallow-merge patch helper, and the `select` / `subscribe` plumbing.
- `packages/reactive-core/` — the `cell` / `computed` / `untrack`
  primitives the store is built on.

## What this example does NOT show

- The raw reactive primitives — see
  [`../reactive-primitives/`](../reactive-primitives).
- Persistent stores (localStorage, IndexedDB) — the demo store is
  in-memory only.
- Server-side state synchronization — the store is a client-side
  abstraction.
