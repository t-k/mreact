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

`mreact-router build` reads this config. Pass `--target=node` for plain Node/container output, `--target=aws-lambda` for Lambda artifacts with a generated handler and import policy, or `--target=cloudflare` for Workers artifacts with a generated Worker module. Configure `buildTargets: ["node"]`, `["aws-lambda"]`, or `["cloudflare"]` in `mreactRouter()` when one deployment target should be the project default. Without an explicit target, build output includes Node-compatible server/client artifacts and Cloudflare route modules for backward compatibility. The legacy `appDir` shortcut remains
available for tests and older direct programmatic usage, but it is deprecated.
Use `projectRoot` + `routesDir` for new code. The shortcut is planned for
removal after `0.1.0`.

Production client source maps are disabled by default. Set `clientSourceMaps: "linked"` to emit public `.js.map` files beside route scripts and include `sourceMappingURL` comments, or set `clientSourceMaps: "hidden"` to emit upload-only maps under `.mreact/source-maps/client/` without exposing them in the client manifest. The CLI accepts the same modes with `mreact-router build --client-source-maps=hidden`, `linked`, or `none`.

`mreact-router dev` reads the same config, preserves route-agnostic Vite plugins and CSS settings, and uses `server.port` from `vite.config.ts` when `PORT` is not set. This keeps Vite CSS transforms, Playwright `webServer` setups, and local dev commands on the same configured port.

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

Internal anchors are intercepted by the app-router client runtime and update the changed route payload instead of forcing a full document reload. The runtime keeps head metadata and route-data scripts synchronized, restores scroll on back/forward navigation, and prefetches client route scripts for likely navigations when the browser is not in reduced-data mode. Client route assets share app-local module instances across development and production route chunks, so app-local modules imported by multiple client routes use the browser's normal single ESM instance across SPA navigation.

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
- `metadata` injects title, OpenGraph, viewport, and related head tags. Use `RouteMetadata` to type the object; `openGraph.image` and `openGraph.images` accept URL scalars or Next-style image objects with a required `url` field.
- `generateMetadata(context)` may compute route metadata from resolved loader data, params, and the current request. Static `metadata` is still used as the fallback and base object.
- `generateStaticParams()` returns dynamic route params to prerender and can import modules transformed by configured Vite plugins.
- `prerender = true` emits HTML at build time.
- `"use client"` at the top of a page or layout forces a hydrated client route even when inference cannot see an event handler or client boundary.
- Imported functions passed to `<form action={...}>` are inferred as server actions. A top-level `"use server"` directive is still supported and marks every exported function in that module as a server action.
- Server actions reject `Content-Length` values over `10 MiB` by default. Pass `serverActions: { maxBodyBytes }` to configure the limit.
- Route handlers may return or throw standard `Response` objects from method exports such as `GET`, `POST`, or `ALL`. Dynamic route handlers receive decoded params as the second argument: `GET(request, { params })`; catch-all `$...slug` params are arrays of decoded segments. The context also includes `request`, `route`, and adapter `env`; Cloudflare route handlers additionally receive the Worker execution `context`.
- `redirect(location)` throws router control flow that defaults to HTTP 303 so auth and form flows continue as GET requests after the redirect. Use `redirect(location, { status: 307 })` when preserving the original method and body is required.

Route-owned client data loading is inferred when the page render path reaches `cell()` state or a same-module browser-only helper, even if the initial server HTML has no event handler. Use route-level `"use client";` as an escape hatch when the client work is hidden behind dynamic dispatch, a registry, or another pattern the static analyzer cannot follow; otherwise a page that only renders passive SSR output may remain server-only and no `/_mreact/client/routes/...` script is emitted.

Inferred form actions are bound to the rendered form with a hidden token derived from the CSRF token and form nonce. Single-process deployments use an automatically generated process secret; multi-instance deployments should set the same `MREACT_SERVER_ACTION_SECRET` value on every instance so forms rendered by one instance can be submitted to another.

