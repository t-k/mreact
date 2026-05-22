# Request Fast Path Microbenchmark

## Environment

- Date: 2026-05-22
- Git commit: b7f092876763e7eb34521141dc8629f725d583a9
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
| baseline | parse plain cookie header | 100.01 | 100.51 | 112.82 | 100.71, 112.82, 103.69, 99.66, 99.85, 99.59, 99.34, 99.84, 100.34, 100.12, 99.81, 99.79, 100.07, 100.01, 100.51 |
| fast-path | parse plain cookie header | 73.56 | 73.73 | 79.24 | 73.21, 79.24, 72.99, 73.22, 73.56, 73.3, 73.32, 73.62, 74.05, 73.48, 73.48, 73.7, 74.16, 73.69, 73.73 |
| baseline | parse encoded cookie header | 103.22 | 103.69 | 104.75 | 104.05, 104.75, 102.74, 102.61, 102.89, 102.72, 102.94, 103.21, 103.69, 104.26, 103.22, 103.25, 103.17, 103.47, 103.68 |
| fast-path | parse encoded cookie header | 78.55 | 78.84 | 81.36 | 78.32, 78.55, 78.16, 78.54, 78.74, 78.84, 78.66, 78.54, 78.25, 78.42, 78.69, 81.36, 79.53, 78.89, 78.35 |
