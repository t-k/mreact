# @reckona/create-mreact-app

Project scaffolder for mreact app-router applications.

```bash
npx @reckona/create-mreact-app my-app --template app-router
```

Upgrade an existing project in place:

```bash
npx @reckona/create-mreact-app upgrade --dry-run
npx @reckona/create-mreact-app upgrade
```

Generated apps include an explicit `vite.config.ts` with the mreact router
plugin and a `tsconfig.json` that enables the app-router global types for route
files. The default route directory is `app`.

## Templates

- `basic`
- `app-router`
- `app-router-tailwind`
- `cloudflare`
- `dashboard`

The `cloudflare` template uses the deployable Worker emitted by `mreact-router build --target=cloudflare` at `.mreact/cloudflare/worker.mjs`, so dynamic and non-prerendered pages do not need a hand-written Worker entrypoint or a bundler-specific `import.meta.glob` transform.

The `dashboard` template adds Tailwind CSS, auth guards, a reactive login form, query cache hydration, and an opt-in devtools overlay helper.

## Options

```bash
npx @reckona/create-mreact-app my-app --template app-router-tailwind --pm pnpm
```

Supported package managers are `pnpm`, `npm`, and `bun`.

## Upgrade

`create-mreact-app upgrade` reads `package.json`, updates `@reckona/mreact*` dependency ranges to the current package version, and reports registered codemods for the version range being crossed. Use `--dry-run` to inspect changes without writing `package.json`, `--from <version>` when the source version is known, and `--to <version>` to target a specific release.

Deployment scaffolds:

```bash
npx @reckona/create-mreact-app my-app --deploy container
npx @reckona/create-mreact-app my-app --deploy aws-lambda
```

`--deploy container` adds a generic Node 24 container image for Cloud Run, AWS
App Runner, and similar platforms, with production builds pinned to `mreact-router build --target=node`. `--deploy aws-lambda` adds a Lambda handler starting point and defaults production builds to `mreact-router build --target=aws-lambda` plus `mreact-router package aws-lambda --from .mreact --out .lambda` for API Gateway HTTP API v2 and Lambda Function URL payload format 2.0.

For AWS Lambda production apps, the build writes `.mreact/server/import-policy.json` from server-side static imports and generated handlers use `importPolicy: "generated"` by default.

Package Lambda deployments from a minimal asset directory, not the full project root. The generated `docs/deploy/aws-lambda.md` shows a `prepare-lambda-asset.sh` example built around `mreact-router package aws-lambda`, then copies lockfiles and installs production `node_modules` into `.lambda/` so CDK/SAM/serverless assets stay below AWS's 250 MB unzipped deployment package limit. The Lambda adapter treats `outDir` as read-only and materializes runtime files under `/tmp` by default, so `.mreact/` can stay inside the deployed package; generated Lambda handlers use top-level `await createPreloadedAwsLambdaRequestHandler()` so built runtime modules, middleware, route modules, layouts, and route metadata are imported during Lambda initialization rather than on the first request. Static middleware matchers, loader redirects, request/control artifacts split from render artifacts, compiled module files, and optional `hot-route-requests` preload avoid unnecessary dependency evaluation on unmatched health checks and simple redirects. For pnpm projects, the generated script uses `--config.node-linker=hoisted` and includes symlink and actual-file-byte checks because pnpm's default isolated linker can create Lambda artifacts that package larger than `du` suggests.

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
