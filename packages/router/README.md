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
  targets: ["node"],
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
      projectRoot: __dirname,
      routesDir: "src/app",
      publicDir: "public",
      allowedSourceDirs: ["src"],
    }),
  ],
});
```

`mreact-router build` reads this config. Pass `--target=node` for Node, container, and AWS Lambda artifacts, `--target=cloudflare` for Workers artifacts, or configure `buildTargets: ["node"]` / `buildTargets: ["cloudflare"]` in `mreactRouter()` when one deployment target should be the project default. Without an explicit target, build output includes both Node-compatible server/client artifacts and Cloudflare route modules for backward compatibility. The legacy `appDir` shortcut remains
available for tests and older direct programmatic usage, but it is deprecated.
Use `projectRoot` + `routesDir` for new code. The shortcut is planned for
removal after `0.1.0`.

Production client source maps are disabled by default. Set `clientSourceMaps: "linked"` to emit public `.js.map` files beside route scripts and include `sourceMappingURL` comments, or set `clientSourceMaps: "hidden"` to emit upload-only maps under `.mreact/source-maps/client/` without exposing them in the client manifest. The CLI accepts the same modes with `mreact-router build --client-source-maps=hidden`, `linked`, or `none`.

`mreact-router dev` reads the same config and uses `server.port` from
`vite.config.ts` when `PORT` is not set. This keeps Playwright `webServer`
setups and local dev commands on the same configured port.

For TypeScript projects that type-check route modules directly, include the
app-router global declarations so route files can use `<Slot />` without a
local import:

```json
{
  "compilerOptions": {
    "types": ["@reckona/mreact-router/app-router-globals"]
  }
}
```

## Client Navigation

Internal anchors are intercepted by the app-router client runtime and update the
changed route payload instead of forcing a full document reload. The runtime
keeps head metadata and route-data scripts synchronized, restores scroll on
back/forward navigation, and prefetches client route scripts for likely
navigations when the browser is not in reduced-data mode.

Use `Link` or `linkProps()` when a route needs explicit navigation behavior:

```tsx
import { Link } from "@reckona/mreact-router/link";

export default function Page() {
  return (
    <nav>
      <Link href="/docs" prefetch="viewport">
        Docs
      </Link>
      <Link href="/editor" scroll="preserve" transition="auto">
        Editor
      </Link>
      <Link href="/legacy" reload>
        Legacy page
      </Link>
    </nav>
  );
}
```

`Link` and `linkProps()` are also re-exported from `@reckona/mreact-router` for
compatibility, but `@reckona/mreact-router/link` is the preferred import for
client-only code. Navigation observers are available from
`@reckona/mreact-router/navigation-state` as `getNavigationState()` and
`subscribeNavigationState()`.

## Route Module Exports

- `loader(context)` returns data passed to the page component, or may return or throw a `Response` for redirects and custom responses.
- `metadata` injects title, OpenGraph, viewport, and related head tags.
- `generateStaticParams()` returns dynamic route params to prerender.
- `prerender = true` emits HTML at build time.
- `"use server"` modules and `<form action={...}>` provide server actions.
- Server actions reject `Content-Length` values over `10 MiB` by default. Pass `serverActions: { maxBodyBytes }` to configure the limit.
- Route handlers may return or throw standard `Response` objects from method exports such as `GET`, `POST`, or `ALL`. Dynamic route handlers receive decoded params as the second argument: `GET(request, { params })`.

Route metadata is composed from parent layouts before the matched page. CSP directives are additive by default through `metadata.csp.directives`, but route-local metadata may replace inherited directives with `metadata.csp.replace`, remove inherited directives with `metadata.csp.remove`, or disable CSP for the route with `metadata.csp.disable = true`. These overrides are applied after inherited directives so the matched page has the final say for vendor callbacks, embedded checkout pages, and other narrowly scoped policy exceptions.

Global middleware can opt into route-local controls by declaring a stable id with `export const config = { id: "auth", matcher: "/admin/:path*" }`. Pages and layouts can then export `middleware = { skip: true }` to skip all app middleware for that route, or `middleware = { skip: ["auth"] }` to skip only the middleware with the matching id. Parent layout controls are composed before page controls.

Route-local `error.tsx` boundaries receive a sanitized `error`, `requestId`, `routeId`, and optional `traceId`. In development only, they also receive `debug.stack`, `debug.cause`, and `debug.route` to speed up local diagnosis; production responses never receive this debug object.

Routers accept an optional `instrumentation` object on `renderAppRequest()`, `renderBuiltAppRequest()`, `startServer()`, and the Node/Lambda adapters. The router parses W3C `traceparent` / `tracestate` headers and passes the resulting trace context to request and loader hooks:

```ts
import type { RouterInstrumentation } from "@reckona/mreact-router";

