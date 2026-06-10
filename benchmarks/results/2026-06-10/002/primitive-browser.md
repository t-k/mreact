# Primitive Browser Benchmark

## Environment

- Date: 2026-06-10
- Git commit: e7eb9fa546dd0088005cdef6102a3a023729a3fa
- Node: v24.16.0
- NODE_ENV: production
- pnpm: 10.19.0
- Platform: linux x64
- CPU: Intel(R) Xeon(R) Platinum 8370C CPU @ 2.80GHz (4)
- Memory: 16769720320 bytes
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
| 1 | solid | browser create 1k rows | 1.5 | best | ms |
| 2 | **mreact** | browser create 1k rows | 2.4 | +60% | ms |
| 3 | qwik | browser create 1k rows | 2.6 | +73.33% | ms |
| 4 | react | browser create 1k rows | 3.4 | +126.67% | ms |
| 5 | **mreact react-compat** | browser create 1k rows | 4.1 | +173.33% | ms |

### browser update every 10th in 10k rows

Updates every tenth row in a 10,000-row keyed DOM in real Chromium, exposing real DOM update costs hidden by happy-dom.

| rank | framework | case | value | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | --- |
| 1 | **mreact** | browser update every 10th in 10k rows | 1.2 | best | ms |
| 2 | react | browser update every 10th in 10k rows | 2.8 | +133.33% | ms |
| 3 | **mreact react-compat** | browser update every 10th in 10k rows | 5.1 | +325% | ms |
| 4 | solid | browser update every 10th in 10k rows | 7.4 | +516.67% | ms |
| 5 | qwik | browser update every 10th in 10k rows | 10.5 | +775% | ms |

### browser select row in 10k rows

Toggles selection attributes for one row in a 10,000-row keyed DOM in real Chromium.

| rank | framework | case | value | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | --- |
| 1 | solid | browser select row in 10k rows | 0.9 | best | ms |
| 2 | **mreact** | browser select row in 10k rows | 1 | +11.11% | ms |
| 3 | react | browser select row in 10k rows | 2.4 | +166.67% | ms |
| 4 | **mreact react-compat** | browser select row in 10k rows | 3.8 | +322.22% | ms |
| 5 | qwik | browser select row in 10k rows | 11.6 | +1188.89% | ms |

### browser clear 10k rows

Clears a 10,000-row keyed DOM in real Chromium to validate happy-dom clear rankings against browser behavior.

| rank | framework | case | value | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | --- |
| 1 | solid | browser clear 10k rows | 2.4 | best | ms |
| 2 | **mreact** | browser clear 10k rows | 2.8 | +16.67% | ms |
| 3 | **mreact react-compat** | browser clear 10k rows | 4.4 | +83.33% | ms |
| 4 | qwik | browser clear 10k rows | 6.2 | +158.33% | ms |
| 5 | react | browser clear 10k rows | 7.2 | +200% | ms |

## Results

