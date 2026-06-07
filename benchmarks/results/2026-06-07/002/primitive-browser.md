# Primitive Browser Benchmark

## Environment

- Date: 2026-06-07
- Git commit: 4dab6e4378238459374b7c5650c176c49c3dd88e
- Node: v24.16.0
- NODE_ENV: production
- pnpm: 10.19.0
- Platform: linux x64
- CPU: AMD EPYC 7763 64-Core Processor (4)
- Memory: 16766423040 bytes
- Package versions:
  - @builder.io/qwik: 1.19.2
  - @playwright/test: 1.60.0
  - @reckona/mreact-compat: 0.0.146
  - @reckona/mreact-reactive-core: 0.0.146
  - @reckona/mreact-reactive-dom: 0.0.146
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
| 2 | qwik | browser create 1k rows | 2.4 | +60% | ms |
| 3 | **mreact** | browser create 1k rows | 2.5 | +66.67% | ms |
| 4 | react | browser create 1k rows | 3.1 | +106.67% | ms |
| 5 | **mreact react-compat** | browser create 1k rows | 4.5 | +200% | ms |

### browser update every 10th in 10k rows

Updates every tenth row in a 10,000-row keyed DOM in real Chromium, exposing real DOM update costs hidden by happy-dom.

| rank | framework | case | value | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | --- |
| 1 | **mreact** | browser update every 10th in 10k rows | 1.3 | best | ms |
| 2 | react | browser update every 10th in 10k rows | 2.7 | +107.69% | ms |
| 3 | solid | browser update every 10th in 10k rows | 7.6 | +484.62% | ms |
| 4 | qwik | browser update every 10th in 10k rows | 10.2 | +684.62% | ms |
| 5 | **mreact react-compat** | browser update every 10th in 10k rows | 14.9 | +1046.15% | ms |

### browser select row in 10k rows

Toggles selection attributes for one row in a 10,000-row keyed DOM in real Chromium.

| rank | framework | case | value | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | --- |
| 1 | **mreact** | browser select row in 10k rows | 0.9 | best | ms |
| 2 | solid | browser select row in 10k rows | 0.9 | 0% | ms |
| 3 | react | browser select row in 10k rows | 2.7 | +200% | ms |
| 4 | **mreact react-compat** | browser select row in 10k rows | 7.8 | +766.67% | ms |
| 5 | qwik | browser select row in 10k rows | 8.9 | +888.89% | ms |

### browser clear 10k rows

Clears a 10,000-row keyed DOM in real Chromium to validate happy-dom clear rankings against browser behavior.

| rank | framework | case | value | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | --- |
| 1 | solid | browser clear 10k rows | 2.4 | best | ms |
| 2 | **mreact** | browser clear 10k rows | 2.5 | +4.17% | ms |
| 3 | **mreact react-compat** | browser clear 10k rows | 4.3 | +79.17% | ms |
| 4 | qwik | browser clear 10k rows | 5.9 | +145.83% | ms |
| 5 | react | browser clear 10k rows | 15.5 | +545.83% | ms |

## Results

