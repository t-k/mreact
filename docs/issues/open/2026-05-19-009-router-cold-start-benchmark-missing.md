# Router cold-start benchmark coverage is missing

## Summary

The router benchmark suite defines an `app server cold start` metric, but the
mreact app-router adapter does not implement `measureServerColdStartMs()`. This
leaves server startup and serverless cold-start regressions untracked, even
though recent production work has focused heavily on AWS Lambda init and first
route hit latency.

## Evidence

- `benchmarks/router/types.ts` declares `measureServerColdStartMs?: () => Promise<number>` for router adapters.
- `benchmarks/router/runner.ts` includes the `app server cold start` duration case and invokes `adapter.measureServerColdStartMs?.()`.
- `benchmarks/router/adapters/mreact-app-router.ts` implements render, streaming, client-navigation, and bundle-size probes, but has no `measureServerColdStartMs()` implementation.
- `benchmarks/results/2026-05-18/router.md` contains many runtime metrics, but no completed mreact cold-start number.

## Impact

Cold start is a first-class deployment concern for Lambda, Cloud Run scale-to-zero,
App Runner, and similar platforms. Without a repeatable benchmark, improvements
to runtime materialization, route artifact loading, and preloading cannot be
tracked or compared against regressions.

## Suggested fix

Add a mreact-specific cold-start probe that isolates server initialization from
the app build:

1. Build the fixture once.
2. Spawn a fresh Node process for each sample.
3. Measure from process start to a ready HTTP listener, or from handler module
   import to a completed synthetic first request for Lambda-style adapters.
4. Report variants for plain `mreact-router start`, `createAwsLambdaRequestHandler()`,
   and `createPreloadedAwsLambdaRequestHandler()` if practical.

The benchmark should record both init-only latency and first dynamic route hit
latency so the project can distinguish platform cold start from route module
evaluation.

## Priority

High.
