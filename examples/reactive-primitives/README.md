# reactive-primitives

Four minimal demos of `@reckona/mreact-reactive-core`, the fine-grained
reactivity layer that the router and SSR pipeline build on top of.
Each demo is a single component plus its HTML page — no routing, no
SSR, no compat shim.

## Run

```bash
pnpm install
pnpm dev    # http://localhost:5173/index.html
```

## Tour

| URL | Demonstrates | Look at |
|---|---|---|
| `/counter.html` | `cell<T>(initial)`, `.get()`, `.set(updater)` | `src/Counter.tsx` |
| `/derived.html` | `computed(() => …)` returning a `ReadonlyCell` | `src/Derived.tsx` |
| `/effect.html` | `effect(() => …)` running on dependency change | `src/Effect.tsx` |
| `/view-transition.html` | `cell.set()` inside `document.startViewTransition()` | `src/ViewTransition.tsx` |

## Anatomy

```
src/
├── Counter.tsx          # cell + onClick
├── Derived.tsx          # computed of two cells
├── Effect.tsx           # effect with dependency tracking
├── ViewTransition.tsx   # cell update inside a view transition
├── counter-entry.ts
├── derived-entry.ts
├── effect-entry.ts
└── view-transition-entry.ts
```

Each `*-entry.ts` mounts its component into `#root` via
`createRoot(element, () => App())` from `@reckona/mreact-reactive-dom`.
A single Vite build emits one bundle per HTML entry.

## Related code in the framework

- `packages/reactive-core/src/cell.ts`, `computed.ts`, `effect.ts` —
  the primitive implementations.
- `packages/reactive-dom/src/root.ts` — `createRoot` and the bindings
  (`bindText`, `bindEvent`, …) that the compiler emits.

## What this example does NOT show

- Centralized state container (createStore + select + subscribe) — see
  [`../store/`](../store).
- Server-side rendering — see [`../ssr-streaming/`](../ssr-streaming).
- File-based routing — see [`../app-router/`](../app-router).
- The React-shaped compat API (`useState`, `Suspense`, …) — see
  [`../react-compat/`](../react-compat).