const instrumentation: RouterInstrumentation = {
  onRequestStart(event) {
    console.log(event.trace?.traceId, event.path);
  },
  onLoaderStart(event) {
    console.log(event.routeId, event.trace?.traceId);
  },
};
```

Use `InferLoaderData<typeof loader>` when sibling modules need the exact data shape returned by a route loader:

```ts
import type { InferLoaderData } from "@reckona/mreact-router";

export async function loader() {
  return { count: 1, name: "Ada" };
}

export type LoaderData = InferLoaderData<typeof loader>;
```

## Streaming Await

Routes can export `stream = true` and use `<Await>` to flush a shell while async work continues. `placeholder` renders the early stream content, `placeholderAs` chooses the visible placeholder host element for block-level skeletons, and `catch` renders a route-local error branch when the awaited value rejects.

```tsx
export const stream = true;

function FeedList(props) {
  return <ul>{props.items.map((item) => <li>{item}</li>)}</ul>;
}

export default function Page() {
  const feed = Promise.resolve(["Compiler output", "Streaming shell"]);

  return (
    <main>
      <Await
        value={feed}
        placeholderAs="div"
        placeholder={<p>Loading feed...</p>}
        catch={(error) => <p>Failed to load feed: {error.message}</p>}
      >
        {(items) => <FeedList items={items} />}
      </Await>
    </main>
  );
}
```

Streaming `<Await>` boundaries may be passed through app-local server component children. For example, a frame component can render `{props.children}` while the route passes an `<Await>` table inside the frame; the stream target keeps both the placeholder and out-of-order fragment in the response.

Use one page-level loading label plus repeated skeleton-only placeholders for parallel boundaries when repeated fallback copy would be noisy. `placeholderAs="div"` keeps list and section skeleton placeholders out of the default inline `span` host.

## Deployment Adapters

- `@reckona/mreact-router/adapters/node`: Node `http` server adapter.
- `@reckona/mreact-router/adapters/static`: static export adapter for prerendered routes.
- `@reckona/mreact-router/adapters/edge`: generic `Request` / `Response` runtime adapter.
- `@reckona/mreact-router/adapters/cloudflare`: Cloudflare Workers adapter.
- `@reckona/mreact-router/adapters/aws-lambda`: AWS Lambda HTTP API v2 adapter.

The built-in CLI can print compact request summaries for both local development and built output:

```bash
mreact-router dev --log=requests
mreact-router start .mreact --log=requests
MREACT_ROUTER_LOG=requests mreact-router dev
```

Each line includes method, path, status, duration, and runtime. Query strings, headers, and request bodies are intentionally omitted.

Server-only pages can opt into the lightweight navigation runtime without becoming hydrated client routes:

```tsx
import { Link } from "@reckona/mreact-router/link";

export const navigationRuntime = true;

