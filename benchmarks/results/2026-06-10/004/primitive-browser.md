# Primitive Browser Benchmark

## Environment

- Date: 2026-06-10
- Git commit: 7486a8314dd7bc681c7622e1d35a1b849882b028
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
| 3 | qwik | browser create 1k rows | 2.9 | +81.25% | ms |
| 4 | react | browser create 1k rows | 3.5 | +118.75% | ms |
| 5 | **mreact react-compat** | browser create 1k rows | 3.9 | +143.75% | ms |

### browser update every 10th in 10k rows

Updates every tenth row in a 10,000-row keyed DOM in real Chromium, exposing real DOM update costs hidden by happy-dom.

| rank | framework | case | value | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | --- |
| 1 | **mreact** | browser update every 10th in 10k rows | 1.1 | best | ms |
| 2 | react | browser update every 10th in 10k rows | 2.8 | +154.55% | ms |
| 3 | **mreact react-compat** | browser update every 10th in 10k rows | 4.9 | +345.45% | ms |
| 4 | solid | browser update every 10th in 10k rows | 8.1 | +636.36% | ms |
| 5 | qwik | browser update every 10th in 10k rows | 16.9 | +1436.36% | ms |

### browser select row in 10k rows

Toggles selection attributes for one row in a 10,000-row keyed DOM in real Chromium.

| rank | framework | case | value | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | --- |
| 1 | solid | browser select row in 10k rows | 0.9 | best | ms |
| 2 | **mreact** | browser select row in 10k rows | 1 | +11.11% | ms |
| 3 | react | browser select row in 10k rows | 2.4 | +166.67% | ms |
| 4 | **mreact react-compat** | browser select row in 10k rows | 3.7 | +311.11% | ms |
| 5 | qwik | browser select row in 10k rows | 9.3 | +933.33% | ms |

### browser clear 10k rows

Clears a 10,000-row keyed DOM in real Chromium to validate happy-dom clear rankings against browser behavior.

| rank | framework | case | value | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | --- |
| 1 | solid | browser clear 10k rows | 2.4 | best | ms |
| 2 | **mreact** | browser clear 10k rows | 2.8 | +16.67% | ms |
| 3 | **mreact react-compat** | browser clear 10k rows | 4.6 | +91.67% | ms |
| 4 | qwik | browser clear 10k rows | 6.1 | +154.17% | ms |
| 5 | react | browser clear 10k rows | 6.3 | +162.5% | ms |

## Results

