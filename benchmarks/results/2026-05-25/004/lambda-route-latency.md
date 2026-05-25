# AWS Lambda Route Latency Benchmark

## Environment

- Date: 2026-05-25
- Git commit: ebc880c99651fd42db9da6a69eb5de8926c0fdc6
- Node: v24.13.0
- NODE_ENV: production
- pnpm: 10.19.0
- Platform: linux x64
- CPU: AMD Ryzen 9 9950X 16-Core Processor (32)
- Memory: 200106930176 bytes
- Package versions:
  - @reckona/mreact-router: 0.0.82

## Results

| scenario | iteration | path | status | request duration ms | render ms | runtime dir ms | preload wait ms | loader wait ms | loader module load ms | loader execution ms | middleware module load ms | middleware execution ms | source analysis ms | source analysis artifact ms | stream drain ms | stream read ms | stream concat ms | stream wait ms | stream write ms | body encode ms | response serialization ms | response streaming ms | body bytes |
| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| cold-healthz | 1 | /healthz | 200 | 8.503 | 6.731 | 0.222 | 0 | 0 | 0 | 0 | 0 | 0 | 0.053 | 0.012 | 0.36 | 0.263 | 0.02 | 0 | 0 | 0.022 | 0.547 | 0 | 30 |
| streaming-healthz | 1 | /healthz | 200 | 1.076 | 0.738 | 0.001 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.03 | 0.021 | 0 | 0 | 0.149 | 30 |
| first-root-redirect | 1 | / | 303 | 26.593 | 26.479 | 0.001 | 0 | 25.389 | 0.612 | 25.341 | 0 | 0 | 0.014 | 0.002 | 0 | 0 | 0 | 0 | 0 | 0 | 0.024 | 0 | 0 |
| warm-root-redirect | 1 | / | 303 | 25.68 | 25.552 | 0.002 | 0 | 25.159 | 0.016 | 25.152 | 0 | 0 | 0.009 | 0.004 | 0 | 0 | 0 | 0 | 0 | 0 | 0.012 | 0 | 0 |
| warm-root-redirect | 2 | / | 303 | 25.61 | 25.487 | 0.001 | 0 | 25.13 | 0.013 | 25.124 | 0 | 0 | 0.007 | 0.002 | 0 | 0 | 0 | 0 | 0 | 0 | 0.011 | 0 | 0 |
| first-login | 1 | /login | 303 | 13.726 | 13.638 | 0.001 | 0 | 12.235 | 0.816 | 12.2 | 0 | 0 | 0.033 | 0.003 | 0 | 0 | 0 | 0 | 0 | 0 | 0.014 | 0 | 0 |