Plain `multipart/form-data` route handlers do not automatically run the server-action CSRF guard. For cookie-authenticated upload forms that post directly to `route.ts`, render a hidden field named `formCsrfFieldName`, set `formCsrfCookie(token)` for the same token, and either call `validateFormCsrf(request, formData)` for small buffered forms or read the CSRF field with `parseMultipartStream()` before consuming a large file part. `request.formData()` buffers multipart file parts in memory; `parseMultipartStream(request, { fields })` keeps file parts as `ReadableStream<Uint8Array>` values with per-part and total byte limits. Workers APIs such as R2 require known-length streams, so `part.fixedLengthStream(length).readable` is only valid when the multipart part carries a `Content-Length` header or the handler can pass the exact byte length; otherwise use a bounded `arrayBuffer()` fallback for R2. Put the CSRF field before the file field when you want early rejection without reading the file body.

Use `startDevServer()` and `startServer()` when an app needs to attach HTTP upgrade handling to the same Node server as mreact routes. Both APIs accept `onUpgrade(request, socket, head)`, and `startDevServer()` keeps Vite middleware/HMR wired to the underlying server. Production route artifacts are bundled independently, so mutable custom-server state should live in `getServerRuntimeState(key, create)` rather than in a module-scoped `let` singleton.

Client boundary markers have the same SSR behavior. A plain `Foo.tsx` component runs on the server and does not hydrate by itself. Marking a component boundary with either `Foo.client.tsx` or a top-level `"use client";` directive makes that boundary hydrate on the client; SSR emits a `<template data-mreact-client-boundary="...">` placeholder plus serialized props, and the component JSX appears after hydration. Combining `.client.tsx` with `"use client";` is redundant and does not change the boundary behavior. Route-level `"use client";` is separate: when it appears in a page, layout, or template route module, the whole route is emitted as a hydrated client route. In development, app-local client boundary dependencies are transformed through the mreact client compiler before Vite serves them, and generated mreact runtime imports are resolved by the router plugin, so server-rendered layouts and app shells can import hydrated client controls without adding React or mreact compat runtime aliases.

```tsx
import { cell } from "@reckona/mreact-reactive-core";

const items = cell<readonly string[]>([]);
const started = cell(false);

function startLoad() {
  if (typeof window === "undefined" || started.get()) return;
  started.set(true);
  queueMicrotask(() => items.set(["A"]));
}

export default function Page() {
  startLoad();
  return <main>{items.get().length === 0 ? <p>Empty</p> : <p>Full</p>}</main>;
}
```

```tsx
"use client";

export default function Page() {
  startClientOnlyWorkThroughADynamicRegistry();
  return <main>Loading</main>;
}
```

Route metadata is composed from parent layouts before the matched page. CSP directives are additive by default through `metadata.csp.directives`, but route-local metadata may replace inherited directives with `metadata.csp.replace`, remove inherited directives with `metadata.csp.remove`, or disable CSP for the route with `metadata.csp.disable = true`. These overrides are applied after inherited directives so the matched page has the final say for vendor callbacks, embedded checkout pages, and other narrowly scoped policy exceptions.

Rendered routes include conservative default response headers: `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and `Permissions-Policy: camera=(), microphone=(), geolocation=()`. Use `metadata.security` to opt out of a default, override a policy, add `X-Frame-Options`, or enable HSTS for HTTPS requests. Security header values are validated before they are emitted.

Root app files can define crawler and install metadata without adding route handlers. `robots.ts`, `sitemap.ts`, and `manifest.ts` serve `/robots.txt`, `/sitemap.xml`, and `/manifest.webmanifest`; static `robots.txt`, `sitemap.xml`, `manifest.webmanifest`, `favicon.ico`, `icon.*`, `apple-icon.*`, and `opengraph-image.*` files are copied as public assets during builds. Route-local `opengraph-image.tsx` / `.ts` / `.jsx` / `.js` modules serve `/<route>/opengraph-image`, receive `{ params, request }`, may return a `Response`, string, or bytes, and are used as the default `og:image` when the page does not set one explicitly. Static files take precedence over generated metadata routes for the same URL, and icon files are also used as fallback route metadata when a page does not define its own icon or OpenGraph image.

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

Routes that render `<Await>` can use `defer()` to return non-critical loader fields as promises. Resolve critical routing decisions such as redirects, `notFound()`, and status-bearing `Response` objects before calling `defer()`. Page components can pass deferred fields to `<Await>` so the route shell renders before those fields settle:

`defer()` marks top-level promises as handled so an early rejection does not become a process-level unhandled rejection before `<Await>` attaches its boundary handlers. Render every deferred promise through `<Await catch>` or otherwise observe it; an unused rejected deferred field will not surface as an unhandled rejection.

```tsx
import { defer, notFound } from "@reckona/mreact-router";

