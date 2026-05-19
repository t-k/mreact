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
- Store raw samples, percentile summaries, and markdown reports under
  `benchmarks/results/<date>/`.
- Commit selected benchmark result directories when they should be a durable
  public record; do not rely on GitHub Actions artifacts for long-term access.
- Treat benchmark numbers as same-machine comparisons, not absolute truth.

## Commands

```bash
pnpm bench:primitive
pnpm bench:router
pnpm bench:all
```

The Phase 1 primitive runner sets `NODE_ENV=production` for both the build and benchmark process.
Each primitive case uses 5 warmup runs and 25 measured runs by default.
The router runner builds production fixture apps where needed, serves them over
loopback HTTP, and records both server-render throughput and client bundle gzip
sizes.
Throughput cases use Tinybench with a 250 ms warmup window and a 1,500 ms
measurement window per case.

## Reading Results

The markdown reports use the median as the ranking value, while the JSON summary files keep the raw measured samples and percentile summaries (`p75`, `p95`, and `p99` where applicable). Use the raw samples when comparing close results, especially for cases that can flip between adjacent runs such as logging-enabled and non-logging router variants.

For public claims, prefer repeated same-commit runs on the same machine, then cross-check on at least one additional runner or machine. Treat close wins inside the noise band as inconclusive until a commit-to-commit regression chart or confidence interval confirms the direction.
