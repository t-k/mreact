# Primitive Browser Benchmark

## Environment

- Date: 2026-06-14
- Git commit: 83149ff3797f4e5baf61c3d97e46cb1f0c137f24
- Node: v24.16.0
- NODE_ENV: production
- pnpm: 10.19.0
- Platform: linux x64
- CPU: AMD EPYC 9V74 80-Core Processor (4)
- Memory: 16766423040 bytes
- Package versions:
  - @angular/core: 22.0.1
  - @builder.io/qwik: 1.20.0
  - @playwright/test: 1.60.0
  - @reckona/mreact-compat: 0.0.167
  - @reckona/mreact-reactive-core: 0.0.167
  - @reckona/mreact-reactive-dom: 0.0.167
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
| 1 | solid | browser create 1k rows | 1.3 | best | ms |
| 2 | **mreact** | browser create 1k rows | 2.1 | +61.54% | ms |
| 3 | qwik | browser create 1k rows | 2.1 | +61.54% | ms |
| 4 | vue | browser create 1k rows | 2.6 | +100% | ms |
| 5 | react | browser create 1k rows | 2.7 | +107.69% | ms |
| 6 | svelte | browser create 1k rows | 3 | +130.77% | ms |
| 7 | **mreact react-compat** | browser create 1k rows | 3.3 | +153.85% | ms |
| 8 | angular | browser create 1k rows | 3.8 | +192.31% | ms |

### browser update every 10th in 10k rows

Updates every tenth row in a 10,000-row keyed DOM in real Chromium, exposing real DOM update costs hidden by happy-dom.

| rank | framework | case | value | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | --- |
| 1 | **mreact** | browser update every 10th in 10k rows | 0.7 | best | ms |
| 2 | svelte | browser update every 10th in 10k rows | 2 | +185.71% | ms |
| 3 | react | browser update every 10th in 10k rows | 2.3 | +228.57% | ms |
| 4 | angular | browser update every 10th in 10k rows | 3.1 | +342.86% | ms |
| 5 | **mreact react-compat** | browser update every 10th in 10k rows | 3.9 | +457.14% | ms |
| 6 | solid | browser update every 10th in 10k rows | 5.9 | +742.86% | ms |
| 7 | qwik | browser update every 10th in 10k rows | 6.7 | +857.14% | ms |
| 8 | vue | browser update every 10th in 10k rows | 8.8 | +1157.14% | ms |

### browser select row in 10k rows

Toggles selection attributes for one row in a 10,000-row keyed DOM in real Chromium.

| rank | framework | case | value | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | --- |
| 1 | solid | browser select row in 10k rows | 0.7 | best | ms |
| 2 | **mreact** | browser select row in 10k rows | 0.8 | +14.29% | ms |
| 3 | react | browser select row in 10k rows | 1.9 | +171.43% | ms |
| 4 | svelte | browser select row in 10k rows | 2.1 | +200% | ms |
| 5 | angular | browser select row in 10k rows | 2.8 | +300% | ms |
| 6 | **mreact react-compat** | browser select row in 10k rows | 3 | +328.57% | ms |
| 7 | qwik | browser select row in 10k rows | 6.3 | +800% | ms |
| 8 | vue | browser select row in 10k rows | 7.6 | +985.71% | ms |

### browser clear 10k rows

Clears a 10,000-row keyed DOM in real Chromium to validate happy-dom clear rankings against browser behavior.

| rank | framework | case | value | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | --- |
| 1 | **mreact** | browser clear 10k rows | 1.9 | best | ms |
| 2 | solid | browser clear 10k rows | 1.9 | 0% | ms |
| 3 | **mreact react-compat** | browser clear 10k rows | 3.3 | +73.68% | ms |
| 4 | vue | browser clear 10k rows | 3.9 | +105.26% | ms |
| 5 | qwik | browser clear 10k rows | 4.4 | +131.58% | ms |
| 6 | react | browser clear 10k rows | 5.4 | +184.21% | ms |
| 7 | angular | browser clear 10k rows | 7.1 | +273.68% | ms |
| 8 | svelte | browser clear 10k rows | 7.2 | +278.95% | ms |

