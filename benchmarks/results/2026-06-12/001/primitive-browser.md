# Primitive Browser Benchmark

## Environment

- Date: 2026-06-12
- Git commit: cf1f6edd8d35ba6df67c244cc758d6d419a01b39
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
  - @reckona/mreact-compat: 0.0.160
  - @reckona/mreact-reactive-core: 0.0.160
  - @reckona/mreact-reactive-dom: 0.0.160
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
| 1 | solid | browser create 1k rows | 1.6 | best | ms |
| 2 | **mreact** | browser create 1k rows | 2.3 | +43.75% | ms |
| 3 | **mreact react-compat** | browser create 1k rows | 2.7 | +68.75% | ms |
| 4 | qwik | browser create 1k rows | 2.8 | +75% | ms |
| 5 | vue | browser create 1k rows | 3.2 | +100% | ms |
| 6 | react | browser create 1k rows | 3.5 | +118.75% | ms |
| 7 | svelte | browser create 1k rows | 4.3 | +168.75% | ms |
| 8 | angular | browser create 1k rows | 5.2 | +225% | ms |

### browser update every 10th in 10k rows

Updates every tenth row in a 10,000-row keyed DOM in real Chromium, exposing real DOM update costs hidden by happy-dom.

| rank | framework | case | value | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | --- |
| 1 | **mreact** | browser update every 10th in 10k rows | 1 | best | ms |
| 2 | react | browser update every 10th in 10k rows | 2.9 | +190% | ms |
| 3 | svelte | browser update every 10th in 10k rows | 2.9 | +190% | ms |
| 4 | angular | browser update every 10th in 10k rows | 4 | +300% | ms |
| 5 | **mreact react-compat** | browser update every 10th in 10k rows | 5.3 | +430% | ms |
| 6 | solid | browser update every 10th in 10k rows | 7.7 | +670% | ms |
| 7 | qwik | browser update every 10th in 10k rows | 8.6 | +760% | ms |
| 8 | vue | browser update every 10th in 10k rows | 12.5 | +1150% | ms |

### browser select row in 10k rows

Toggles selection attributes for one row in a 10,000-row keyed DOM in real Chromium.

| rank | framework | case | value | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | --- |
| 1 | **mreact** | browser select row in 10k rows | 1 | best | ms |
| 2 | solid | browser select row in 10k rows | 1 | 0% | ms |
| 3 | react | browser select row in 10k rows | 2.8 | +180% | ms |
| 4 | svelte | browser select row in 10k rows | 3.1 | +210% | ms |
| 5 | angular | browser select row in 10k rows | 3.6 | +260% | ms |
| 6 | **mreact react-compat** | browser select row in 10k rows | 3.7 | +270% | ms |
| 7 | qwik | browser select row in 10k rows | 8.4 | +740% | ms |
| 8 | vue | browser select row in 10k rows | 11 | +1000% | ms |

### browser clear 10k rows

Clears a 10,000-row keyed DOM in real Chromium to validate happy-dom clear rankings against browser behavior.

| rank | framework | case | value | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | --- |
| 1 | solid | browser clear 10k rows | 2.4 | best | ms |
| 2 | **mreact** | browser clear 10k rows | 2.7 | +12.5% | ms |
| 3 | **mreact react-compat** | browser clear 10k rows | 4.1 | +70.83% | ms |
| 4 | vue | browser clear 10k rows | 4.9 | +104.17% | ms |
| 5 | qwik | browser clear 10k rows | 6 | +150% | ms |
| 6 | angular | browser clear 10k rows | 8.5 | +254.17% | ms |
| 7 | react | browser clear 10k rows | 8.5 | +254.17% | ms |
| 8 | svelte | browser clear 10k rows | 8.6 | +258.33% | ms |

## Results

