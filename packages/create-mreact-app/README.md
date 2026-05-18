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
