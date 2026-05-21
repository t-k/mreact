# Router Build Time Benchmark

## Environment

- Date: 2026-05-21
- Git commit: fa28735c298c3fd87baabc0f81b865d9ffff33b8
- Node: v24.13.0
- NODE_ENV: production
- pnpm: 10.19.0
- Platform: linux x64
- CPU: AMD Ryzen 9 9950X 16-Core Processor (32)
- Memory: 200106930176 bytes

## Results

| case | routes | mean ms | p75 ms | p99 ms | raw samples ms |
| --- | ---: | ---: | ---: | ---: | --- |
| app build with rendered-export client inference | 40 | 1524.55 | 1583.68 | 1586.12 | 1471.74, 1457.85, 1523.38, 1586.12, 1583.68 |