| suite | framework | version | case | status | metric | unit | value | diff vs 1st | sample count | min | max | mean | median | p75 | p95 | p99 | standard deviation | raw samples | notes |
| --- | --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| primitive-browser | mreact | workspace | browser create 1k rows | completed | duration | ms | 2.3 | +43.75% | 7 | 2 | 3 | 2.4 | 2.3 | 2.9 | 3 | 3 | 0.3742 | 3, 2.9000000001396984, 2.3999999999068677, 2.300000000046566, 2, 2, 2.199999999953434 | bundle gzip bytes: 468726 |
| primitive-browser | mreact react-compat | workspace | browser create 1k rows | completed | duration | ms | 2.7 | +68.75% | 7 | 2.5 | 6.199999999953434 | 3.4571 | 2.7 | 4.3 | 6.2 | 6.2 | 1.267 | 4.2999999998137355, 3.300000000046566, 2.699999999953434, 6.199999999953434, 2.699999999953434, 2.5, 2.5 | bundle gzip bytes: 468726 |
| primitive-browser | react | workspace | browser create 1k rows | completed | duration | ms | 3.5 | +118.75% | 7 | 3.3999999999068677 | 6.400000000139698 | 4.0143 | 3.5 | 4.2 | 6.4 | 6.4 | 1.0077 | 4.2000000001862645, 3.5, 3.699999999953434, 3.3999999999068677, 3.5, 6.400000000139698, 3.3999999999068677 | bundle gzip bytes: 468726 |
| primitive-browser | solid | workspace | browser create 1k rows | completed | duration | ms | 1.6 | best | 7 | 1.5 | 1.8000000000465661 | 1.6429 | 1.6 | 1.7 | 1.8 | 1.8 | 0.0904 | 1.6999999999534339, 1.8000000000465661, 1.5999999998603016, 1.7000000001862645, 1.5999999998603016, 1.6000000000931323, 1.5 | bundle gzip bytes: 468726 |
| primitive-browser | vue | workspace | browser create 1k rows | completed | duration | ms | 3.2 | +100% | 7 | 2.800000000046566 | 6.399999999906868 | 3.6714 | 3.2 | 3.7 | 6.4 | 6.4 | 1.1486 | 3.699999999953434, 6.399999999906868, 3.199999999953434, 3.5, 3.1000000000931323, 2.800000000046566, 3 | bundle gzip bytes: 468726 |
| primitive-browser | svelte | workspace | browser create 1k rows | completed | duration | ms | 4.3 | +168.75% | 7 | 3.300000000046566 | 5.5 | 4.3714 | 4.3 | 5.3 | 5.5 | 5.5 | 0.7573 | 4.600000000093132, 3.699999999953434, 5.300000000046566, 3.300000000046566, 3.8999999999068677, 4.300000000046566, 5.5 | bundle gzip bytes: 468726 |
| primitive-browser | angular | workspace | browser create 1k rows | completed | duration | ms | 5.2 | +225% | 7 | 4.800000000046566 | 7.899999999906868 | 5.6714 | 5.2 | 6.3 | 7.9 | 7.9 | 1.0095 | 6.300000000046566, 5.199999999953434, 5.099999999860302, 5.100000000093132, 5.300000000046566, 4.800000000046566, 7.899999999906868 | bundle gzip bytes: 468726 |
| primitive-browser | marko | workspace | browser create 1k rows | unsupported | duration | ms | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | Marko's standalone browser primitive fixture requires the Marko client compiler/runtime integration; keep Marko covered by router browser probes until a stable standalone harness is added. |
| primitive-browser | qwik | workspace | browser create 1k rows | completed | duration | ms | 2.8 | +75% | 7 | 2.300000000046566 | 9.299999999813735 | 3.7 | 2.8 | 3.1 | 9.3 | 9.3 | 2.2972 | 3.0999999998603016, 2.800000000046566, 2.800000000046566, 2.9000000001396984, 9.299999999813735, 2.699999999953434, 2.300000000046566 | bundle gzip bytes: 468726 |
| primitive-browser | mreact | workspace | browser update every 10th in 10k rows | completed | duration | ms | 1 | best | 7 | 0.8000000000465661 | 2.199999999953434 | 1.1286 | 1 | 1.3 | 2.2 | 2.2 | 0.4682 | 2.199999999953434, 0.8000000000465661, 1, 1, 0.8000000000465661, 0.8000000000465661, 1.3000000000465661 | bundle gzip bytes: 468726 |
| primitive-browser | mreact react-compat | workspace | browser update every 10th in 10k rows | completed | duration | ms | 5.3 | +430% | 7 | 4.899999999906868 | 10.599999999860302 | 5.9429 | 5.3 | 5.4 | 10.6 | 10.6 | 1.9108 | 5.399999999906868, 4.899999999906868, 5.400000000139698, 5, 5.300000000046566, 10.599999999860302, 5 | bundle gzip bytes: 468726 |
| primitive-browser | react | workspace | browser update every 10th in 10k rows | completed | duration | ms | 2.9 | +190% | 7 | 2.699999999953434 | 10 | 3.9429 | 2.9 | 3.3 | 10 | 10 | 2.4801 | 10, 3.2999999998137355, 2.9000000001396984, 3.0999999998603016, 2.699999999953434, 2.800000000046566, 2.800000000046566 | bundle gzip bytes: 468726 |
| primitive-browser | solid | workspace | browser update every 10th in 10k rows | completed | duration | ms | 7.7 | +670% | 7 | 7.199999999953434 | 8.900000000139698 | 7.8 | 7.7 | 7.9 | 8.9 | 8.9 | 0.4928 | 7.7000000001862645, 7.699999999953434, 7.5, 7.899999999906868, 7.699999999953434, 8.900000000139698, 7.199999999953434 | bundle gzip bytes: 468726 |
| primitive-browser | vue | workspace | browser update every 10th in 10k rows | completed | duration | ms | 12.5 | +1150% | 7 | 10.800000000046566 | 22.5 | 15.2286 | 12.5 | 22.3 | 22.5 | 22.5 | 4.6864 | 10.800000000046566, 22.5, 11.5, 12.100000000093132, 14.899999999906868, 22.300000000046566, 12.5 | bundle gzip bytes: 468726 |
| primitive-browser | svelte | workspace | browser update every 10th in 10k rows | completed | duration | ms | 2.9 | +190% | 7 | 2.699999999953434 | 3.4000000001396984 | 2.9286 | 2.9 | 3 | 3.4 | 3.4 | 0.2119 | 3.4000000001396984, 2.8999999999068677, 2.699999999953434, 3, 2.8999999999068677, 2.800000000046566, 2.800000000046566 | bundle gzip bytes: 468726 |
| primitive-browser | angular | workspace | browser update every 10th in 10k rows | completed | duration | ms | 4 | +300% | 7 | 3.800000000046566 | 4.300000000046566 | 4.0429 | 4 | 4.2 | 4.3 | 4.3 | 0.1761 | 4.300000000046566, 4.199999999953434, 4.199999999953434, 3.8999999999068677, 3.8999999999068677, 3.800000000046566, 4 | bundle gzip bytes: 468726 |
| primitive-browser | marko | workspace | browser update every 10th in 10k rows | unsupported | duration | ms | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | Marko's standalone browser primitive fixture requires the Marko client compiler/runtime integration; keep Marko covered by router browser probes until a stable standalone harness is added. |
| primitive-browser | qwik | workspace | browser update every 10th in 10k rows | completed | duration | ms | 8.6 | +760% | 7 | 8 | 20.0999999998603 | 11.4 | 8.6 | 17.4 | 20.1 | 20.1 | 4.728 | 20.0999999998603, 8.600000000093132, 8, 17.399999999906868, 8.099999999860302, 8.099999999860302, 9.5 | bundle gzip bytes: 468726 |
| primitive-browser | mreact | workspace | browser select row in 10k rows | completed | duration | ms | 1 | best | 7 | 0.8999999999068677 | 1.0999999998603016 | 1 | 1 | 1 | 1.1 | 1.1 | 0.0535 | 1, 1.0999999998603016, 1, 1, 1, 1, 0.8999999999068677 | bundle gzip bytes: 468726 |
| primitive-browser | mreact react-compat | workspace | browser select row in 10k rows | completed | duration | ms | 3.7 | +270% | 7 | 3.699999999953434 | 45.39999999990687 | 9.7 | 3.7 | 3.9 | 45.4 | 45.4 | 14.5746 | 3.800000000046566, 3.699999999953434, 3.7000000001862645, 3.7000000001862645, 45.39999999990687, 3.8999999999068677, 3.699999999953434 | bundle gzip bytes: 468726 |
| primitive-browser | react | workspace | browser select row in 10k rows | completed | duration | ms | 2.8 | +180% | 7 | 2.3999999999068677 | 9.800000000046566 | 4 | 2.8 | 4.2 | 9.8 | 9.8 | 2.4559 | 3.800000000046566, 4.199999999953434, 2.800000000046566, 2.5, 9.800000000046566, 2.5, 2.3999999999068677 | bundle gzip bytes: 468726 |
| primitive-browser | solid | workspace | browser select row in 10k rows | completed | duration | ms | 1 | 0% | 7 | 0.8999999999068677 | 1.1000000000931323 | 1 | 1 | 1.1 | 1.1 | 1.1 | 0.0756 | 0.8999999999068677, 1, 1, 1.1000000000931323, 1, 1.1000000000931323, 0.8999999999068677 | bundle gzip bytes: 468726 |
| primitive-browser | vue | workspace | browser select row in 10k rows | completed | duration | ms | 11 | +1000% | 7 | 10.200000000186265 | 12.5 | 11.1 | 11 | 11.6 | 12.5 | 12.5 | 0.7483 | 12.5, 10.300000000046566, 10.200000000186265, 11.399999999906868, 11.600000000093132, 11, 10.699999999953434 | bundle gzip bytes: 468726 |
| primitive-browser | svelte | workspace | browser select row in 10k rows | completed | duration | ms | 3.1 | +210% | 7 | 2.699999999953434 | 3.5 | 3.0429 | 3.1 | 3.1 | 3.5 | 3.5 | 0.2321 | 3.1000000000931323, 2.699999999953434, 3.1000000000931323, 2.8999999999068677, 3.5, 2.9000000001396984, 3.0999999998603016 | bundle gzip bytes: 468726 |
| primitive-browser | angular | workspace | browser select row in 10k rows | completed | duration | ms | 3.6 | +260% | 7 | 3.5 | 19 | 7.8143 | 3.6 | 17.9 | 19 | 19 | 6.7332 | 3.6000000000931323, 19, 3.5, 3.6000000000931323, 17.9000000001397, 3.5, 3.6000000000931323 | bundle gzip bytes: 468726 |
| primitive-browser | marko | workspace | browser select row in 10k rows | unsupported | duration | ms | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | Marko's standalone browser primitive fixture requires the Marko client compiler/runtime integration; keep Marko covered by router browser probes until a stable standalone harness is added. |
| primitive-browser | qwik | workspace | browser select row in 10k rows | completed | duration | ms | 8.4 | +740% | 7 | 7.899999999906868 | 21.5999999998603 | 11.8571 | 8.4 | 20.2 | 21.6 | 21.6 | 5.7343 | 8.100000000093132, 21.5999999998603, 8.400000000139698, 8.300000000046566, 20.199999999953434, 8.5, 7.899999999906868 | bundle gzip bytes: 468726 |
| primitive-browser | mreact | workspace | browser clear 10k rows | completed | duration | ms | 2.7 | +12.5% | 7 | 2.699999999953434 | 2.9000000001396984 | 2.7714 | 2.7 | 2.9 | 2.9 | 2.9 | 0.0881 | 2.8999999999068677, 2.699999999953434, 2.800000000046566, 2.9000000001396984, 2.699999999953434, 2.699999999953434, 2.699999999953434 | bundle gzip bytes: 468726 |
| primitive-browser | mreact react-compat | workspace | browser clear 10k rows | completed | duration | ms | 4.1 | +70.83% | 7 | 3.8999999999068677 | 7.600000000093132 | 4.9571 | 4.1 | 7 | 7.6 | 7.6 | 1.4927 | 4.100000000093132, 4.099999999860302, 7, 4.099999999860302, 3.8999999999068677, 3.8999999999068677, 7.600000000093132 | bundle gzip bytes: 468726 |
| primitive-browser | react | workspace | browser clear 10k rows | completed | duration | ms | 8.5 | +254.17% | 7 | 8.199999999953434 | 10.5 | 8.8 | 8.5 | 9.2 | 10.5 | 10.5 | 0.7597 | 8.5, 8.600000000093132, 10.5, 9.199999999953434, 8.300000000046566, 8.300000000046566, 8.199999999953434 | bundle gzip bytes: 468726 |
| primitive-browser | solid | workspace | browser clear 10k rows | completed | duration | ms | 2.4 | best | 7 | 2.300000000046566 | 22.300000000046566 | 5.2 | 2.4 | 2.4 | 22.3 | 22.3 | 6.9812 | 2.4000000001396984, 2.4000000001396984, 2.4000000001396984, 2.300000000046566, 2.300000000046566, 22.300000000046566, 2.300000000046566 | bundle gzip bytes: 468726 |
| primitive-browser | vue | workspace | browser clear 10k rows | completed | duration | ms | 4.9 | +104.17% | 7 | 4.399999999906868 | 34.300000000046566 | 9.1 | 4.9 | 5.7 | 34.3 | 34.3 | 10.298 | 5.400000000139698, 4.899999999906868, 5.7000000001862645, 4.5, 4.5, 34.300000000046566, 4.399999999906868 | bundle gzip bytes: 468726 |
| primitive-browser | svelte | workspace | browser clear 10k rows | completed | duration | ms | 8.6 | +258.33% | 7 | 8.099999999860302 | 21.399999999906868 | 11 | 8.6 | 13 | 21.4 | 21.4 | 4.5441 | 13, 9.600000000093132, 8.100000000093132, 8.199999999953434, 8.600000000093132, 21.399999999906868, 8.099999999860302 | bundle gzip bytes: 468726 |
| primitive-browser | angular | workspace | browser clear 10k rows | completed | duration | ms | 8.5 | +254.17% | 7 | 8.300000000046566 | 11.200000000186265 | 9.1571 | 8.5 | 10.7 | 11.2 | 11.2 | 1.145 | 11.200000000186265, 10.699999999953434, 8.5, 8.600000000093132, 8.399999999906868, 8.300000000046566, 8.400000000139698 | bundle gzip bytes: 468726 |
| primitive-browser | marko | workspace | browser clear 10k rows | unsupported | duration | ms | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | Marko's standalone browser primitive fixture requires the Marko client compiler/runtime integration; keep Marko covered by router browser probes until a stable standalone harness is added. |
| primitive-browser | qwik | workspace | browser clear 10k rows | completed | duration | ms | 6 | +150% | 7 | 5.699999999953434 | 19.5 | 8.3286 | 6 | 9 | 19.5 | 19.5 | 4.6827 | 5.900000000139698, 6, 19.5, 5.900000000139698, 5.699999999953434, 9, 6.300000000046566 | bundle gzip bytes: 468726 |