| suite | framework | version | case | status | metric | unit | value | diff vs 1st | sample count | min | max | mean | median | p75 | p95 | p99 | standard deviation | raw samples | notes |
| --- | --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| primitive-browser | mreact | workspace | browser create 1k rows | completed | duration | ms | 2.3 | +43.75% | 7 | 1.900000000023283 | 3.699999999953434 | 2.4571 | 2.3 | 2.8 | 3.7 | 3.7 | 0.5778 | 2.800000000046566, 3.699999999953434, 2.099999999976717, 2.300000000046566, 2, 1.900000000023283, 2.3999999999068677 | bundle gzip bytes: 115796 |
| primitive-browser | mreact react-compat | workspace | browser create 1k rows | completed | duration | ms | 3.9 | +143.75% | 7 | 2.5 | 5.900000000023283 | 3.9286 | 3.9 | 4.9 | 5.9 | 5.9 | 1.1348 | 5.900000000023283, 4.399999999906868, 4.900000000023283, 3.900000000023283, 2.5, 2.900000000023283, 3 | bundle gzip bytes: 115796 |
| primitive-browser | react | workspace | browser create 1k rows | completed | duration | ms | 3.5 | +118.75% | 7 | 3.299999999930151 | 4.700000000069849 | 3.7143 | 3.5 | 4.1 | 4.7 | 4.7 | 0.4794 | 4.099999999976717, 3.5, 3.700000000069849, 3.400000000023283, 4.700000000069849, 3.299999999930151, 3.300000000046566 | bundle gzip bytes: 115796 |
| primitive-browser | solid | workspace | browser create 1k rows | completed | duration | ms | 1.6 | best | 7 | 1.5 | 3 | 1.8286 | 1.6 | 1.9 | 3 | 3 | 0.4949 | 1.6999999999534339, 1.8999999999068677, 1.6000000000931323, 3, 1.5, 1.599999999976717, 1.5 | bundle gzip bytes: 115796 |
| primitive-browser | marko | workspace | browser create 1k rows | unsupported | duration | ms | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | Marko's standalone browser primitive fixture requires the Marko client compiler/runtime integration; keep Marko covered by router browser probes until a stable standalone harness is added. |
| primitive-browser | qwik | workspace | browser create 1k rows | completed | duration | ms | 2.9 | +81.25% | 7 | 2.3999999999068677 | 4.400000000023283 | 3.1286 | 2.9 | 3.2 | 4.4 | 4.4 | 0.575 | 3.199999999953434, 2.900000000023283, 2.900000000023283, 4.400000000023283, 2.3999999999068677, 3.200000000069849, 2.900000000023283 | bundle gzip bytes: 115796 |
| primitive-browser | mreact | workspace | browser update every 10th in 10k rows | completed | duration | ms | 1.1 | best | 7 | 0.9000000000232831 | 1.5 | 1.1571 | 1.1 | 1.3 | 1.5 | 1.5 | 0.1841 | 1.3000000000465661, 1.5, 1.1999999999534339, 1, 1.099999999976717, 1.099999999976717, 0.9000000000232831 | bundle gzip bytes: 115796 |
| primitive-browser | mreact react-compat | workspace | browser update every 10th in 10k rows | completed | duration | ms | 4.9 | +345.45% | 7 | 4.5 | 15.699999999953434 | 6.4286 | 4.9 | 5.2 | 15.7 | 15.7 | 3.7901 | 5.200000000069849, 15.699999999953434, 4.799999999930151, 4.900000000023283, 5, 4.5, 4.900000000023283 | bundle gzip bytes: 115796 |
| primitive-browser | react | workspace | browser update every 10th in 10k rows | completed | duration | ms | 2.8 | +154.55% | 7 | 2.700000000069849 | 3.299999999930151 | 2.9143 | 2.8 | 3.2 | 3.3 | 3.3 | 0.2167 | 3.200000000069849, 3.299999999930151, 2.799999999930151, 2.799999999930151, 2.700000000069849, 2.800000000046566, 2.800000000046566 | bundle gzip bytes: 115796 |
| primitive-browser | solid | workspace | browser update every 10th in 10k rows | completed | duration | ms | 8.1 | +636.36% | 7 | 7 | 64.29999999993015 | 16.1857 | 8.1 | 11.3 | 64.3 | 64.3 | 19.6893 | 8.100000000093132, 8.099999999976717, 64.29999999993015, 7.199999999953434, 7, 11.300000000046566, 7.299999999930151 | bundle gzip bytes: 115796 |
| primitive-browser | marko | workspace | browser update every 10th in 10k rows | unsupported | duration | ms | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | Marko's standalone browser primitive fixture requires the Marko client compiler/runtime integration; keep Marko covered by router browser probes until a stable standalone harness is added. |
| primitive-browser | qwik | workspace | browser update every 10th in 10k rows | completed | duration | ms | 16.9 | +1436.36% | 7 | 8.599999999976717 | 20.900000000023283 | 14.5 | 16.9 | 19.6 | 20.9 | 20.9 | 5.054 | 17.599999999976717, 19.600000000093132, 16.900000000023283, 8.79999999993015, 8.599999999976717, 20.900000000023283, 9.099999999976717 | bundle gzip bytes: 115796 |
| primitive-browser | mreact | workspace | browser select row in 10k rows | completed | duration | ms | 1 | +11.11% | 7 | 0.8999999999068677 | 1.8000000000465661 | 1.1 | 1 | 1.2 | 1.8 | 1.8 | 0.3024 | 1, 0.8999999999068677, 0.8999999999068677, 1, 1.1999999999534339, 0.8999999999068677, 1.8000000000465661 | bundle gzip bytes: 115796 |
| primitive-browser | mreact react-compat | workspace | browser select row in 10k rows | completed | duration | ms | 3.7 | +311.11% | 7 | 3.699999999953434 | 4.800000000046566 | 3.9 | 3.7 | 3.9 | 4.8 | 4.8 | 0.3742 | 3.900000000023283, 4.800000000046566, 3.699999999953434, 3.700000000069849, 3.800000000046566, 3.699999999953434, 3.699999999953434 | bundle gzip bytes: 115796 |
| primitive-browser | react | workspace | browser select row in 10k rows | completed | duration | ms | 2.4 | +166.67% | 7 | 2.299999999930151 | 2.5 | 2.4286 | 2.4 | 2.5 | 2.5 | 2.5 | 0.07 | 2.400000000023283, 2.5, 2.400000000023283, 2.299999999930151, 2.400000000023283, 2.5, 2.5 | bundle gzip bytes: 115796 |
| primitive-browser | solid | workspace | browser select row in 10k rows | completed | duration | ms | 0.9 | best | 7 | 0.8999999999068677 | 1 | 0.9286 | 0.9 | 1 | 1 | 1 | 0.0452 | 0.8999999999068677, 1, 0.9000000000232831, 1, 0.9000000000232831, 0.9000000000232831, 0.9000000000232831 | bundle gzip bytes: 115796 |
| primitive-browser | marko | workspace | browser select row in 10k rows | unsupported | duration | ms | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | Marko's standalone browser primitive fixture requires the Marko client compiler/runtime integration; keep Marko covered by router browser probes until a stable standalone harness is added. |
| primitive-browser | qwik | workspace | browser select row in 10k rows | completed | duration | ms | 9.3 | +933.33% | 7 | 9.29999999993015 | 21.900000000023283 | 12.9286 | 9.3 | 21.8 | 21.9 | 21.9 | 5.6434 | 9.300000000046566, 9.300000000046566, 21.900000000023283, 9.300000000046566, 9.29999999993015, 21.79999999993015, 9.599999999976717 | bundle gzip bytes: 115796 |
| primitive-browser | mreact | workspace | browser clear 10k rows | completed | duration | ms | 2.8 | +16.67% | 7 | 2.799999999930151 | 3 | 2.8714 | 2.8 | 3 | 3 | 3 | 0.0881 | 2.799999999930151, 2.799999999930151, 2.799999999930151, 2.799999999930151, 3, 2.900000000023283, 3 | bundle gzip bytes: 115796 |
| primitive-browser | mreact react-compat | workspace | browser clear 10k rows | completed | duration | ms | 4.6 | +91.67% | 7 | 4.099999999976717 | 48.10000000009313 | 11.2714 | 4.6 | 7 | 48.1 | 48.1 | 15.0782 | 4.599999999976717, 4.300000000046566, 7, 6.699999999953434, 4.100000000093132, 4.099999999976717, 48.10000000009313 | bundle gzip bytes: 115796 |
| primitive-browser | react | workspace | browser clear 10k rows | completed | duration | ms | 6.3 | +162.5% | 7 | 6.099999999976717 | 7.5 | 6.4714 | 6.3 | 6.6 | 7.5 | 7.5 | 0.4431 | 6.299999999930151, 6.199999999953434, 6.099999999976717, 6.599999999976717, 7.5, 6.300000000046566, 6.299999999930151 | bundle gzip bytes: 115796 |
| primitive-browser | solid | workspace | browser clear 10k rows | completed | duration | ms | 2.4 | best | 7 | 2.299999999930151 | 4 | 2.9 | 2.4 | 3.9 | 4 | 4 | 0.6887 | 2.900000000023283, 2.3999999999068677, 2.400000000023283, 4, 3.8999999999068677, 2.400000000023283, 2.299999999930151 | bundle gzip bytes: 115796 |
| primitive-browser | marko | workspace | browser clear 10k rows | unsupported | duration | ms | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | Marko's standalone browser primitive fixture requires the Marko client compiler/runtime integration; keep Marko covered by router browser probes until a stable standalone harness is added. |
| primitive-browser | qwik | workspace | browser clear 10k rows | completed | duration | ms | 6.1 | +154.17% | 7 | 5.900000000023283 | 31.199999999953434 | 9.7429 | 6.1 | 6.8 | 31.2 | 31.2 | 8.7644 | 6.099999999976717, 5.900000000023283, 31.199999999953434, 6.800000000046566, 6.099999999976717, 6.199999999953434, 5.900000000023283 | bundle gzip bytes: 115796 |
