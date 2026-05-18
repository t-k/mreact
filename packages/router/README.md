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
import { Link } from "@reckona/mreact-router";

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

## Route Module Exports

- `loader(context)` returns data passed to the page component, or may return or throw a `Response` for redirects and custom responses.
- `metadata` injects title, OpenGraph, viewport, and related head tags.
- `generateStaticParams()` returns dynamic route params to prerender.
- `prerender = true` emits HTML at build time.
- `"use server"` modules and `<form action={...}>` provide server actions.
- Server actions reject `Content-Length` values over `10 MiB` by default. Pass `serverActions: { maxBodyBytes }` to configure the limit.
- Route handlers may return or throw standard `Response` objects from method exports such as `GET`, `POST`, or `ALL`.

## Deployment Adapters

- `@reckona/mreact-router/adapters/node`: Node `http` server adapter.
- `@reckona/mreact-router/adapters/static`: static export adapter for prerendered routes.
- `@reckona/mreact-router/adapters/edge`: generic `Request` / `Response` runtime adapter.
- `@reckona/mreact-router/adapters/cloudflare`: Cloudflare Workers adapter.
- `@reckona/mreact-router/adapters/aws-lambda`: AWS Lambda HTTP API v2 adapter.

For Cloudflare Workers, combine `createCloudflareBuiltRequestHandler`,
`createCloudflareStaticAssetLoader`, `createCloudflarePrerenderStore`, and
`createCloudflareRouteModuleRenderer`. Use `collectCloudflareRouteModules()` with
`import.meta.glob()` to build the dynamic route registry from the server
manifest. Client assets are served only when they appear in the generated
manifest allow-list. Dynamic routes should resolve modules through a build-time
registry keyed by `route.file`, not by constructing module ids from request
input.

For AWS Lambda, use `createAwsLambdaRequestHandler()` with API Gateway HTTP API
v2 or Lambda Function URL payload format 2.0:

```ts
import { createAwsLambdaRequestHandler } from "@reckona/mreact-router/adapters/aws-lambda";

export const handler = createAwsLambdaRequestHandler({
  outDir: ".mreact",
  onResponse(response) {
    response.headers.set("x-content-type-options", "nosniff");
  },
});
```

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

## Sessions

Application code should import session helpers from `@reckona/mreact-auth`:
`createMemorySessionStore()`, `createSession()`, `getSession()`,
`destroySession()`, and `rotateSession()`. The router still re-exports these
helpers for older code, but those re-exports are deprecated.
