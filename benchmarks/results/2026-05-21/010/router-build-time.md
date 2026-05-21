# Router Build Time Benchmark

## Environment

- Date: 2026-05-21
- Git commit: 1771911f3aefe3b666e7bf8488127316f87c7704
- Node: v24.13.0
- NODE_ENV: production
- pnpm: 10.19.0
- Platform: linux x64
- CPU: AMD Ryzen 9 9950X 16-Core Processor (32)
- Memory: 200106930176 bytes

## Results

| case | routes | mean ms | p75 ms | p99 ms | raw samples ms |
| --- | ---: | ---: | ---: | ---: | --- |
| app build with rendered-export client inference | 40 | 1601.95 | 1674.06 | 1683.09 | 1475.13, 1524.91, 1652.56, 1683.09, 1674.06 |
