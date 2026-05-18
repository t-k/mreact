# hacker-news

Read-only Hacker News clone that dogfoods the mreact router with external API SSR, dynamic routes, Tailwind, Playwright E2E coverage, and a Cloudflare Workers entrypoint smoke target.

## Run

```bash
pnpm install
pnpm dev
```

The development server runs at http://localhost:3001.

## Build

```bash
pnpm build
pnpm start
```

## Tests

```bash
pnpm test
pnpm exec playwright test ../e2e/examples.spec.ts --grep "hacker-news example"
```

The E2E flow uses live Hacker News API data, so it asserts page structure and navigation instead of specific story titles.

## Cloudflare Worker

```bash
pnpm worker:check
```

`pnpm worker:check` builds the mreact app, bundles `scripts/cloudflare-worker.ts` to `dist/worker.mjs`, imports the bundled Worker, and smoke-tests `/api/health` plus the generated `/styles.css` asset path. Wrangler serves static assets from `.mreact/client` through the `ASSETS` binding.

Dynamic Hacker News pages currently run through the standard mreact dev and Node built server. A deployable Workers version needs generated Cloudflare route modules for the built App Router manifest before `wrangler deploy` should be used for this example.
