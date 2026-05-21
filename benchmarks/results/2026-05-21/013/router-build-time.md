# Router Build Time Benchmark

## Environment

- Date: 2026-05-21
- Git commit: 6e9f08356b75cde91a8002190183e3e000e90f1d
- Node: v24.13.0
- NODE_ENV: production
- pnpm: 10.19.0
- Platform: linux x64
- CPU: AMD Ryzen 9 9950X 16-Core Processor (32)
- Memory: 200106930176 bytes

## Results

| case | routes | mean ms | p75 ms | p99 ms | raw samples ms |
| --- | ---: | ---: | ---: | ---: | --- |
| app build with rendered-export client inference | 40 | 1654.51 | 1727.5 | 1968.48 | 1727.5, 1492.9, 1431.04, 1652.64, 1968.48 |
