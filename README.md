# Mreact

Mreact is a [React](https://react.dev/)-flavored framework inspired by [Marko](https://markojs.com/)'s compiler-first philosophy, with ideas from [Solid](https://www.solidjs.com/) and [Qwik](https://qwik.dev/).

It focuses on fine-grained reactivity, route-level client runtime inference, chunk-based streaming SSR, and separate server/client compilation so server-only routes do not ship unnecessary browser runtime.

Mreact is experimental. APIs may change.

## Documentation

- Documentation site: <https://t-k.github.io/mreact/>
- Getting started: <https://t-k.github.io/mreact/getting-started/>
- Benchmarks: <https://t-k.github.io/mreact/benchmarks/>
- Full API reference: <https://t-k.github.io/mreact/api/>

## Quick Start

Create an app:

```bash
npx @reckona/create-mreact-app my-app --template basic --src-dir
cd my-app
pnpm install
pnpm dev
```

The basic template starts with a small counter app. Run the generator without flags to choose the package manager, template, `src/app` layout, and deployment target interactively.

Common variants:

```bash
npx @reckona/create-mreact-app my-app --template tailwind --src-dir
npx @reckona/create-mreact-app my-app --template basic --src-dir --deploy cloudflare
npx @reckona/create-mreact-app my-app --template basic --src-dir --deploy container
npx @reckona/create-mreact-app my-app --template basic --src-dir --deploy aws-lambda
npx @reckona/create-mreact-app my-dashboard --template dashboard
```

Upgrade an existing generated app:

```bash
npx @reckona/create-mreact-app upgrade --dry-run
npx @reckona/create-mreact-app upgrade
```

Inside this repository, scaffolding under `examples/<name>` automatically uses the `@reckona/example-<name>` package name and `workspace:*` ranges for local `@reckona/*` packages:

```bash
npx @reckona/create-mreact-app examples/ai-chat --template tailwind --src-dir --pm pnpm
```

Build and run production output:

```bash
pnpm build
pnpm start
```

## Packages

| Package | Purpose |
| --- | --- |
| `@reckona/mreact` | React-like public runtime entry point |
| `@reckona/mreact-dom` | React DOM-compatible client and server entry points |
| `@reckona/mreact-router` | File-system app router, build pipeline, server actions, cache, and deployment adapters |
| `@reckona/mreact-compat` | Compatibility runtime used by the public React-like packages |
| `@reckona/mreact-reactive-core` | `cell`, `computed`, `effect`, `batch`, and dependency tracking |
| `@reckona/mreact-reactive-dom` | DOM bindings for text, lists, events, props, and hydration |
| `@reckona/mreact-server` | SSR string, stream, async boundary, and Flight helpers |
| `@reckona/mreact-query` | Query cache, mutation observer, dehydration, and client hand-off |
| `@reckona/mreact-store` | Global/client state primitives |
| `@reckona/mreact-virtual` | Reactive list and grid virtualization primitives |
| `@reckona/mreact-auth` | Session and authorization helpers |
| `@reckona/mreact-forms` | Form validation and server-action error integration |
| `@reckona/mreact-vite` | Standalone Vite plugin for compatibility-oriented builds |
| `@reckona/create-mreact-app` | Project scaffolder |

## Examples

- [examples/app-router](https://github.com/t-k/mreact/tree/main/examples/app-router): App Router tour covering layouts, metadata, client boundaries, streaming, server actions, cache, route handlers, middleware, auth, query, forms, i18n, and deployment adapters.
- [examples/hacker-news](https://github.com/t-k/mreact/tree/main/examples/hacker-news): Read-only Hacker News clone using App Router streaming, Tailwind CSS, `Link` navigation, and Cloudflare Workers deployment. Live demo: <https://mreact-hacker-news.t-kaniwa-e16.workers.dev>
- [examples/reactive-primitives](https://github.com/t-k/mreact/tree/main/examples/reactive-primitives): `cell`, `computed`, `effect`, and DOM updates.
- [examples/store](https://github.com/t-k/mreact/tree/main/examples/store): Shared store, selectors, transactions, and subscriptions.
- [examples/virtual-grid](https://github.com/t-k/mreact/tree/main/examples/virtual-grid): Responsive grid virtualization with bounded DOM cards, spacer telemetry, and jump controls.
- [examples/react-compat](https://github.com/t-k/mreact/tree/main/examples/react-compat): React-like hooks, Suspense, lazy, and DOM root entry points.
- [examples/react-libraries](https://github.com/t-k/mreact/tree/main/examples/react-libraries): React ecosystem libraries running through `.compat.tsx` boundaries.

## Benchmarks

Benchmark outputs are committed under [benchmarks/results](https://github.com/t-k/mreact/tree/main/benchmarks/results). The [Benchmarks workflow](https://github.com/t-k/mreact/actions/workflows/benchmarks.yml?query=branch%3Amain) can be dispatched manually; when it runs on `main`, it commits a new `benchmarks/results/<date>/<run>/` directory back to `main`.

The docs site build regenerates its benchmark page from the latest complete run containing `primitive.md`, `router.md`, `primitive-browser.md`, and `env.json`. Because the GitHub Pages workflow runs on pushes to `main`, a benchmark workflow commit on `main` causes the published benchmark page to rebuild with the latest complete results.

## Repository Development

Install dependencies and build packages:

```bash
pnpm install
pnpm build
```

Run tests:

```bash
pnpm test
pnpm test:coverage:router
pnpm test:e2e
pnpm test:e2e:smoke
```

Run the app-router example:

```bash
pnpm example:mreact-app-router:dev
```

Build the documentation site locally:

```bash
pnpm --filter @reckona/example-docs-site build
```

Generate and check API documentation:

```bash
pnpm docs:api
pnpm docs:api:check
pnpm api:report
pnpm api:report:check
```

`docs/api` contains generated TypeDoc output, including `docs/api/index.json`, which the documentation site imports to render the integrated API reference. `etc/api` contains API Extractor reports used to review public API signature changes.

## License

MIT