export async function loader({ params }) {
  const user = await loadUser(params.id);
  if (user === undefined) notFound();

  return defer({
    recentStories: loadRecentStories(user.submitted),
    user,
  });
}

export default function Page(props) {
  return (
    <main>
      <h1>{props.data.user.id}</h1>
      <Await value={props.data.recentStories} placeholder={<p>Loading stories...</p>}>
        {(stories) => <StoryList stories={stories} />}
      </Await>
    </main>
  );
}
```

## Streaming Await

Routes that render route-local `<Await>` directly or through app-local server components are built as streaming routes automatically. Routes can still export `stream = true` to opt into streaming without an `<Await>` boundary. `placeholder` renders the early stream content, `placeholderAs` chooses the visible placeholder host element for block-level skeletons, and `catch` renders a route-local error branch when the awaited value rejects. Router `Link` components can be rendered inside streamed `<Await>` renderers, including mapped list rows in Cloudflare route modules.

```tsx
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

Use `streamList()` when a route needs to stream an ordered list in batches. `streamList()` creates stable batch promises and metadata; render those batches with direct sibling `<Await>` boundaries so the compiler can preserve placeholder hosts, catch handlers, and streaming output:

```tsx
import { streamList } from "@reckona/mreact-router/stream-list";

export default function Page() {
  const batches = streamList(storyIds, {
    batchSize: 5,
    loadBatch: async (ids) => loadStories(ids),
  });

  return (
    <ol>
      {batches.map((batch) => (
        <Await
          key={batch.index}
          value={batch.value}
          placeholderAs="div"
          placeholder={<StorySkeleton count={batch.size} start={batch.start + 1} />}
        >
          {(resolved) => (
            <StoryRows stories={resolved.items} start={resolved.start + 1} />
          )}
        </Await>
      ))}
    </ol>
  );
}
```

For route-handler mutations, `redirect303(location)`, `textError(message, status)`, and `parseForm(request, schema)` provide small composable helpers for redirect-after-post responses, plain text validation failures, and body-safe `FormData` parsing without introducing an opinionated mutation framework.

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

Use `mreact-router --help`, `mreact-router help build`, or command-level help such as `mreact-router build --help` to inspect supported commands, build targets, and generated artifacts.

Server-only pages can opt into the lightweight navigation runtime without becoming hydrated client routes:

```tsx
import { Link } from "@reckona/mreact-router/link";

export const navigationRuntime = true;

export default function Page() {
  return <Link href="/docs" prefetch="viewport">Docs</Link>;
}
```

The build manifest records this separately from `client: true`, emits a shared navigation runtime asset, prefetches client route scripts when present, and falls back to `x-mreact-navigation: 1` HTML prefetches for server-only targets.

For Cloudflare Workers, `mreact-router build --target=cloudflare` emits `.mreact/cloudflare/worker.mjs`, `.mreact/cloudflare/route-modules.mjs`, and per-route module chunks for non-prerendered and dynamic App Router pages plus `route.ts` server routes and metadata conventions, so deployments do not need a hand-written Worker entrypoint or Vite-only `import.meta.glob()` transforms. User Vite plugins from the project config are forwarded into router bundle builds after the `mreact-router` plugin itself is removed, so MDX-style syntax transforms and custom content loaders can participate in server, client, Cloudflare, and prerender bundles. Client assets, route stylesheet assets imported by pages/layouts/templates, and copied public assets are served only when they appear in the generated manifest allow-list. Dynamic routes resolve modules through a build-time registry keyed by `route.file`, not by constructing module ids from request input. Generated Cloudflare route modules preserve app-router layout/template shells and named slots for both string and `stream = true` pages, including route-local `<Await>` boundaries and local server-component imports. Generated Cloudflare server route modules dispatch method exports such as `GET`, `POST`, and `ALL` with decoded dynamic params plus `context.env`, `context.context`, `context.request`, and `context.route`, so handlers can use Worker bindings directly. The Cloudflare adapter marks streamed HTML with `Cache-Control: no-transform` and `Content-Encoding: identity` so Workers compression does not gzip-buffer the first shell before placeholders can paint. Pass `onResponse` to add cross-cutting response headers to rendered, static, asset, reload, not-found, and error responses. If a generated Cloudflare route module cannot produce the `data-mreact-route-id` marker contract required by client navigation, the adapter returns a reload signal for `x-mreact-navigation: 1` requests so the browser performs a normal document navigation without first buffering the full HTML response.

