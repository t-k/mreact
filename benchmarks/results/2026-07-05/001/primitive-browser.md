# Primitive Browser Benchmark

## Environment

- Date: 2026-07-05
- Git commit: 9d0b81e1acf425488d7c63268c4f6201c8684852
- Node: v24.18.0
- NODE_ENV: production
- pnpm: 10.19.0
- Platform: linux x64
- CPU: AMD EPYC 9V74 80-Core Processor (4)
- Memory: 16766423040 bytes
- Package versions:
  - @angular/core: 22.0.1
  - @builder.io/qwik: 1.20.0
  - @playwright/test: 1.60.0
  - @reckona/mreact-compat: 0.0.186
  - @reckona/mreact-reactive-core: 0.0.186
  - @reckona/mreact-reactive-dom: 0.0.186
  - marko: 5.39.2
  - react: 19.2.7
  - react-dom: 19.2.7
  - solid-js: 1.9.13
  - svelte: 5.56.3
  - vite: 8.0.16
  - vue: 3.5.38

## Rankings

### browser create 1k rows

Creates 1,000 keyed DOM rows in real Chromium, mirroring the primitive create case without happy-dom.

| rank | framework | case | value | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | --- |
| 1 | solid | browser create 1k rows | 1.7 | best | ms |
| 2 | qwik | browser create 1k rows | 2.7 | +58.82% | ms |
| 3 | **mreact react-compat** | browser create 1k rows | 2.8 | +64.71% | ms |
| 4 | **mreact** | browser create 1k rows | 3 | +76.47% | ms |
| 5 | react | browser create 1k rows | 3.4 | +100% | ms |
| 6 | vue | browser create 1k rows | 3.4 | +100% | ms |
| 7 | svelte | browser create 1k rows | 3.7 | +117.65% | ms |
| 8 | angular | browser create 1k rows | 5.4 | +217.65% | ms |

### browser update every 10th in 10k rows

Updates every tenth row in a 10,000-row keyed DOM in real Chromium, exposing real DOM update costs hidden by happy-dom.

| rank | framework | case | value | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | --- |
| 1 | **mreact** | browser update every 10th in 10k rows | 1 | best | ms |
| 2 | svelte | browser update every 10th in 10k rows | 2.8 | +180% | ms |
| 3 | react | browser update every 10th in 10k rows | 2.9 | +190% | ms |
| 4 | angular | browser update every 10th in 10k rows | 4 | +300% | ms |
| 5 | **mreact react-compat** | browser update every 10th in 10k rows | 4.8 | +380% | ms |
| 6 | solid | browser update every 10th in 10k rows | 7.1 | +610% | ms |
| 7 | qwik | browser update every 10th in 10k rows | 9.8 | +880% | ms |
| 8 | vue | browser update every 10th in 10k rows | 13.2 | +1220% | ms |

### browser select row in 10k rows

Toggles selection attributes for one row in a 10,000-row keyed DOM in real Chromium.

| rank | framework | case | value | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | --- |
| 1 | solid | browser select row in 10k rows | 0.9 | best | ms |
| 2 | **mreact** | browser select row in 10k rows | 1.1 | +22.22% | ms |
| 3 | react | browser select row in 10k rows | 2.4 | +166.67% | ms |
| 4 | angular | browser select row in 10k rows | 3.5 | +288.89% | ms |
| 5 | **mreact react-compat** | browser select row in 10k rows | 3.5 | +288.89% | ms |
| 6 | svelte | browser select row in 10k rows | 3.8 | +322.22% | ms |
| 7 | qwik | browser select row in 10k rows | 9.6 | +966.67% | ms |
| 8 | vue | browser select row in 10k rows | 10.8 | +1100% | ms |

### browser clear 10k rows

Clears a 10,000-row keyed DOM in real Chromium to validate happy-dom clear rankings against browser behavior.

