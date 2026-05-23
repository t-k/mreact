# app-router — mreact router tour

A single sample app that exercises every public feature of
`@reckona/mreact-router`, plus a landing page that links to the tour.
The app does **not** depend on `react` or `react-dom`; the
`package.test.ts` guard fails the suite if any source file imports
either.

## Prerequisites

Build the workspace packages once from the repo root:

```bash
pnpm install
pnpm -r --filter "./packages/*" build
```

## Project configuration

`vite.config.ts` declares the router project paths through the
`mreactRouter()` plugin. The CLI (`mreact-router build`,
`mreact-router dev`) and the Vite middleware read from it:

```ts
import { defineConfig } from "vite";
import { mreactRouter } from "@reckona/mreact-router/vite";

export default defineConfig({
  server: {
    port: 3001,
  },
  plugins: [
    mreactRouter({
      projectRoot: __dirname,
      routesDir: "app",
      publicDir: "public",
      allowedSourceDirs: ["app"],
    }),
  ],
});
```

The legacy `mreact-router build <appDir>` positional form still works
and is what `package.test.ts` and older direct programmatic callers use,
but new apps should configure paths here. `create-mreact-app` uses the
same `app/` layout by default; pass `--src-dir` when you want `src/app`,
`src/lib`, and root-level `public`.

## Run

```bash
cd examples/app-router
pnpm install
pnpm dev              # http://localhost:3001 (dev server, HMR, auto reload)
pnpm dev:logs         # same, with compact request logs from the built-in CLI
pnpm dev:devtools     # same, with @reckona/mreact-devtools subscribed (logs events)
pnpm build            # → .mreact/ (server manifest + content-hashed client asset)
pnpm start            # serve .mreact/ via the built-in CLI
pnpm start:logs       # serve .mreact/ with compact request logs from the built-in CLI
pnpm start:node       # serve .mreact/ via createNodeRequestHandler (DEVTOOLS=1 to log)
pnpm export:static    # write a static dist/ directory from prerendered routes
pnpm edge:demo        # run the edge-handler shape locally as a smoke test
pnpm test             # package.test.ts: dependency + route-shape assertions
```

The dev server uses `server.port` from `vite.config.ts`; `PORT=4000 pnpm dev` overrides the configured port.
The built-in `dev` and `start` commands accept `--log=requests` or `MREACT_ROUTER_LOG=requests` to print method, path, status, duration, and runtime without query strings or headers. Use `mreact-router --help` or `mreact-router build --help` to inspect supported commands and generated deployment artifacts.

## Tour

Open `http://localhost:3001/` for the grouped index. The table below is
the source of truth for the tour:

| URL | Demonstrates | Look at |
|---|---|---|
| `/about` | Prerender + metadata export | `app/about/page.tsx` |
| `/counter` | Client interactivity via `cell` + `onClick` | `app/counter/page.tsx` |
| `/streaming` | Streaming SSR + `<Await>` placeholder + collocated `loading.tsx` | `app/streaming/` |
| `/` | Server-rendered `Link` navigation controls via `navigationRuntime = true`, including viewport prefetch and scroll preservation without hydration | `app/page.tsx` |
| `/server-actions` | `"use server"` form action + `revalidatePath` + `export const revalidate` | `app/server-actions/` |
| `/query` | Loader prefetch + client hydrate/refetch via `@reckona/mreact-query` (`createQueryClient`, `createQuery`, `dehydrate`, `hydrate`) | `app/query/page.tsx` |
| `/forms` | Reactive form state + per-field validation + server errors via `@reckona/mreact-forms` (`createForm`, `setServerErrors`) | `app/forms/page.tsx`, `app/api/contact/route.ts` |
| `/forms/valibot` | Valibot schema validation through Standard Schema, including transformed submit values | `app/forms/valibot/page.tsx` |
| `/forms/zod` | Zod v4 schema validation through Standard Schema, including transformed submit values | `app/forms/zod/page.tsx` |
| `/users/$id` | Dynamic segment + loader + `notFound()` + `generateStaticParams()` | `app/users/$id/page.tsx`, `app/users/data.ts` |
| `/files/$...path` | Catch-all segment | `app/files/$...path/page.tsx` |
| `/docs` (+ `/docs/routing`) | Nested layout + template + collocated `loading.tsx` / `error.tsx` / `not-found.tsx`, plus **layout → page metadata merge** (`/docs` inherits the docs layout's title + description; `/docs/slots` overrides only the title) | `app/docs/` |
| `/docs/slots` | Named slots — three pages fill the same `<Slot name="aside" />` with different content | `app/docs/slots/page.tsx`, `app/docs/layout.tsx` |
| `/contact` | Route group — `(marketing)` segment omitted from URL | `app/(marketing)/contact/page.tsx` |
| `/blocked` | Middleware short-circuits with HTTP 451 before render | `app/middleware.ts` |
| `/api/time` | Route handler — `GET` / `POST` / `ALL` named exports | `app/api/time/route.ts` |
| `/login` → `/admin` | Session cookie + middleware redirect for unauthenticated `/admin` | `app/login/`, `app/admin/`, `app/api/login/`, `app/api/logout/`, `app/middleware.ts`, `app/session-store.ts` |
| `/admin/audit` | Role-gated subpage via `requireRole("admin")` from `@reckona/mreact-auth`. 303-redirects to `/forbidden` for users without the role. | `app/admin/audit/page.tsx`, `app/forbidden/page.tsx` |
| `/i18n` (+ `/i18n/$locale`) | `detectLocale` + `defineMessages` from `@reckona/mreact-router`. Locale picked from URL prefix or `Accept-Language` header; typed messages keyed by locale. | `app/i18n/page.tsx`, `app/i18n/$locale/page.tsx`, `app/i18n/messages.ts` |

Demo accounts (same password `mreact`):
- `ada` — roles `["admin", "editor"]` (can reach `/admin/audit`)
- `grace` — roles `["editor"]` (redirected to `/forbidden` from `/admin/audit`)

`/admin` also opts in to `export const auth = "include-claims"`, so the
router injects a `<script id="__mreact_auth_session">` tag with the
session's claims. The page calls `getSessionClaims()` to read the
same data on both server and client without prop drilling. The
`tryRequireRole` helper is used inline to hide the audit-log link for
non-admins without redirecting.

App-wide auth defaults (`redirectTo: "/login"`, `forbiddenTo: "/forbidden"`)
are set once in `app/session-store.ts` via `configureAuth(...)`; the
guard call sites only pass the role/permission they need.
Session helpers such as `createMemorySessionStore`, `createSession`,
`getSession`, and `destroySession` are imported from `@reckona/mreact-auth`;
the router's legacy session re-exports are deprecated.

## Client navigation

The app-router runtime intercepts same-origin links and updates only the changed route payload. The landing page imports `Link` from `@reckona/mreact-router/link` to demonstrate the granular client-helper subpath and per-link controls: `/docs` opts into viewport script prefetch, `/query` preserves scroll for a stateful workflow, and normal anchors still use the default intent prefetch behavior. Back/forward navigation restores the previous scroll position, while new route navigations scroll to the top unless a link opts into preservation.

## Anatomy

```
app/
├── layout.tsx              # HTML shell, top nav, global <style>
├── page.tsx                # / — grouped landing
├── error.tsx               # 500 boundary
├── not-found.tsx           # 404 boundary
├── middleware.ts           # /blocked (451), /admin auth redirect
├── session-store.ts        # in-memory session store
├── about/page.tsx
├── counter/page.tsx
├── streaming/
│   ├── page.tsx            # stream=true + <Await> boundaries
│   └── loading.tsx         # rendered while the page's promises resolve
├── server-actions/
│   ├── page.tsx            # form + listNotes()
│   ├── actions.ts          # "use server" addNote
│   └── store.ts            # in-memory note store
├── users/
│   ├── data.ts             # ada / grace / margaret
│   └── $id/page.tsx        # dynamic + prerender + notFound
├── files/$...path/page.tsx
├── docs/
│   ├── layout.tsx          # nested layout with <Slot name="aside" />
│   ├── template.tsx        # remounts per navigation (vs layout)
│   ├── loading.tsx         # nested loading boundary
│   ├── error.tsx           # nested error boundary
│   ├── not-found.tsx       # nested 404 boundary
│   ├── page.tsx            # /docs (slots.aside = TipAside)
│   ├── routing/page.tsx    # /docs/routing (slots.aside = SeeAlsoAside)
│   └── slots/page.tsx      # /docs/slots (slots.aside = HintAside + walkthrough)
├── query/page.tsx          # /query (loader prefetch + client refetch)
├── forms/
│   ├── page.tsx            # /forms (createForm + setServerErrors)
│   ├── valibot/page.tsx    # /forms/valibot (Valibot Standard Schema)
│   └── zod/page.tsx        # /forms/zod (Zod v4 Standard Schema)
├── i18n/
│   ├── messages.ts         # defineMessages → typed en/ja/fr bundles
│   ├── page.tsx            # /i18n (detectLocale via Accept-Language)
│   └── $locale/page.tsx    # /i18n/$locale (detectLocale via URL prefix)
├── (marketing)/contact/page.tsx
├── login/page.tsx
├── admin/
│   ├── page.tsx            # /admin (middleware-gated, getCurrentSession)
│   └── audit/page.tsx      # /admin/audit (requireRole("admin"))
├── forbidden/page.tsx      # /forbidden (target of failed role / permission checks)
└── api/
    ├── time/route.ts
    ├── contact/route.ts    # /api/contact (server-side validation for /forms)
    ├── login/route.ts
    └── logout/route.ts
scripts/
├── serve-node.ts           # createNodeRequestHandler against .mreact/ (start:node)
├── export-static.ts        # exportStaticApp → dist/ (export:static)
├── edge-handler.ts         # createEdgeRequestHandler shape (edge:demo)
└── dev-with-devtools.ts    # startDevServer + installDevtools (dev:devtools)
```

## Deployment adapters and devtools

The sample exposes three thin wrappers around the public adapters from
`@reckona/mreact-router`:

| Script | Adapter | Use case |
|---|---|---|
| `scripts/serve-node.ts` | `@reckona/mreact-router/adapters/node` | Production Node `http` server hosting the `.mreact/` build. Accepts `DEVTOOLS=1` to also install `@reckona/mreact-devtools` and log every router request event to stdout. |
| `scripts/export-static.ts` | `@reckona/mreact-router/adapters/static` | Walks the build manifest's prerendered routes, writes one HTML file per route under `dist/`, and copies the client bundle alongside. Pass paths as arguments to limit the export. |
| `scripts/edge-handler.ts` | `@reckona/mreact-router/adapters/edge` | Reference shape for edge runtimes (Cloudflare Workers, Vercel Edge, Deno Deploy, Bun). The handler depends only on `Request` / `Response` — no `node:*` imports. |

`scripts/dev-with-devtools.ts` is the same as the regular `pnpm dev`
plus an `installDevtools()` call. Reactive cell / store / query /
router events are all opt-in: the runtime packages only emit if the
global `__mreactDevtools` hook is present, so `pnpm dev` itself stays
zero-cost.

Use `pnpm dev:logs` or `pnpm start:logs` when you only need compact request summaries. Use the devtools scripts when you need the full event stream for router, reactive, store, and query internals.

`scripts/serve-node.ts` also demonstrates `onResponse`, which adds global security headers to every final response returned by the built app runtime.

The generated Cloudflare asset loader intentionally forwards only files listed in the generated client manifest (`manifest.json`, hashed route scripts, copied public assets, and linked source maps when `clientSourceMaps: "linked"` is enabled). Requests such as `/_mreact/client/../secret.js` or encoded traversal variants are rejected before reaching the `ASSETS` binding.

`mreact-router build --target=cloudflare` emits `.mreact/cloudflare/worker.mjs`, `.mreact/cloudflare/route-modules.mjs`, and per-route module chunks for non-prerendered and dynamic App Router pages plus `route.ts` server routes. The generated Worker imports that registry directly, so examples do not need a hand-written Worker entrypoint or Vite-only `import.meta.glob` transforms. Generated Cloudflare route modules preserve app-router layout/template shells, page metadata, layout titles, and named slots for both string and `stream = true` pages, and generated server route modules dispatch `GET`, `POST`, and `ALL` exports with decoded dynamic params plus Worker `context.env` bindings. Streamed HTML responses are marked with `Cache-Control: no-transform` and `Content-Encoding: identity` so Workers compression does not buffer the first shell before placeholders can paint. If a route module cannot produce route-marker HTML for `x-mreact-navigation: 1`, the Cloudflare adapter returns a reload signal so the browser performs a normal document navigation without first downloading the full HTML body through the client navigation runtime. Use `mreact-router build --target=node` when testing only the Node server path and you want to skip Workers route module bundling.

## Related code in the framework

- `packages/router/` — the router implementation; start at
  `packages/router/src/cli.ts` and `packages/router/src/dev-server.ts`.
- `packages/server/` — the SSR primitives used by `<Await>` and the
  streaming render path.
- `packages/compiler/` — the compiler that infers client boundaries
  from `cell` + event-handler usage.

## What this example does NOT show

- Fine-grained reactive primitives in isolation — see
  [`../reactive-primitives/`](../reactive-primitives).
- Centralized state container — see [`../store/`](../store).
- Raw SSR chunk output — see [`../ssr-streaming/`](../ssr-streaming).
- React drop-in compatibility — see [`../react-compat/`](../react-compat).
- Selective hydration on plain SSR (no router) — see
  [`../selective-hydration/`](../selective-hydration).
