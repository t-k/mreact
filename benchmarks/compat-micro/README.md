# compat-micro

Fast local micro-benchmark comparing `@reckona/mreact-compat` against React 19
on the js-framework-benchmark keyed operations, for tight perf iteration
(~1-2s per run) versus minutes for the official Playwright harness.

It esbuild-bundles react-compat **from `src`** (production-minified,
`NODE_ENV=production`) and measures the synchronous `flushSync` time per
operation in headless Chromium — the same "script" cost the official benchmark
reports. React is loaded from esm.sh in the same page, so the mreact/React ratio
is measured under identical conditions. The ratios track the official "script"
ratios, so this is a trustworthy proxy.

## Usage

```sh
export PLAYWRIGHT_BROWSERS_PATH="$HOME/Library/Caches/ms-playwright"  # macOS

# Compare both frameworks (median of N fresh-page trials):
node measure.mjs both --trials 3

# Iterate on react-compat: measure mreact vs a saved baseline:
node measure.mjs mreact --json baseline.json            # save a baseline
# ...edit packages/react-compat/src...
node measure.mjs mreact --vs baseline.json              # show deltas

# CPU-profile one op on the prod build (sourcemap-resolved names):
node profile.mjs partialUpdate
node profile.mjs create mreact --count 300 --top 25
```

Requires the worktree deps installed (`pnpm install`) and the matching
Playwright Chromium (`node_modules/.bin/playwright install chromium chromium-headless-shell`).

`dist/` and `*.json` are generated and git-ignored.
