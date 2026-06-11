# benchmarks

This directory contains fair, repeatable benchmark fixtures for mreact and peer frameworks.

## Tracks

- `primitive`: framework primitive comparison without routers. Current adapters:
  Marko, Qwik, React, Solid, and mreact.
- `primitive-browser`: real Chromium primitive comparison for mreact and
  mreact react-compat. It mirrors the create/update/select/clear shape used by
  the Node+happy-dom primitive suite so happy-dom-specific rankings can be
  cross-checked against real browser DOM behavior.
- `non-router`: package-level regression microbenchmarks for virtual, forms,
  query, store, auth, and other non-router packages.
- `router`: production router/app framework comparison across Marko Run, Vue, Nuxt, Svelte, SvelteKit, Angular, Analog, Qwik City, SolidStart, TanStack Start, Next.js App Router, and mreact app router.
- `lambda-route-latency`: local AWS Lambda adapter route latency reproduction.
  It invokes API Gateway HTTP API v2-style events directly against the mreact
  Lambda handler and records request/render timing phases for cold health
  checks, first redirects, and warm redirects.
- `scenarios`: reserved for user-centric scenario reports.

## Fairness Policy

- Use each framework's recommended production mode.
- Use the same fixture data and DOM shape for comparable rows.
- Validate DOM or HTML output before recording a completed result.
- Record unsupported cases with explicit reasons.
- Keep mreact-specific diagnostics out of cross-framework score tables.
- Use warmup runs before measured runs, and report the median of measured samples
  as the primary value to reduce sensitivity to transient system load.
- Store raw samples, percentile summaries, and markdown reports under `benchmarks/results/<date>/<run>/`, where `<run>` is a same-day sequence such as `001` or `002`.
- The Benchmarks GitHub Actions workflow commits changed result directories back to the selected branch; do not rely on Actions artifacts for long-term access. A single workflow dispatch writes all selected public benchmark reports into the same run directory, so `all` produces `primitive.md`, `primitive-browser.md`, `non-router.md`, and `router.md` side by side. Microbenchmarks such as `html-escape` and `request-fastpaths` are local investigation tools and are not published by the workflow.
- The router `app concurrent RSS delta` case measures the benchmark runner process. The mreact fixtures serve in-process, so their delta includes server-side allocation, while adapters that spawn child-process servers only expose the HTTP client side; treat the mreact number as an upper bound rather than a same-kind comparison.
- Treat benchmark numbers as same-machine comparisons, not absolute truth.

## Commands

```bash
pnpm bench:primitive
pnpm bench:primitive-browser
pnpm bench:html-escape
pnpm bench:request-fastpaths
pnpm bench:non-router
pnpm bench:router
pnpm bench:lambda-routes
pnpm bench:all
```

The Phase 1 primitive runner sets `NODE_ENV=production` for both the build and benchmark process.
Each primitive case uses 5 warmup runs and 25 measured runs by default.
Primitive memory cases run in workers started with `--expose-gc` and record `heapUsed` growth after explicit garbage collection before and after the measured create/update/clear loop.
The HTML escape microbenchmark compares the current `.replaceAll` chain with candidate single-pass regex, char-code loop, and hybrid strategies across short clean strings, short escaped strings, long clean strings, and long escape-heavy strings.
The request fast-path microbenchmark compares baseline and optimized cookie parsing paths that are too small to read from end-to-end router throughput.
The router runner builds production fixture apps where needed, serves them over loopback HTTP, and records both server-render throughput and client bundle gzip sizes.
The Cloudflare router latency case currently measures the bundled Pages worker module's exported `fetch` handler. It is intentionally listed separately from the Lambda suite; replacing it with a strict workerd/Miniflare harness remains the next step because Miniflare 4 can fail to start workerd with a local path-resolution error in this repository layout.
Throughput cases use Tinybench with a 250 ms warmup window and a 1,500 ms measurement window per case.
The Lambda route latency runner is not a full AWS runtime emulator: it skips AWS zip extraction, runtime init scheduling, API Gateway infrastructure, and networked AWS service latency. It is intended for fast iteration on mreact's handler, route matching, middleware, loader, render, and response conversion phases. Use `MREACT_LAMBDA_BENCH_LOADER_MS`, `MREACT_LAMBDA_BENCH_MIDDLEWARE_MS`, and `MREACT_LAMBDA_BENCH_REPEATS` to tune the synthetic fixture.

## Reading Results

The markdown reports use the median as the ranking value, while the JSON summary files keep the raw measured samples and percentile summaries (`p75`, `p95`, and `p99` where applicable). Use the raw samples when comparing close results, especially for cases that can flip between adjacent runs such as logging-enabled and non-logging router variants.

For public claims, prefer repeated same-commit runs on the same machine, then cross-check on at least one additional runner or machine. Treat close wins inside the noise band as inconclusive until a commit-to-commit regression chart or confidence interval confirms the direction.
