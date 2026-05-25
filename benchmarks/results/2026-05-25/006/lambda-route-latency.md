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
| cold-healthz | 1 | /healthz | 200 | 8.932 | 7.027 | 0.289 | 0 | 0 | 0 | 0 | 0 | 0 | 0.056 | 0.013 | 0.376 | 0.271 | 0.022 | 0 | 0 | 0.024 | 0.573 | 0 | 30 |
| streaming-healthz | 1 | /healthz | 200 | 0.769 | 0.433 | 0.001 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.029 | 0.027 | 0 | 0 | 0.156 | 30 |
| first-root-redirect | 1 | / | 303 | 26.485 | 26.372 | 0.001 | 0 | 25.319 | 0.634 | 25.278 | 0 | 0 | 0.015 | 0.002 | 0 | 0 | 0 | 0 | 0 | 0 | 0.017 | 0 | 0 |
| warm-root-redirect | 1 | / | 303 | 25.549 | 25.449 | 0.001 | 0 | 25.143 | 0.012 | 25.138 | 0 | 0 | 0.006 | 0.002 | 0 | 0 | 0 | 0 | 0 | 0 | 0.01 | 0 | 0 |
| warm-root-redirect | 2 | / | 303 | 25.766 | 25.638 | 0.003 | 0 | 25.302 | 0.017 | 25.295 | 0 | 0 | 0.006 | 0.002 | 0 | 0 | 0 | 0 | 0 | 0 | 0.017 | 0 | 0 |
| first-login | 1 | /login | 303 | 14.583 | 14.467 | 0.001 | 0 | 12.282 | 1.158 | 12.236 | 0 | 0 | 0.038 | 0.004 | 0 | 0 | 0 | 0 | 0 | 0 | 0.018 | 0 | 0 |
