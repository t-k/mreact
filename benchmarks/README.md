# benchmarks

This directory contains fair, repeatable benchmark fixtures for mreact and peer frameworks.

## Tracks

- `primitive`: framework primitive comparison without routers.
- `router`: reserved for production router/app framework comparison.
- `scenarios`: reserved for user-centric scenario reports.

## Fairness Policy

- Use each framework's recommended production mode.
- Use the same fixture data and DOM shape for comparable rows.
- Validate DOM or HTML output before recording a completed result.
- Record unsupported cases with explicit reasons.
- Keep mreact-specific diagnostics out of cross-framework score tables.
- Store raw and summary outputs under `benchmarks/results/<date>/`.
- Treat benchmark numbers as same-machine comparisons, not absolute truth.

## Commands

```bash
pnpm bench:primitive
```

The Phase 1 primitive runner sets `NODE_ENV=production` for both the build and benchmark process.