export default function Page() {
  return <Link href="/docs" prefetch="viewport">Docs</Link>;
}
```

The build manifest records this separately from `client: true`, emits a shared navigation runtime asset, prefetches client route scripts when present, and falls back to `x-mreact-navigation: 1` HTML prefetches for server-only targets.

For Cloudflare Workers, combine `createCloudflareBuiltRequestHandler`, `createCloudflareStaticAssetLoader`, `createCloudflarePrerenderStore`, and `createCloudflareRouteModuleRenderer`. `mreact-router build --target=cloudflare` emits `.mreact/cloudflare/route-modules.mjs` for non-prerendered and dynamic App Router pages, so Workers entrypoints can import a plain route registry without Vite-only `import.meta.glob()` transforms. Client assets are served only when they appear in the generated manifest allow-list. Dynamic routes should resolve modules through a build-time registry keyed by `route.file`, not by constructing module ids from request input. Generated Cloudflare route modules preserve app-router layout/template shells and named slots for both string and `stream = true` pages, including route-local `<Await>` boundaries and local server-component imports. The Cloudflare adapter marks streamed HTML with `Cache-Control: no-transform` and `Content-Encoding: identity` so Workers compression does not gzip-buffer the first shell before placeholders can paint. If a generated Cloudflare route module cannot produce the `data-mreact-route-id` marker contract required by client navigation, the adapter returns a reload signal for `x-mreact-navigation: 1` requests so the browser performs a normal document navigation without first buffering the full HTML response.

For AWS Lambda, use `createPreloadedAwsLambdaRequestHandler()` with API Gateway
HTTP API v2 or Lambda Function URL payload format 2.0:

```ts
import { createPreloadedAwsLambdaRequestHandler } from "@reckona/mreact-router/adapters/aws-lambda";

