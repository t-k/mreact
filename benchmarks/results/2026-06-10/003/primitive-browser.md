# Primitive Browser Benchmark

## Environment

- Date: 2026-06-10
- Git commit: 7655cf5786b605187d046040884f5ae79395d7da
- Node: v24.16.0
- NODE_ENV: production
- pnpm: 10.19.0
- Platform: linux x64
- CPU: AMD EPYC 9V74 80-Core Processor (4)
- Memory: 16766423040 bytes
- Package versions:
  - @builder.io/qwik: 1.19.2
  - @playwright/test: 1.60.0
  - @reckona/mreact-compat: 0.0.153
  - @reckona/mreact-reactive-core: 0.0.153
  - @reckona/mreact-reactive-dom: 0.0.153
  - marko: 5.38.39
  - react: 19.2.6
  - react-dom: 19.2.6
  - solid-js: 1.9.12
  - vite: 8.0.11

## Rankings

### browser create 1k rows

Creates 1,000 keyed DOM rows in real Chromium, mirroring the primitive create case without happy-dom.

| rank | framework | case | value | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | --- |
| 1 | solid | browser create 1k rows | 1.6 | best | ms |
| 2 | **mreact** | browser create 1k rows | 2.3 | +43.75% | ms |
| 3 | qwik | browser create 1k rows | 3.1 | +93.75% | ms |
| 4 | react | browser create 1k rows | 3.3 | +106.25% | ms |
| 5 | **mreact react-compat** | browser create 1k rows | 4.5 | +181.25% | ms |

### browser update every 10th in 10k rows

Updates every tenth row in a 10,000-row keyed DOM in real Chromium, exposing real DOM update costs hidden by happy-dom.

| rank | framework | case | value | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | --- |
| 1 | **mreact** | browser update every 10th in 10k rows | 1.3 | best | ms |
| 2 | react | browser update every 10th in 10k rows | 2.8 | +115.38% | ms |
| 3 | **mreact react-compat** | browser update every 10th in 10k rows | 5 | +284.62% | ms |
| 4 | solid | browser update every 10th in 10k rows | 7.6 | +484.62% | ms |
| 5 | qwik | browser update every 10th in 10k rows | 9.7 | +646.15% | ms |

### browser select row in 10k rows

Toggles selection attributes for one row in a 10,000-row keyed DOM in real Chromium.

| rank | framework | case | value | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | --- |
| 1 | solid | browser select row in 10k rows | 0.9 | best | ms |
| 2 | **mreact** | browser select row in 10k rows | 1 | +11.11% | ms |
| 3 | react | browser select row in 10k rows | 2.4 | +166.67% | ms |
| 4 | **mreact react-compat** | browser select row in 10k rows | 4.1 | +355.56% | ms |
| 5 | qwik | browser select row in 10k rows | 9.7 | +977.78% | ms |

### browser clear 10k rows

Clears a 10,000-row keyed DOM in real Chromium to validate happy-dom clear rankings against browser behavior.

| rank | framework | case | value | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | --- |
| 1 | solid | browser clear 10k rows | 2.4 | best | ms |
| 2 | **mreact** | browser clear 10k rows | 2.7 | +12.5% | ms |
| 3 | **mreact react-compat** | browser clear 10k rows | 4.1 | +70.83% | ms |
| 4 | qwik | browser clear 10k rows | 6 | +150% | ms |
| 5 | react | browser clear 10k rows | 10.1 | +320.83% | ms |

## Results

