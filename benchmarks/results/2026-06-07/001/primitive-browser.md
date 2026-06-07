# Primitive Browser Benchmark

## Environment

- Date: 2026-06-07
- Git commit: 7490ad535c95d68ec5c0d19c3e4abd0f1c2e0356
- Node: v24.16.0
- NODE_ENV: production
- pnpm: 10.19.0
- Platform: linux x64
- CPU: AMD EPYC 7763 64-Core Processor (4)
- Memory: 16766423040 bytes
- Package versions:
  - @builder.io/qwik: 1.19.2
  - @playwright/test: 1.60.0
  - @reckona/mreact-compat: 0.0.145
  - @reckona/mreact-reactive-core: 0.0.145
  - @reckona/mreact-reactive-dom: 0.0.145
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
| 1 | solid | browser create 1k rows | 1.5 | best | ms |
| 2 | **mreact** | browser create 1k rows | 2.1 | +40% | ms |
| 3 | qwik | browser create 1k rows | 2.7 | +80% | ms |
| 4 | react | browser create 1k rows | 3.1 | +106.67% | ms |
| 5 | **mreact react-compat** | browser create 1k rows | 4.4 | +193.33% | ms |

### browser update every 10th in 10k rows

Updates every tenth row in a 10,000-row keyed DOM in real Chromium, exposing real DOM update costs hidden by happy-dom.

| rank | framework | case | value | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | --- |
| 1 | **mreact** | browser update every 10th in 10k rows | 1 | best | ms |
| 2 | react | browser update every 10th in 10k rows | 2.8 | +180% | ms |
| 3 | solid | browser update every 10th in 10k rows | 7.2 | +620% | ms |
| 4 | **mreact react-compat** | browser update every 10th in 10k rows | 9.2 | +820% | ms |
| 5 | qwik | browser update every 10th in 10k rows | 15.5 | +1450% | ms |

### browser select row in 10k rows

Toggles selection attributes for one row in a 10,000-row keyed DOM in real Chromium.

| rank | framework | case | value | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | --- |
| 1 | **mreact** | browser select row in 10k rows | 0.9 | best | ms |
| 2 | solid | browser select row in 10k rows | 1 | +11.11% | ms |
| 3 | react | browser select row in 10k rows | 2.3 | +155.56% | ms |
| 4 | **mreact react-compat** | browser select row in 10k rows | 7.4 | +722.22% | ms |
| 5 | qwik | browser select row in 10k rows | 9.4 | +944.44% | ms |

### browser clear 10k rows

Clears a 10,000-row keyed DOM in real Chromium to validate happy-dom clear rankings against browser behavior.

| rank | framework | case | value | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | --- |
| 1 | **mreact** | browser clear 10k rows | 2.4 | best | ms |
| 2 | solid | browser clear 10k rows | 2.4 | 0% | ms |
| 3 | **mreact react-compat** | browser clear 10k rows | 4.3 | +79.17% | ms |
| 4 | qwik | browser clear 10k rows | 5.9 | +145.83% | ms |
| 5 | react | browser clear 10k rows | 8.6 | +258.33% | ms |

## Results

