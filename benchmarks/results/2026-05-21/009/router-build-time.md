# Router Build Time Benchmark

## Environment

- Date: 2026-05-21
- Git commit: 3971eef8de1fbe928db83dc4e6028479b96985e4
- Node: v24.13.0
- NODE_ENV: production
- pnpm: 10.19.0
- Platform: linux x64
- CPU: AMD Ryzen 9 9950X 16-Core Processor (32)
- Memory: 200106930176 bytes

## Results

| case | routes | mean ms | p75 ms | p99 ms | raw samples ms |
| --- | ---: | ---: | ---: | ---: | --- |
| app build with rendered-export client inference | 40 | 1539.93 | 1586.1 | 1620.46 | 1491.99, 1439.34, 1561.76, 1586.1, 1620.46 |
