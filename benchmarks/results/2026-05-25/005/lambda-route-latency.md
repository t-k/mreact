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
| cold-healthz | 1 | /healthz | 200 | 11.109 | 8.82 | 0.258 | 0 | 0 | 0 | 0 | 0 | 0 | 0.059 | 0.014 | 0.438 | 0.318 | 0.024 | 0 | 0 | 0.028 | 0.642 | 0 | 30 |
| streaming-healthz | 1 | /healthz | 200 | 1.145 | 0.738 | 0.001 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.036 | 0.034 | 0 | 0 | 0.199 | 30 |
| first-root-redirect | 1 | / | 303 | 27.713 | 27.563 | 0.001 | 0 | 25.554 | 1.239 | 25.477 | 0 | 0 | 0.023 | 0.004 | 0 | 0 | 0 | 0 | 0 | 0 | 0.031 | 0 | 0 |
| warm-root-redirect | 1 | / | 303 | 25.937 | 25.781 | 0.001 | 0 | 25.218 | 0.023 | 25.21 | 0 | 0 | 0.011 | 0.003 | 0 | 0 | 0 | 0 | 0 | 0 | 0.019 | 0 | 0 |
| warm-root-redirect | 2 | / | 303 | 25.758 | 25.587 | 0.001 | 0 | 25.138 | 0.019 | 25.132 | 0 | 0 | 0.009 | 0.003 | 0 | 0 | 0 | 0 | 0 | 0 | 0.014 | 0 | 0 |
| first-login | 1 | /login | 303 | 14.02 | 13.924 | 0.001 | 0 | 12.261 | 1.065 | 12.223 | 0 | 0 | 0.037 | 0.003 | 0 | 0 | 0 | 0 | 0 | 0 | 0.014 | 0 | 0 |
