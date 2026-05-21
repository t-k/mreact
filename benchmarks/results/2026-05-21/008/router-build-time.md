# Router Build Time Benchmark

## Environment

- Date: 2026-05-21
- Git commit: e8acbf9b403aa80e278f9b3446619c8987147e8e
- Node: v24.13.0
- NODE_ENV: production
- pnpm: 10.19.0
- Platform: linux x64
- CPU: AMD Ryzen 9 9950X 16-Core Processor (32)
- Memory: 200106930176 bytes

## Results

| case | routes | mean ms | p75 ms | p99 ms | raw samples ms |
| --- | ---: | ---: | ---: | ---: | --- |
| app build with rendered-export client inference | 40 | 1551.95 | 1586.7 | 1680.1 | 1501.32, 1441.05, 1550.56, 1586.7, 1680.1 |