| suite | framework | version | case | status | metric | unit | value | diff vs 1st | sample count | min | max | mean | median | p75 | p95 | p99 | standard deviation | raw samples | notes |
| --- | --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| primitive-browser | mreact | workspace | browser create 1k rows | completed | duration | ms | 2.5 | +66.67% | 7 | 2 | 3.400000000023283 | 2.6429 | 2.5 | 3.1 | 3.4 | 3.4 | 0.5206 | 3.1000000000931323, 3.400000000023283, 2.5, 2, 2.400000000023283, 3.099999999976717, 2 | bundle gzip bytes: 115363 |
| primitive-browser | mreact react-compat | workspace | browser create 1k rows | completed | duration | ms | 4.5 | +200% | 7 | 3.5 | 6 | 4.6571 | 4.5 | 4.9 | 6 | 6 | 0.7007 | 4.5, 4.300000000046566, 6, 4.5, 4.899999999906868, 3.5, 4.899999999906868 | bundle gzip bytes: 115363 |
| primitive-browser | react | workspace | browser create 1k rows | completed | duration | ms | 3.1 | +106.67% | 7 | 2.900000000023283 | 3.800000000046566 | 3.1857 | 3.1 | 3.3 | 3.8 | 3.8 | 0.2799 | 3.800000000046566, 3.199999999953434, 3.300000000046566, 3, 3, 3.099999999976717, 2.900000000023283 | bundle gzip bytes: 115363 |
| primitive-browser | solid | workspace | browser create 1k rows | completed | duration | ms | 1.5 | best | 7 | 1.5 | 1.6999999999534339 | 1.5571 | 1.5 | 1.6 | 1.7 | 1.7 | 0.0728 | 1.5, 1.6999999999534339, 1.5, 1.6000000000931323, 1.5, 1.5, 1.6000000000931323 | bundle gzip bytes: 115363 |
| primitive-browser | marko | workspace | browser create 1k rows | unsupported | duration | ms | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | Marko's standalone browser primitive fixture requires the Marko client compiler/runtime integration; keep Marko covered by router browser probes until a stable standalone harness is added. |
| primitive-browser | qwik | workspace | browser create 1k rows | completed | duration | ms | 2.4 | +60% | 7 | 2.200000000069849 | 3 | 2.4571 | 2.4 | 2.5 | 3 | 3 | 0.2382 | 3, 2.400000000023283, 2.200000000069849, 2.3999999999068677, 2.300000000046566, 2.5, 2.400000000023283 | bundle gzip bytes: 115363 |
| primitive-browser | mreact | workspace | browser update every 10th in 10k rows | completed | duration | ms | 1.3 | best | 7 | 1.1999999999534339 | 3.300000000046566 | 1.5857 | 1.3 | 1.4 | 3.3 | 3.3 | 0.7039 | 3.300000000046566, 1.1999999999534339, 1.1999999999534339, 1.3000000000465661, 1.3999999999068677, 1.2999999999301508, 1.400000000023283 | bundle gzip bytes: 115363 |
| primitive-browser | mreact react-compat | workspace | browser update every 10th in 10k rows | completed | duration | ms | 14.9 | +1046.15% | 7 | 9 | 17.599999999976717 | 13.3571 | 14.9 | 17 | 17.6 | 17.6 | 3.7648 | 17, 14.899999999906868, 16.70000000006985, 9, 9.20000000006985, 17.599999999976717, 9.099999999976717 | bundle gzip bytes: 115363 |
| primitive-browser | react | workspace | browser update every 10th in 10k rows | completed | duration | ms | 2.7 | +107.69% | 7 | 2.6000000000931323 | 3.5 | 2.8714 | 2.7 | 3 | 3.5 | 3.5 | 0.2864 | 3.5, 3, 2.900000000023283, 2.700000000069849, 2.699999999953434, 2.699999999953434, 2.6000000000931323 | bundle gzip bytes: 115363 |
| primitive-browser | solid | workspace | browser update every 10th in 10k rows | completed | duration | ms | 7.6 | +484.62% | 7 | 7.5 | 13.099999999976717 | 8.3857 | 7.6 | 7.7 | 13.1 | 13.1 | 1.9261 | 7.5, 7.599999999976717, 7.699999999953434, 7.700000000069849, 13.099999999976717, 7.5, 7.600000000093132 | bundle gzip bytes: 115363 |
| primitive-browser | marko | workspace | browser update every 10th in 10k rows | unsupported | duration | ms | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | Marko's standalone browser primitive fixture requires the Marko client compiler/runtime integration; keep Marko covered by router browser probes until a stable standalone harness is added. |
| primitive-browser | qwik | workspace | browser update every 10th in 10k rows | completed | duration | ms | 10.2 | +684.62% | 7 | 9.699999999953434 | 22.900000000023283 | 13.2143 | 10.2 | 18.8 | 22.9 | 22.9 | 4.9697 | 22.900000000023283, 11.099999999976717, 10.20000000006985, 18.79999999993015, 9.900000000023283, 9.699999999953434, 9.899999999906868 | bundle gzip bytes: 115363 |
| primitive-browser | mreact | workspace | browser select row in 10k rows | completed | duration | ms | 0.9 | best | 7 | 0.8000000000465661 | 1 | 0.9143 | 0.9 | 1 | 1 | 1 | 0.0639 | 0.9000000000232831, 0.9000000000232831, 1, 0.9000000000232831, 0.9000000000232831, 1, 0.8000000000465661 | bundle gzip bytes: 115363 |
| primitive-browser | mreact react-compat | workspace | browser select row in 10k rows | completed | duration | ms | 7.8 | +766.67% | 7 | 7.600000000093132 | 17.5 | 9.4429 | 7.8 | 9.8 | 17.5 | 17.5 | 3.3649 | 7.799999999930151, 7.699999999953434, 7.799999999930151, 7.600000000093132, 17.5, 7.900000000023283, 9.800000000046566 | bundle gzip bytes: 115363 |
| primitive-browser | react | workspace | browser select row in 10k rows | completed | duration | ms | 2.7 | +200% | 7 | 2.400000000023283 | 8.599999999976717 | 4.0429 | 2.7 | 5.3 | 8.6 | 8.6 | 2.14 | 4.400000000023283, 5.300000000046566, 2.700000000069849, 2.5, 2.400000000023283, 8.599999999976717, 2.400000000023283 | bundle gzip bytes: 115363 |
| primitive-browser | solid | workspace | browser select row in 10k rows | completed | duration | ms | 0.9 | 0% | 7 | 0.8000000000465661 | 0.9000000000232831 | 0.8857 | 0.9 | 0.9 | 0.9 | 0.9 | 0.035 | 0.8999999999068677, 0.9000000000232831, 0.8999999999068677, 0.8999999999068677, 0.9000000000232831, 0.8999999999068677, 0.8000000000465661 | bundle gzip bytes: 115363 |
| primitive-browser | marko | workspace | browser select row in 10k rows | unsupported | duration | ms | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | Marko's standalone browser primitive fixture requires the Marko client compiler/runtime integration; keep Marko covered by router browser probes until a stable standalone harness is added. |
| primitive-browser | qwik | workspace | browser select row in 10k rows | completed | duration | ms | 8.9 | +888.89% | 7 | 8.599999999976717 | 16.5 | 11.0857 | 8.9 | 15.5 | 16.5 | 16.5 | 3.1827 | 10.599999999976717, 15.5, 8.79999999993015, 8.900000000023283, 16.5, 8.699999999953434, 8.599999999976717 | bundle gzip bytes: 115363 |
| primitive-browser | mreact | workspace | browser clear 10k rows | completed | duration | ms | 2.5 | +4.17% | 7 | 2.400000000023283 | 2.5 | 2.4571 | 2.5 | 2.5 | 2.5 | 2.5 | 0.0495 | 2.400000000023283, 2.5, 2.5, 2.400000000023283, 2.5, 2.5, 2.400000000023283 | bundle gzip bytes: 115363 |
| primitive-browser | mreact react-compat | workspace | browser clear 10k rows | completed | duration | ms | 4.3 | +79.17% | 7 | 4.199999999953434 | 4.400000000023283 | 4.2857 | 4.3 | 4.4 | 4.4 | 4.4 | 0.0833 | 4.400000000023283, 4.400000000023283, 4.200000000069849, 4.299999999930151, 4.199999999953434, 4.199999999953434, 4.300000000046566 | bundle gzip bytes: 115363 |
| primitive-browser | react | workspace | browser clear 10k rows | completed | duration | ms | 15.5 | +545.83% | 7 | 14.300000000046566 | 15.599999999976717 | 15.0429 | 15.5 | 15.6 | 15.6 | 15.6 | 0.5876 | 15.599999999976717, 15.599999999976717, 15.5, 15.5, 14.399999999906868, 14.300000000046566, 14.399999999906868 | bundle gzip bytes: 115363 |
| primitive-browser | solid | workspace | browser clear 10k rows | completed | duration | ms | 2.4 | best | 7 | 2.300000000046566 | 2.5 | 2.4 | 2.4 | 2.5 | 2.5 | 2.5 | 0.0756 | 2.5, 2.5, 2.400000000023283, 2.300000000046566, 2.300000000046566, 2.400000000023283, 2.400000000023283 | bundle gzip bytes: 115363 |
| primitive-browser | marko | workspace | browser clear 10k rows | unsupported | duration | ms | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | Marko's standalone browser primitive fixture requires the Marko client compiler/runtime integration; keep Marko covered by router browser probes until a stable standalone harness is added. |
| primitive-browser | qwik | workspace | browser clear 10k rows | completed | duration | ms | 5.9 | +145.83% | 7 | 5.799999999930151 | 6.199999999953434 | 5.9429 | 5.9 | 6 | 6.2 | 6.2 | 0.1294 | 6.199999999953434, 6, 5.900000000023283, 6, 5.799999999930151, 5.900000000023283, 5.800000000046566 | bundle gzip bytes: 115363 |
