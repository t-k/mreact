# hacker-news

Read-only Hacker News clone that dogfoods the mreact router with external API SSR, dynamic routes, Tailwind, Playwright E2E coverage, and a generated Cloudflare Workers entrypoint.

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
pnpm exec wrangler dev
pnpm exec wrangler deploy
```

`pnpm worker:check` builds the mreact app, emits `.mreact/cloudflare/worker.mjs`, imports the generated Worker, and smoke-tests `/styles.css`, `/robots.txt`, and the dynamic home page. Wrangler serves static assets from `.mreact/client` through the `ASSETS` binding.

`wrangler dev` and deployed Workers print mreact router request logs through `console.info` / `console.error`.
