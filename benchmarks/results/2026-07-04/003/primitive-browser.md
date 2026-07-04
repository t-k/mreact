# Primitive Browser Benchmark

## Environment

- Date: 2026-07-04
- Git commit: 501bf599e745249b6c2db31c7e820319ad0fbb46
- Node: v24.18.0
- NODE_ENV: production
- pnpm: 10.19.0
- Platform: linux x64
- CPU: AMD EPYC 7763 64-Core Processor (4)
- Memory: 16766423040 bytes
- Package versions:
  - @angular/core: 22.0.1
  - @builder.io/qwik: 1.20.0
  - @playwright/test: 1.60.0
  - @reckona/mreact-compat: 0.0.185
  - @reckona/mreact-reactive-core: 0.0.185
  - @reckona/mreact-reactive-dom: 0.0.185
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
| 1 | solid | browser create 1k rows | 1.5 | best | ms |
| 2 | **mreact** | browser create 1k rows | 2.6 | +73.33% | ms |
| 3 | qwik | browser create 1k rows | 2.7 | +80% | ms |
| 4 | react | browser create 1k rows | 3.1 | +106.67% | ms |
| 5 | **mreact react-compat** | browser create 1k rows | 3.3 | +120% | ms |
| 6 | vue | browser create 1k rows | 3.3 | +120% | ms |
| 7 | svelte | browser create 1k rows | 4.1 | +173.33% | ms |
| 8 | angular | browser create 1k rows | 4.8 | +220% | ms |

### browser update every 10th in 10k rows

Updates every tenth row in a 10,000-row keyed DOM in real Chromium, exposing real DOM update costs hidden by happy-dom.

| rank | framework | case | value | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | --- |
| 1 | **mreact** | browser update every 10th in 10k rows | 0.9 | best | ms |
| 2 | svelte | browser update every 10th in 10k rows | 2.7 | +200% | ms |
| 3 | react | browser update every 10th in 10k rows | 3 | +233.33% | ms |
| 4 | angular | browser update every 10th in 10k rows | 4.6 | +411.11% | ms |
| 5 | **mreact react-compat** | browser update every 10th in 10k rows | 5.1 | +466.67% | ms |
| 6 | solid | browser update every 10th in 10k rows | 7.3 | +711.11% | ms |
| 7 | qwik | browser update every 10th in 10k rows | 9.9 | +1000% | ms |
| 8 | vue | browser update every 10th in 10k rows | 12.6 | +1300% | ms |

### browser select row in 10k rows

Toggles selection attributes for one row in a 10,000-row keyed DOM in real Chromium.

| rank | framework | case | value | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | --- |
| 1 | **mreact** | browser select row in 10k rows | 1 | best | ms |
| 2 | solid | browser select row in 10k rows | 1.2 | +20% | ms |
| 3 | react | browser select row in 10k rows | 2.5 | +150% | ms |
| 4 | svelte | browser select row in 10k rows | 3.2 | +220% | ms |
| 5 | **mreact react-compat** | browser select row in 10k rows | 3.7 | +270% | ms |
| 6 | angular | browser select row in 10k rows | 4.1 | +310% | ms |
| 7 | qwik | browser select row in 10k rows | 8.8 | +780% | ms |
| 8 | vue | browser select row in 10k rows | 11.2 | +1020% | ms |

### browser clear 10k rows

Clears a 10,000-row keyed DOM in real Chromium to validate happy-dom clear rankings against browser behavior.

| rank | framework | case | value | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | --- |
| 1 | **mreact** | browser clear 10k rows | 2.2 | best | ms |
| 2 | solid | browser clear 10k rows | 2.5 | +13.64% | ms |
| 3 | **mreact react-compat** | browser clear 10k rows | 4.4 | +100% | ms |
| 4 | vue | browser clear 10k rows | 4.8 | +118.18% | ms |
| 5 | qwik | browser clear 10k rows | 5.9 | +168.18% | ms |
| 6 | react | browser clear 10k rows | 7.3 | +231.82% | ms |
| 7 | svelte | browser clear 10k rows | 8.6 | +290.91% | ms |
| 8 | angular | browser clear 10k rows | 8.7 | +295.45% | ms |