For AWS Lambda, use `createPreloadedAwsLambdaRequestHandler()` with API Gateway
HTTP API v2 or Lambda Function URL payload format 2.0:

```ts
import { createPreloadedAwsLambdaRequestHandler } from "@reckona/mreact-router/adapters/aws-lambda";

export const handler = await createPreloadedAwsLambdaRequestHandler({
  outDir: ".mreact",
  importPolicy: "generated",
  onResponse(response) {
    response.headers.set("x-content-type-options", "nosniff");
  },
});
```

Production adapters enforce the app-router import policy when bundling loaders, middleware, route handlers, metadata, and server actions. `mreact-router build` writes `.mreact/server/import-policy.json` from server-side static imports, and Lambda handlers can use `importPolicy: "generated"`. You can still pass an explicit `importPolicy.allowedPackages` list when you need a hand-audited policy.

For Lambda deployments, build with `mreact-router build --target=aws-lambda` or `buildApp({ targets: ["aws-lambda"] })`. The target writes Node-compatible server/client output, `.mreact/server/import-policy.json`, and `.mreact/aws-lambda/mreact-handler.mjs` while skipping `.mreact/cloudflare` route modules, so loaders and server helpers may import Node-only dependencies such as database drivers without being bundled for the Workers runtime.

Package Lambda deployments with `mreact-router package aws-lambda --from .mreact --out .lambda` instead of pointing deployment tooling at the full project checkout. AWS Lambda enforces a 250 MB unzipped deployment package limit, and the runtime only needs `.mreact/`, `mreact-handler.mjs`, `package.json` / lockfiles, and production `node_modules`; `src/`, tests, dev dependencies, build caches, and Vite/Vitest/Playwright tooling are not required. `mreact-router build --target=aws-lambda` keeps compiled server route artifacts in `.mreact/server/server-modules/*.json` instead of embedding them in one large server manifest, writes compiled module bodies as hashed `.mjs` files, and keeps request/control artifacts separate from render artifacts so loader redirects do not read page render bundles. `createAwsLambdaRequestHandler()` treats `outDir` as read-only and materializes generated runtime files under `/tmp/mreact-router/<hash>/runtime` by default, with a `node_modules` symlink back to the deployed package root. Direct `createAwsLambdaRequestHandler()` and `createAwsLambdaStreamingRequestHandler()` handlers start only middleware and shared runtime preload in the background by default, so all-route preload work does not compete with the first user request. If a request arrives before preload finishes, middleware is resolved first, middleware responses or redirects return without loading the matched page artifact, and continuing requests load only the matched route's artifact closure. Static middleware `config.matcher` and `config.id` values are checked before importing the middleware module, so unmatched health checks and route-local middleware skips avoid evaluating heavyweight middleware dependencies. Route request artifacts omit page render exports, and built loader and route metadata artifacts are split, so loader redirects do not evaluate page-only or metadata-only dependencies before render or metadata is needed. Loader redirects settle before page component server transforms and render imports for non-stream routes and stream routes without a loading boundary. Prefer `await createPreloadedAwsLambdaRequestHandler()` in Node 24 ESM Lambda handlers when first-request latency matters: it waits for the full preload during Lambda initialization by default, increasing `Init Duration` but making the first handler invocation much closer to warm steady-state. Pass `runtimeDir` only when you need to control that writable cache location. With pnpm, run `pnpm --dir .lambda install --prod --frozen-lockfile --ignore-scripts --config.node-linker=hoisted`. pnpm's default isolated linker is symlink-heavy, so verify the artifact's symlink count with `find .lambda -type l | wc -l` and measure actual file bytes in addition to `du -sh .lambda` before upload. Packages listed in the generated import policy must also be installed in that production artifact.

