# AWS Lambda Route Latency Benchmark

## Environment

- Date: 2026-05-25
- Git commit: 601c773237cad3d56df9fa1ba681f169f65b135b
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
| cold-healthz | 1 | /healthz | 200 | 8.704 | 6.972 | 0.211 | 0 | 0 | 0 | 0 | 0 | 0 | 0.069 | 0.013 | 0.354 | 0.256 | 0.021 | 0 | 0 | 0.022 | 0.54 | 0 | 30 |
| streaming-healthz | 1 | /healthz | 200 | 1.02 | 0.694 | 0.001 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.03 | 0.022 | 0 | 0 | 0.154 | 30 |
| first-root-redirect | 1 | / | 303 | 26.581 | 26.474 | 0.001 | 0 | 25.369 | 0.623 | 25.331 | 0 | 0 | 0.014 | 0.002 | 0 | 0 | 0 | 0 | 0 | 0 | 0.022 | 0 | 0 |
| warm-root-redirect | 1 | / | 303 | 25.711 | 25.569 | 0.002 | 0 | 25.177 | 0.014 | 25.17 | 0 | 0 | 0.008 | 0.003 | 0 | 0 | 0 | 0 | 0 | 0 | 0.014 | 0 | 0 |
| warm-root-redirect | 2 | / | 303 | 25.639 | 25.485 | 0.001 | 0 | 25.117 | 0.013 | 25.111 | 0 | 0 | 0.007 | 0.002 | 0 | 0 | 0 | 0 | 0 | 0 | 0.009 | 0 | 0 |
| warm-root-redirect | 3 | / | 303 | 25.476 | 25.403 | 0.001 | 0 | 25.111 | 0.012 | 25.106 | 0 | 0 | 0.006 | 0.002 | 0 | 0 | 0 | 0 | 0 | 0 | 0.01 | 0 | 0 |
| first-login | 1 | /login | 303 | 14.045 | 13.974 | 0.001 | 0 | 12.255 | 1.183 | 12.218 | 0 | 0 | 0.034 | 0.002 | 0 | 0 | 0 | 0 | 0 | 0 | 0.013 | 0 | 0 |
