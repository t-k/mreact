# Request Fast Path Microbenchmark

## Environment

- Date: 2026-05-22
- Git commit: 4f085fe04dfb570197392d9b43ecd8dedc0d3e63
- Node: v24.15.0
- NODE_ENV: production
- pnpm: 10.19.0
- Platform: linux x64
- CPU: AMD EPYC 9V74 80-Core Processor (4)

## Results

- Repeat count per sample: 100000
- Warmup runs: 5
- Measured runs: 15

| candidate | case | median ms | p75 ms | p95 ms | raw samples ms |
| --- | --- | ---: | ---: | ---: | --- |
| baseline | parse plain cookie header | 104.89 | 105.32 | 111.51 | 103.69, 111.51, 108.98, 104.35, 104.89, 104.27, 105.32, 104.73, 105.15, 104.74, 104.77, 105.19, 104.84, 105.52, 105.04 |
| fast-path | parse plain cookie header | 70.37 | 70.48 | 72.77 | 69.58, 70.76, 69.99, 70.39, 70.48, 70.34, 70.33, 70.63, 72.77, 70.28, 70.15, 70.37, 70.22, 70.38, 70.48 |
| baseline | parse encoded cookie header | 103.6 | 103.97 | 121.12 | 102.78, 103.54, 103.18, 103.56, 103.21, 103.23, 103.89, 106.8, 104.01, 103.42, 103.6, 103.6, 103.97, 103.65, 121.12 |
| fast-path | parse encoded cookie header | 81.17 | 81.4 | 81.99 | 80.81, 80.91, 81.4, 80.99, 80.95, 81.4, 81.99, 81.11, 81, 81.17, 81.37, 81.83, 81.05, 81.3, 81.66 |
