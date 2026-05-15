# react-compat

A tiny app that imports from `react` and `react-dom/client` and runs
entirely on `@reckona/mreact-compat`. The workspace `react` /
`react-dom` packages are shim re-exports that point at the compat
runtime; the compiler runs in `compat` mode so React-shaped APIs
(`useState`, `useEffect`, `Suspense`, `lazy`, `createRoot`) are
recognized and lowered.

## Run

```bash
pnpm install
pnpm dev    # http://localhost:5174
```

## Tour

| Interaction | Demonstrates | Look at |
|---|---|---|
| `+1` button | `useState` + `useEffect` syncing `document.title` | `src/App.compat.tsx` |
| `Show About` button | `Suspense` + `lazy(() => import(...))` dynamic chunk | `src/App.compat.tsx`, `src/LazyAbout.compat.tsx` |
| Initial load | `createRoot(container).render(...)` from `react-dom/client` | `src/main.ts` |

## Anatomy

```
src/
├── App.compat.tsx          # useState + useEffect + Suspense + lazy
├── LazyAbout.compat.tsx    # loaded on demand
└── main.ts                 # createRoot entry
index.html
```

The `.compat.tsx` extension tells the Vite plugin to lower this file
with the compat target (JSX → `createElement` + hook calls). The
`react` and `react-dom/client` specifiers are resolved through pnpm
workspace links — both packages re-export from
`@reckona/mreact-compat`, so no Vite `resolve.alias` is needed.

## Related code in the framework

- `packages/react/`, `packages/react-dom/` — drop-in shim packages.
- `packages/react-compat/` — the compat runtime: hook implementations,
  Suspense, Fiber-shape reconciler.
- `packages/vite-plugin/` — the `modularReact({ mode: "compat" })`
  plugin used here.

## What this example does NOT show

- React Server Components / Flight protocol — not implemented in the
  example trees.
- Streaming SSR with React 18 Suspense markers — see the compat tests
  in `packages/react-compat/`.
- The reactive-core primitives — see
  [`../reactive-primitives/`](../reactive-primitives).