| suite | framework | version | case | status | metric | unit | value | diff vs 1st | sample count | min | max | mean | median | p75 | p95 | p99 | standard deviation | raw samples | notes |
| --- | --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| primitive-browser | mreact | workspace | browser create 1k rows | completed | duration | ms | 2.3 | +43.75% | 7 | 1.8000000000465661 | 3.1000000000931323 | 2.3429 | 2.3 | 2.5 | 3.1 | 3.1 | 0.3886 | 2.5, 3.1000000000931323, 2.200000000069849, 2.300000000046566, 2, 1.8000000000465661, 2.5 | bundle gzip bytes: 115796 |
| primitive-browser | mreact react-compat | workspace | browser create 1k rows | completed | duration | ms | 4.5 | +181.25% | 7 | 2.700000000069849 | 5.900000000023283 | 4.2714 | 4.5 | 5.1 | 5.9 | 5.9 | 1.0552 | 5.900000000023283, 5.100000000093132, 4.300000000046566, 4.5, 2.900000000023283, 4.5, 2.700000000069849 | bundle gzip bytes: 115796 |
| primitive-browser | react | workspace | browser create 1k rows | completed | duration | ms | 3.3 | +106.25% | 7 | 3.099999999976717 | 5.099999999976717 | 3.6571 | 3.3 | 4.1 | 5.1 | 5.1 | 0.663 | 4.099999999976717, 5.099999999976717, 3.5, 3.199999999953434, 3.300000000046566, 3.099999999976717, 3.299999999930151 | bundle gzip bytes: 115796 |
| primitive-browser | solid | workspace | browser create 1k rows | completed | duration | ms | 1.6 | best | 7 | 1.5 | 1.7000000000698492 | 1.5857 | 1.6 | 1.7 | 1.7 | 1.7 | 0.0833 | 1.599999999976717, 1.7000000000698492, 1.599999999976717, 1.6999999999534339, 1.5, 1.5, 1.5 | bundle gzip bytes: 115796 |
| primitive-browser | marko | workspace | browser create 1k rows | unsupported | duration | ms | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | Marko's standalone browser primitive fixture requires the Marko client compiler/runtime integration; keep Marko covered by router browser probes until a stable standalone harness is added. |
| primitive-browser | qwik | workspace | browser create 1k rows | completed | duration | ms | 3.1 | +93.75% | 7 | 2.5 | 4.599999999976717 | 3.1429 | 3.1 | 3.2 | 4.6 | 4.6 | 0.6433 | 3.200000000069849, 4.599999999976717, 2.599999999976717, 2.5, 3.1000000000931323, 3.099999999976717, 2.900000000023283 | bundle gzip bytes: 115796 |
| primitive-browser | mreact | workspace | browser update every 10th in 10k rows | completed | duration | ms | 1.3 | best | 7 | 1 | 1.400000000023283 | 1.2429 | 1.3 | 1.4 | 1.4 | 1.4 | 0.1591 | 1.3999999999068677, 1.3000000000465661, 1, 1.400000000023283, 1.3000000000465661, 1, 1.3000000000465661 | bundle gzip bytes: 115796 |
| primitive-browser | mreact react-compat | workspace | browser update every 10th in 10k rows | completed | duration | ms | 5 | +284.62% | 7 | 4.899999999906868 | 7.599999999976717 | 5.4 | 5 | 5.2 | 7.6 | 7.6 | 0.9055 | 5.199999999953434, 5, 7.599999999976717, 5, 5.199999999953434, 4.899999999906868, 4.899999999906868 | bundle gzip bytes: 115796 |
| primitive-browser | react | workspace | browser update every 10th in 10k rows | completed | duration | ms | 2.8 | +115.38% | 7 | 2.699999999953434 | 5.100000000093132 | 3.1714 | 2.8 | 3.3 | 5.1 | 5.1 | 0.8101 | 5.100000000093132, 3.299999999930151, 2.800000000046566, 2.800000000046566, 2.799999999930151, 2.699999999953434, 2.699999999953434 | bundle gzip bytes: 115796 |
| primitive-browser | solid | workspace | browser update every 10th in 10k rows | completed | duration | ms | 7.6 | +484.62% | 7 | 7 | 7.799999999930151 | 7.5286 | 7.6 | 7.7 | 7.8 | 7.8 | 0.2491 | 7.5, 7.599999999976717, 7.799999999930151, 7.699999999953434, 7.700000000069849, 7.400000000023283, 7 | bundle gzip bytes: 115796 |
| primitive-browser | marko | workspace | browser update every 10th in 10k rows | unsupported | duration | ms | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | Marko's standalone browser primitive fixture requires the Marko client compiler/runtime integration; keep Marko covered by router browser probes until a stable standalone harness is added. |
| primitive-browser | qwik | workspace | browser update every 10th in 10k rows | completed | duration | ms | 9.7 | +646.15% | 7 | 8.800000000046566 | 18.400000000023283 | 11.2571 | 9.7 | 11.7 | 18.4 | 18.4 | 3.0691 | 11.199999999953434, 18.400000000023283, 9.699999999953434, 9.300000000046566, 11.699999999953434, 9.699999999953434, 8.800000000046566 | bundle gzip bytes: 115796 |
| primitive-browser | mreact | workspace | browser select row in 10k rows | completed | duration | ms | 1 | +11.11% | 7 | 0.9000000000232831 | 1 | 0.9857 | 1 | 1 | 1 | 1 | 0.035 | 1, 1, 1, 1, 0.9000000000232831, 1, 1 | bundle gzip bytes: 115796 |
| primitive-browser | mreact react-compat | workspace | browser select row in 10k rows | completed | duration | ms | 4.1 | +355.56% | 7 | 3.900000000023283 | 5.599999999976717 | 4.3 | 4.1 | 4.2 | 5.6 | 5.6 | 0.5372 | 4.099999999976717, 4.100000000093132, 4.099999999976717, 4.100000000093132, 5.599999999976717, 3.900000000023283, 4.200000000069849 | bundle gzip bytes: 115796 |
| primitive-browser | react | workspace | browser select row in 10k rows | completed | duration | ms | 2.4 | +166.67% | 7 | 2.299999999930151 | 3.599999999976717 | 2.5429 | 2.4 | 2.5 | 3.6 | 3.6 | 0.4371 | 2.5, 2.300000000046566, 2.3999999999068677, 2.299999999930151, 2.3999999999068677, 2.300000000046566, 3.599999999976717 | bundle gzip bytes: 115796 |
| primitive-browser | solid | workspace | browser select row in 10k rows | completed | duration | ms | 0.9 | best | 7 | 0.8999999999068677 | 1 | 0.9429 | 0.9 | 1 | 1 | 1 | 0.0495 | 1, 1, 0.9000000000232831, 0.9000000000232831, 1, 0.8999999999068677, 0.9000000000232831 | bundle gzip bytes: 115796 |
| primitive-browser | marko | workspace | browser select row in 10k rows | unsupported | duration | ms | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | Marko's standalone browser primitive fixture requires the Marko client compiler/runtime integration; keep Marko covered by router browser probes until a stable standalone harness is added. |
| primitive-browser | qwik | workspace | browser select row in 10k rows | completed | duration | ms | 9.7 | +977.78% | 7 | 9.400000000023283 | 18.599999999976717 | 12.1143 | 9.7 | 18.3 | 18.6 | 18.6 | 4.0098 | 9.5, 9.5, 18.599999999976717, 9.70000000006985, 9.400000000023283, 18.29999999993015, 9.79999999993015 | bundle gzip bytes: 115796 |
| primitive-browser | mreact | workspace | browser clear 10k rows | completed | duration | ms | 2.7 | +12.5% | 7 | 2.5 | 4.700000000069849 | 2.9571 | 2.7 | 2.9 | 4.7 | 4.7 | 0.7248 | 2.700000000069849, 2.800000000046566, 2.5, 2.5, 2.6000000000931323, 4.700000000069849, 2.8999999999068677 | bundle gzip bytes: 115796 |
| primitive-browser | mreact react-compat | workspace | browser clear 10k rows | completed | duration | ms | 4.1 | +70.83% | 7 | 4 | 4.100000000093132 | 4.0571 | 4.1 | 4.1 | 4.1 | 4.1 | 0.0495 | 4, 4, 4.100000000093132, 4.099999999976717, 4.099999999976717, 4, 4.099999999976717 | bundle gzip bytes: 115796 |
| primitive-browser | react | workspace | browser clear 10k rows | completed | duration | ms | 10.1 | +320.83% | 7 | 9.199999999953434 | 10.100000000093132 | 9.8286 | 10.1 | 10.1 | 10.1 | 10.1 | 0.3411 | 10.100000000093132, 10.099999999976717, 10.099999999976717, 10.099999999976717, 9.5, 9.699999999953434, 9.199999999953434 | bundle gzip bytes: 115796 |
| primitive-browser | solid | workspace | browser clear 10k rows | completed | duration | ms | 2.4 | best | 7 | 2.199999999953434 | 2.400000000023283 | 2.3429 | 2.4 | 2.4 | 2.4 | 2.4 | 0.0728 | 2.299999999930151, 2.3999999999068677, 2.299999999930151, 2.199999999953434, 2.3999999999068677, 2.400000000023283, 2.400000000023283 | bundle gzip bytes: 115796 |
| primitive-browser | marko | workspace | browser clear 10k rows | unsupported | duration | ms | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | Marko's standalone browser primitive fixture requires the Marko client compiler/runtime integration; keep Marko covered by router browser probes until a stable standalone harness is added. |
| primitive-browser | qwik | workspace | browser clear 10k rows | completed | duration | ms | 6 | +150% | 7 | 5.800000000046566 | 6.5 | 6.0714 | 6 | 6.3 | 6.5 | 6.5 | 0.2373 | 5.800000000046566, 6.299999999930151, 5.800000000046566, 6, 6.100000000093132, 6, 6.5 | bundle gzip bytes: 115796 |
