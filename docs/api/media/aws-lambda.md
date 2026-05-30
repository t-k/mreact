# AWS Lambda Deployment

mreact app-router can run on AWS Lambda through the AWS Lambda adapter. `create-mreact-app --deploy aws-lambda` generates `src/lambda.ts` as a custom-handler starting point and this deployment guide. A production `mreact-router build --target=aws-lambda` also writes `.mreact/aws-lambda/mreact-handler.mjs`, which targets API Gateway HTTP API v2 and Lambda Function URL payload format 2.0.

## Handler

Use `createPreloadedAwsLambdaRequestHandler()` in Node 24 ESM Lambda handlers when first-request latency matters. It waits for preload work during Lambda initialization by default, which can increase `Init Duration` but brings the first handler invocation closer to warm steady-state behavior.

```ts
import { createPreloadedAwsLambdaRequestHandler } from "@reckona/mreact-router/adapters/aws-lambda";

export const handler = await createPreloadedAwsLambdaRequestHandler({
  outDir: new URL("../.mreact", import.meta.url).pathname,
  importPolicy: "generated",
});
```

Use `onResponse` to add cross-cutting response headers to the final response:

```ts
import { createPreloadedAwsLambdaRequestHandler } from "@reckona/mreact-router/adapters/aws-lambda";

export const handler = await createPreloadedAwsLambdaRequestHandler({
  onResponse(response) {
    response.headers.set("x-frame-options", "DENY");
    response.headers.set("permissions-policy", "camera=(), microphone=(), geolocation=()");
  },
  outDir: new URL("../.mreact", import.meta.url).pathname,
  importPolicy: "generated",
});
```

## Build and Package

Build Lambda artifacts with the AWS Lambda target:

```bash
mreact-router build --target=aws-lambda
```

The build writes Node-compatible server/client output, `.mreact/server/import-policy.json`, and `.mreact/aws-lambda/mreact-handler.mjs` without bundling Cloudflare Workers route modules for loaders that import Node-only dependencies such as database drivers.

Package a minimal Lambda asset directory instead of deploying the project root:

```bash
mreact-router package aws-lambda --from .mreact --out .lambda
```

The package command creates `.lambda/.mreact`, `.lambda/mreact-handler.mjs`, and `mreact-lambda-artifact.json`. The runtime needs `.mreact/`, `mreact-handler.mjs`, `package.json` or lockfiles, and production `node_modules`; it does not need `src/`, tests, development dependencies, build caches, or Vite/Vitest/Playwright tooling.

For pnpm deployments, install production dependencies into the package directory with a hoisted linker before CDK, SAM, Serverless Framework, or similar tooling packages it:

```bash
pnpm --dir .lambda install --prod --frozen-lockfile --ignore-scripts --config.node-linker=hoisted
```

pnpm's default isolated linker creates many symlinks. Verify symlink counts and actual file bytes in addition to directory size:

```bash
find .lambda -type l | wc -l
du -sh .lambda
```

Keep the unzipped artifact below AWS's 250 MB deployment package limit.

## Import Policy

Production adapters enforce the app-router import policy when bundling loaders, middleware, route handlers, metadata, and server actions. `mreact-router build` writes `.mreact/server/import-policy.json` from server-side static imports and the optional runtime packages declared by their transitive dependencies. Lambda handlers can use `importPolicy: "generated"`.

The build-generated import policy records packages imported by loaders, middleware, route handlers, metadata, server actions, and app-local helper modules. Common examples include validation, cookie, database, auth, and AWS SDK packages. Packages listed in the generated import policy must exist in the production dependency set deployed with the Lambda artifact.

Use relative imports for app-local server modules in Lambda builds. TypeScript or Vite path aliases such as `~/*` are not resolved before the production import policy checks package imports.

You can still pass an explicit `importPolicy.allowedPackages` list when a deployment needs a hand-audited policy.

## Runtime Layout

`mreact-router build --target=aws-lambda` stores compiled server route artifacts in `.mreact/server/server-modules/*.json` instead of embedding them in one large server manifest. It writes compiled module bodies as hashed `.mjs` files and keeps request/control artifacts separate from render artifacts so loader redirects do not read page render bundles.

The Lambda adapter treats `outDir` as read-only and materializes generated runtime files under `/tmp/mreact-router/<hash>/runtime` by default, with a `node_modules` symlink back to the deployed package root. Set `runtimeDir` only when you need a custom writable cache directory.

Direct `createAwsLambdaRequestHandler()` and `createAwsLambdaStreamingRequestHandler()` handlers start only middleware and shared runtime preload in the background by default, so all-route preload work does not compete with the first user request. If a request arrives before preload finishes, middleware is resolved first, middleware responses or redirects return without loading the matched page artifact, and continuing requests load only the matched route's artifact closure.

