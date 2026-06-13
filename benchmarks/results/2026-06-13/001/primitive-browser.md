# Primitive Browser Benchmark

## Environment

- Date: 2026-06-13
- Git commit: ae376b459d7536f2671dac8e73b11de791d6d651
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
  - @reckona/mreact-compat: 0.0.162
  - @reckona/mreact-reactive-core: 0.0.162
  - @reckona/mreact-reactive-dom: 0.0.162
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
| 2 | **mreact** | browser create 1k rows | 2.7 | +80% | ms |
| 3 | qwik | browser create 1k rows | 2.8 | +86.67% | ms |
| 4 | vue | browser create 1k rows | 3.3 | +120% | ms |
| 5 | react | browser create 1k rows | 3.5 | +133.33% | ms |
| 6 | svelte | browser create 1k rows | 4.1 | +173.33% | ms |
| 7 | angular | browser create 1k rows | 4.6 | +206.67% | ms |
| 8 | **mreact react-compat** | browser create 1k rows | 4.6 | +206.67% | ms |

### browser update every 10th in 10k rows

Updates every tenth row in a 10,000-row keyed DOM in real Chromium, exposing real DOM update costs hidden by happy-dom.

| rank | framework | case | value | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | --- |
| 1 | **mreact** | browser update every 10th in 10k rows | 1 | best | ms |
| 2 | svelte | browser update every 10th in 10k rows | 2.7 | +170% | ms |
| 3 | react | browser update every 10th in 10k rows | 2.8 | +180% | ms |
| 4 | angular | browser update every 10th in 10k rows | 4 | +300% | ms |
| 5 | **mreact react-compat** | browser update every 10th in 10k rows | 5 | +400% | ms |
| 6 | solid | browser update every 10th in 10k rows | 7.5 | +650% | ms |
| 7 | qwik | browser update every 10th in 10k rows | 8.4 | +740% | ms |
| 8 | vue | browser update every 10th in 10k rows | 11.1 | +1010% | ms |

### browser select row in 10k rows

Toggles selection attributes for one row in a 10,000-row keyed DOM in real Chromium.

| rank | framework | case | value | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | --- |
| 1 | **mreact** | browser select row in 10k rows | 0.9 | best | ms |
| 2 | solid | browser select row in 10k rows | 0.9 | 0% | ms |
| 3 | react | browser select row in 10k rows | 2.4 | +166.67% | ms |
| 4 | svelte | browser select row in 10k rows | 3 | +233.33% | ms |
| 5 | angular | browser select row in 10k rows | 3.6 | +300% | ms |
| 6 | **mreact react-compat** | browser select row in 10k rows | 3.8 | +322.22% | ms |
| 7 | qwik | browser select row in 10k rows | 8.2 | +811.11% | ms |
| 8 | vue | browser select row in 10k rows | 9.9 | +1000% | ms |

### browser clear 10k rows

Clears a 10,000-row keyed DOM in real Chromium to validate happy-dom clear rankings against browser behavior.

| rank | framework | case | value | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | --- |
| 1 | solid | browser clear 10k rows | 2.4 | best | ms |
| 2 | **mreact** | browser clear 10k rows | 2.6 | +8.33% | ms |
| 3 | **mreact react-compat** | browser clear 10k rows | 4 | +66.67% | ms |
| 4 | vue | browser clear 10k rows | 4.7 | +95.83% | ms |
| 5 | qwik | browser clear 10k rows | 5.9 | +145.83% | ms |
| 6 | svelte | browser clear 10k rows | 8.5 | +254.17% | ms |
| 7 | angular | browser clear 10k rows | 8.6 | +258.33% | ms |
| 8 | react | browser clear 10k rows | 11.4 | +375% | ms |

## Results

