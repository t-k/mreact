# mreact examples

Hands-on samples for [`@reckona/mreact`](../README.md). Each folder is a
self-contained pnpm workspace — `cd` into it and run
`pnpm install && pnpm dev` (or the example-specific command).

> **Prerequisite:** Build the workspace packages once from the repo
> root: `pnpm install && pnpm -r --filter "./packages/*" build`.

## Examples

| Example                                         | What it shows                                                                                         | Run                                                       |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| [`app-router/`](./app-router)                   | File-based router tour: routing, layouts, streaming, server actions, middleware, route handlers       | `pnpm dev` → http://localhost:3001                        |
| [hacker-news/](./hacker-news)                   | Read-only Hacker News clone: external API SSR, dynamic routes, Tailwind, generated Cloudflare Worker  | `pnpm dev` → http://localhost:3001                        |
| [`reactive-primitives/`](./reactive-primitives) | `cell` / `computed` / `effect` in isolation — the fine-grained reactivity layer                       | `pnpm dev` → http://localhost:5173                        |
| [`store/`](./store)                             | `@reckona/mreact-store` — centralized state container with `set` / `select` / `subscribe`             | `pnpm dev` → http://localhost:5176                        |
| [`virtual-grid/`](./virtual-grid)               | `@reckona/mreact-virtual` — bounded responsive grid projection, spacers, telemetry, and jump controls | `pnpm dev` → http://localhost:5177                        |
| [`ssr-streaming/`](./ssr-streaming)             | Terminal view of `renderToString` vs server-stream chunks vs `<Await>` boundary timing                | `pnpm demo:string`, `pnpm demo:stream`, `pnpm demo:await` |
| [`react-compat/`](./react-compat)               | Drop-in `react` / `react-dom`: `useState`, `useEffect`, `Suspense`, `lazy`, `createRoot`              | `pnpm dev` → http://localhost:5174                        |
| [`react-libraries/`](./react-libraries) | Real React libraries on mreact via `.compat.tsx`: Recharts, Lexical, conform, Radix UI | `pnpm dev` → http://localhost:3013                        |
| [`selective-hydration/`](./selective-hydration) | Static SSR HTML that only hydrates once the user clicks a manifest-listed button                      | `pnpm dev` → http://localhost:5175                        |

## Reading order

New here? Open `app-router/` first — it shows the framework as users would actually use it. The other examples zoom in on specific layers and libraries (reactive primitives, state containers, virtual grids, SSR streaming, React compat, Recharts-backed compat dashboards, selective hydration) that the router builds on top of.

## E2E coverage

The repository-level Playwright suite covers every example:

```bash
pnpm test:e2e
```

The example E2E tests render the app-router tour, exercise the form examples, click through the Vite browser examples, verify the virtual grid's bounded DOM behavior, render the Recharts compat dashboard, start the selective-hydration demo server, and run the SSR streaming terminal demos.

## Glossary

- **cell** — reactive primitive holding a value; reads create
  dependencies on the surrounding computation.
- **computed** — a `ReadonlyCell` derived from one or more cells; only
  recomputes when its dependencies change.
- **effect** — an imperative function rerun when its dependencies
  change; use sparingly.
- **client boundary** — the smallest subtree that ships JS to the
  browser; inferred from the use of `cell` / `onClick` / etc.
- **auto-hydrate** — client boundaries hydrate themselves on first
  interaction; no manual `hydrateRoot()` call is needed.
- **route handler** — a `route.ts` file exporting `GET` / `POST` /
  `ALL` for non-page endpoints; dynamic handlers receive `{ params }`
  after the request argument.
- **server action** — a `"use server"` function called from a
  `<form action={...}>` or directly from a client boundary.
