# docs-site example

This example builds the public Mreact documentation site at <https://t-k.github.io/mreact/>. It demonstrates MDX content, static export, Pagefind search, generated API reference pages, benchmark result cards, Tailwind CSS, and the app router's prerendered output.

## Prerequisites

Build the workspace packages once from the repository root:

```bash
pnpm install
pnpm -r --filter "./packages/*" build
```

## Run

```bash
cd examples/docs-site
pnpm install
pnpm dev
```

Open the local URL printed by the dev server. The router reads `vite.config.ts`, serves the `src/app` routes, and renders MDX pages from `src/content`.

## Build Static Output

```bash
pnpm build
```

The build synchronizes the generated API reference and benchmark data, writes `.mreact` router artifacts, exports static HTML to `dist`, and indexes the site with Pagefind.

## What To Inspect

- `src/content/` contains the MDX guide, deployment, utility, and reference pages.
- `src/nav.config.ts` defines the sidebar and previous/next reading order.
- `src/app/$...slug/page.tsx` renders MDX content through the app router.
- `src/app/api/$...apiPath/page.tsx` serves generated TypeDoc reference pages.
- `scripts/sync-api-reference.ts` and `scripts/sync-benchmark-results.ts` copy generated data into the docs build.
