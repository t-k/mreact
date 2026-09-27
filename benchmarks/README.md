# benchmarks

This directory contains fair, repeatable benchmark fixtures for mreact and peer frameworks.

## Tracks

- `primitive`: framework primitive comparison without routers. Current adapters: Marko, Vue, Svelte, Angular, Qwik, React, Solid, and mreact.
- `primitive-browser`: real Chromium comparison of hand-written primitive APIs and framework adapters. It mirrors the create/update/select/clear shape used by the Node+happy-dom suite; its mreact rows do not measure generated JSX.
- `primitive-browser-list-rotation`: a targeted browser check of the compiler-keyed list runtime with 10,000 rows. It reports last-row-to-front DOM moves, key evaluations, row creations, operation times, and total generated JavaScript gzip size; it is a runtime microbenchmark, separate from the canonical JSX score.
- `primitive-browser-event-lifecycle`: a targeted browser check of connected registration, detached fallback, promotion after insertion, and individual disposal through the public event API. Listener counts are gathered in separate instrumented trials.
- `js-framework-benchmark`: the canonical compiled JSX comparison for mreact, its React compatibility variants, and peer frameworks. The keyed/mreact fixture uses ordinary cell-backed JSX through the public compiler path. Keep its results separate from primitive-browser rows.
- `compiled-jsx-endurance`: a natural-GC repeated-operation track using the production build of the canonical keyed/mreact fixture in one persistent Chromium page. It records DOM verification time and heap/node trends without treating either as paint, INP, or retained allocation.
- `compiler-specializations`: an opt-in emitter report for the canonical JSX fixture, recording applied helpers, fallback reasons, source locations, and module-level runtime imports. It does not measure runtime subscriptions or effects.
- `compiler-specialization-ablation`: one ordinary JSX fixture that exercises the four existing compiler flags. It compares each flag on/off with fresh Chromium trials and records verified DOM times, emitted helper decisions, runtime imports, and generated/bundled bytes; it is a diagnostic fixture, separate from the canonical keyed score.
- `non-router`: package-level regression microbenchmarks for virtual, forms,
  query, store, auth, and other non-router packages.
- `router`: production router/app framework comparison across Marko Run, Nuxt, SvelteKit, Qwik City, SolidStart, TanStack Start, Next.js App Router, and mreact app router.
- `lambda-route-latency`: local AWS Lambda adapter route latency reproduction.
  It invokes API Gateway HTTP API v2-style events directly against the mreact
  Lambda handler and records request/render timing phases for cold health
  checks, first redirects, and warm redirects.
- `lambda-generated-handler-latency`: packaged generated AWS Lambda handler import/initialization, first redirect, first rendered route, and warm-hit latency across supported preload policies.
- `router-build`: repeated app builds in one Node process after deleting generated output. The report keeps signed RSS deltas and raw samples; it is not a cold-process build.
- `router-build:fresh`: a new Node process for each app build, with generated output deleted but OS caches retained. It records wall time including process startup, child module import and build time, child CPU time, and peak child RSS.
- `router-build:incremental`: a same-process build after an unmeasured initial build, changing one rendered leaf page or the shared layout for every measured trial while retaining the output directory. The changed build fingerprint is checked; this track measures rebuild cost without assuming partial recompilation.
- `scheduler`: React-compatible scheduler queue scaling for ready callbacks, delayed timer promotion, and cancellation-heavy callback bursts.
- `scenarios`: reserved for user-centric scenario reports.

## Fairness Policy