| suite | framework | version | case | status | metric | unit | value | diff vs 1st | sample count | min | max | mean | median | p75 | p95 | p99 | standard deviation | raw samples | notes |
| --- | --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| primitive-browser | mreact | workspace | browser create 1k rows | completed | duration | ms | 2.7 | +80% | 7 | 2.099999999976717 | 4.199999999953434 | 2.9857 | 2.7 | 4.1 | 4.2 | 4.2 | 0.8096 | 3.199999999953434, 4.099999999976717, 2.400000000023283, 4.199999999953434, 2.199999999953434, 2.099999999976717, 2.699999999953434 | bundle gzip bytes: 468736 |
| primitive-browser | mreact react-compat | workspace | browser create 1k rows | completed | duration | ms | 4.6 | +206.67% | 7 | 2.599999999976717 | 7.300000000046566 | 4.5571 | 4.6 | 6.4 | 7.3 | 7.3 | 1.7377 | 6.400000000023283, 4.599999999976717, 5.299999999930151, 7.300000000046566, 2.900000000023283, 2.599999999976717, 2.799999999930151 | bundle gzip bytes: 468736 |
| primitive-browser | react | workspace | browser create 1k rows | completed | duration | ms | 3.5 | +133.33% | 7 | 3.300000000046566 | 6.099999999976717 | 4.0714 | 3.5 | 4.9 | 6.1 | 6.1 | 0.975 | 4.900000000023283, 3.5, 3.900000000023283, 3.400000000023283, 3.300000000046566, 6.099999999976717, 3.400000000023283 | bundle gzip bytes: 468736 |
| primitive-browser | solid | workspace | browser create 1k rows | completed | duration | ms | 1.5 | best | 7 | 1.400000000023283 | 1.900000000023283 | 1.5857 | 1.5 | 1.7 | 1.9 | 1.9 | 0.1552 | 1.599999999976717, 1.900000000023283, 1.5, 1.5, 1.400000000023283, 1.5, 1.7000000000698492 | bundle gzip bytes: 468736 |
| primitive-browser | vue | workspace | browser create 1k rows | completed | duration | ms | 3.3 | +120% | 7 | 2.900000000023283 | 7.5 | 3.9 | 3.3 | 3.9 | 7.5 | 7.5 | 1.4976 | 3.8999999999068677, 7.5, 3.299999999930151, 3.3999999999068677, 3.1000000000931323, 2.900000000023283, 3.199999999953434 | bundle gzip bytes: 468736 |
| primitive-browser | svelte | workspace | browser create 1k rows | completed | duration | ms | 4.1 | +173.33% | 7 | 3.3999999999068677 | 5.200000000069849 | 4.1857 | 4.1 | 5.2 | 5.2 | 5.2 | 0.6958 | 4.199999999953434, 3.699999999953434, 5.199999999953434, 3.3999999999068677, 3.5, 4.099999999976717, 5.200000000069849 | bundle gzip bytes: 468736 |
| primitive-browser | angular | workspace | browser create 1k rows | completed | duration | ms | 4.6 | +206.67% | 7 | 4.400000000023283 | 8.800000000046566 | 5.5286 | 4.6 | 7 | 8.8 | 8.8 | 1.5773 | 8.800000000046566, 4.599999999976717, 4.600000000093132, 4.700000000069849, 4.400000000023283, 4.599999999976717, 7 | bundle gzip bytes: 468736 |
| primitive-browser | marko | workspace | browser create 1k rows | unsupported | duration | ms | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | Marko's standalone browser primitive fixture requires the Marko client compiler/runtime integration; keep Marko covered by router browser probes until a stable standalone harness is added. |
| primitive-browser | qwik | workspace | browser create 1k rows | completed | duration | ms | 2.8 | +86.67% | 7 | 2.400000000023283 | 8.400000000023283 | 3.5714 | 2.8 | 3.2 | 8.4 | 8.4 | 1.984 | 3.199999999953434, 2.599999999976717, 2.799999999930151, 2.800000000046566, 2.800000000046566, 8.400000000023283, 2.400000000023283 | bundle gzip bytes: 468736 |
| primitive-browser | mreact | workspace | browser update every 10th in 10k rows | completed | duration | ms | 1 | best | 7 | 0.5999999999767169 | 2 | 1.0857 | 1 | 1.4 | 2 | 2 | 0.4389 | 2, 0.7999999999301508, 1.400000000023283, 1, 0.5999999999767169, 0.8000000000465661, 1 | bundle gzip bytes: 468736 |
| primitive-browser | mreact react-compat | workspace | browser update every 10th in 10k rows | completed | duration | ms | 5 | +400% | 7 | 4.599999999976717 | 10.099999999976717 | 5.6571 | 5 | 5.2 | 10.1 | 10.1 | 1.8243 | 5.200000000069849, 4.900000000023283, 5.099999999976717, 10.099999999976717, 5, 4.599999999976717, 4.699999999953434 | bundle gzip bytes: 468736 |
| primitive-browser | react | workspace | browser update every 10th in 10k rows | completed | duration | ms | 2.8 | +180% | 7 | 2.599999999976717 | 11.300000000046566 | 4.0857 | 2.8 | 3.4 | 11.3 | 11.3 | 2.959 | 3.400000000023283, 3.199999999953434, 11.300000000046566, 2.6000000000931323, 2.599999999976717, 2.699999999953434, 2.800000000046566 | bundle gzip bytes: 468736 |
| primitive-browser | solid | workspace | browser update every 10th in 10k rows | completed | duration | ms | 7.5 | +650% | 7 | 7 | 7.700000000069849 | 7.3857 | 7.5 | 7.7 | 7.7 | 7.7 | 0.285 | 7.699999999953434, 7.700000000069849, 7.600000000093132, 7.5, 7.099999999976717, 7, 7.100000000093132 | bundle gzip bytes: 468736 |
| primitive-browser | vue | workspace | browser update every 10th in 10k rows | completed | duration | ms | 11.1 | +1010% | 7 | 10.5 | 21.599999999976717 | 13.4286 | 11.1 | 17.7 | 21.6 | 21.6 | 4.0819 | 10.5, 17.70000000006985, 10.599999999976717, 11.099999999976717, 11.5, 21.599999999976717, 11 | bundle gzip bytes: 468736 |
| primitive-browser | svelte | workspace | browser update every 10th in 10k rows | completed | duration | ms | 2.7 | +170% | 7 | 2.3999999999068677 | 3.800000000046566 | 2.9 | 2.7 | 3.1 | 3.8 | 3.8 | 0.4276 | 3, 2.699999999953434, 2.700000000069849, 2.599999999976717, 3.800000000046566, 3.099999999976717, 2.3999999999068677 | bundle gzip bytes: 468736 |
| primitive-browser | angular | workspace | browser update every 10th in 10k rows | completed | duration | ms | 4 | +300% | 7 | 3.8999999999068677 | 4.199999999953434 | 4.0286 | 4 | 4.2 | 4.2 | 4.2 | 0.1278 | 4.099999999976717, 4.199999999953434, 4.199999999953434, 4, 3.900000000023283, 3.900000000023283, 3.8999999999068677 | bundle gzip bytes: 468736 |
| primitive-browser | marko | workspace | browser update every 10th in 10k rows | unsupported | duration | ms | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | Marko's standalone browser primitive fixture requires the Marko client compiler/runtime integration; keep Marko covered by router browser probes until a stable standalone harness is added. |
| primitive-browser | qwik | workspace | browser update every 10th in 10k rows | completed | duration | ms | 8.4 | +740% | 7 | 7.900000000023283 | 17.79999999993015 | 11.8143 | 8.4 | 16.4 | 17.8 | 17.8 | 4.3725 | 17.79999999993015, 8.400000000023283, 8, 16.400000000023283, 7.900000000023283, 7.900000000023283, 16.29999999993015 | bundle gzip bytes: 468736 |
| primitive-browser | mreact | workspace | browser select row in 10k rows | completed | duration | ms | 0.9 | best | 7 | 0.9000000000232831 | 1 | 0.9429 | 0.9 | 1 | 1 | 1 | 0.0495 | 0.9000000000232831, 1, 1, 0.9000000000232831, 1, 0.9000000000232831, 0.9000000000232831 | bundle gzip bytes: 468736 |
| primitive-browser | mreact react-compat | workspace | browser select row in 10k rows | completed | duration | ms | 3.8 | +322.22% | 7 | 3.599999999976717 | 4.800000000046566 | 3.9 | 3.8 | 3.9 | 4.8 | 4.8 | 0.378 | 3.900000000023283, 3.799999999930151, 3.700000000069849, 3.599999999976717, 3.700000000069849, 4.800000000046566, 3.800000000046566 | bundle gzip bytes: 468736 |
| primitive-browser | react | workspace | browser select row in 10k rows | completed | duration | ms | 2.4 | +166.67% | 7 | 2.3999999999068677 | 2.599999999976717 | 2.4571 | 2.4 | 2.5 | 2.6 | 2.6 | 0.0728 | 2.3999999999068677, 2.5, 2.400000000023283, 2.599999999976717, 2.400000000023283, 2.5, 2.400000000023283 | bundle gzip bytes: 468736 |
| primitive-browser | solid | workspace | browser select row in 10k rows | completed | duration | ms | 0.9 | 0% | 7 | 0.7999999999301508 | 1.1000000000931323 | 0.9429 | 0.9 | 1 | 1.1 | 1.1 | 0.0904 | 0.9000000000232831, 1, 0.9000000000232831, 0.7999999999301508, 1.1000000000931323, 1, 0.9000000000232831 | bundle gzip bytes: 468736 |
| primitive-browser | vue | workspace | browser select row in 10k rows | completed | duration | ms | 9.9 | +1000% | 7 | 9.599999999976717 | 12.599999999976717 | 10.7714 | 9.9 | 12.2 | 12.6 | 12.6 | 1.2127 | 12.199999999953434, 9.70000000006985, 12.599999999976717, 11.599999999976717, 9.599999999976717, 9.79999999993015, 9.900000000023283 | bundle gzip bytes: 468736 |
| primitive-browser | svelte | workspace | browser select row in 10k rows | completed | duration | ms | 3 | +233.33% | 7 | 2.8999999999068677 | 3.099999999976717 | 3 | 3 | 3 | 3.1 | 3.1 | 0.0535 | 3.099999999976717, 2.8999999999068677, 3, 3, 3, 3, 3 | bundle gzip bytes: 468736 |
| primitive-browser | angular | workspace | browser select row in 10k rows | completed | duration | ms | 3.6 | +300% | 7 | 3.5 | 22.5 | 6.3286 | 3.6 | 3.9 | 22.5 | 22.5 | 6.6032 | 3.900000000023283, 3.6000000000931323, 3.5, 3.599999999976717, 22.5, 3.5, 3.700000000069849 | bundle gzip bytes: 468736 |
| primitive-browser | marko | workspace | browser select row in 10k rows | unsupported | duration | ms | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | Marko's standalone browser primitive fixture requires the Marko client compiler/runtime integration; keep Marko covered by router browser probes until a stable standalone harness is added. |
| primitive-browser | qwik | workspace | browser select row in 10k rows | completed | duration | ms | 8.2 | +811.11% | 7 | 7.900000000023283 | 19.70000000006985 | 11.2857 | 8.2 | 18.8 | 19.7 | 19.7 | 5.0439 | 8.20000000006985, 7.900000000023283, 19.70000000006985, 8, 8.20000000006985, 18.79999999993015, 8.199999999953434 | bundle gzip bytes: 468736 |
| primitive-browser | mreact | workspace | browser clear 10k rows | completed | duration | ms | 2.6 | +8.33% | 7 | 2.3999999999068677 | 4.199999999953434 | 2.8714 | 2.6 | 3.1 | 4.2 | 4.2 | 0.5799 | 4.199999999953434, 3.1000000000931323, 2.599999999976717, 2.700000000069849, 2.3999999999068677, 2.599999999976717, 2.5 | bundle gzip bytes: 468736 |
| primitive-browser | mreact react-compat | workspace | browser clear 10k rows | completed | duration | ms | 4 | +66.67% | 7 | 3.900000000023283 | 6.599999999976717 | 4.3857 | 4 | 4.2 | 6.6 | 6.6 | 0.9094 | 3.900000000023283, 4.100000000093132, 6.599999999976717, 4, 4, 4.199999999953434, 3.900000000023283 | bundle gzip bytes: 468736 |
| primitive-browser | react | workspace | browser clear 10k rows | completed | duration | ms | 11.4 | +375% | 7 | 11 | 15.800000000046566 | 12.1 | 11.4 | 12.6 | 15.8 | 15.8 | 1.5866 | 15.800000000046566, 11.20000000006985, 11, 11.199999999953434, 12.599999999976717, 11.400000000023283, 11.5 | bundle gzip bytes: 468736 |
| primitive-browser | solid | workspace | browser clear 10k rows | completed | duration | ms | 2.4 | best | 7 | 2.299999999930151 | 12.599999999976717 | 3.8429 | 2.4 | 2.5 | 12.6 | 12.6 | 3.5757 | 2.400000000023283, 2.5, 12.599999999976717, 2.400000000023283, 2.3999999999068677, 2.300000000046566, 2.299999999930151 | bundle gzip bytes: 468736 |
| primitive-browser | vue | workspace | browser clear 10k rows | completed | duration | ms | 4.7 | +95.83% | 7 | 4.400000000023283 | 22.099999999976717 | 7.2571 | 4.7 | 5.5 | 22.1 | 22.1 | 6.0693 | 5.5, 5, 4.699999999953434, 22.099999999976717, 4.5, 4.400000000023283, 4.599999999976717 | bundle gzip bytes: 468736 |
| primitive-browser | svelte | workspace | browser clear 10k rows | completed | duration | ms | 8.5 | +254.17% | 7 | 7.800000000046566 | 11 | 8.6857 | 8.5 | 8.7 | 11 | 11 | 0.992 | 8.699999999953434, 8.5, 7.800000000046566, 11, 8.20000000006985, 8.599999999976717, 8 | bundle gzip bytes: 468736 |
| primitive-browser | angular | workspace | browser clear 10k rows | completed | duration | ms | 8.6 | +258.33% | 7 | 8.400000000023283 | 17.600000000093132 | 10.1286 | 8.6 | 10.7 | 17.6 | 17.6 | 3.1422 | 8.5, 10.699999999953434, 8.5, 8.400000000023283, 17.600000000093132, 8.600000000093132, 8.599999999976717 | bundle gzip bytes: 468736 |
| primitive-browser | marko | workspace | browser clear 10k rows | unsupported | duration | ms | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | Marko's standalone browser primitive fixture requires the Marko client compiler/runtime integration; keep Marko covered by router browser probes until a stable standalone harness is added. |
| primitive-browser | qwik | workspace | browser clear 10k rows | completed | duration | ms | 5.9 | +145.83% | 7 | 5.800000000046566 | 6.099999999976717 | 5.9429 | 5.9 | 6 | 6.1 | 6.1 | 0.0904 | 5.800000000046566, 5.900000000023283, 5.900000000023283, 6, 5.899999999906868, 6.099999999976717, 6 | bundle gzip bytes: 468736 |
