# Router Build Time Benchmark

## Environment

- Date: 2026-05-25
- Git commit: eed9cd124c3099fe83438751b7d18dc27bfedf6b
- Node: v24.13.0
- NODE_ENV: production
- pnpm: 10.19.0
- Platform: linux x64
- CPU: AMD Ryzen 9 9950X 16-Core Processor (32)
- Memory: 200106930176 bytes

## Results

| case | routes | mean ms | p75 ms | p99 ms | raw samples ms |
| --- | ---: | ---: | ---: | ---: | --- |
| app build with rendered-export client inference | 40 | 1423.87 | 1455.32 | 1455.32 | 1451.37, 1364.92, 1455.32 |
