# Router Build Time Benchmark

## Environment

- Date: 2026-05-21
- Git commit: 1d2702ecb5eb54094d8f1b18d6f55e67016f47ae
- Node: v24.13.0
- NODE_ENV: production
- pnpm: 10.19.0
- Platform: linux x64
- CPU: AMD Ryzen 9 9950X 16-Core Processor (32)
- Memory: 200106930176 bytes

## Results

| case | routes | mean ms | p75 ms | p99 ms | raw samples ms |
| --- | ---: | ---: | ---: | ---: | --- |
| app build with rendered-export client inference | 40 | 1506.03 | 1569.43 | 1615.44 | 1433.63, 1422.97, 1488.67, 1569.43, 1615.44 |
