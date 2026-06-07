# Primitive Browser Benchmark

## Environment

- Date: 2026-06-06
- Git commit: 6d5d28d24418c81cc9b81d95ba439783ed42294d
- Node: v24.16.0
- NODE_ENV: production
- pnpm: 10.19.0
- Platform: linux x64
- CPU: Intel(R) Xeon(R) Platinum 8370C CPU @ 2.80GHz (4)
- Memory: 16769716224 bytes
- Package versions:
  - @builder.io/qwik: 1.19.2
  - @playwright/test: 1.60.0
  - @reckona/mreact-compat: 0.0.141
  - @reckona/mreact-reactive-core: 0.0.141
  - @reckona/mreact-reactive-dom: 0.0.141
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
| 2 | qwik | browser create 1k rows | 2.5 | +56.25% | ms |
| 3 | **mreact** | browser create 1k rows | 2.9 | +81.25% | ms |
| 4 | react | browser create 1k rows | 3.1 | +93.75% | ms |
| 5 | **mreact react-compat** | browser create 1k rows | 4.4 | +175% | ms |

### browser update every 10th in 10k rows

Updates every tenth row in a 10,000-row keyed DOM in real Chromium, exposing real DOM update costs hidden by happy-dom.

| rank | framework | case | value | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | --- |
| 1 | **mreact** | browser update every 10th in 10k rows | 1.5 | best | ms |
| 2 | react | browser update every 10th in 10k rows | 2.8 | +86.67% | ms |
| 3 | solid | browser update every 10th in 10k rows | 7.7 | +413.33% | ms |
| 4 | **mreact react-compat** | browser update every 10th in 10k rows | 8.8 | +486.67% | ms |
| 5 | qwik | browser update every 10th in 10k rows | 10 | +566.67% | ms |

### browser select row in 10k rows

Toggles selection attributes for one row in a 10,000-row keyed DOM in real Chromium.

| rank | framework | case | value | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | --- |
| 1 | solid | browser select row in 10k rows | 0.9 | best | ms |
| 2 | **mreact** | browser select row in 10k rows | 1.1 | +22.22% | ms |
| 3 | react | browser select row in 10k rows | 2.4 | +166.67% | ms |
| 4 | **mreact react-compat** | browser select row in 10k rows | 7.7 | +755.56% | ms |
| 5 | qwik | browser select row in 10k rows | 10.1 | +1022.22% | ms |

### browser clear 10k rows

Clears a 10,000-row keyed DOM in real Chromium to validate happy-dom clear rankings against browser behavior.

| rank | framework | case | value | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | --- |
| 1 | solid | browser clear 10k rows | 2.5 | best | ms |
| 2 | **mreact** | browser clear 10k rows | 2.8 | +12% | ms |
| 3 | **mreact react-compat** | browser clear 10k rows | 4.5 | +80% | ms |
| 4 | qwik | browser clear 10k rows | 6.5 | +160% | ms |
| 5 | react | browser clear 10k rows | 9 | +260% | ms |

## Results