Static middleware `config.matcher` and `config.id` values are checked before importing the middleware module, so unmatched health checks and route-local middleware skips avoid evaluating heavyweight middleware dependencies. Route request artifacts omit page render exports, and built loader and route metadata artifacts are split, so loader redirects do not evaluate page-only or metadata-only dependencies before render or metadata is needed. Loader redirects also settle before page component server transforms and render imports for non-stream routes and stream routes without a loading boundary.

## Host and Proxy Policy

Set `allowedHosts` on production Lambda handlers. The adapter no longer treats `x-forwarded-host` or `x-forwarded-proto` as trusted client input by default. Use `hostPolicy: "trusted-proxy"` only behind a trusted proxy that normalizes forwarded host values, and set `trustForwardedProto: true` only when that proxy also normalizes forwarded proto values.

```ts
export const handler = await createPreloadedAwsLambdaRequestHandler({
  outDir: new URL("../.mreact", import.meta.url).pathname,
  importPolicy: "generated",
  allowedHosts: ["example.com"],
  hostPolicy: "strict",
});
```

## Preload Tuning

Lambda handlers accept a `preload` option when runtime warmup needs tuning.

- Direct handlers default to `"middleware"` so cold starts do not kick off all route module imports in parallel with the first request.
- `createPreloadedAwsLambdaRequestHandler()` and `createPreloadedAwsLambdaStreamingRequestHandler()` default to `"all"` because the work is awaited during Lambda initialization instead of racing user traffic.
- Use `preload: "none"` to disable background work.
- Use `preload: "all"` only when measurement shows that all-route background preload helps the deployed function.
- Use `preload: { mode: "hot-routes", routes: ["/", "/dashboard"] }` to preload selected route closures including render modules during async handler initialization.
- Use `preload: { mode: "hot-route-requests", routes: ["/", "/login"] }` to warm only middleware plus selected route loader/server-route request modules without evaluating page/layout render modules.

For direct handlers that cannot use top-level async initialization, add `wait: "before-render"` to an object preload strategy to let page-rendering invocations wait for the already-started preload after loader redirects have had a chance to return. Add `wait: "first-request"` only when the first invocation can pay the full preload cost. Lambda request timing reports `first-request` waits as `preloadWaitMs`, and render timing reports `before-render` waits as `preloadWaitMs`.

## Timing Diagnostics

Set `timings: true` on the Lambda handler while diagnosing production latency. The adapter emits a `router:request:timing` debug log event with event normalization, runtime directory, render, and response conversion phase durations. It also forwards `router:render:timing` debug events for route-level phases such as route matching, middleware, loader start/wait, source analysis, page module load, page component render, route slot render, layout module load, layout component render, metadata, and response construction.

Loader timings split module load/evaluation (`loaderModuleLoadMs`) from user loader execution (`loaderExecutionMs`) inside the existing `loaderWaitMs` envelope. Source analysis reports `sourceAnalysisArtifactMs` when a built analysis summary is reused, and middleware timings similarly split `middlewareModuleLoadMs` from `middlewareExecutionMs` inside `middlewareMs`.

Buffered handlers report `responseSerializationMs` as the total response conversion time and split it into `streamDrainMs`, `streamReadMs`, `streamConcatMs`, and `bodyEncodeMs` so streamed `<Await>` work and body materialization are not hidden behind serialization. Streaming handlers report `responseStreamingMs` as the total streaming phase and split it into `streamWaitMs` and `streamWriteMs` to separate waiting for chunks from writing them to the Lambda response stream.

## Streaming

API Gateway and Lambda Function URL proxy responses are buffered by default. In that mode, mreact still renders through the same server pipeline, but Streaming SSR is materialized into one Lambda response body.

Use `createAwsLambdaStreamingRequestHandler()` only with a Lambda Function URL or API Gateway integration configured for payload response streaming:

```ts
import { createAwsLambdaStreamingRequestHandler } from "@reckona/mreact-router/adapters/aws-lambda";

export const handler = createAwsLambdaStreamingRequestHandler({
  outDir: new URL("../.mreact", import.meta.url).pathname,
});
```

The streaming handler uses the Node.js Lambda runtime `awslambda.streamifyResponse()` and `awslambda.HttpResponseStream.from()` APIs, and streams response bytes without base64 buffering.

## Static Assets

Lambda can serve `.mreact/client`, but production deployments should usually move static assets to S3 + CloudFront or another CDN. See [CDN Assets](assets.md) for `assetBaseUrl`, `publicAssetBaseUrl`, and cache-control guidance.
