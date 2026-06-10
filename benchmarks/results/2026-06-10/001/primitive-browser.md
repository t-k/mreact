# Primitive Browser Benchmark

## Environment

- Date: 2026-06-10
- Git commit: 12f39fa99cbdaca41b23aef27683815945fa627c
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
| 1 | solid | browser create 1k rows | 1.7 | best | ms |
| 2 | **mreact** | browser create 1k rows | 2.6 | +52.94% | ms |
| 3 | qwik | browser create 1k rows | 3.3 | +94.12% | ms |
| 4 | react | browser create 1k rows | 3.4 | +100% | ms |
| 5 | **mreact react-compat** | browser create 1k rows | 4.9 | +188.24% | ms |

### browser update every 10th in 10k rows

Updates every tenth row in a 10,000-row keyed DOM in real Chromium, exposing real DOM update costs hidden by happy-dom.

| rank | framework | case | value | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | --- |
| 1 | **mreact** | browser update every 10th in 10k rows | 1.3 | best | ms |
| 2 | react | browser update every 10th in 10k rows | 2.7 | +107.69% | ms |
| 3 | solid | browser update every 10th in 10k rows | 7.8 | +500% | ms |
| 4 | **mreact react-compat** | browser update every 10th in 10k rows | 8.7 | +569.23% | ms |
| 5 | qwik | browser update every 10th in 10k rows | 11.9 | +815.38% | ms |

### browser select row in 10k rows

Toggles selection attributes for one row in a 10,000-row keyed DOM in real Chromium.

| rank | framework | case | value | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | --- |
| 1 | solid | browser select row in 10k rows | 0.9 | best | ms |
| 2 | **mreact** | browser select row in 10k rows | 1 | +11.11% | ms |
| 3 | react | browser select row in 10k rows | 2.4 | +166.67% | ms |
| 4 | **mreact react-compat** | browser select row in 10k rows | 7.5 | +733.33% | ms |
| 5 | qwik | browser select row in 10k rows | 9.5 | +955.56% | ms |

### browser clear 10k rows

Clears a 10,000-row keyed DOM in real Chromium to validate happy-dom clear rankings against browser behavior.

| rank | framework | case | value | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | --- |
| 1 | **mreact** | browser clear 10k rows | 2.4 | best | ms |
| 2 | solid | browser clear 10k rows | 2.4 | 0% | ms |
| 3 | **mreact react-compat** | browser clear 10k rows | 4.3 | +79.17% | ms |
| 4 | qwik | browser clear 10k rows | 6.1 | +154.17% | ms |
| 5 | react | browser clear 10k rows | 10.2 | +325% | ms |

## Results

