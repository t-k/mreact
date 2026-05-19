# Streaming first-byte latency trails the fastest adapter

## Summary

The current router benchmark shows mreact's full streaming body latency is
competitive, but the first-byte timing is slower than Marko Run and Qwik City.
This suggests the work before response headers become observable is still worth
profiling.

## Evidence

`benchmarks/results/2026-05-18/router.md` reports:

- `app streaming first byte 1000 nodes`
  - Marko Run: `0.3366 ms`
  - Qwik City: `0.4152 ms`
  - mreact app-router with logging: `0.6312 ms`
  - mreact app-router: `0.8803 ms`
- `app streaming first chunk 1000 nodes`
  - Marko Run: `0.3204 ms`
  - mreact app-router: `0.3923 ms`
- `app streaming full body 1000 nodes`
  - Marko Run: `50.5942 ms`
  - mreact app-router: `50.7124 ms`

`benchmarks/router/runner.ts` already separates first byte, first chunk, and
full body for the real streaming fixture.

## Impact

The full body result indicates mreact is not fundamentally slow once streaming
is underway. The first-byte gap is narrower but important for perceived latency,
TTFB, FCP/LCP chains, and serverless environments where every pre-header step is
visible to users.

## Suggested fix

Profile the pre-header path for the real streaming route:

1. Add internal benchmark timings around route match, middleware resolution,
   source analysis, metadata loading, stream module import, layout preparation,
   and `renderToReadableStream()` construction.
2. Check whether metadata, layout, hydration marker, or query-state work can be
   deferred until after the shell starts streaming.
3. Compare the no-logging and logging variants, because the latest report shows
   the logging variant unexpectedly faster for first byte.
4. Add a regression threshold once the main source of the gap is understood.

## Priority

High.