export const handler = await createPreloadedAwsLambdaRequestHandler({
  outDir: ".mreact",
  importPolicy: {
    allowedPackages: [
      "@reckona/mreact",
      // "cookie",
      // "zod",
    ],
  },
  onResponse(response) {
    response.headers.set("x-content-type-options", "nosniff");
  },
});
```

Production adapters enforce the app-router import policy when bundling loaders, middleware, route handlers, metadata, and server actions. Add every npm package imported by server-side application code to `importPolicy.allowedPackages`, including dependencies reached through app-local helper modules.

For Lambda and other Node-only deployments, build with `mreact-router build --target=node` or `buildApp({ targets: ["node"] })`. Node-only builds skip `.mreact/cloudflare` route modules, so loaders and server helpers may import Node-only dependencies such as database drivers without being bundled for the Workers runtime.

For Lambda deployments, package a minimal asset directory instead of the full project checkout. AWS Lambda enforces a 250 MB unzipped deployment package limit, and the runtime only needs `.mreact/`, the bundled handler, `package.json` / lockfiles, and production `node_modules`; `src/`, tests, dev dependencies, build caches, and Vite/Vitest/Playwright tooling are not required. `mreact-router build --target=node` keeps compiled server route artifacts in `.mreact/server/server-modules/*.json` instead of embedding them in one large server manifest. `createAwsLambdaRequestHandler()` treats `outDir` as read-only and materializes generated runtime files under `/tmp/mreact-router/<hash>/runtime` by default, with a `node_modules` symlink back to the deployed package root. Handler creation starts a background preload for the built runtime, loader modules, middleware, route handlers, page modules, layouts, and route metadata so route-specific bundling can move out of the first matched request on warmable runtimes; if a request arrives before preload finishes, middleware is resolved first, middleware responses or redirects return without loading the matched page artifact, and continuing requests load only the matched route's artifact closure. Static middleware `config.matcher` and `config.id` values are checked before importing the middleware module, so unmatched health checks and route-local middleware skips avoid evaluating heavyweight middleware dependencies. Route request artifacts omit page render exports, and built loader and route metadata artifacts are split, so loader redirects do not evaluate page-only or metadata-only dependencies before render or metadata is needed. Loader redirects settle before page component server transforms and render imports for non-stream routes and stream routes without a loading boundary. Prefer `await createPreloadedAwsLambdaRequestHandler()` in Node 24 ESM Lambda handlers when first-request latency matters: it waits for the same preload during Lambda initialization, increasing `Init Duration` but making the first handler invocation much closer to warm steady-state. Pass `runtimeDir` only when you need to control that writable cache location. With pnpm, copy those files into `.lambda/` and run `pnpm --dir .lambda install --prod --frozen-lockfile --ignore-scripts --config.node-linker=hoisted`. pnpm's default isolated linker is symlink-heavy, so verify the artifact's symlink count with `find .lambda -type l | wc -l` and measure actual file bytes in addition to `du -sh .lambda` before upload. Every package listed in `importPolicy.allowedPackages` must also be installed in that production artifact.

Use the Lambda `preload` option to tune that trade-off. The default is `"all"` for backward compatibility. Set `preload: "none"` to disable background preload, `preload: "middleware"` to warm only middleware and shared runtime, `preload: { mode: "hot-routes", routes: ["/", "/dashboard"] }` with `createPreloadedAwsLambdaRequestHandler()` to await selected route closures including render modules during Lambda initialization, or `preload: { mode: "hot-route-requests", routes: ["/", "/login"] }` to warm only middleware plus selected route loader/server-route request modules without evaluating page/layout render modules.

Set `timings: true` on `createAwsLambdaRequestHandler()` or `createAwsLambdaStreamingRequestHandler()` when you need low-overhead Lambda phase diagnostics. The adapter emits a `router:request:timing` debug log event with `eventToRequestMs`, `runtimeDirMs`, `renderMs`, and response serialization or streaming time, so production measurements can separate API Gateway event normalization, runtime materialization, route rendering, and Lambda response conversion. It also forwards `router:render:timing` debug events for route-level phases such as route matching, middleware, loader start/wait, source analysis, page module load, page component render, route slot render, layout module load, layout component render, metadata, and response construction. Loader timings split module load/evaluation (`loaderModuleLoadMs`) from user loader execution (`loaderExecutionMs`) inside the existing `loaderWaitMs` envelope, source analysis reports `sourceAnalysisArtifactMs` when a built analysis summary is reused, and middleware timings similarly split `middlewareModuleLoadMs` from `middlewareExecutionMs` inside `middlewareMs`. Buffered handlers report `responseSerializationMs` as the total conversion phase and split it into `streamDrainMs`, `streamReadMs`, `streamConcatMs`, and `bodyEncodeMs`; streaming handlers report `responseStreamingMs` as the total streaming phase and split it into `streamWaitMs` and `streamWriteMs`.

The Lambda adapter returns proxy responses with `cookies`, `headers`,
`statusCode`, `body`, and `isBase64Encoded`. It buffers response bodies because
API Gateway and Lambda Function URL proxy responses do not expose true streaming
SSR. Prefer S3 + CloudFront for `.mreact/client` assets on production Lambda
deployments.

For Lambda Function URL response streaming, use
`createAwsLambdaStreamingRequestHandler()` instead:

```ts
import { createAwsLambdaStreamingRequestHandler } from "@reckona/mreact-router/adapters/aws-lambda";

export const handler = createAwsLambdaStreamingRequestHandler({
  outDir: ".mreact",
});
```

The streaming handler requires the Node.js Lambda runtime
`awslambda.streamifyResponse()` and `awslambda.HttpResponseStream.from()` APIs.
It streams response bytes directly and preserves status, headers, and cookies
through Lambda response streaming metadata.

## Related APIs

- `renderAppRequest`: development and test API for rendering a source app directory.
- `renderBuiltAppRequest`: production API for rendering a `.mreact/` build artifact.
- `startDevServer`: dev server that watches the app directory.
- `startServer`: helper that serves a `.mreact/` build artifact with Node.

`renderAppRequest` and the development server enforce the app-router import policy before bundling loaders, middleware, metadata, and server actions. Packages must either be explicitly allowed through `importPolicy.allowedPackages` or, in dev, be declared by the application `package.json`. Allowed server dependencies may use normal Node runtime features, including CommonJS modules that require Node built-ins such as `events`.

Use relative imports for app-local modules in server-side route code. The production server bundler applies the import policy before Vite-only or tsconfig path alias plugins can rewrite aliases such as `~/*`, so an alias like `~/lib/csrf` is treated as a package import named `"~"`. Prefer `../lib/csrf.js` or another relative specifier in loaders, middleware, route handlers, metadata modules, server actions, and their app-local helper modules.

Route pages may extract server-only UI into app-local `.tsx` or `.mreact.tsx` components and pass JSX children through them. The router compiles those local server-component dependencies with the same server string or stream target before inserting the page output into layout `<Slot />` positions.

## Sessions

Application code should import session helpers from `@reckona/mreact-auth`:
`createMemorySessionStore()`, `createSession()`, `getSession()`,
`destroySession()`, and `rotateSession()`. The router still re-exports these
helpers for older code, but those re-exports are deprecated.
