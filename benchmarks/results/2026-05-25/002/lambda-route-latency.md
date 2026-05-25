# AWS Lambda Route Latency Benchmark

## Environment

- Date: 2026-05-25
- Git commit: 5b61b130426d40baae6ae3cf29b50f041ad92ef6
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
| cold-healthz | 1 | /healthz | 200 | 8.572 | 6.716 | 0.331 | 0 | 0 | 0 | 0 | 0 | 0 | 0.054 | 0.015 | 0.36 | 0.263 | 0.021 | 0 | 0 | 0.022 | 0.55 | 0 | 30 |
| streaming-healthz | 1 | /healthz | 200 | 0.735 | 0.405 | 0.001 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.027 | 0.022 | 0 | 0 | 0.148 | 30 |
| first-root-redirect | 1 | / | 303 | 26.459 | 26.346 | 0.001 | 0 | 25.331 | 0.616 | 25.291 | 0 | 0 | 0.014 | 0.002 | 0 | 0 | 0 | 0 | 0 | 0 | 0.02 | 0 | 0 |
| warm-root-redirect | 1 | / | 303 | 25.79 | 25.67 | 0.001 | 0 | 25.265 | 0.013 | 25.256 | 0 | 0 | 0.006 | 0.002 | 0 | 0 | 0 | 0 | 0 | 0 | 0.022 | 0 | 0 |
| warm-root-redirect | 2 | / | 303 | 25.981 | 25.807 | 0.001 | 0 | 25.253 | 0.018 | 25.241 | 0 | 0 | 0.01 | 0.004 | 0 | 0 | 0 | 0 | 0 | 0 | 0.023 | 0 | 0 |
| first-login | 1 | /login | 303 | 14.3 | 14.173 | 0.001 | 0 | 12.292 | 1.109 | 12.247 | 0 | 0 | 0.038 | 0.004 | 0 | 0 | 0 | 0 | 0 | 0 | 0.018 | 0 | 0 |
