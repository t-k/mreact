# Mreact

Mreact is a React-flavored framework inspired by Marko's compiler-first philosophy, with ideas from Solid and Qwik where they fit Mreact's model.

Mreact aims to stay small and fast: small client bundles, low server rendering cost, streaming-friendly HTML, and short deployment startup paths.

Mreact is experimental. APIs may change.

## Documentation

- Documentation site: <https://t-k.github.io/mreact/>
- Getting started: <https://t-k.github.io/mreact/getting-started/>
- Basics: <https://t-k.github.io/mreact/guides/basics/>
- App Router: <https://t-k.github.io/mreact/guides/app-router/>
- Deployments: <https://t-k.github.io/mreact/deployments/static-hosting/>
- Benchmarks: <https://t-k.github.io/mreact/benchmarks/>
- API reference: <https://t-k.github.io/mreact/api/>

## Quick Start

Create a project:

```bash
npx @reckona/create-mreact-app my-app --template basic --src-dir
cd my-app
pnpm install
pnpm dev
```

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

Build and run production output:

```bash
pnpm build
pnpm start
```

## What Mreact Focuses On

- **Fine-grained reactivity** - `cell`, `computed`, and `effect` track dependencies so updates can target the DOM work that changed.
- **Automatic server/client inference** - server-rendered routes stay JavaScript-free when possible, while event handlers, reactive state, browser APIs, and explicit boundaries add the required browser runtime.
- **Streaming SSR** - HTML can flush in chunks instead of buffering the full document.
- **App Router** - file-system routing, layouts, loaders, route handlers, middleware, metadata, server actions, cache helpers, and deployment adapters.
- **React compatibility** - React-like packages and `.compat.tsx` boundaries cover common React ecosystem use cases.

Read the full guides in the documentation site: <https://t-k.github.io/mreact/>

## Examples

The `examples/` directory contains focused applications:

| Example | Purpose |
| --- | --- |
| [examples/app-router](examples/app-router) | Full app-router tour covering routing, layouts, metadata, loaders, actions, middleware, forms, auth, i18n, and deployments |
| [examples/hacker-news](examples/hacker-news) | Hacker News clone using streaming SSR, Tailwind CSS, router navigation, and Cloudflare Workers deployment |
| [examples/docs-site](examples/docs-site) | This documentation site with MDX, static export, Pagefind search, API reference rendering, and benchmark result cards |
| [examples/react-libraries](examples/react-libraries) | React ecosystem libraries running through Mreact compatibility boundaries |
| [examples/reactive-primitives](examples/reactive-primitives) | `cell`, `computed`, `effect`, and DOM updates |
| [examples/store](examples/store) | Shared store, selectors, transactions, and subscriptions |
| [examples/virtual-grid](examples/virtual-grid) | Responsive grid virtualization |

More details: <https://t-k.github.io/mreact/examples/>

## Packages

Core packages:

- `@reckona/mreact`
- `@reckona/mreact-dom`
- `@reckona/mreact-router`
- `@reckona/mreact-reactive-core`
- `@reckona/mreact-reactive-dom`
- `@reckona/mreact-server`
- `@reckona/create-mreact-app`

Companion packages:

- `@reckona/mreact-auth`
- `@reckona/mreact-forms`
- `@reckona/mreact-query`
- `@reckona/mreact-store`
- `@reckona/mreact-virtual`
- `@reckona/mreact-compat`
- `@reckona/mreact-vite`
- `@reckona/mreact-test-utils`

API reference: <https://t-k.github.io/mreact/api/>

## Benchmarks

Mreact tracks primitive reactivity behavior, browser DOM costs, app-router throughput, client bundle size, route artifact shape, and deployment startup paths.

See the benchmark dashboard and interpretation notes: <https://t-k.github.io/mreact/benchmarks/>

Local benchmark commands:

```bash
pnpm bench:primitive
pnpm bench:primitive-browser
pnpm bench:non-router
pnpm bench:router
pnpm bench:lambda-routes
pnpm bench:all
```

## Development

Install dependencies and build packages:

```bash
pnpm install
pnpm build
```

Run tests:

```bash
pnpm test
pnpm test:e2e:smoke
pnpm test:e2e
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

Generated TypeDoc output is committed under [docs/api](docs/api). API Extractor reports live under [etc/api](etc/api).

## License

MIT
