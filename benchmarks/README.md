# benchmarks

This directory contains fair, repeatable benchmark fixtures for mreact and peer frameworks.

## Tracks

- `primitive`: framework primitive comparison without routers. Current adapters: Marko, Vue, Svelte, Angular, Qwik, React, Solid, and mreact.
- `primitive-browser`: real Chromium primitive comparison for mreact and
  mreact react-compat. It mirrors the create/update/select/clear shape used by
  the Node+happy-dom primitive suite so happy-dom-specific rankings can be
  cross-checked against real browser DOM behavior.
- `non-router`: package-level regression microbenchmarks for virtual, forms,
  query, store, auth, and other non-router packages.
- `router`: production router/app framework comparison across Marko Run, Nuxt, SvelteKit, Analog, Qwik City, SolidStart, TanStack Start, Next.js App Router, and mreact app router.
- `lambda-route-latency`: local AWS Lambda adapter route latency reproduction.
  It invokes API Gateway HTTP API v2-style events directly against the mreact
  Lambda handler and records request/render timing phases for cold health
  checks, first redirects, and warm redirects.
- `lambda-generated-handler-latency`: packaged generated AWS Lambda handler import/initialization, first redirect, first rendered route, and warm-hit latency across supported preload policies.
- `scheduler`: React-compatible scheduler queue scaling for ready callbacks, delayed timer promotion, and cancellation-heavy callback bursts.
- `scenarios`: reserved for user-centric scenario reports.

## Fairness Policy

The default router suite excludes the experimental `qwik-router-v2` adapter following an interactive validation timeout in [run 34344383424](https://github.com/t-k/mreact/actions/runs/34344383424). Qwik City remains included. The V2 adapter source is retained for investigation; exclusion is not a fix for its timeout or a performance improvement. Historical results that include V2 have a different adapter set.

The Analog production fixture serializes Vite's client and SSR environment builds while retaining Nitro's `buildApp()` orchestration. Concurrent builds with shared Angular compiler state intermittently produced server components without AOT output and empty SSR documents. This build-time workaround preserves the framework version, production runtime, hydration, navigation, fixture contents, and measurement intervals; it is not a runtime optimization. The opt-in regression command `MREACT_ANALOG_INTEGRATION=1 NODE_ENV=production pnpm exec vitest run benchmarks/router/adapters/analog.integration.test.ts` checks three independent production builds and three post-readiness SSR responses per build. The existing HTTP readiness probe runs first, so this regression check does not guarantee correctness of the server's very first HTTP response. Failed checks retain HTML and process diagnostics.

- Use each framework's recommended production mode.
- Use the same fixture data and DOM shape for comparable rows.
- Validate DOM or HTML output before recording a completed result.
- Record unsupported cases with explicit reasons.
- Keep mreact-specific diagnostics out of cross-framework score tables.
- Use warmup runs before measured runs, and report the median of measured samples as the primary value to reduce sensitivity to transient system load.
- The Nuxt, SvelteKit, and Analog router adapters use generated production app fixtures. Their SSR and client-bundle rows come from each framework's build/start path rather than the shared lightweight proxy fixture.
- Store raw samples, percentile summaries, and markdown reports under `benchmarks/results/<date>/<run>/`, where `<run>` is a same-day sequence such as `001` or `002`.
- The Benchmarks GitHub Actions workflow commits changed result directories back to the selected branch; do not rely on Actions artifacts for long-term access. A single workflow dispatch writes all selected public benchmark reports into the same run directory, so `all` produces `primitive.md`, `primitive-browser.md`, `non-router.md`, and `router.md` side by side. Microbenchmarks such as `html-escape` and `request-fastpaths` are local investigation tools and are not published by the workflow.
- Router `app HTTP v2` cases separate the orchestrator, HTTP load generator and production server into different processes. One trial supplies throughput, p50/p95/p99 and a single server PID's RSS before/after delta. Burst uses 200 requests with at most 100 in flight and a fresh keep-alive pool, repeated in three rotated rounds. Steady load uses a two-second warmup at the configured concurrency and three consecutive five-second windows with the same pool. Requests already in flight drain within the request deadline, and actual elapsed time includes that drain. This is not a cold-server test. JSON `router.http-trials.json` stores each raw trial once; summary-row `httpTrials` entries link to it with `latencySamplesRef` and retain workload configuration, trial/series IDs, execution order, process IDs, warmup measurements, per-window connection-open/reuse counts and explicit worker totals, and RSS snapshots. RSS is neither peak memory nor a process-tree total; negative deltas are retained but excluded from RSS rankings. `samples` carries metric-specific units rather than storing bytes or ops/sec in `samplesMs`. Route/cache semantics remain unchanged and may differ across frameworks: mreact targets `/static-page` with its existing memory route cache; other adapters keep their existing `/` fixtures. Methodology v2 is not directly comparable to the legacy concurrent probes, and topology changes are not runtime speedups.
- The primitive Vue, Svelte, and Angular adapters use framework-runtime fixtures: Vue mounts `createApp` components, Svelte mounts compiler-generated components, and Angular mounts JIT standalone components with signals. Source-primitive rows remain unsupported unless the framework has a directly comparable fine-grained source primitive.
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
pnpm bench:lambda-generated-handler
pnpm bench:scheduler
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

Router runs save measurement rows to `router.summary.json` and `router.md` before teardown. `router.lifecycle.json` records separate `measurementFailures` and `cleanupFailures` counts once cleanup finishes, with an `error` for execution or output failures. `router.process.json` records worker exit and process supervision, including forced termination and remaining tracked groups. A measurement failure produces a nonzero exit even when cleanup and process shutdown succeed. Failed runs retain Actions artifacts.

The markdown reports use the median as the ranking value, while the JSON summary files keep the raw measured samples and percentile summaries (`p75`, `p95`, and `p99` where applicable). Use the raw samples when comparing close results, especially for cases that can flip between adjacent runs such as logging-enabled and non-logging router variants.

For public claims, prefer repeated same-commit runs on the same machine, then cross-check on at least one additional runner or machine. Treat close wins inside the noise band as inconclusive until a commit-to-commit regression chart or confidence interval confirms the direction.