Configure `allowedHosts` for production Lambda deployments so absolute URLs, redirects, cache keys, and metadata cannot be derived from attacker-controlled Host input. The Lambda adapter uses `Host` by default and only reads `x-forwarded-host` when `hostPolicy: "trusted-proxy"` is set. It also ignores `x-forwarded-proto` unless `trustForwardedProto: true` is configured, deriving the request scheme from the Lambda event protocol when available and otherwise defaulting to HTTPS.

Use the Lambda `preload` option to tune that trade-off. Direct handlers default to `"middleware"` so cold starts do not kick off all route module imports in parallel with the first request. `createPreloadedAwsLambdaRequestHandler()` and `createPreloadedAwsLambdaStreamingRequestHandler()` default to `"all"` because the work is awaited during Lambda initialization instead of racing user traffic. Set `preload: "none"` to disable background preload, `preload: "all"` only when you have measured that all-route background preload helps the deployed function, `preload: { mode: "hot-routes", routes: ["/", "/dashboard"] }` with `createPreloadedAwsLambdaRequestHandler()` to await selected route closures including render modules during Lambda initialization, or `preload: { mode: "hot-route-requests", routes: ["/", "/login"] }` to warm only middleware plus selected route loader/server-route request modules without evaluating page/layout render modules. For direct handlers that cannot use top-level async initialization, add `wait: "before-render"` to an object preload strategy to let page-rendering invocations wait for the already-started preload after loader redirects have had a chance to return; add `wait: "first-request"` only when the first invocation can pay the full preload cost. Lambda request timing reports `first-request` waits as `preloadWaitMs`, and render timing reports `before-render` waits as `preloadWaitMs`.

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

`renderAppRequest` and the development server enforce the app-router import policy before bundling loaders, middleware, metadata, and server actions. Packages must either be explicitly allowed through `importPolicy.allowedPackages` or, in dev, be declared by the application `package.json`. Allowed server dependencies may use normal Node runtime features, including CommonJS modules that require Node built-ins such as `events`. Tests that call `renderAppRequest` directly can pass `vitePlugins` when loaders, metadata, layouts, or pages import non-JavaScript modules handled by user Vite plugins.

Use relative imports for app-local modules in server-side route code. The production server bundler applies the import policy before Vite-only or tsconfig path alias plugins can rewrite aliases such as `~/*`, so an alias like `~/lib/csrf` is treated as a package import named `"~"`. Prefer `../lib/csrf.js` or another relative specifier in loaders, middleware, route handlers, metadata modules, server actions, and their app-local helper modules.

When `assetBaseUrl` is configured, built client route scripts, HTML modulepreload links, and dynamic import preload helpers use that same client asset base. Without `assetBaseUrl`, built client assets stay under `/_mreact/client/`, including shared chunks loaded after hydration.

Route pages may extract server-only UI into app-local `.tsx` or `.mreact.tsx` components and pass JSX children through them. The router compiles those local server-component dependencies with the same server string or stream target before inserting the page output into layout `<Slot />` positions. Imported interactive app-local components are inferred from supported static render shapes, including direct JSX, JSX member roots, simple aliases, app-local barrel re-exports, and component function calls returned by the route. Route-local helper functions that return JSX are included in the same client route inference even when the helper name is lowercase and called as a normal render helper. JSX-rendered client components become client reference boundaries; direct function-call returns hydrate as the route's client component.

The server target supports JSX spread attributes on HTML and SVG elements. Spread attributes are escaped with the same server rules as normal dynamic attributes, normalize common JSX aliases such as `className`, `htmlFor`, `srcDoc`, `tabIndex`, `defaultValue`, and `defaultChecked`, and drop `key`, `ref`, `children`, event handlers, invalid attribute names, unsafe URL values such as `javascript:`, and raw `srcDoc` strings. Use `{ __html: value }` for `srcDoc` when you intentionally need iframe document HTML. Explicit `dangerouslySetInnerHTML={{ __html: value }}` emits trusted raw element children during server rendering and is available for application-owned inline bootstraps such as root-level scripts.

## Sessions

Application code should import session helpers from `@reckona/mreact-auth`:
`createMemorySessionStore()`, `createSession()`, `getSession()`,
`destroySession()`, and `rotateSession()`. The router still re-exports these
helpers for older code, but those re-exports are deprecated.
