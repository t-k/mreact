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
| cold-healthz | 1 | /healthz | 200 | 8.944 | 7.07 | 0.231 | 0 | 0 | 0 | 0 | 0 | 0 | 0.055 | 0.013 | 0.408 | 0.308 | 0.021 | 0 | 0 | 0.024 | 0.602 | 0 | 30 |
| streaming-healthz | 1 | /healthz | 200 | 9.244 | 8.739 | 0.001 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.046 | 0.034 | 0 | 0 | 0.321 | 30 |
| first-root-redirect | 1 | / | 303 | 26.951 | 26.82 | 0.001 | 0 | 25.34 | 0.856 | 25.298 | 0 | 0 | 0.024 | 0.003 | 0 | 0 | 0 | 0 | 0 | 0 | 0.02 | 0 | 0 |
| warm-root-redirect | 1 | / | 303 | 25.665 | 25.552 | 0.001 | 0 | 25.175 | 0.014 | 25.17 | 0 | 0 | 0.007 | 0.002 | 0 | 0 | 0 | 0 | 0 | 0 | 0.013 | 0 | 0 |
| warm-root-redirect | 2 | / | 303 | 25.69 | 25.56 | 0.001 | 0 | 25.146 | 0.013 | 25.139 | 0 | 0 | 0.007 | 0.003 | 0 | 0 | 0 | 0 | 0 | 0 | 0.014 | 0 | 0 |
| first-login | 1 | /login | 303 | 14.078 | 13.976 | 0.001 | 0 | 12.239 | 1.076 | 12.197 | 0 | 0 | 0.056 | 0.009 | 0 | 0 | 0 | 0 | 0 | 0 | 0.019 | 0 | 0 |