The default router suite excludes the experimental `qwik-router-v2` adapter following an interactive validation timeout in [run 34344383424](https://github.com/t-k/mreact/actions/runs/34344383424). Qwik City remains included. The V2 adapter source is retained for investigation; exclusion is not a fix for its timeout or a performance improvement. Historical results that include V2 have a different adapter set.

The default router suite also excludes Analog following an owned-process cleanup failure in [run 34369458539](https://github.com/t-k/mreact/actions/runs/34369458539). Its adapter and opt-in production regression test remain available for investigation, but the standard benchmark workflow no longer runs that preflight. The saved SSR responses contained all 1,000 rows; exclusion does not resolve the cleanup failure and is not a performance improvement. Historical results that include Analog have a different adapter set.

The Analog production fixture serializes Vite's client and SSR environment builds while retaining Nitro's `buildApp()` orchestration. Concurrent builds with shared Angular compiler state intermittently produced server components without AOT output and empty SSR documents. This build-time workaround preserves the framework version, production runtime, hydration, navigation, fixture contents, and measurement intervals; it is not a runtime optimization. The opt-in regression command `MREACT_ANALOG_INTEGRATION=1 NODE_ENV=production pnpm exec vitest run benchmarks/router/adapters/analog.integration.test.ts` checks three independent production builds and three post-readiness SSR responses per build. The existing HTTP readiness probe runs first, so this regression check does not guarantee correctness of the server's very first HTTP response. Failed checks retain HTML and process diagnostics.

- Use each framework's recommended production mode.
- Use the same fixture data and DOM shape for comparable rows.
- Validate DOM or HTML output before recording a completed result.
- Record unsupported cases with explicit reasons.
- Keep mreact-specific diagnostics out of cross-framework score tables.
- Use warmup runs before measured runs, and report the median of measured samples as the primary value to reduce sensitivity to transient system load.
- The Nuxt, SvelteKit, and Analog router adapters use generated production app fixtures. Their SSR and client-bundle rows come from each framework's build/start path rather than the shared lightweight proxy fixture.
- Store raw samples, percentile summaries, and markdown reports under `benchmarks/results/<date>/<run>/`, where `<run>` is a same-day sequence such as `001` or `002`.
- Primitive-browser methodology v2 builds one entry per supported framework, starts a fresh Chromium process for every scored trial, and rotates framework order by round. Each browser performs its configured warmups, then one measured operation with explicit GC before and after; `primitive-browser.trials.json` records the round, position, browser version, and outcome. This is an isolated primitive track, not a natural-GC endurance test. Its numbers cannot be compared directly with mixed-entry methodology v1 or the official compiled JSX harness.
- The list-rotation probe builds the same runtime-only source against the current workspace and, when `MREACT_ROTATION_BASELINE_WORKSPACE` names another built checkout, alternates baseline/candidate/candidate/baseline fresh Chromium trials. Each trial warms five rotations and records 20 rotations without forced GC. Use its move count as a direct check; the short operation times are browser-specific, and its gzip comparison includes every difference between the two workspaces.
- `bench:js-framework:allocations` rebuilds the canonical compiled keyed JSX fixture and runs its operation sequence with Chromium's sampling heap profiler in a separate browser/process from scored endurance. The profile includes objects collected by minor and major GC when supported by that Chromium version, records an estimated sampled byte count and top allocation sites, and retains the full CDP profile. Sampling changes execution cost, so its operation times are for verification only. The ordinary endurance track does not enable profiling.
- The Benchmarks GitHub Actions workflow commits changed result directories back to the selected branch; do not rely on Actions artifacts for long-term access. A single workflow dispatch writes all selected public benchmark reports into the same run directory, so `all` produces `primitive.md`, `primitive-browser.md`, `non-router.md`, and `router.md` side by side. Microbenchmarks such as `html-escape` and `request-fastpaths` are local investigation tools and are not published by the workflow.
- The Performance Diagnostics workflow runs the compiled JSX endurance and separate allocation profile, compiler flag ablations, event lifecycle, list rotation, router build modes including leaf/layout changes, scheduler, generated Lambda handler, lifecycle, and client delivery size tracks weekly or by manual dispatch. Its per-track raw artifacts expire after 90 days; results from shared GitHub runners are diagnostics, not fixed-machine regression gates. Keep commit-to-commit performance claims on one controlled machine.
- Router `app HTTP v2` cases separate the orchestrator, HTTP load generator and production server into different processes. One trial supplies throughput, p50/p95/p99 and a single server PID's RSS before/after delta. Burst uses 200 requests with at most 100 in flight and a fresh keep-alive pool, repeated in three rotated rounds. Steady load uses a two-second warmup at the configured concurrency and three consecutive five-second windows with the same pool. Requests already in flight drain within the request deadline, and actual elapsed time includes that drain. This is not a cold-server test. JSON `router.http-trials.json` stores each raw trial once; summary-row `httpTrials` entries link to it with `latencySamplesRef` and retain workload configuration, trial/series IDs, execution order, process IDs, warmup measurements, per-window connection-open/reuse counts and explicit worker totals, and RSS snapshots. RSS is neither peak memory nor a process-tree total; negative deltas are retained but excluded from RSS rankings. `samples` carries metric-specific units rather than storing bytes or ops/sec in `samplesMs`. Route/cache semantics remain unchanged and may differ across frameworks: mreact targets `/static-page` with its existing memory route cache; other adapters keep their existing `/` fixtures. Methodology v2 is not directly comparable to the legacy concurrent probes, and topology changes are not runtime speedups.
- The primitive Vue, Svelte, and Angular adapters use framework-runtime fixtures: Vue mounts `createApp` components, Svelte mounts compiler-generated components, and Angular mounts JIT standalone components with signals. Source-primitive rows remain unsupported unless the framework has a directly comparable fine-grained source primitive.
- Treat benchmark numbers as same-machine comparisons, not absolute truth.

## Commands

```bash
pnpm bench:primitive
pnpm bench:primitive-browser
pnpm bench:primitive-browser:list-rotation
pnpm bench:primitive-browser:event-lifecycle
pnpm bench:js-framework
pnpm bench:js-framework:endurance
pnpm bench:js-framework:allocations
pnpm report:compiler-specializations
pnpm bench:compiler-specializations
pnpm bench:html-escape
pnpm bench:request-fastpaths
pnpm bench:non-router
pnpm bench:router
pnpm bench:lambda-routes
pnpm bench:lambda-generated-handler
pnpm bench:router-build
pnpm bench:router-build:fresh
pnpm bench:router-build:incremental
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

Router `app browser v2` cases use five rotated rounds per adapter and profile, with a fresh browser for each trial. The `domcontentloaded` profile observes initial content and then verifies two counter interactions; the `networkidle` profile explicitly waits for network quiet before the same interactions and fails if that wait times out. A separate JavaScript-disabled context verifies SSR content before either profile. There is no hidden interaction warmup. Summary `browserTrials` entries retain shared trial IDs, round/order, browser version, navigation-relative timestamps, partial observations and failure stages. Related rows are derived from the same trial, not separate repeated operations; a failed trial fails all related ranking rows while preserving raw observations.

Initial content observation is not proof of hydration or exact readiness. Navigation-to-first-verified-update ends when the expected first counter update is observed. Click E2E includes Playwright actionability waits and automation overhead; event-to-DOM measures trusted capture-phase event receipt through MutationObserver delivery of the expected update on the counter or its newly created replacement. It does not measure paint, INP or the event handler alone. These new cases replace the legacy scalar initial-load and interaction cases and are not directly comparable to their results. Client JavaScript byte collection and navigation probes retain their existing boundaries.

The `app 100 islands verified interaction E2E` case includes navigation and all sequential Playwright clicks. Every island must update independently, and all island states are checked after each click. This is a functional E2E duration, not hydration time. Reported mreact variant spread includes implementation/configuration differences and must not be interpreted as statistical noise or a significance threshold.

Router runs save measurement rows to `router.summary.json` and `router.md` before teardown. `router.lifecycle.json` records separate `measurementFailures` and `cleanupFailures` counts once cleanup finishes, with an `error` for execution or output failures. `router.process.json` records worker exit and process supervision, including forced termination and remaining tracked groups. A measurement failure produces a nonzero exit even when cleanup and process shutdown succeed. Failed runs retain Actions artifacts.

The markdown reports use the median as the ranking value, while the JSON summary files keep the raw measured samples and percentile summaries (`p75`, `p95`, and `p99` where applicable). Use the raw samples when comparing close results, especially for cases that can flip between adjacent runs such as logging-enabled and non-logging router variants.

For public claims, prefer repeated same-commit runs on the same machine, then cross-check on at least one additional runner or machine. Treat close wins inside the noise band as inconclusive until a commit-to-commit regression chart or confidence interval confirms the direction.
