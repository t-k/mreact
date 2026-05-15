# @reckona/mreact-router

`@reckona/mreact-router` is the mreact app router. It covers file-system routes,
loaders, metadata, server actions, prerendering, and deployment adapters.

## Basic Usage

```ts
import { buildApp, renderBuiltAppRequest } from "@reckona/mreact-router";

await buildApp({
  projectRoot: process.cwd(),
  routesDir: "src/app",
  publicDir: "public",
  allowedSourceDirs: ["src"],
  outDir: ".mreact",
});

const response = await renderBuiltAppRequest({
  outDir: ".mreact",
  request: new Request("https://example.test/"),
});
```

For application projects, configure the router explicitly in `vite.config.ts`:

```ts
import { defineConfig } from "vite";
import { mreactRouter } from "@reckona/mreact-router/vite";

export default defineConfig({
  plugins: [
    mreactRouter({
      routesDir: "src/app",
      publicDir: "public",
      allowedSourceDirs: ["src"],
    }),
  ],
});
```

`mreact-router build` reads this config. The legacy `appDir` shortcut remains
available for tests and older direct programmatic usage, but it is deprecated.
Use `projectRoot` + `routesDir` for new code. The shortcut is planned for
removal after `0.1.0`.

## Route Module Exports

- `loader(context)` returns data passed to the page component.
- `metadata` injects title, OpenGraph, viewport, and related head tags.
- `generateStaticParams()` returns dynamic route params to prerender.
- `prerender = true` emits HTML at build time.
- `"use server"` modules and `<form action={...}>` provide server actions.

## Deployment Adapters

- `@reckona/mreact-router/adapters/node`: Node `http` server adapter.
- `@reckona/mreact-router/adapters/static`: static export adapter for prerendered routes.
- `@reckona/mreact-router/adapters/edge`: generic `Request` / `Response` runtime adapter.
- `@reckona/mreact-router/adapters/cloudflare`: Cloudflare Workers adapter.

For Cloudflare Workers, combine `createCloudflareBuiltRequestHandler`,
`createCloudflareStaticAssetLoader`, `createCloudflarePrerenderStore`, and
`createCloudflareRouteModuleRenderer`. Use `collectCloudflareRouteModules()` with
`import.meta.glob()` to build the dynamic route registry from the server
manifest. Client assets are served only when they appear in the generated
manifest allow-list. Dynamic routes should resolve modules through a build-time
registry keyed by `route.file`, not by constructing module ids from request
input.

## Related APIs

- `renderAppRequest`: development and test API for rendering a source app directory.
- `renderBuiltAppRequest`: production API for rendering a `.mreact/` build artifact.
- `startDevServer`: dev server that watches the app directory.
- `startServer`: helper that serves a `.mreact/` build artifact with Node.

## Sessions

Application code should import session helpers from `@reckona/mreact-auth`:
`createMemorySessionStore()`, `createSession()`, `getSession()`,
`destroySession()`, and `rotateSession()`. The router still re-exports these
helpers for older code, but those re-exports are deprecated.