## Results

| suite | framework | version | case | status | metric | unit | value | diff vs 1st | sample count | min | max | mean | median | p75 | p95 | p99 | standard deviation | raw samples | notes |
| --- | --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| primitive-browser | mreact | workspace | browser create 1k rows | completed | duration | ms | 2.1 | +61.54% | 7 | 1.6999999999534339 | 3.1000000000931323 | 2.2 | 2.1 | 2.5 | 3.1 | 3.1 | 0.4504 | 2.099999999976717, 2.5, 2.199999999953434, 2.099999999976717, 1.6999999999534339, 3.1000000000931323, 1.6999999999534339 | bundle gzip bytes: 470145 |
| primitive-browser | mreact react-compat | workspace | browser create 1k rows | completed | duration | ms | 3.3 | +153.85% | 7 | 2 | 4.699999999953434 | 3.1143 | 3.3 | 3.5 | 4.7 | 4.7 | 0.8708 | 4.699999999953434, 3.5, 3.400000000023283, 3.300000000046566, 2, 2, 2.900000000023283 | bundle gzip bytes: 470145 |
| primitive-browser | react | workspace | browser create 1k rows | completed | duration | ms | 2.7 | +107.69% | 7 | 2.5 | 3.199999999953434 | 2.7286 | 2.7 | 2.8 | 3.2 | 3.2 | 0.2119 | 3.199999999953434, 2.599999999976717, 2.799999999930151, 2.599999999976717, 2.699999999953434, 2.5, 2.700000000069849 | bundle gzip bytes: 470145 |
| primitive-browser | solid | workspace | browser create 1k rows | completed | duration | ms | 1.3 | best | 7 | 1.1999999999534339 | 1.5 | 1.3143 | 1.3 | 1.4 | 1.5 | 1.5 | 0.099 | 1.2999999999301508, 1.5, 1.3000000000465661, 1.3999999999068677, 1.1999999999534339, 1.3000000000465661, 1.2000000000698492 | bundle gzip bytes: 470145 |
| primitive-browser | vue | workspace | browser create 1k rows | completed | duration | ms | 2.6 | +100% | 7 | 2.3999999999068677 | 3.599999999976717 | 2.7857 | 2.6 | 3 | 3.6 | 3.6 | 0.3943 | 3, 3.599999999976717, 2.599999999976717, 2.900000000023283, 2.400000000023283, 2.3999999999068677, 2.599999999976717 | bundle gzip bytes: 470145 |
| primitive-browser | svelte | workspace | browser create 1k rows | completed | duration | ms | 3 | +130.77% | 7 | 2.800000000046566 | 15.70000000006985 | 5.8143 | 3 | 9.2 | 15.7 | 15.7 | 4.568 | 9.199999999953434, 15.70000000006985, 4.300000000046566, 2.900000000023283, 2.800000000046566, 2.800000000046566, 3 | bundle gzip bytes: 470145 |
| primitive-browser | angular | workspace | browser create 1k rows | completed | duration | ms | 3.8 | +192.31% | 7 | 3.5 | 8.800000000046566 | 4.6714 | 3.8 | 5.3 | 8.8 | 8.8 | 1.7758 | 5.300000000046566, 3.800000000046566, 3.800000000046566, 3.900000000023283, 3.5, 3.6000000000931323, 8.800000000046566 | bundle gzip bytes: 470145 |
| primitive-browser | marko | workspace | browser create 1k rows | unsupported | duration | ms | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | Marko's standalone browser primitive fixture requires the Marko client compiler/runtime integration; keep Marko covered by router browser probes until a stable standalone harness is added. |
| primitive-browser | qwik | workspace | browser create 1k rows | completed | duration | ms | 2.1 | +61.54% | 7 | 1.900000000023283 | 2.300000000046566 | 2.1286 | 2.1 | 2.3 | 2.3 | 2.3 | 0.1278 | 2.300000000046566, 1.900000000023283, 2.099999999976717, 2.099999999976717, 2.099999999976717, 2.300000000046566, 2.1000000000931323 | bundle gzip bytes: 470145 |
| primitive-browser | mreact | workspace | browser update every 10th in 10k rows | completed | duration | ms | 0.7 | best | 7 | 0.5999999999767169 | 1.1000000000931323 | 0.7429 | 0.7 | 0.9 | 1.1 | 1.1 | 0.1761 | 1.1000000000931323, 0.5999999999767169, 0.5999999999767169, 0.9000000000232831, 0.7000000000698492, 0.6999999999534339, 0.5999999999767169 | bundle gzip bytes: 470145 |
| primitive-browser | mreact react-compat | workspace | browser update every 10th in 10k rows | completed | duration | ms | 3.9 | +457.14% | 7 | 3.6000000000931323 | 4.400000000023283 | 3.9 | 3.9 | 3.9 | 4.4 | 4.4 | 0.2268 | 3.900000000023283, 3.6000000000931323, 4.400000000023283, 3.800000000046566, 3.8999999999068677, 3.900000000023283, 3.800000000046566 | bundle gzip bytes: 470145 |
| primitive-browser | react | workspace | browser update every 10th in 10k rows | completed | duration | ms | 2.3 | +228.57% | 7 | 2.199999999953434 | 7.699999999953434 | 3.0286 | 2.3 | 2.3 | 7.7 | 7.7 | 1.9077 | 2.300000000046566, 2.199999999953434, 2.199999999953434, 2.300000000046566, 2.199999999953434, 7.699999999953434, 2.299999999930151 | bundle gzip bytes: 470145 |
| primitive-browser | solid | workspace | browser update every 10th in 10k rows | completed | duration | ms | 5.9 | +742.86% | 7 | 5.400000000023283 | 6 | 5.7857 | 5.9 | 6 | 6 | 6 | 0.21 | 6, 5.600000000093132, 5.699999999953434, 5.899999999906868, 5.899999999906868, 6, 5.400000000023283 | bundle gzip bytes: 470145 |
| primitive-browser | vue | workspace | browser update every 10th in 10k rows | completed | duration | ms | 8.8 | +1157.14% | 7 | 8.199999999953434 | 61.699999999953434 | 17.1143 | 8.8 | 14.5 | 61.7 | 61.7 | 18.314 | 8.199999999953434, 14.5, 9.400000000023283, 61.699999999953434, 8.599999999976717, 8.800000000046566, 8.599999999976717 | bundle gzip bytes: 470145 |
| primitive-browser | svelte | workspace | browser update every 10th in 10k rows | completed | duration | ms | 2 | +185.71% | 7 | 1.8000000000465661 | 2.799999999930151 | 2.0714 | 2 | 2.1 | 2.8 | 2.8 | 0.3104 | 2.099999999976717, 2, 2, 1.8000000000465661, 1.8999999999068677, 2.799999999930151, 1.900000000023283 | bundle gzip bytes: 470145 |
| primitive-browser | angular | workspace | browser update every 10th in 10k rows | completed | duration | ms | 3.1 | +342.86% | 7 | 3 | 3.200000000069849 | 3.1143 | 3.1 | 3.2 | 3.2 | 3.2 | 0.0639 | 3.200000000069849, 3.200000000069849, 3.099999999976717, 3.1000000000931323, 3.099999999976717, 3.099999999976717, 3 | bundle gzip bytes: 470145 |
| primitive-browser | marko | workspace | browser update every 10th in 10k rows | unsupported | duration | ms | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | Marko's standalone browser primitive fixture requires the Marko client compiler/runtime integration; keep Marko covered by router browser probes until a stable standalone harness is added. |
| primitive-browser | qwik | workspace | browser update every 10th in 10k rows | completed | duration | ms | 6.7 | +857.14% | 7 | 6.299999999930151 | 17.699999999953434 | 10.6 | 6.7 | 15.6 | 17.7 | 17.7 | 4.9016 | 17.699999999953434, 6.700000000069849, 6.300000000046566, 15.300000000046566, 6.300000000046566, 6.299999999930151, 15.600000000093132 | bundle gzip bytes: 470145 |
| primitive-browser | mreact | workspace | browser select row in 10k rows | completed | duration | ms | 0.8 | +14.29% | 7 | 0.6999999999534339 | 1 | 0.8 | 0.8 | 0.9 | 1 | 1 | 0.1069 | 0.7999999999301508, 1, 0.6999999999534339, 0.6999999999534339, 0.7000000000698492, 0.8000000000465661, 0.9000000000232831 | bundle gzip bytes: 470145 |
| primitive-browser | mreact react-compat | workspace | browser select row in 10k rows | completed | duration | ms | 3 | +328.57% | 7 | 2.8999999999068677 | 3.099999999976717 | 2.9857 | 3 | 3 | 3.1 | 3.1 | 0.0639 | 3, 3, 2.8999999999068677, 3.099999999976717, 2.900000000023283, 3, 3 | bundle gzip bytes: 470145 |
| primitive-browser | react | workspace | browser select row in 10k rows | completed | duration | ms | 1.9 | +171.43% | 7 | 1.7999999999301508 | 50.699999999953434 | 8.8286 | 1.9 | 1.9 | 50.7 | 50.7 | 17.094 | 50.699999999953434, 1.900000000023283, 1.900000000023283, 1.7999999999301508, 1.900000000023283, 1.8000000000465661, 1.7999999999301508 | bundle gzip bytes: 470145 |
| primitive-browser | solid | workspace | browser select row in 10k rows | completed | duration | ms | 0.7 | best | 7 | 0.6999999999534339 | 1.1999999999534339 | 0.8 | 0.7 | 0.8 | 1.2 | 1.2 | 0.169 | 0.6999999999534339, 0.8000000000465661, 0.7999999999301508, 0.6999999999534339, 0.7000000000698492, 0.6999999999534339, 1.1999999999534339 | bundle gzip bytes: 470145 |
| primitive-browser | vue | workspace | browser select row in 10k rows | completed | duration | ms | 7.6 | +985.71% | 7 | 7.5 | 70 | 16.7 | 7.6 | 9 | 70 | 70 | 21.7654 | 9, 7.800000000046566, 7.600000000093132, 7.5, 7.5, 70, 7.5 | bundle gzip bytes: 470145 |
| primitive-browser | svelte | workspace | browser select row in 10k rows | completed | duration | ms | 2.1 | +200% | 7 | 2 | 2.5 | 2.1857 | 2.1 | 2.3 | 2.5 | 2.5 | 0.1552 | 2.199999999953434, 2.5, 2.300000000046566, 2.099999999976717, 2.099999999976717, 2.099999999976717, 2 | bundle gzip bytes: 470145 |
| primitive-browser | angular | workspace | browser select row in 10k rows | completed | duration | ms | 2.8 | +300% | 7 | 2.599999999976717 | 42.59999999997672 | 8.4286 | 2.8 | 2.9 | 42.6 | 42.6 | 13.9508 | 2.900000000023283, 2.599999999976717, 2.800000000046566, 2.700000000069849, 2.599999999976717, 42.59999999997672, 2.800000000046566 | bundle gzip bytes: 470145 |
| primitive-browser | marko | workspace | browser select row in 10k rows | unsupported | duration | ms | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | Marko's standalone browser primitive fixture requires the Marko client compiler/runtime integration; keep Marko covered by router browser probes until a stable standalone harness is added. |
| primitive-browser | qwik | workspace | browser select row in 10k rows | completed | duration | ms | 6.3 | +800% | 7 | 6.199999999953434 | 17.599999999976717 | 9.3286 | 6.3 | 16.1 | 17.6 | 17.6 | 4.7745 | 17.599999999976717, 6.299999999930151, 6.300000000046566, 16.099999999976717, 6.300000000046566, 6.199999999953434, 6.5 | bundle gzip bytes: 470145 |
| primitive-browser | mreact | workspace | browser clear 10k rows | completed | duration | ms | 1.9 | best | 7 | 1.8000000000465661 | 19.800000000046566 | 4.5571 | 1.9 | 2.7 | 19.8 | 19.8 | 6.2296 | 1.900000000023283, 1.8000000000465661, 19.800000000046566, 2.699999999953434, 2, 1.900000000023283, 1.8000000000465661 | bundle gzip bytes: 470145 |
| primitive-browser | mreact react-compat | workspace | browser clear 10k rows | completed | duration | ms | 3.3 | +73.68% | 7 | 3.200000000069849 | 11.599999999976717 | 4.7714 | 3.3 | 5.4 | 11.6 | 11.6 | 2.8823 | 3.300000000046566, 3.300000000046566, 5.399999999906868, 3.299999999930151, 11.599999999976717, 3.200000000069849, 3.299999999930151 | bundle gzip bytes: 470145 |
| primitive-browser | react | workspace | browser clear 10k rows | completed | duration | ms | 5.4 | +184.21% | 7 | 5.099999999976717 | 48.199999999953434 | 11.4857 | 5.4 | 5.6 | 48.2 | 48.2 | 14.9893 | 48.199999999953434, 5.600000000093132, 5.400000000023283, 5.5, 5.299999999930151, 5.299999999930151, 5.099999999976717 | bundle gzip bytes: 470145 |
| primitive-browser | solid | workspace | browser clear 10k rows | completed | duration | ms | 1.9 | 0% | 7 | 1.6999999999534339 | 9.5 | 2.9286 | 1.9 | 1.9 | 9.5 | 9.5 | 2.6842 | 1.900000000023283, 1.900000000023283, 1.900000000023283, 1.900000000023283, 1.7000000000698492, 9.5, 1.6999999999534339 | bundle gzip bytes: 470145 |
| primitive-browser | vue | workspace | browser clear 10k rows | completed | duration | ms | 3.9 | +105.26% | 7 | 3.5 | 6 | 4.0429 | 3.9 | 4 | 6 | 6 | 0.8244 | 4, 3.900000000023283, 3.8999999999068677, 3.5, 6, 3.5, 3.5 | bundle gzip bytes: 470145 |
| primitive-browser | svelte | workspace | browser clear 10k rows | completed | duration | ms | 7.2 | +278.95% | 7 | 6.5 | 7.699999999953434 | 7.1286 | 7.2 | 7.4 | 7.7 | 7.7 | 0.3692 | 7.400000000023283, 7, 6.5, 7.699999999953434, 7.200000000069849, 7.299999999930151, 6.800000000046566 | bundle gzip bytes: 470145 |
| primitive-browser | angular | workspace | browser clear 10k rows | completed | duration | ms | 7.1 | +273.68% | 7 | 6.5 | 12.300000000046566 | 8.5857 | 7.1 | 11.8 | 12.3 | 12.3 | 2.3436 | 6.700000000069849, 7.099999999976717, 6.5, 6.599999999976717, 11.800000000046566, 12.300000000046566, 9.100000000093132 | bundle gzip bytes: 470145 |
| primitive-browser | marko | workspace | browser clear 10k rows | unsupported | duration | ms | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | Marko's standalone browser primitive fixture requires the Marko client compiler/runtime integration; keep Marko covered by router browser probes until a stable standalone harness is added. |
| primitive-browser | qwik | workspace | browser clear 10k rows | completed | duration | ms | 4.4 | +131.58% | 7 | 4.399999999906868 | 15.400000000023283 | 6 | 4.4 | 4.6 | 15.4 | 15.4 | 3.8382 | 4.400000000023283, 4.400000000023283, 4.599999999976717, 15.400000000023283, 4.400000000023283, 4.399999999906868, 4.400000000023283 | bundle gzip bytes: 470145 |