| suite | framework | version | case | status | metric | unit | value | diff vs 1st | sample count | min | max | mean | median | p75 | p95 | p99 | standard deviation | raw samples | notes |
| --- | --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| primitive-browser | mreact | workspace | browser create 1k rows | completed | duration | ms | 2.1 | +40% | 7 | 1.7000000000698492 | 3.799999999930151 | 2.4571 | 2.1 | 3.1 | 3.8 | 3.8 | 0.6821 | 3.099999999976717, 3.799999999930151, 2, 2.099999999976717, 2.400000000023283, 1.7000000000698492, 2.1000000000931323 | bundle gzip bytes: 115026 |
| primitive-browser | mreact react-compat | workspace | browser create 1k rows | completed | duration | ms | 4.4 | +193.33% | 7 | 3.300000000046566 | 5.599999999976717 | 4.4714 | 4.4 | 5 | 5.6 | 5.6 | 0.7085 | 4.900000000023283, 5, 3.8999999999068677, 5.599999999976717, 3.300000000046566, 4.199999999953434, 4.400000000023283 | bundle gzip bytes: 115026 |
| primitive-browser | react | workspace | browser create 1k rows | completed | duration | ms | 3.1 | +106.67% | 7 | 3 | 4.800000000046566 | 3.4286 | 3.1 | 3.8 | 4.8 | 4.8 | 0.6135 | 3.799999999930151, 3.099999999976717, 3.099999999976717, 3.099999999976717, 3, 3.099999999976717, 4.800000000046566 | bundle gzip bytes: 115026 |
| primitive-browser | solid | workspace | browser create 1k rows | completed | duration | ms | 1.5 | best | 7 | 1.5 | 1.599999999976717 | 1.5286 | 1.5 | 1.6 | 1.6 | 1.6 | 0.0452 | 1.5, 1.5, 1.5, 1.599999999976717, 1.5, 1.5, 1.599999999976717 | bundle gzip bytes: 115026 |
| primitive-browser | marko | workspace | browser create 1k rows | unsupported | duration | ms | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | Marko's standalone browser primitive fixture requires the Marko client compiler/runtime integration; keep Marko covered by router browser probes until a stable standalone harness is added. |
| primitive-browser | qwik | workspace | browser create 1k rows | completed | duration | ms | 2.7 | +80% | 7 | 2.199999999953434 | 6 | 3.2143 | 2.7 | 4.1 | 6 | 6 | 1.2789 | 6, 2.700000000069849, 2.199999999953434, 2.700000000069849, 2.299999999930151, 2.5, 4.100000000093132 | bundle gzip bytes: 115026 |
| primitive-browser | mreact | workspace | browser update every 10th in 10k rows | completed | duration | ms | 1 | best | 7 | 0.9000000000232831 | 1.599999999976717 | 1.1 | 1 | 1.2 | 1.6 | 1.6 | 0.2268 | 1.599999999976717, 1, 1.1999999999534339, 1.099999999976717, 0.9000000000232831, 0.9000000000232831, 1 | bundle gzip bytes: 115026 |
| primitive-browser | mreact react-compat | workspace | browser update every 10th in 10k rows | completed | duration | ms | 9.2 | +820% | 7 | 9 | 13.800000000046566 | 10.4429 | 9.2 | 12.2 | 13.8 | 13.8 | 1.7598 | 13.800000000046566, 12.20000000006985, 9, 9, 9.199999999953434, 9.199999999953434, 10.70000000006985 | bundle gzip bytes: 115026 |
| primitive-browser | react | workspace | browser update every 10th in 10k rows | completed | duration | ms | 2.8 | +180% | 7 | 2.5 | 6.5 | 3.4286 | 2.8 | 3.7 | 6.5 | 6.5 | 1.3188 | 3.699999999953434, 6.5, 2.799999999930151, 3.300000000046566, 2.699999999953434, 2.5, 2.5 | bundle gzip bytes: 115026 |
| primitive-browser | solid | workspace | browser update every 10th in 10k rows | completed | duration | ms | 7.2 | +620% | 7 | 6.799999999930151 | 7.599999999976717 | 7.1857 | 7.2 | 7.6 | 7.6 | 7.6 | 0.2949 | 7.599999999976717, 7.599999999976717, 7.200000000069849, 7.199999999953434, 7, 6.799999999930151, 6.900000000023283 | bundle gzip bytes: 115026 |
| primitive-browser | marko | workspace | browser update every 10th in 10k rows | unsupported | duration | ms | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | Marko's standalone browser primitive fixture requires the Marko client compiler/runtime integration; keep Marko covered by router browser probes until a stable standalone harness is added. |
| primitive-browser | qwik | workspace | browser update every 10th in 10k rows | completed | duration | ms | 15.5 | +1450% | 7 | 8.900000000023283 | 19.300000000046566 | 14.6857 | 15.5 | 19 | 19.3 | 19.3 | 3.7892 | 12.399999999906868, 15.5, 19.300000000046566, 10.70000000006985, 8.900000000023283, 17, 19 | bundle gzip bytes: 115026 |
| primitive-browser | mreact | workspace | browser select row in 10k rows | completed | duration | ms | 0.9 | best | 7 | 0.9000000000232831 | 1 | 0.9286 | 0.9 | 1 | 1 | 1 | 0.0452 | 0.9000000000232831, 0.9000000000232831, 0.9000000000232831, 1, 0.9000000000232831, 1, 0.9000000000232831 | bundle gzip bytes: 115026 |
| primitive-browser | mreact react-compat | workspace | browser select row in 10k rows | completed | duration | ms | 7.4 | +722.22% | 7 | 7.299999999930151 | 10.599999999976717 | 7.8571 | 7.4 | 7.7 | 10.6 | 10.6 | 1.1274 | 7.399999999906868, 7.300000000046566, 7.399999999906868, 7.299999999930151, 10.599999999976717, 7.699999999953434, 7.299999999930151 | bundle gzip bytes: 115026 |
| primitive-browser | react | workspace | browser select row in 10k rows | completed | duration | ms | 2.3 | +155.56% | 7 | 2.199999999953434 | 8.599999999976717 | 3.3571 | 2.3 | 3.5 | 8.6 | 8.6 | 2.1823 | 2.199999999953434, 2.199999999953434, 2.300000000046566, 2.300000000046566, 8.599999999976717, 2.3999999999068677, 3.5 | bundle gzip bytes: 115026 |
| primitive-browser | solid | workspace | browser select row in 10k rows | completed | duration | ms | 1 | +11.11% | 7 | 0.8000000000465661 | 1.1000000000931323 | 0.9571 | 1 | 1 | 1.1 | 1.1 | 0.0904 | 1.1000000000931323, 1, 0.9000000000232831, 1, 1, 0.8000000000465661, 0.9000000000232831 | bundle gzip bytes: 115026 |
| primitive-browser | marko | workspace | browser select row in 10k rows | unsupported | duration | ms | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | Marko's standalone browser primitive fixture requires the Marko client compiler/runtime integration; keep Marko covered by router browser probes until a stable standalone harness is added. |
| primitive-browser | qwik | workspace | browser select row in 10k rows | completed | duration | ms | 9.4 | +944.44% | 7 | 9 | 21.899999999906868 | 13.8857 | 9.4 | 19.4 | 21.9 | 21.9 | 5.4997 | 21.899999999906868, 9.400000000023283, 9, 19.199999999953434, 9.199999999953434, 9.099999999976717, 19.400000000023283 | bundle gzip bytes: 115026 |
| primitive-browser | mreact | workspace | browser clear 10k rows | completed | duration | ms | 2.4 | best | 7 | 2.3999999999068677 | 2.5 | 2.4429 | 2.4 | 2.5 | 2.5 | 2.5 | 0.0495 | 2.400000000023283, 2.3999999999068677, 2.5, 2.400000000023283, 2.5, 2.5, 2.400000000023283 | bundle gzip bytes: 115026 |
| primitive-browser | mreact react-compat | workspace | browser clear 10k rows | completed | duration | ms | 4.3 | +79.17% | 7 | 4.200000000069849 | 4.5 | 4.3286 | 4.3 | 4.4 | 4.5 | 4.5 | 0.0881 | 4.299999999930151, 4.300000000046566, 4.5, 4.300000000046566, 4.400000000023283, 4.200000000069849, 4.300000000046566 | bundle gzip bytes: 115026 |
| primitive-browser | react | workspace | browser clear 10k rows | completed | duration | ms | 8.6 | +258.33% | 7 | 8.400000000023283 | 9.400000000023283 | 8.6571 | 8.6 | 8.6 | 9.4 | 9.4 | 0.311 | 8.599999999976717, 8.599999999976717, 8.600000000093132, 9.400000000023283, 8.5, 8.5, 8.400000000023283 | bundle gzip bytes: 115026 |
| primitive-browser | solid | workspace | browser clear 10k rows | completed | duration | ms | 2.4 | 0% | 7 | 2.300000000046566 | 4.5 | 2.7 | 2.4 | 2.5 | 4.5 | 4.5 | 0.7368 | 4.5, 2.5, 2.400000000023283, 2.400000000023283, 2.400000000023283, 2.300000000046566, 2.3999999999068677 | bundle gzip bytes: 115026 |
| primitive-browser | marko | workspace | browser clear 10k rows | unsupported | duration | ms | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | Marko's standalone browser primitive fixture requires the Marko client compiler/runtime integration; keep Marko covered by router browser probes until a stable standalone harness is added. |
| primitive-browser | qwik | workspace | browser clear 10k rows | completed | duration | ms | 5.9 | +145.83% | 7 | 5.699999999953434 | 9.300000000046566 | 6.3571 | 5.9 | 6 | 9.3 | 9.3 | 1.2058 | 5.699999999953434, 5.900000000023283, 9.300000000046566, 6, 5.800000000046566, 5.800000000046566, 6 | bundle gzip bytes: 115026 |
