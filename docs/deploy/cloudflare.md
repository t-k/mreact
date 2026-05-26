# Cloudflare Deployment

mreact can build generated Cloudflare Workers artifacts for dynamic and non-prerendered App Router pages plus `route.ts` server routes. The generated Worker imports a build-time route registry directly, so applications do not need a hand-written Worker wrapper or Vite-only `import.meta.glob()` transforms.

## Build

Build Workers artifacts with the Cloudflare target:

```bash
mreact-router build --target=cloudflare
```

The build emits:

- `.mreact/cloudflare/worker.mjs`
- `.mreact/cloudflare/route-modules.mjs`
- per-route module chunks for non-prerendered and dynamic App Router pages
- generated server route modules for `route.ts`
- `.mreact/client` static client assets

Deploy `.mreact/cloudflare/worker.mjs` as the Worker entry and bind static assets from `.mreact/client`.

## Cloudflare Pages Advanced Mode

For Cloudflare Pages advanced mode, package the build output before deployment:

```bash
mreact-router build --target=cloudflare
mreact-router package cloudflare-pages --from .mreact --out .mreact/pages
wrangler pages deploy .mreact/pages
```

The package command creates a Pages output directory with bundled `_worker.js`, `_mreact/client/*` static route assets, root public assets, and `mreact-cloudflare-pages-artifact.json`. Pages provides the `ASSETS` binding to `_worker.js`; mreact's generated worker reads that binding and serves only manifest-listed route assets and public files.

The package step bundles the generated Worker entry, route registry, route chunks, and router adapter code, so deploy scripts do not need to copy `worker.mjs` manually or decide whether Wrangler should bundle package imports.

## Route Modules

Generated Cloudflare route modules preserve app-router layout/template shells, page metadata, layout titles, and named slots for both string and `stream = true` pages. They also preserve route-local `<Await>` boundaries and local server-component imports.

Generated Cloudflare server route modules dispatch method exports such as `GET`, `POST`, and `ALL` with decoded dynamic params plus `context.env`, `context.context`, `context.request`, and `context.route`, so route handlers can use Worker bindings such as R2, KV, D1, Queues, Durable Objects, and secrets directly.

## Streaming and Client Navigation

The Cloudflare adapter marks streamed HTML responses with `Cache-Control: no-transform` and `Content-Encoding: identity` so Workers compression does not gzip-buffer the first shell before placeholders can paint.

If a generated Cloudflare route module cannot produce the `data-mreact-route-id` marker contract required by client navigation, the adapter returns a reload signal for `x-mreact-navigation: 1` requests. The browser then performs a normal document navigation instead of first buffering the full HTML response through the client navigation runtime.

Router `Link` components are safe inside streamed `<Await>` renderers, including mapped list rows in Cloudflare route modules.

## Assets and Security

Client assets, route stylesheet assets imported by pages/layouts/templates, and copied public assets are served only when they appear in the generated manifest allow-list. Requests such as `/_mreact/client/../secret.js` or encoded traversal variants are rejected before reaching the `ASSETS` binding.

Dynamic routes resolve modules through a build-time registry keyed by `route.file`, not by constructing module ids from request input. Pass `onResponse` to add cross-cutting response headers to rendered, static, asset, reload, not-found, and error responses.

See [CDN Assets](assets.md) for shared asset base URL and source map configuration.