## Results

| suite | framework | version | case | status | metric | unit | value | diff vs 1st | sample count | min | max | mean | median | p75 | p95 | p99 | standard deviation | raw samples | notes |
| --- | --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| primitive-browser | mreact | workspace | browser create 1k rows | completed | duration | ms | 2.6 | +73.33% | 7 | 2.2000000000116415 | 3.6000000000349246 | 2.8571 | 2.6 | 3.6 | 3.6 | 3.6 | 0.5395 | 3.099999999976717, 3.6000000000349246, 2.599999999976717, 2.6000000000349246, 2.2999999999883585, 3.6000000000349246, 2.2000000000116415 | bundle gzip bytes: 474134 |
| primitive-browser | mreact react-compat | workspace | browser create 1k rows | completed | duration | ms | 3.3 | +120% | 7 | 2.1000000000349246 | 4.100000000034925 | 3.1429 | 3.3 | 3.6 | 4.1 | 4.1 | 0.6184 | 3.2999999999883585, 3.599999999976717, 3.300000000046566, 3.1000000000349246, 4.100000000034925, 2.1000000000349246, 2.5 | bundle gzip bytes: 474134 |
| primitive-browser | react | workspace | browser create 1k rows | completed | duration | ms | 3.1 | +106.67% | 7 | 3.099999999976717 | 4 | 3.2571 | 3.1 | 3.3 | 4 | 4 | 0.311 | 4, 3.1000000000349246, 3.2999999999883585, 3.1000000000349246, 3.1000000000349246, 3.1000000000349246, 3.099999999976717 | bundle gzip bytes: 474134 |
| primitive-browser | solid | workspace | browser create 1k rows | completed | duration | ms | 1.5 | best | 7 | 1.3999999999650754 | 1.5 | 1.4571 | 1.5 | 1.5 | 1.5 | 1.5 | 0.0495 | 1.5, 1.5, 1.3999999999650754, 1.5, 1.400000000023283, 1.3999999999650754, 1.5 | bundle gzip bytes: 474134 |
| primitive-browser | vue | workspace | browser create 1k rows | completed | duration | ms | 3.3 | +120% | 7 | 2.900000000023283 | 4.7999999999883585 | 3.5143 | 3.3 | 4.1 | 4.8 | 4.8 | 0.6446 | 4.099999999976717, 4.7999999999883585, 3.2999999999883585, 3.3999999999650754, 2.900000000023283, 2.900000000023283, 3.199999999953434 | bundle gzip bytes: 474134 |
| primitive-browser | svelte | workspace | browser create 1k rows | completed | duration | ms | 4.1 | +173.33% | 7 | 3.699999999953434 | 21.399999999965075 | 6.8143 | 4.1 | 5.7 | 21.4 | 21.4 | 6.0015 | 5.2999999999883585, 21.399999999965075, 5.699999999953434, 3.7999999999883585, 3.699999999953434, 3.699999999953434, 4.099999999976717 | bundle gzip bytes: 474134 |
| primitive-browser | angular | workspace | browser create 1k rows | completed | duration | ms | 4.8 | +220% | 7 | 4.399999999965075 | 11.700000000011642 | 5.9143 | 4.8 | 6.2 | 11.7 | 11.7 | 2.4251 | 6.2000000000116415, 4.800000000046566, 4.7999999999883585, 5, 4.399999999965075, 4.5, 11.700000000011642 | bundle gzip bytes: 474134 |
| primitive-browser | marko | workspace | browser create 1k rows | unsupported | duration | ms | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | Marko's standalone browser primitive fixture requires the Marko client compiler/runtime integration; keep Marko covered by router browser probes until a stable standalone harness is added. |
| primitive-browser | qwik | workspace | browser create 1k rows | completed | duration | ms | 2.7 | +80% | 7 | 2.599999999976717 | 2.900000000023283 | 2.7143 | 2.7 | 2.7 | 2.9 | 2.9 | 0.0833 | 2.599999999976717, 2.699999999953434, 2.7000000000116415, 2.7000000000116415, 2.7000000000116415, 2.900000000023283, 2.7000000000116415 | bundle gzip bytes: 474134 |
| primitive-browser | mreact | workspace | browser update every 10th in 10k rows | completed | duration | ms | 0.9 | best | 7 | 0.8000000000465661 | 1.8000000000465661 | 1.0714 | 0.9 | 1.2 | 1.8 | 1.8 | 0.3194 | 1.8000000000465661, 0.9000000000232831, 1.2000000000116415, 1, 0.8000000000465661, 0.9000000000232831, 0.8999999999650754 | bundle gzip bytes: 474134 |
| primitive-browser | mreact react-compat | workspace | browser update every 10th in 10k rows | completed | duration | ms | 5.1 | +466.67% | 7 | 4.900000000023283 | 7.800000000046566 | 5.4857 | 5.1 | 5.3 | 7.8 | 7.8 | 0.9523 | 5.199999999953434, 5.099999999976717, 4.900000000023283, 7.800000000046566, 5.300000000046566, 5, 5.099999999976717 | bundle gzip bytes: 474134 |
| primitive-browser | react | workspace | browser update every 10th in 10k rows | completed | duration | ms | 3 | +233.33% | 7 | 2.7999999999883585 | 5.300000000046566 | 3.4714 | 3 | 4.2 | 5.3 | 5.3 | 0.868 | 5.300000000046566, 2.900000000023283, 3.199999999953434, 2.7999999999883585, 2.900000000023283, 4.199999999953434, 3 | bundle gzip bytes: 474134 |
| primitive-browser | solid | workspace | browser update every 10th in 10k rows | completed | duration | ms | 7.3 | +711.11% | 7 | 6.900000000023283 | 7.5 | 7.3 | 7.3 | 7.5 | 7.5 | 7.5 | 0.1927 | 7.399999999965075, 7.2999999999883585, 7.5, 6.900000000023283, 7.5, 7.2999999999883585, 7.199999999953434 | bundle gzip bytes: 474134 |
| primitive-browser | vue | workspace | browser update every 10th in 10k rows | completed | duration | ms | 12.6 | +1300% | 7 | 11.899999999965075 | 18.79999999998836 | 13.8857 | 12.6 | 15.9 | 18.8 | 18.8 | 2.3576 | 11.899999999965075, 18.79999999998836, 13.299999999988358, 15.900000000023283, 12.600000000034925, 12.5, 12.199999999953434 | bundle gzip bytes: 474134 |
| primitive-browser | svelte | workspace | browser update every 10th in 10k rows | completed | duration | ms | 2.7 | +200% | 7 | 2.2999999999883585 | 3 | 2.7286 | 2.7 | 2.9 | 3 | 3 | 0.205 | 3, 2.8999999999650754, 2.7000000000116415, 2.7999999999883585, 2.7000000000116415, 2.7000000000116415, 2.2999999999883585 | bundle gzip bytes: 474134 |
| primitive-browser | angular | workspace | browser update every 10th in 10k rows | completed | duration | ms | 4.6 | +411.11% | 7 | 4.400000000023283 | 4.7999999999883585 | 4.6143 | 4.6 | 4.8 | 4.8 | 4.8 | 0.1726 | 4.400000000023283, 4.7999999999883585, 4.600000000034925, 4.7999999999883585, 4.7999999999883585, 4.5, 4.400000000023283 | bundle gzip bytes: 474134 |
| primitive-browser | marko | workspace | browser update every 10th in 10k rows | unsupported | duration | ms | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | Marko's standalone browser primitive fixture requires the Marko client compiler/runtime integration; keep Marko covered by router browser probes until a stable standalone harness is added. |
| primitive-browser | qwik | workspace | browser update every 10th in 10k rows | completed | duration | ms | 9.9 | +1000% | 7 | 9 | 37.70000000001164 | 16.5143 | 9.9 | 21 | 37.7 | 37.7 | 9.9127 | 21, 9.900000000023283, 9, 19.70000000001164, 9.299999999988358, 9, 37.70000000001164 | bundle gzip bytes: 474134 |
| primitive-browser | mreact | workspace | browser select row in 10k rows | completed | duration | ms | 1 | best | 7 | 0.8999999999650754 | 1.099999999976717 | 0.9857 | 1 | 1 | 1.1 | 1.1 | 0.0639 | 1, 0.8999999999650754, 1, 1, 0.9000000000232831, 1.099999999976717, 1 | bundle gzip bytes: 474134 |
| primitive-browser | mreact react-compat | workspace | browser select row in 10k rows | completed | duration | ms | 3.7 | +270% | 7 | 3.5 | 7.600000000034925 | 4.3 | 3.7 | 4.1 | 7.6 | 7.6 | 1.3575 | 4.099999999976717, 3.7999999999883585, 3.699999999953434, 3.7000000000116415, 3.5, 3.7000000000116415, 7.600000000034925 | bundle gzip bytes: 474134 |
| primitive-browser | react | workspace | browser select row in 10k rows | completed | duration | ms | 2.5 | +150% | 7 | 2.400000000023283 | 7.599999999976717 | 3.2429 | 2.5 | 2.6 | 7.6 | 7.6 | 1.7799 | 2.6000000000349246, 2.5, 7.599999999976717, 2.5, 2.5, 2.400000000023283, 2.6000000000349246 | bundle gzip bytes: 474134 |
| primitive-browser | solid | workspace | browser select row in 10k rows | completed | duration | ms | 1.2 | +20% | 7 | 1.099999999976717 | 1.2999999999883585 | 1.1857 | 1.2 | 1.2 | 1.3 | 1.3 | 0.0639 | 1.1000000000349246, 1.2000000000116415, 1.2999999999883585, 1.099999999976717, 1.2000000000116415, 1.2000000000116415, 1.2000000000116415 | bundle gzip bytes: 474134 |
| primitive-browser | vue | workspace | browser select row in 10k rows | completed | duration | ms | 11.2 | +1020% | 7 | 9.799999999988358 | 16.5 | 11.8143 | 11.2 | 12.7 | 16.5 | 16.5 | 2.1243 | 12.700000000011642, 10.099999999976717, 11.799999999988358, 11.200000000011642, 10.600000000034925, 9.799999999988358, 16.5 | bundle gzip bytes: 474134 |
| primitive-browser | svelte | workspace | browser select row in 10k rows | completed | duration | ms | 3.2 | +220% | 7 | 3.1000000000349246 | 96.39999999996508 | 16.5286 | 3.2 | 3.3 | 96.4 | 96.4 | 32.6074 | 3.199999999953434, 3.2000000000116415, 3.1000000000349246, 3.2000000000116415, 96.39999999996508, 3.300000000046566, 3.2999999999883585 | bundle gzip bytes: 474134 |
| primitive-browser | angular | workspace | browser select row in 10k rows | completed | duration | ms | 4.1 | +310% | 7 | 3.900000000023283 | 5.5 | 4.4714 | 4.1 | 5.4 | 5.5 | 5.5 | 0.625 | 5.5, 4.2000000000116415, 5.400000000023283, 4.100000000034925, 4.100000000034925, 3.900000000023283, 4.099999999976717 | bundle gzip bytes: 474134 |
| primitive-browser | marko | workspace | browser select row in 10k rows | unsupported | duration | ms | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | Marko's standalone browser primitive fixture requires the Marko client compiler/runtime integration; keep Marko covered by router browser probes until a stable standalone harness is added. |
| primitive-browser | qwik | workspace | browser select row in 10k rows | completed | duration | ms | 8.8 | +780% | 7 | 8.100000000034925 | 22.300000000046566 | 12.3286 | 8.8 | 18.2 | 22.3 | 22.3 | 5.2273 | 8.799999999988358, 18.20000000001164, 11.5, 8.799999999988358, 8.100000000034925, 22.300000000046566, 8.599999999976717 | bundle gzip bytes: 474134 |
| primitive-browser | mreact | workspace | browser clear 10k rows | completed | duration | ms | 2.2 | best | 7 | 2.099999999976717 | 2.300000000046566 | 2.1714 | 2.2 | 2.2 | 2.3 | 2.3 | 0.07 | 2.300000000046566, 2.199999999953434, 2.200000000069849, 2.099999999976717, 2.099999999976717, 2.199999999953434, 2.099999999976717 | bundle gzip bytes: 474134 |
| primitive-browser | mreact react-compat | workspace | browser clear 10k rows | completed | duration | ms | 4.4 | +100% | 7 | 4.200000000069849 | 7.699999999953434 | 5.0429 | 4.4 | 6 | 7.7 | 7.7 | 1.2316 | 4.400000000023283, 4.200000000069849, 4.400000000023283, 7.699999999953434, 4.300000000046566, 4.300000000046566, 6 | bundle gzip bytes: 474134 |
| primitive-browser | react | workspace | browser clear 10k rows | completed | duration | ms | 7.3 | +231.82% | 7 | 7 | 8.099999999976717 | 7.3714 | 7.3 | 7.6 | 8.1 | 8.1 | 0.3452 | 7.300000000046566, 7.599999999976717, 7.299999999930151, 8.099999999976717, 7.099999999976717, 7.199999999953434, 7 | bundle gzip bytes: 474134 |
| primitive-browser | solid | workspace | browser clear 10k rows | completed | duration | ms | 2.5 | +13.64% | 7 | 2.299999999930151 | 20.800000000046566 | 5.0429 | 2.5 | 2.5 | 20.8 | 20.8 | 6.4334 | 2.5, 2.5, 2.5, 2.299999999930151, 2.400000000023283, 20.800000000046566, 2.300000000046566 | bundle gzip bytes: 474134 |
| primitive-browser | vue | workspace | browser clear 10k rows | completed | duration | ms | 4.8 | +118.18% | 7 | 4.600000000093132 | 25.900000000023283 | 7.9286 | 4.8 | 5.7 | 25.9 | 25.9 | 7.3441 | 4.900000000023283, 4.800000000046566, 5.699999999953434, 4.600000000093132, 4.799999999930151, 25.900000000023283, 4.800000000046566 | bundle gzip bytes: 474134 |
| primitive-browser | svelte | workspace | browser clear 10k rows | completed | duration | ms | 8.6 | +290.91% | 7 | 8.400000000023283 | 12 | 9.0714 | 8.6 | 8.8 | 12 | 12 | 1.202 | 8.5, 12, 8.699999999953434, 8.400000000023283, 8.5, 8.800000000046566, 8.600000000093132 | bundle gzip bytes: 474134 |
| primitive-browser | angular | workspace | browser clear 10k rows | completed | duration | ms | 8.7 | +295.45% | 7 | 8.400000000023283 | 9.800000000046566 | 8.8429 | 8.7 | 9 | 9.8 | 9.8 | 0.4371 | 9, 9.800000000046566, 8.5, 8.699999999953434, 8.400000000023283, 8.900000000023283, 8.600000000093132 | bundle gzip bytes: 474134 |
| primitive-browser | marko | workspace | browser clear 10k rows | unsupported | duration | ms | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | Marko's standalone browser primitive fixture requires the Marko client compiler/runtime integration; keep Marko covered by router browser probes until a stable standalone harness is added. |
| primitive-browser | qwik | workspace | browser clear 10k rows | completed | duration | ms | 5.9 | +168.18% | 7 | 5.700000000069849 | 6 | 5.8714 | 5.9 | 5.9 | 6 | 6 | 0.0881 | 5.900000000023283, 5.900000000023283, 5.899999999906868, 5.700000000069849, 5.900000000023283, 5.800000000046566, 6 | bundle gzip bytes: 474134 |
