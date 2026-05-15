# benchmarks

This directory contains fair, repeatable benchmark fixtures for mreact and peer frameworks.

## Tracks

- `primitive`: framework primitive comparison without routers. Current adapters:
  Marko, Qwik, React, Solid, and mreact.
- `router`: production router/app framework comparison across Marko Run,
  Qwik City, SolidStart, TanStack Start, Next.js App Router, and
  mreact app router.
- `scenarios`: reserved for user-centric scenario reports.

## Fairness Policy

- Use each framework's recommended production mode.
- Use the same fixture data and DOM shape for comparable rows.
- Validate DOM or HTML output before recording a completed result.
- Record unsupported cases with explicit reasons.
- Keep mreact-specific diagnostics out of cross-framework score tables.
- Use warmup runs before measured runs, and report the median of measured samples
  as the primary value to reduce sensitivity to transient system load.
- Store raw and summary outputs under `benchmarks/results/<date>/`.
- Treat benchmark numbers as same-machine comparisons, not absolute truth.

## Commands

```bash
pnpm bench:primitive
pnpm bench:router
pnpm bench:all
```

The Phase 1 primitive runner sets `NODE_ENV=production` for both the build and benchmark process.
Each case uses 2 warmup runs and 7 measured runs by default.
The router runner builds production fixture apps where needed, serves them over
loopback HTTP, and records both server-render throughput and client bundle gzip
sizes.
Throughput cases use Tinybench with a 250 ms warmup window and a 1,500 ms
measurement window per case.
