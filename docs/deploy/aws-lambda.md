# AWS Lambda Deployment

mreact app-router can run on AWS Lambda through the AWS Lambda adapter:

```ts
import { createAwsLambdaRequestHandler } from "@reckona/mreact-router/adapters/aws-lambda";

export const handler = createAwsLambdaRequestHandler({
  outDir: new URL("../.mreact", import.meta.url).pathname,
});
```

The adapter targets API Gateway HTTP API v2 and Lambda Function URL payload
format 2.0.

## Generated Files

`create-mreact-app --deploy aws-lambda` adds:

- `src/lambda.ts`
- `docs/deploy/aws-lambda.md`
- a `build:lambda` script
- an `esbuild` dev dependency for bundling the Lambda entrypoint

## Build

```bash
pnpm build
pnpm build:lambda
```

`dist/lambda.mjs` exports `handler`. Package that file together with `.mreact`,
`package.json`, and production `node_modules`.

## Runtime Shape

Use one of these AWS front doors:

- API Gateway HTTP API v2
- Lambda Function URL with payload format 2.0

The Lambda runtime must provide Web `Request` and `Response`. Use a current
Node.js Lambda runtime.

The adapter returns the Lambda proxy response shape:

- `cookies`
- `headers`
- `statusCode`
- `body`
- `isBase64Encoded`

Binary responses are base64 encoded automatically.

## Streaming SSR

API Gateway and Lambda Function URL proxy responses are buffered. mreact still
renders through the same server pipeline, but Streaming SSR is materialized into
one Lambda response body.

Use the container deployment path when true response streaming is required.

## Static Assets

Lambda can serve `.mreact/client`, but production deployments should usually
move static assets to S3 + CloudFront or another CDN.

Upload `.mreact/client` to your static origin and configure the router:

```ts
import { defineConfig } from "vite";
import { mreactRouter } from "@reckona/mreact-router/vite";

export default defineConfig({
  plugins: [
    mreactRouter({
      routesDir: "src/app",
      publicDir: "public",
      allowedSourceDirs: ["src"],
      assetBaseUrl: "https://cdn.example.com/_mreact/client/",
      publicAssetBaseUrl: "https://cdn.example.com/",
    }),
  ],
});
```

`assetBaseUrl` is used for route scripts and modulepreload links emitted into
HTML. `publicAssetBaseUrl` is persisted in the server manifest for public asset
helpers and deployment tooling.

Hashed route assets can use a long immutable cache. `manifest.json` and
non-fingerprinted public assets should use a shorter cache or revalidation.

## Deployment Notes

Keep the Lambda bundle focused on the handler and server runtime. The `.mreact`
directory is build output and must be deployed with the handler because it
contains the server manifest, route modules, and client asset manifest.

For larger applications, prefer:

- Lambda for dynamic HTML and route handlers
- S3 + CloudFront for `.mreact/client`
- `assetBaseUrl` / `publicAssetBaseUrl` for generated HTML asset URLs