| rank | framework | case | value | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | --- |
| 1 | **mreact** | browser clear 10k rows | 2.1 | best | ms |
| 2 | solid | browser clear 10k rows | 2.4 | +14.29% | ms |
| 3 | **mreact react-compat** | browser clear 10k rows | 4.5 | +114.29% | ms |
| 4 | vue | browser clear 10k rows | 4.7 | +123.81% | ms |
| 5 | qwik | browser clear 10k rows | 6 | +185.71% | ms |
| 6 | react | browser clear 10k rows | 8.4 | +300% | ms |
| 7 | angular | browser clear 10k rows | 8.5 | +304.76% | ms |
| 8 | svelte | browser clear 10k rows | 8.8 | +319.05% | ms |

## Results

| suite | framework | version | case | status | metric | unit | value | diff vs 1st | sample count | min | max | mean | median | p75 | p95 | p99 | standard deviation | raw samples | notes |
| --- | --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| primitive-browser | mreact | workspace | browser create 1k rows | completed | duration | ms | 3 | +76.47% | 7 | 2.2000000000116415 | 4 | 3.0857 | 3 | 3.7 | 4 | 4 | 0.5668 | 3.7000000000116415, 3, 2.7000000000116415, 3.2000000000116415, 4, 2.2000000000116415, 2.7999999999883585 | bundle gzip bytes: 474249 |
| primitive-browser | mreact react-compat | workspace | browser create 1k rows | completed | duration | ms | 2.8 | +64.71% | 7 | 2 | 3.7999999999883585 | 2.8143 | 2.8 | 3.5 | 3.8 | 3.8 | 0.6034 | 2.8999999999650754, 2.7999999999883585, 3.7999999999883585, 3.5, 2.3999999999650754, 2, 2.2999999999883585 | bundle gzip bytes: 474249 |
| primitive-browser | react | workspace | browser create 1k rows | completed | duration | ms | 3.4 | +100% | 7 | 3.300000000046566 | 4.100000000034925 | 3.5143 | 3.4 | 3.6 | 4.1 | 4.1 | 0.2531 | 4.100000000034925, 3.3999999999650754, 3.599999999976717, 3.400000000023283, 3.300000000046566, 3.3999999999650754, 3.3999999999650754 | bundle gzip bytes: 474249 |
| primitive-browser | solid | workspace | browser create 1k rows | completed | duration | ms | 1.7 | best | 7 | 1.5 | 1.7999999999883585 | 1.6714 | 1.7 | 1.8 | 1.8 | 1.8 | 0.103 | 1.7999999999883585, 1.7000000000116415, 1.7999999999883585, 1.6999999999534339, 1.5, 1.599999999976717, 1.599999999976717 | bundle gzip bytes: 474249 |
| primitive-browser | vue | workspace | browser create 1k rows | completed | duration | ms | 3.4 | +100% | 7 | 3.1000000000349246 | 3.900000000023283 | 3.4571 | 3.4 | 3.7 | 3.9 | 3.9 | 0.2665 | 3.900000000023283, 3.6000000000349246, 3.400000000023283, 3.7000000000116415, 3.2999999999883585, 3.1000000000349246, 3.2000000000116415 | bundle gzip bytes: 474249 |
| primitive-browser | svelte | workspace | browser create 1k rows | completed | duration | ms | 3.7 | +117.65% | 7 | 3.599999999976717 | 20.79999999998836 | 6.5286 | 3.7 | 5.5 | 20.8 | 20.8 | 5.8661 | 4.7999999999883585, 20.79999999998836, 5.5, 3.599999999976717, 3.6000000000349246, 3.7000000000116415, 3.699999999953434 | bundle gzip bytes: 474249 |
| primitive-browser | angular | workspace | browser create 1k rows | completed | duration | ms | 5.4 | +217.65% | 7 | 4.7000000000116415 | 11.5 | 6.1143 | 5.4 | 5.8 | 11.5 | 11.5 | 2.2261 | 5.7999999999883585, 4.800000000046566, 4.7000000000116415, 5.2000000000116415, 5.400000000023283, 5.400000000023283, 11.5 | bundle gzip bytes: 474249 |
| primitive-browser | marko | workspace | browser create 1k rows | unsupported | duration | ms | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | Marko's standalone browser primitive fixture requires the Marko client compiler/runtime integration; keep Marko covered by router browser probes until a stable standalone harness is added. |
| primitive-browser | qwik | workspace | browser create 1k rows | completed | duration | ms | 2.7 | +58.82% | 7 | 2.5 | 3 | 2.7286 | 2.7 | 2.8 | 3 | 3 | 0.1485 | 2.599999999976717, 2.5, 2.7000000000116415, 2.800000000046566, 2.7999999999883585, 3, 2.7000000000116415 | bundle gzip bytes: 474249 |
| primitive-browser | mreact | workspace | browser update every 10th in 10k rows | completed | duration | ms | 1 | best | 7 | 0.7000000000116415 | 1.7000000000116415 | 1.0571 | 1 | 1.3 | 1.7 | 1.7 | 0.3156 | 1.7000000000116415, 0.7999999999883585, 1.2999999999883585, 1, 1, 0.9000000000232831, 0.7000000000116415 | bundle gzip bytes: 474249 |
| primitive-browser | mreact react-compat | workspace | browser update every 10th in 10k rows | completed | duration | ms | 4.8 | +380% | 7 | 4.599999999976717 | 5.2999999999883585 | 4.8143 | 4.8 | 4.8 | 5.3 | 5.3 | 0.21 | 5.2999999999883585, 4.7999999999883585, 4.7999999999883585, 4.7999999999883585, 4.599999999976717, 4.7000000000116415, 4.699999999953434 | bundle gzip bytes: 474249 |
| primitive-browser | react | workspace | browser update every 10th in 10k rows | completed | duration | ms | 2.9 | +190% | 7 | 2.8999999999650754 | 17.400000000023283 | 5.1429 | 2.9 | 3.7 | 17.4 | 17.4 | 5.0119 | 3.7000000000116415, 3.2999999999883585, 2.900000000023283, 2.8999999999650754, 2.900000000023283, 2.900000000023283, 17.400000000023283 | bundle gzip bytes: 474249 |
| primitive-browser | solid | workspace | browser update every 10th in 10k rows | completed | duration | ms | 7.1 | +610% | 7 | 6.899999999965075 | 20.79999999998836 | 9.0143 | 7.1 | 7.4 | 20.8 | 20.8 | 4.8144 | 7.399999999965075, 7.100000000034925, 7.100000000034925, 6.899999999965075, 6.899999999965075, 20.79999999998836, 6.900000000023283 | bundle gzip bytes: 474249 |
| primitive-browser | vue | workspace | browser update every 10th in 10k rows | completed | duration | ms | 13.2 | +1220% | 7 | 11.200000000011642 | 36.20000000001164 | 17.5 | 13.2 | 23.6 | 36.2 | 36.2 | 8.5905 | 11.200000000011642, 36.20000000001164, 13, 13.200000000011642, 11.200000000011642, 23.599999999976717, 14.099999999976717 | bundle gzip bytes: 474249 |
| primitive-browser | svelte | workspace | browser update every 10th in 10k rows | completed | duration | ms | 2.8 | +180% | 7 | 2.5 | 4.100000000034925 | 3.2286 | 2.8 | 4.1 | 4.1 | 4.1 | 0.7323 | 4.099999999976717, 2.7999999999883585, 2.599999999976717, 2.5, 4.100000000034925, 4, 2.5 | bundle gzip bytes: 474249 |
| primitive-browser | angular | workspace | browser update every 10th in 10k rows | completed | duration | ms | 4 | +300% | 7 | 3.8999999999650754 | 5 | 4.1571 | 4 | 4.2 | 5 | 5 | 0.3659 | 4.2000000000116415, 5, 4.2000000000116415, 4, 3.900000000023283, 3.8999999999650754, 3.900000000023283 | bundle gzip bytes: 474249 |
| primitive-browser | marko | workspace | browser update every 10th in 10k rows | unsupported | duration | ms | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | Marko's standalone browser primitive fixture requires the Marko client compiler/runtime integration; keep Marko covered by router browser probes until a stable standalone harness is added. |
| primitive-browser | qwik | workspace | browser update every 10th in 10k rows | completed | duration | ms | 9.8 | +880% | 7 | 8.700000000011642 | 46.20000000001164 | 16.6571 | 9.8 | 21.2 | 46.2 | 46.2 | 12.7053 | 9.700000000011642, 21.20000000001164, 9.5, 8.700000000011642, 46.20000000001164, 11.5, 9.799999999988358 | bundle gzip bytes: 474249 |
| primitive-browser | mreact | workspace | browser select row in 10k rows | completed | duration | ms | 1.1 | +22.22% | 7 | 0.9000000000232831 | 1.2000000000116415 | 1.0571 | 1.1 | 1.1 | 1.2 | 1.2 | 0.0904 | 1, 0.9000000000232831, 1, 1.2000000000116415, 1.1000000000349246, 1.1000000000349246, 1.1000000000349246 | bundle gzip bytes: 474249 |
| primitive-browser | mreact react-compat | workspace | browser select row in 10k rows | completed | duration | ms | 3.5 | +288.89% | 7 | 3.3999999999650754 | 7 | 4.2 | 3.5 | 5 | 7 | 7 | 1.2593 | 3.3999999999650754, 3.5, 5, 3.5, 3.3999999999650754, 7, 3.6000000000349246 | bundle gzip bytes: 474249 |
| primitive-browser | react | workspace | browser select row in 10k rows | completed | duration | ms | 2.4 | +166.67% | 7 | 2.3999999999650754 | 2.400000000023283 | 2.4 | 2.4 | 2.4 | 2.4 | 2.4 | 0 | 2.400000000023283, 2.400000000023283, 2.3999999999650754, 2.3999999999650754, 2.400000000023283, 2.3999999999650754, 2.400000000023283 | bundle gzip bytes: 474249 |
| primitive-browser | solid | workspace | browser select row in 10k rows | completed | duration | ms | 0.9 | best | 7 | 0.7999999999883585 | 29.20000000001164 | 5 | 0.9 | 1.3 | 29.2 | 29.2 | 9.8807 | 0.8999999999650754, 0.7999999999883585, 1, 0.9000000000232831, 29.20000000001164, 0.9000000000232831, 1.3000000000465661 | bundle gzip bytes: 474249 |
| primitive-browser | vue | workspace | browser select row in 10k rows | completed | duration | ms | 10.8 | +1100% | 7 | 9.700000000011642 | 12.700000000011642 | 11.0429 | 10.8 | 12 | 12.7 | 12.7 | 1.039 | 12, 10.5, 12.700000000011642, 9.899999999965075, 10.799999999988358, 11.700000000011642, 9.700000000011642 | bundle gzip bytes: 474249 |
| primitive-browser | svelte | workspace | browser select row in 10k rows | completed | duration | ms | 3.8 | +322.22% | 7 | 3.7000000000116415 | 3.8999999999650754 | 3.8143 | 3.8 | 3.9 | 3.9 | 3.9 | 0.0833 | 3.8999999999650754, 3.8999999999650754, 3.7999999999883585, 3.7000000000116415, 3.7999999999883585, 3.8999999999650754, 3.7000000000116415 | bundle gzip bytes: 474249 |
| primitive-browser | angular | workspace | browser select row in 10k rows | completed | duration | ms | 3.5 | +288.89% | 7 | 3.3999999999650754 | 14.900000000023283 | 5.1571 | 3.5 | 3.7 | 14.9 | 14.9 | 3.9785 | 14.900000000023283, 3.3999999999650754, 3.5, 3.5, 3.5, 3.699999999953434, 3.599999999976717 | bundle gzip bytes: 474249 |
| primitive-browser | marko | workspace | browser select row in 10k rows | unsupported | duration | ms | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | Marko's standalone browser primitive fixture requires the Marko client compiler/runtime integration; keep Marko covered by router browser probes until a stable standalone harness is added. |
| primitive-browser | qwik | workspace | browser select row in 10k rows | completed | duration | ms | 9.6 | +966.67% | 7 | 8.799999999988358 | 18.900000000023283 | 13.0857 | 9.6 | 18.6 | 18.9 | 18.9 | 4.6744 | 17.900000000023283, 8.899999999965075, 9.599999999976717, 18.900000000023283, 8.900000000023283, 8.799999999988358, 18.600000000034925 | bundle gzip bytes: 474249 |
| primitive-browser | mreact | workspace | browser clear 10k rows | completed | duration | ms | 2.1 | best | 7 | 2.099999999976717 | 2.2000000000116415 | 2.1429 | 2.1 | 2.2 | 2.2 | 2.2 | 0.0495 | 2.2000000000116415, 2.1000000000349246, 2.099999999976717, 2.099999999976717, 2.2000000000116415, 2.1000000000349246, 2.2000000000116415 | bundle gzip bytes: 474249 |
| primitive-browser | mreact react-compat | workspace | browser clear 10k rows | completed | duration | ms | 4.5 | +114.29% | 7 | 4.2999999999883585 | 5.7999999999883585 | 4.6429 | 4.5 | 4.6 | 5.8 | 5.8 | 0.4866 | 5.7999999999883585, 4.599999999976717, 4.2999999999883585, 4.599999999976717, 4.5, 4.400000000023283, 4.2999999999883585 | bundle gzip bytes: 474249 |
| primitive-browser | react | workspace | browser clear 10k rows | completed | duration | ms | 8.4 | +300% | 7 | 8.299999999988358 | 19 | 9.8857 | 8.4 | 8.4 | 19 | 19 | 3.7211 | 8.399999999965075, 8.400000000023283, 8.299999999988358, 19, 8.400000000023283, 8.299999999988358, 8.399999999965075 | bundle gzip bytes: 474249 |
| primitive-browser | solid | workspace | browser clear 10k rows | completed | duration | ms | 2.4 | +14.29% | 7 | 2.2999999999883585 | 48.5 | 8.9857 | 2.4 | 2.6 | 48.5 | 48.5 | 16.1319 | 48.5, 2.400000000023283, 2.6000000000349246, 2.3999999999650754, 2.2999999999883585, 2.400000000023283, 2.2999999999883585 | bundle gzip bytes: 474249 |
| primitive-browser | vue | workspace | browser clear 10k rows | completed | duration | ms | 4.7 | +123.81% | 7 | 4.400000000023283 | 26.600000000034925 | 7.8 | 4.7 | 5.2 | 26.6 | 26.6 | 7.6791 | 5.2000000000116415, 4.599999999976717, 4.7000000000116415, 26.600000000034925, 4.400000000023283, 4.400000000023283, 4.7000000000116415 | bundle gzip bytes: 474249 |
| primitive-browser | svelte | workspace | browser clear 10k rows | completed | duration | ms | 8.8 | +319.05% | 7 | 8.199999999953434 | 13 | 9.2857 | 8.8 | 9.4 | 13 | 13 | 1.5634 | 13, 9.400000000023283, 8.599999999976717, 8.800000000046566, 8.199999999953434, 8.799999999988358, 8.200000000011642 | bundle gzip bytes: 474249 |
| primitive-browser | angular | workspace | browser clear 10k rows | completed | duration | ms | 8.5 | +304.76% | 7 | 8.199999999953434 | 9.200000000011642 | 8.5571 | 8.5 | 8.7 | 9.2 | 9.2 | 0.2969 | 8.5, 8.700000000011642, 8.400000000023283, 8.199999999953434, 8.400000000023283, 8.5, 9.200000000011642 | bundle gzip bytes: 474249 |
| primitive-browser | marko | workspace | browser clear 10k rows | unsupported | duration | ms | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | Marko's standalone browser primitive fixture requires the Marko client compiler/runtime integration; keep Marko covered by router browser probes until a stable standalone harness is added. |
| primitive-browser | qwik | workspace | browser clear 10k rows | completed | duration | ms | 6 | +185.71% | 7 | 5.899999999965075 | 6.2000000000116415 | 6.0143 | 6 | 6.2 | 6.2 | 6.2 | 0.1245 | 5.900000000023283, 5.899999999965075, 6, 5.900000000023283, 6, 6.2000000000116415, 6.199999999953434 | bundle gzip bytes: 474249 |