| suite | framework | version | case | status | metric | unit | value | diff vs 1st | sample count | min | max | mean | median | p75 | p95 | p99 | standard deviation | raw samples | notes |
| --- | --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| primitive-browser | mreact | workspace | browser create 1k rows | completed | duration | ms | 2.4 | +60% | 7 | 1.900000000023283 | 3.5 | 2.4429 | 2.4 | 2.7 | 3.5 | 3.5 | 0.5233 | 2.599999999976717, 3.5, 2.099999999976717, 2.699999999953434, 1.900000000023283, 2.3999999999068677, 1.900000000023283 | bundle gzip bytes: 115798 |
| primitive-browser | mreact react-compat | workspace | browser create 1k rows | completed | duration | ms | 4.1 | +173.33% | 7 | 2.599999999976717 | 5.599999999976717 | 4.0286 | 4.1 | 5.2 | 5.6 | 5.6 | 1.0938 | 5.599999999976717, 3.3999999999068677, 5.200000000069849, 4.099999999976717, 2.699999999953434, 2.599999999976717, 4.599999999976717 | bundle gzip bytes: 115798 |
| primitive-browser | react | workspace | browser create 1k rows | completed | duration | ms | 3.4 | +126.67% | 7 | 3.099999999976717 | 4.699999999953434 | 3.5429 | 3.4 | 3.8 | 4.7 | 4.7 | 0.5261 | 3.799999999930151, 3.400000000023283, 3.5, 4.699999999953434, 3.099999999976717, 3.099999999976717, 3.199999999953434 | bundle gzip bytes: 115798 |
| primitive-browser | solid | workspace | browser create 1k rows | completed | duration | ms | 1.5 | best | 7 | 1.400000000023283 | 1.7000000000698492 | 1.5143 | 1.5 | 1.6 | 1.7 | 1.7 | 0.099 | 1.599999999976717, 1.5, 1.7000000000698492, 1.5, 1.400000000023283, 1.5, 1.400000000023283 | bundle gzip bytes: 115798 |
| primitive-browser | marko | workspace | browser create 1k rows | unsupported | duration | ms | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | Marko's standalone browser primitive fixture requires the Marko client compiler/runtime integration; keep Marko covered by router browser probes until a stable standalone harness is added. |
| primitive-browser | qwik | workspace | browser create 1k rows | completed | duration | ms | 2.6 | +73.33% | 7 | 2.299999999930151 | 4.600000000093132 | 2.8714 | 2.6 | 2.9 | 4.6 | 4.6 | 0.7284 | 2.900000000023283, 2.599999999976717, 4.600000000093132, 2.299999999930151, 2.400000000023283, 2.700000000069849, 2.599999999976717 | bundle gzip bytes: 115798 |
| primitive-browser | mreact | workspace | browser update every 10th in 10k rows | completed | duration | ms | 1.2 | best | 7 | 1 | 1.6999999999534339 | 1.2571 | 1.2 | 1.5 | 1.7 | 1.7 | 0.2441 | 1.6999999999534339, 1.1999999999534339, 1.3000000000465661, 1.5, 1.1000000000931323, 1, 1 | bundle gzip bytes: 115798 |
| primitive-browser | mreact react-compat | workspace | browser update every 10th in 10k rows | completed | duration | ms | 5.1 | +325% | 7 | 4.900000000023283 | 10.20000000006985 | 5.8 | 5.1 | 5.3 | 10.2 | 10.2 | 1.8 | 10.20000000006985, 5, 5.099999999976717, 5.300000000046566, 5, 5.099999999976717, 4.900000000023283 | bundle gzip bytes: 115798 |
| primitive-browser | react | workspace | browser update every 10th in 10k rows | completed | duration | ms | 2.8 | +133.33% | 7 | 2.699999999953434 | 13.699999999953434 | 4.4143 | 2.8 | 3.3 | 13.7 | 13.7 | 3.7956 | 13.699999999953434, 2.800000000046566, 2.900000000023283, 2.799999999930151, 3.300000000046566, 2.699999999953434, 2.699999999953434 | bundle gzip bytes: 115798 |
| primitive-browser | solid | workspace | browser update every 10th in 10k rows | completed | duration | ms | 7.4 | +516.67% | 7 | 6.700000000069849 | 13.5 | 8.9143 | 7.4 | 11.5 | 13.5 | 13.5 | 2.4044 | 11.5, 6.700000000069849, 7.200000000069849, 7.399999999906868, 7.300000000046566, 13.5, 8.79999999993015 | bundle gzip bytes: 115798 |
| primitive-browser | marko | workspace | browser update every 10th in 10k rows | unsupported | duration | ms | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | Marko's standalone browser primitive fixture requires the Marko client compiler/runtime integration; keep Marko covered by router browser probes until a stable standalone harness is added. |
| primitive-browser | qwik | workspace | browser update every 10th in 10k rows | completed | duration | ms | 10.5 | +775% | 7 | 9.900000000023283 | 20.800000000046566 | 13.0571 | 10.5 | 19.4 | 20.8 | 20.8 | 4.4759 | 10.5, 20.800000000046566, 10.599999999976717, 10.199999999953434, 19.400000000023283, 9.900000000023283, 10 | bundle gzip bytes: 115798 |
| primitive-browser | mreact | workspace | browser select row in 10k rows | completed | duration | ms | 1 | +11.11% | 7 | 0.9000000000232831 | 1.099999999976717 | 1 | 1 | 1 | 1.1 | 1.1 | 0.0535 | 1, 0.9000000000232831, 1, 1, 1.099999999976717, 1, 1 | bundle gzip bytes: 115798 |
| primitive-browser | mreact react-compat | workspace | browser select row in 10k rows | completed | duration | ms | 3.8 | +322.22% | 7 | 3.799999999930151 | 5.400000000023283 | 4.0571 | 3.8 | 4 | 5.4 | 5.4 | 0.5525 | 3.800000000046566, 4, 3.800000000046566, 3.799999999930151, 3.800000000046566, 5.400000000023283, 3.799999999930151 | bundle gzip bytes: 115798 |
| primitive-browser | react | workspace | browser select row in 10k rows | completed | duration | ms | 2.4 | +166.67% | 7 | 2.199999999953434 | 2.400000000023283 | 2.3429 | 2.4 | 2.4 | 2.4 | 2.4 | 0.0728 | 2.400000000023283, 2.199999999953434, 2.300000000046566, 2.400000000023283, 2.400000000023283, 2.299999999930151, 2.400000000023283 | bundle gzip bytes: 115798 |
| primitive-browser | solid | workspace | browser select row in 10k rows | completed | duration | ms | 0.9 | best | 7 | 0.9000000000232831 | 1 | 0.9429 | 0.9 | 1 | 1 | 1 | 0.0495 | 1, 0.9000000000232831, 0.9000000000232831, 0.9000000000232831, 1, 1, 0.9000000000232831 | bundle gzip bytes: 115798 |
| primitive-browser | marko | workspace | browser select row in 10k rows | unsupported | duration | ms | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | Marko's standalone browser primitive fixture requires the Marko client compiler/runtime integration; keep Marko covered by router browser probes until a stable standalone harness is added. |
| primitive-browser | qwik | workspace | browser select row in 10k rows | completed | duration | ms | 11.6 | +1188.89% | 7 | 9.899999999906868 | 57.40000000002328 | 20.1 | 11.6 | 22.5 | 57.4 | 57.4 | 15.9458 | 57.40000000002328, 11.599999999976717, 19.400000000023283, 9.899999999906868, 9.900000000023283, 22.5, 10 | bundle gzip bytes: 115798 |
| primitive-browser | mreact | workspace | browser clear 10k rows | completed | duration | ms | 2.8 | +16.67% | 7 | 2.599999999976717 | 2.800000000046566 | 2.7429 | 2.8 | 2.8 | 2.8 | 2.8 | 0.0728 | 2.800000000046566, 2.599999999976717, 2.799999999930151, 2.700000000069849, 2.699999999953434, 2.799999999930151, 2.799999999930151 | bundle gzip bytes: 115798 |
| primitive-browser | mreact react-compat | workspace | browser clear 10k rows | completed | duration | ms | 4.4 | +83.33% | 7 | 4.200000000069849 | 4.5 | 4.3571 | 4.4 | 4.5 | 4.5 | 4.5 | 0.1178 | 4.399999999906868, 4.400000000023283, 4.5, 4.300000000046566, 4.5, 4.200000000069849, 4.200000000069849 | bundle gzip bytes: 115798 |
| primitive-browser | react | workspace | browser clear 10k rows | completed | duration | ms | 7.2 | +200% | 7 | 7.199999999953434 | 17 | 8.9857 | 7.2 | 9 | 17 | 17 | 3.3331 | 7.199999999953434, 7.200000000069849, 7.199999999953434, 8.099999999976717, 17, 7.200000000069849, 9 | bundle gzip bytes: 115798 |
| primitive-browser | solid | workspace | browser clear 10k rows | completed | duration | ms | 2.4 | best | 7 | 2.3999999999068677 | 2.5 | 2.4286 | 2.4 | 2.5 | 2.5 | 2.5 | 0.0452 | 2.5, 2.400000000023283, 2.400000000023283, 2.5, 2.400000000023283, 2.3999999999068677, 2.400000000023283 | bundle gzip bytes: 115798 |
| primitive-browser | marko | workspace | browser clear 10k rows | unsupported | duration | ms | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | Marko's standalone browser primitive fixture requires the Marko client compiler/runtime integration; keep Marko covered by router browser probes until a stable standalone harness is added. |
| primitive-browser | qwik | workspace | browser clear 10k rows | completed | duration | ms | 6.2 | +158.33% | 7 | 5.700000000069849 | 20.199999999953434 | 8.4 | 6.2 | 8.6 | 20.2 | 20.2 | 4.9034 | 20.199999999953434, 6.199999999953434, 5.700000000069849, 5.800000000046566, 8.599999999976717, 6.200000000069849, 6.099999999976717 | bundle gzip bytes: 115798 |