| suite | framework | version | case | status | metric | unit | value | diff vs 1st | sample count | min | max | mean | median | p75 | p95 | p99 | standard deviation | raw samples | notes |
| --- | --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| primitive-browser | mreact | workspace | browser create 1k rows | completed | duration | ms | 2.9 | +81.25% | 7 | 1.8999999999068677 | 3.699999999953434 | 2.8857 | 2.9 | 3.5 | 3.7 | 3.7 | 0.5866 | 3.699999999953434, 3.5, 2.900000000023283, 2.800000000046566, 1.8999999999068677, 2.300000000046566, 3.099999999976717 | bundle gzip bytes: 114657 |
| primitive-browser | mreact react-compat | workspace | browser create 1k rows | completed | duration | ms | 4.4 | +175% | 7 | 3.700000000069849 | 6 | 4.7714 | 4.4 | 5.9 | 6 | 6 | 0.9254 | 4.399999999906868, 5.5, 4.100000000093132, 5.900000000023283, 3.700000000069849, 3.799999999930151, 6 | bundle gzip bytes: 114657 |
| primitive-browser | react | workspace | browser create 1k rows | completed | duration | ms | 3.1 | +93.75% | 7 | 3 | 3.599999999976717 | 3.1429 | 3.1 | 3.2 | 3.6 | 3.6 | 0.199 | 3.599999999976717, 3.099999999976717, 3.200000000069849, 3, 3.099999999976717, 3, 3 | bundle gzip bytes: 114657 |
| primitive-browser | solid | workspace | browser create 1k rows | completed | duration | ms | 1.6 | best | 7 | 1.5 | 1.900000000023283 | 1.6571 | 1.6 | 1.8 | 1.9 | 1.9 | 0.14 | 1.599999999976717, 1.900000000023283, 1.5, 1.8000000000465661, 1.599999999976717, 1.5, 1.6999999999534339 | bundle gzip bytes: 114657 |
| primitive-browser | marko | workspace | browser create 1k rows | unsupported | duration | ms | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | Marko's standalone browser primitive fixture requires the Marko client compiler/runtime integration; keep Marko covered by router browser probes until a stable standalone harness is added. |
| primitive-browser | qwik | workspace | browser create 1k rows | completed | duration | ms | 2.5 | +56.25% | 7 | 2.400000000023283 | 2.699999999953434 | 2.5143 | 2.5 | 2.6 | 2.7 | 2.7 | 0.1125 | 2.699999999953434, 2.400000000023283, 2.5, 2.599999999976717, 2.400000000023283, 2.599999999976717, 2.400000000023283 | bundle gzip bytes: 114657 |
| primitive-browser | mreact | workspace | browser update every 10th in 10k rows | completed | duration | ms | 1.5 | best | 7 | 1.3000000000465661 | 1.8000000000465661 | 1.5286 | 1.5 | 1.6 | 1.8 | 1.8 | 0.1385 | 1.8000000000465661, 1.5, 1.5, 1.599999999976717, 1.3000000000465661, 1.5, 1.5 | bundle gzip bytes: 114657 |
| primitive-browser | mreact react-compat | workspace | browser update every 10th in 10k rows | completed | duration | ms | 8.8 | +486.67% | 7 | 8.5 | 12.900000000023283 | 9.7286 | 8.8 | 11.8 | 12.9 | 12.9 | 1.6918 | 11.800000000046566, 12.900000000023283, 8.5, 8.800000000046566, 8.599999999976717, 8.5, 9 | bundle gzip bytes: 114657 |
| primitive-browser | react | workspace | browser update every 10th in 10k rows | completed | duration | ms | 2.8 | +86.67% | 7 | 2.700000000069849 | 4.400000000023283 | 3.1571 | 2.8 | 3.4 | 4.4 | 4.4 | 0.5602 | 3.3999999999068677, 3.200000000069849, 4.400000000023283, 2.799999999930151, 2.800000000046566, 2.800000000046566, 2.700000000069849 | bundle gzip bytes: 114657 |
| primitive-browser | solid | workspace | browser update every 10th in 10k rows | completed | duration | ms | 7.7 | +413.33% | 7 | 7 | 8.29999999993015 | 7.6429 | 7.7 | 7.9 | 8.3 | 8.3 | 0.3923 | 7, 7.799999999930151, 7.5, 7.900000000023283, 8.29999999993015, 7.699999999953434, 7.299999999930151 | bundle gzip bytes: 114657 |
| primitive-browser | marko | workspace | browser update every 10th in 10k rows | unsupported | duration | ms | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | Marko's standalone browser primitive fixture requires the Marko client compiler/runtime integration; keep Marko covered by router browser probes until a stable standalone harness is added. |
| primitive-browser | qwik | workspace | browser update every 10th in 10k rows | completed | duration | ms | 10 | +566.67% | 7 | 9 | 18.800000000046566 | 11.2429 | 10 | 11.7 | 18.8 | 18.8 | 3.1861 | 10.20000000006985, 18.800000000046566, 10, 11.699999999953434, 9.5, 9, 9.5 | bundle gzip bytes: 114657 |
| primitive-browser | mreact | workspace | browser select row in 10k rows | completed | duration | ms | 1.1 | +22.22% | 7 | 0.9000000000232831 | 19.599999999976717 | 3.6857 | 1.1 | 1.1 | 19.6 | 19.6 | 6.4973 | 1, 0.9000000000232831, 1.099999999976717, 1.099999999976717, 1, 19.599999999976717, 1.099999999976717 | bundle gzip bytes: 114657 |
| primitive-browser | mreact react-compat | workspace | browser select row in 10k rows | completed | duration | ms | 7.7 | +755.56% | 7 | 7.100000000093132 | 40.79999999993015 | 13.9571 | 7.7 | 19.4 | 40.8 | 40.8 | 11.7055 | 7.400000000023283, 7.699999999953434, 8, 19.400000000023283, 7.300000000046566, 7.100000000093132, 40.79999999993015 | bundle gzip bytes: 114657 |
| primitive-browser | react | workspace | browser select row in 10k rows | completed | duration | ms | 2.4 | +166.67% | 7 | 2.199999999953434 | 8.599999999976717 | 3.2286 | 2.4 | 2.4 | 8.6 | 8.6 | 2.194 | 2.400000000023283, 2.199999999953434, 8.599999999976717, 2.299999999930151, 2.3999999999068677, 2.400000000023283, 2.299999999930151 | bundle gzip bytes: 114657 |
| primitive-browser | solid | workspace | browser select row in 10k rows | completed | duration | ms | 0.9 | best | 7 | 0.8999999999068677 | 1 | 0.9143 | 0.9 | 0.9 | 1 | 1 | 0.035 | 1, 0.8999999999068677, 0.9000000000232831, 0.9000000000232831, 0.9000000000232831, 0.9000000000232831, 0.9000000000232831 | bundle gzip bytes: 114657 |
| primitive-browser | marko | workspace | browser select row in 10k rows | unsupported | duration | ms | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | Marko's standalone browser primitive fixture requires the Marko client compiler/runtime integration; keep Marko covered by router browser probes until a stable standalone harness is added. |
| primitive-browser | qwik | workspace | browser select row in 10k rows | completed | duration | ms | 10.1 | +1022.22% | 7 | 9.599999999976717 | 22.900000000023283 | 14.0286 | 10.1 | 18.4 | 22.9 | 22.9 | 5.0914 | 10.100000000093132, 22.900000000023283, 9.599999999976717, 18.400000000023283, 10, 17.599999999976717, 9.599999999976717 | bundle gzip bytes: 114657 |
| primitive-browser | mreact | workspace | browser clear 10k rows | completed | duration | ms | 2.8 | +12% | 7 | 2.699999999953434 | 3.200000000069849 | 2.8429 | 2.8 | 2.9 | 3.2 | 3.2 | 0.1678 | 2.699999999953434, 2.900000000023283, 2.700000000069849, 2.900000000023283, 2.699999999953434, 2.800000000046566, 3.200000000069849 | bundle gzip bytes: 114657 |
| primitive-browser | mreact react-compat | workspace | browser clear 10k rows | completed | duration | ms | 4.5 | +80% | 7 | 4.299999999930151 | 4.900000000023283 | 4.5286 | 4.5 | 4.7 | 4.9 | 4.9 | 0.1906 | 4.5, 4.299999999930151, 4.700000000069849, 4.400000000023283, 4.5, 4.900000000023283, 4.399999999906868 | bundle gzip bytes: 114657 |
| primitive-browser | react | workspace | browser clear 10k rows | completed | duration | ms | 9 | +260% | 7 | 8.800000000046566 | 23.300000000046566 | 11.1571 | 9 | 10 | 23.3 | 23.3 | 4.9716 | 8.800000000046566, 8.900000000023283, 9.20000000006985, 10, 8.900000000023283, 9, 23.300000000046566 | bundle gzip bytes: 114657 |
| primitive-browser | solid | workspace | browser clear 10k rows | completed | duration | ms | 2.5 | best | 7 | 2.400000000023283 | 4.900000000023283 | 2.8429 | 2.5 | 2.6 | 4.9 | 4.9 | 0.8432 | 4.900000000023283, 2.5, 2.599999999976717, 2.400000000023283, 2.5, 2.400000000023283, 2.6000000000931323 | bundle gzip bytes: 114657 |
| primitive-browser | marko | workspace | browser clear 10k rows | unsupported | duration | ms | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | Marko's standalone browser primitive fixture requires the Marko client compiler/runtime integration; keep Marko covered by router browser probes until a stable standalone harness is added. |
| primitive-browser | qwik | workspace | browser clear 10k rows | completed | duration | ms | 6.5 | +160% | 7 | 6.099999999976717 | 9.29999999993015 | 6.9571 | 6.5 | 7.7 | 9.3 | 9.3 | 1.0821 | 6.200000000069849, 6.099999999976717, 7.700000000069849, 6.5, 6.200000000069849, 9.29999999993015, 6.699999999953434 | bundle gzip bytes: 114657 |