| suite | framework | version | case | status | metric | unit | value | diff vs 1st | sample count | min | max | mean | median | p75 | p95 | p99 | standard deviation | raw samples | notes |
| --- | --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| primitive-browser | mreact | workspace | browser create 1k rows | completed | duration | ms | 2.6 | +52.94% | 7 | 2 | 3.5 | 2.5857 | 2.6 | 3.4 | 3.5 | 3.5 | 0.601 | 3.400000000023283, 3.5, 2.599999999976717, 2, 2, 2.599999999976717, 2 | bundle gzip bytes: 115682 |
| primitive-browser | mreact react-compat | workspace | browser create 1k rows | completed | duration | ms | 4.9 | +188.24% | 7 | 3.5 | 6.300000000046566 | 4.9429 | 4.9 | 6 | 6.3 | 6.3 | 1.0083 | 6.300000000046566, 3.900000000023283, 5.699999999953434, 4.299999999930151, 6, 3.5, 4.900000000023283 | bundle gzip bytes: 115682 |
| primitive-browser | react | workspace | browser create 1k rows | completed | duration | ms | 3.4 | +100% | 7 | 3.200000000069849 | 4.200000000069849 | 3.5429 | 3.4 | 3.7 | 4.2 | 4.2 | 0.3017 | 4.200000000069849, 3.5, 3.700000000069849, 3.400000000023283, 3.3999999999068677, 3.200000000069849, 3.400000000023283 | bundle gzip bytes: 115682 |
| primitive-browser | solid | workspace | browser create 1k rows | completed | duration | ms | 1.7 | best | 7 | 1.599999999976717 | 2 | 1.7 | 1.7 | 1.7 | 2 | 2 | 0.1309 | 1.6999999999534339, 2, 1.6999999999534339, 1.599999999976717, 1.599999999976717, 1.7000000000698492, 1.599999999976717 | bundle gzip bytes: 115682 |
| primitive-browser | marko | workspace | browser create 1k rows | unsupported | duration | ms | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | Marko's standalone browser primitive fixture requires the Marko client compiler/runtime integration; keep Marko covered by router browser probes until a stable standalone harness is added. |
| primitive-browser | qwik | workspace | browser create 1k rows | completed | duration | ms | 3.3 | +94.12% | 7 | 2.400000000023283 | 4.800000000046566 | 3.3714 | 3.3 | 4.2 | 4.8 | 4.8 | 0.8362 | 3.300000000046566, 2.400000000023283, 2.400000000023283, 3.599999999976717, 4.200000000069849, 4.800000000046566, 2.900000000023283 | bundle gzip bytes: 115682 |
| primitive-browser | mreact | workspace | browser update every 10th in 10k rows | completed | duration | ms | 1.3 | best | 7 | 1.099999999976717 | 1.8000000000465661 | 1.3571 | 1.3 | 1.5 | 1.8 | 1.8 | 0.2195 | 1.8000000000465661, 1.1999999999534339, 1.099999999976717, 1.2000000000698492, 1.5, 1.400000000023283, 1.2999999999301508 | bundle gzip bytes: 115682 |
| primitive-browser | mreact react-compat | workspace | browser update every 10th in 10k rows | completed | duration | ms | 8.7 | +569.23% | 7 | 8.300000000046566 | 15.099999999976717 | 10 | 8.7 | 12.2 | 15.1 | 15.1 | 2.4401 | 15.099999999976717, 12.199999999953434, 8.699999999953434, 8.300000000046566, 8.79999999993015, 8.5, 8.399999999906868 | bundle gzip bytes: 115682 |
| primitive-browser | react | workspace | browser update every 10th in 10k rows | completed | duration | ms | 2.7 | +107.69% | 7 | 2.699999999953434 | 3.5 | 2.8571 | 2.7 | 2.9 | 3.5 | 3.5 | 0.2718 | 3.5, 2.800000000046566, 2.900000000023283, 2.700000000069849, 2.699999999953434, 2.700000000069849, 2.700000000069849 | bundle gzip bytes: 115682 |
| primitive-browser | solid | workspace | browser update every 10th in 10k rows | completed | duration | ms | 7.8 | +500% | 7 | 7 | 8.20000000006985 | 7.7143 | 7.8 | 8 | 8.2 | 8.2 | 0.387 | 7.800000000046566, 7.799999999930151, 7.900000000023283, 8, 8.20000000006985, 7.300000000046566, 7 | bundle gzip bytes: 115682 |
| primitive-browser | marko | workspace | browser update every 10th in 10k rows | unsupported | duration | ms | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | Marko's standalone browser primitive fixture requires the Marko client compiler/runtime integration; keep Marko covered by router browser probes until a stable standalone harness is added. |
| primitive-browser | qwik | workspace | browser update every 10th in 10k rows | completed | duration | ms | 11.9 | +815.38% | 7 | 9 | 26.099999999976717 | 15.0857 | 11.9 | 20 | 26.1 | 26.1 | 6.0934 | 10.79999999993015, 18.699999999953434, 9, 9.099999999976717, 20, 26.099999999976717, 11.900000000023283 | bundle gzip bytes: 115682 |
| primitive-browser | mreact | workspace | browser select row in 10k rows | completed | duration | ms | 1 | +11.11% | 7 | 0.9000000000232831 | 1 | 0.9571 | 1 | 1 | 1 | 1 | 0.0495 | 1, 1, 1, 0.9000000000232831, 0.9000000000232831, 0.9000000000232831, 1 | bundle gzip bytes: 115682 |
| primitive-browser | mreact react-compat | workspace | browser select row in 10k rows | completed | duration | ms | 7.5 | +733.33% | 7 | 7.399999999906868 | 17.5 | 9.0857 | 7.5 | 8.6 | 17.5 | 17.5 | 3.4564 | 7.5, 17.5, 7.5, 7.399999999906868, 8.599999999976717, 7.599999999976717, 7.5 | bundle gzip bytes: 115682 |
| primitive-browser | react | workspace | browser select row in 10k rows | completed | duration | ms | 2.4 | +166.67% | 7 | 2.299999999930151 | 3.5 | 2.5143 | 2.4 | 2.4 | 3.5 | 3.5 | 0.4051 | 2.299999999930151, 2.300000000046566, 2.400000000023283, 2.300000000046566, 2.400000000023283, 2.400000000023283, 3.5 | bundle gzip bytes: 115682 |
| primitive-browser | solid | workspace | browser select row in 10k rows | completed | duration | ms | 0.9 | best | 7 | 0.9000000000232831 | 1.099999999976717 | 0.9571 | 0.9 | 1 | 1.1 | 1.1 | 0.0728 | 0.9000000000232831, 0.9000000000232831, 1.099999999976717, 0.9000000000232831, 1, 1, 0.9000000000232831 | bundle gzip bytes: 115682 |
| primitive-browser | marko | workspace | browser select row in 10k rows | unsupported | duration | ms | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | Marko's standalone browser primitive fixture requires the Marko client compiler/runtime integration; keep Marko covered by router browser probes until a stable standalone harness is added. |
| primitive-browser | qwik | workspace | browser select row in 10k rows | completed | duration | ms | 9.5 | +955.56% | 7 | 9.20000000006985 | 20 | 12.3714 | 9.5 | 19.4 | 20 | 20 | 4.6401 | 9.5, 9.300000000046566, 19.400000000023283, 9.5, 9.20000000006985, 20, 9.699999999953434 | bundle gzip bytes: 115682 |
| primitive-browser | mreact | workspace | browser clear 10k rows | completed | duration | ms | 2.4 | best | 7 | 2.400000000023283 | 4 | 2.7286 | 2.4 | 3 | 4 | 4 | 0.5573 | 2.400000000023283, 2.400000000023283, 4, 3, 2.5, 2.400000000023283, 2.400000000023283 | bundle gzip bytes: 115682 |
| primitive-browser | mreact react-compat | workspace | browser clear 10k rows | completed | duration | ms | 4.3 | +79.17% | 7 | 4.199999999953434 | 4.5 | 4.2857 | 4.3 | 4.3 | 4.5 | 4.5 | 0.099 | 4.199999999953434, 4.300000000046566, 4.300000000046566, 4.200000000069849, 4.199999999953434, 4.5, 4.300000000046566 | bundle gzip bytes: 115682 |
| primitive-browser | react | workspace | browser clear 10k rows | completed | duration | ms | 10.2 | +325% | 7 | 10.099999999976717 | 10.800000000046566 | 10.2714 | 10.2 | 10.4 | 10.8 | 10.8 | 0.2373 | 10.199999999953434, 10.099999999976717, 10.099999999976717, 10.800000000046566, 10.199999999953434, 10.400000000023283, 10.099999999976717 | bundle gzip bytes: 115682 |
| primitive-browser | solid | workspace | browser clear 10k rows | completed | duration | ms | 2.4 | 0% | 7 | 2.299999999930151 | 9.099999999976717 | 3.3714 | 2.4 | 2.5 | 9.1 | 9.1 | 2.3395 | 2.400000000023283, 2.3999999999068677, 2.5, 2.299999999930151, 2.400000000023283, 9.099999999976717, 2.5 | bundle gzip bytes: 115682 |
| primitive-browser | marko | workspace | browser clear 10k rows | unsupported | duration | ms | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | Marko's standalone browser primitive fixture requires the Marko client compiler/runtime integration; keep Marko covered by router browser probes until a stable standalone harness is added. |
| primitive-browser | qwik | workspace | browser clear 10k rows | completed | duration | ms | 6.1 | +154.17% | 7 | 5.900000000023283 | 17 | 7.9286 | 6.1 | 8.4 | 17 | 17 | 3.7946 | 17, 5.900000000023283, 6.099999999976717, 6.199999999953434, 8.399999999906868, 5.900000000023283, 6 | bundle gzip bytes: 115682 |
