# @reckona/create-mreact-app

Project scaffolder for mreact app-router applications.

```bash
npx @reckona/create-mreact-app my-app --template app-router
```

Generated apps include an explicit `vite.config.ts` with the mreact router
plugin and a `tsconfig.json` that enables the app-router global types for route
files. The default route directory is `app`.

## Templates

- `basic`
- `app-router`
- `app-router-tailwind`
- `cloudflare`

The `cloudflare` template generates a Workers entrypoint that imports the route registry emitted by `mreact-router build` at `.mreact/cloudflare/route-modules.mjs`, so dynamic and non-prerendered pages do not need a bundler-specific `import.meta.glob` transform.

## Options

```bash
npx @reckona/create-mreact-app my-app --template app-router-tailwind --pm pnpm
```

Supported package managers are `pnpm`, `npm`, and `bun`.

Deployment scaffolds:

```bash
npx @reckona/create-mreact-app my-app --deploy container
npx @reckona/create-mreact-app my-app --deploy aws-lambda
```

`--deploy container` adds a generic Node 24 container image for Cloud Run, AWS
App Runner, and similar platforms. `--deploy aws-lambda` adds a Lambda handler
for API Gateway HTTP API v2 and Lambda Function URL payload format 2.0.

For AWS Lambda production apps, add packages imported by loaders, middleware, route handlers, metadata, server actions, or their app-local helper modules to `importPolicy.allowedPackages` in the generated `src/lambda.ts`.

Package Lambda deployments from a minimal asset directory, not the full project root. The generated `docs/deploy/aws-lambda.md` shows a `prepare-lambda-asset.sh` example that copies `.mreact/`, the bundled handler, manifests, lockfiles, and production `node_modules` into `.lambda/` so CDK/SAM/serverless assets stay below AWS's 250 MB unzipped deployment package limit. The Lambda adapter treats `outDir` as read-only and materializes runtime files under `/tmp` by default, so `.mreact/` can stay inside the deployed package. For pnpm projects, the generated script uses `--config.node-linker=hoisted` and includes symlink and actual-file-byte checks because pnpm's default isolated linker can create Lambda artifacts that package larger than `du` suggests.

Use `--src-dir` to generate a larger-app layout:

```bash
npx @reckona/create-mreact-app my-app --template app-router --src-dir
```

That creates `src/app` for routes, `src/lib` for shared application code, and
root-level `public` for static assets.

## TypeScript route globals

App-router templates include `@reckona/mreact-router/app-router-globals` in
`compilerOptions.types`, so layouts can use `<Slot />` without a local import.
Keep that entry if you replace the generated `tsconfig.json`.
