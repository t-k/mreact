# Router Build Time Benchmark

## Environment

- Date: 2026-05-21
- Git commit: c038fee5006ef409f95064c9f21e5d8d4eb3ddb1
- Node: v24.13.0
- NODE_ENV: production
- pnpm: 10.19.0
- Platform: linux x64
- CPU: AMD Ryzen 9 9950X 16-Core Processor (32)
- Memory: 200106930176 bytes

## Results

| case | routes | mean ms | p75 ms | p99 ms | raw samples ms |
| --- | ---: | ---: | ---: | ---: | --- |
| app build with rendered-export client inference | 40 | 1585.23 | 1705.56 | 1711.35 | 1438.48, 1446.41, 1711.35, 1705.56, 1624.37 |
