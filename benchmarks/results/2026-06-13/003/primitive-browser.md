# Primitive Browser Benchmark

## Environment

- Date: 2026-06-13
- Git commit: 2084be4d887d44c9a8e1e8bb44366ca137aba905
- Node: v24.16.0
- NODE_ENV: production
- pnpm: 10.19.0
- Platform: linux x64
- CPU: AMD EPYC 7763 64-Core Processor (4)
- Memory: 16766414848 bytes
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
| 2 | **mreact** | browser create 1k rows | 2.3 | +53.33% | ms |
| 3 | **mreact react-compat** | browser create 1k rows | 2.7 | +80% | ms |
| 4 | qwik | browser create 1k rows | 2.8 | +86.67% | ms |
| 5 | vue | browser create 1k rows | 3 | +100% | ms |
| 6 | react | browser create 1k rows | 3.1 | +106.67% | ms |
| 7 | svelte | browser create 1k rows | 4 | +166.67% | ms |
| 8 | angular | browser create 1k rows | 4.6 | +206.67% | ms |

### browser update every 10th in 10k rows

Updates every tenth row in a 10,000-row keyed DOM in real Chromium, exposing real DOM update costs hidden by happy-dom.

| rank | framework | case | value | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | --- |
| 1 | **mreact** | browser update every 10th in 10k rows | 1 | best | ms |
| 2 | svelte | browser update every 10th in 10k rows | 2.6 | +160% | ms |
| 3 | react | browser update every 10th in 10k rows | 2.8 | +180% | ms |
| 4 | angular | browser update every 10th in 10k rows | 4.5 | +350% | ms |
| 5 | **mreact react-compat** | browser update every 10th in 10k rows | 5 | +400% | ms |
| 6 | solid | browser update every 10th in 10k rows | 7.7 | +670% | ms |
| 7 | qwik | browser update every 10th in 10k rows | 8.8 | +780% | ms |
| 8 | vue | browser update every 10th in 10k rows | 11.4 | +1040% | ms |

### browser select row in 10k rows

Toggles selection attributes for one row in a 10,000-row keyed DOM in real Chromium.

| rank | framework | case | value | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | --- |
| 1 | solid | browser select row in 10k rows | 0.9 | best | ms |
| 2 | **mreact** | browser select row in 10k rows | 1 | +11.11% | ms |
| 3 | react | browser select row in 10k rows | 2.6 | +188.89% | ms |
| 4 | **mreact react-compat** | browser select row in 10k rows | 3.5 | +288.89% | ms |
| 5 | svelte | browser select row in 10k rows | 3.6 | +300% | ms |
| 6 | angular | browser select row in 10k rows | 4.6 | +411.11% | ms |
| 7 | vue | browser select row in 10k rows | 9.6 | +966.67% | ms |
| 8 | qwik | browser select row in 10k rows | 11.8 | +1211.11% | ms |

### browser clear 10k rows

Clears a 10,000-row keyed DOM in real Chromium to validate happy-dom clear rankings against browser behavior.

| rank | framework | case | value | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | --- |
| 1 | solid | browser clear 10k rows | 2.4 | best | ms |
| 2 | **mreact** | browser clear 10k rows | 2.5 | +4.17% | ms |
| 3 | **mreact react-compat** | browser clear 10k rows | 4.1 | +70.83% | ms |
| 4 | vue | browser clear 10k rows | 5 | +108.33% | ms |
| 5 | qwik | browser clear 10k rows | 5.8 | +141.67% | ms |
| 6 | react | browser clear 10k rows | 7.5 | +212.5% | ms |
| 7 | svelte | browser clear 10k rows | 8.2 | +241.67% | ms |
| 8 | angular | browser clear 10k rows | 8.7 | +262.5% | ms |

## Results

| suite | framework | version | case | status | metric | unit | value | diff vs 1st | sample count | min | max | mean | median | p75 | p95 | p99 | standard deviation | raw samples | notes |
| --- | --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| primitive-browser | mreact | workspace | browser create 1k rows | completed | duration | ms | 2.3 | +53.33% | 7 | 1.8999999999068677 | 3.800000000046566 | 2.5286 | 2.3 | 2.9 | 3.8 | 3.8 | 0.6386 | 2.7999999998137355, 2.9000000001396984, 2.300000000046566, 3.800000000046566, 1.8999999999068677, 1.8999999999068677, 2.0999999998603016 | bundle gzip bytes: 468736 |
| primitive-browser | mreact react-compat | workspace | browser create 1k rows | completed | duration | ms | 2.7 | +80% | 7 | 2.5999999998603016 | 6.699999999953434 | 3.5714 | 2.7 | 4.5 | 6.7 | 6.7 | 1.43 | 4.5, 3.300000000046566, 2.7000000001862645, 6.699999999953434, 2.5999999998603016, 2.6000000000931323, 2.6000000000931323 | bundle gzip bytes: 468736 |
| primitive-browser | react | workspace | browser create 1k rows | completed | duration | ms | 3.1 | +106.67% | 7 | 3 | 6 | 3.6429 | 3.1 | 4 | 6 | 6 | 1.0126 | 4, 3.1000000000931323, 3.0999999998603016, 3, 3.1000000000931323, 6, 3.199999999953434 | bundle gzip bytes: 468736 |
| primitive-browser | solid | workspace | browser create 1k rows | completed | duration | ms | 1.5 | best | 7 | 1.3999999999068677 | 1.7999999998137355 | 1.5571 | 1.5 | 1.6 | 1.8 | 1.8 | 0.1178 | 1.6000000000931323, 1.7999999998137355, 1.3999999999068677, 1.6000000000931323, 1.5, 1.5, 1.5 | bundle gzip bytes: 468736 |
| primitive-browser | vue | workspace | browser create 1k rows | completed | duration | ms | 3 | +100% | 7 | 2.800000000046566 | 6.399999999906868 | 3.5571 | 3 | 3.6 | 6.4 | 6.4 | 1.1903 | 3.5999999998603016, 6.399999999906868, 3, 3.300000000046566, 2.800000000046566, 2.800000000046566, 3 | bundle gzip bytes: 468736 |
| primitive-browser | svelte | workspace | browser create 1k rows | completed | duration | ms | 4 | +166.67% | 7 | 3.300000000046566 | 5.5 | 4.2429 | 4 | 5.4 | 5.5 | 5.5 | 0.8209 | 4.2999999998137355, 3.5, 5.400000000139698, 3.300000000046566, 3.7000000001862645, 4, 5.5 | bundle gzip bytes: 468736 |
| primitive-browser | angular | workspace | browser create 1k rows | completed | duration | ms | 4.6 | +206.67% | 7 | 4.399999999906868 | 8.199999999953434 | 5.3571 | 4.6 | 6.6 | 8.2 | 8.2 | 1.3626 | 6.600000000093132, 4.600000000093132, 4.599999999860302, 4.5, 4.399999999906868, 4.599999999860302, 8.199999999953434 | bundle gzip bytes: 468736 |
| primitive-browser | marko | workspace | browser create 1k rows | unsupported | duration | ms | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | Marko's standalone browser primitive fixture requires the Marko client compiler/runtime integration; keep Marko covered by router browser probes until a stable standalone harness is added. |
| primitive-browser | qwik | workspace | browser create 1k rows | completed | duration | ms | 2.8 | +86.67% | 7 | 2.199999999953434 | 8.200000000186265 | 3.4857 | 2.8 | 3.2 | 8.2 | 8.2 | 1.9467 | 3.199999999953434, 2.6000000000931323, 2.5, 2.800000000046566, 8.200000000186265, 2.8999999999068677, 2.199999999953434 | bundle gzip bytes: 468736 |
| primitive-browser | mreact | workspace | browser update every 10th in 10k rows | completed | duration | ms | 1 | best | 7 | 0.7999999998137355 | 1.6000000000931323 | 1.0571 | 1 | 1.2 | 1.6 | 1.6 | 0.2611 | 1.6000000000931323, 0.7999999998137355, 1.1000000000931323, 1, 0.8999999999068677, 0.8000000000465661, 1.1999999999534339 | bundle gzip bytes: 468736 |
| primitive-browser | mreact react-compat | workspace | browser update every 10th in 10k rows | completed | duration | ms | 5 | +400% | 7 | 4.899999999906868 | 11.199999999953434 | 5.9286 | 5 | 5.3 | 11.2 | 11.2 | 2.1552 | 5.300000000046566, 5, 5.100000000093132, 5, 5, 11.199999999953434, 4.899999999906868 | bundle gzip bytes: 468736 |
| primitive-browser | react | workspace | browser update every 10th in 10k rows | completed | duration | ms | 2.8 | +180% | 7 | 2.7000000001862645 | 9.100000000093132 | 3.7 | 2.8 | 2.9 | 9.1 | 9.1 | 2.2052 | 9.100000000093132, 2.800000000046566, 2.8999999999068677, 2.800000000046566, 2.800000000046566, 2.7999999998137355, 2.7000000001862645 | bundle gzip bytes: 468736 |
| primitive-browser | solid | workspace | browser update every 10th in 10k rows | completed | duration | ms | 7.7 | +670% | 7 | 7.199999999953434 | 13.699999999953434 | 8.5857 | 7.7 | 8.6 | 13.7 | 13.7 | 2.125 | 7.5, 7.699999999953434, 7.699999999953434, 7.699999999953434, 13.699999999953434, 8.599999999860302, 7.199999999953434 | bundle gzip bytes: 468736 |
| primitive-browser | vue | workspace | browser update every 10th in 10k rows | completed | duration | ms | 11.4 | +1040% | 7 | 10.5 | 22.300000000046566 | 15.1571 | 11.4 | 21.5 | 22.3 | 22.3 | 4.9181 | 10.5, 18.199999999953434, 11.399999999906868, 10.899999999906868, 11.300000000046566, 21.5, 22.300000000046566 | bundle gzip bytes: 468736 |
| primitive-browser | svelte | workspace | browser update every 10th in 10k rows | completed | duration | ms | 2.6 | +160% | 7 | 2.300000000046566 | 3.1000000000931323 | 2.6 | 2.6 | 2.6 | 3.1 | 3.1 | 0.2268 | 3.1000000000931323, 2.6000000000931323, 2.5, 2.6000000000931323, 2.6000000000931323, 2.300000000046566, 2.5 | bundle gzip bytes: 468736 |
| primitive-browser | angular | workspace | browser update every 10th in 10k rows | completed | duration | ms | 4.5 | +350% | 7 | 4.399999999906868 | 13.800000000046566 | 6.2143 | 4.5 | 7.2 | 13.8 | 13.8 | 3.2344 | 13.800000000046566, 4.5, 4.600000000093132, 4.399999999906868, 4.5, 4.5, 7.2000000001862645 | bundle gzip bytes: 468736 |
| primitive-browser | marko | workspace | browser update every 10th in 10k rows | unsupported | duration | ms | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | Marko's standalone browser primitive fixture requires the Marko client compiler/runtime integration; keep Marko covered by router browser probes until a stable standalone harness is added. |
| primitive-browser | qwik | workspace | browser update every 10th in 10k rows | completed | duration | ms | 8.8 | +780% | 7 | 7.899999999906868 | 20.399999999906868 | 12.2 | 8.8 | 16.1 | 20.4 | 20.4 | 4.8131 | 20.399999999906868, 8.800000000046566, 7.899999999906868, 16.0999999998603, 8, 8.099999999860302, 16.0999999998603 | bundle gzip bytes: 468736 |
| primitive-browser | mreact | workspace | browser select row in 10k rows | completed | duration | ms | 1 | +11.11% | 7 | 0.8999999999068677 | 1.1000000000931323 | 0.9714 | 1 | 1 | 1.1 | 1.1 | 0.07 | 1.1000000000931323, 1, 0.8999999999068677, 0.9000000001396984, 1, 1, 0.9000000001396984 | bundle gzip bytes: 468736 |
| primitive-browser | mreact react-compat | workspace | browser select row in 10k rows | completed | duration | ms | 3.5 | +288.89% | 7 | 3.3999999999068677 | 3.6000000000931323 | 3.5286 | 3.5 | 3.6 | 3.6 | 3.6 | 0.07 | 3.5, 3.6000000000931323, 3.6000000000931323, 3.5, 3.3999999999068677, 3.6000000000931323, 3.5 | bundle gzip bytes: 468736 |
| primitive-browser | react | workspace | browser select row in 10k rows | completed | duration | ms | 2.6 | +188.89% | 7 | 2.3999999999068677 | 6.300000000046566 | 3.4429 | 2.6 | 4.3 | 6.3 | 6.3 | 1.3254 | 4.2999999998137355, 6.300000000046566, 2.5999999998603016, 3.4000000001396984, 2.5999999998603016, 2.5, 2.3999999999068677 | bundle gzip bytes: 468736 |
| primitive-browser | solid | workspace | browser select row in 10k rows | completed | duration | ms | 0.9 | best | 7 | 0.8000000000465661 | 1 | 0.9143 | 0.9 | 1 | 1 | 1 | 0.0639 | 1, 0.9000000001396984, 0.8999999999068677, 0.8999999999068677, 0.8000000000465661, 1, 0.8999999999068677 | bundle gzip bytes: 468736 |
| primitive-browser | vue | workspace | browser select row in 10k rows | completed | duration | ms | 9.6 | +966.67% | 7 | 9.400000000139698 | 12 | 9.9 | 9.6 | 9.7 | 12 | 12 | 0.8619 | 9.600000000093132, 9.699999999953434, 9.5, 9.400000000139698, 9.5, 9.600000000093132, 12 | bundle gzip bytes: 468736 |
| primitive-browser | svelte | workspace | browser select row in 10k rows | completed | duration | ms | 3.6 | +300% | 7 | 3.2999999998137355 | 3.800000000046566 | 3.6 | 3.6 | 3.8 | 3.8 | 3.8 | 0.1927 | 3.5999999998603016, 3.800000000046566, 3.7999999998137355, 3.2999999998137355, 3.5, 3.4000000001396984, 3.7999999998137355 | bundle gzip bytes: 468736 |
| primitive-browser | angular | workspace | browser select row in 10k rows | completed | duration | ms | 4.6 | +411.11% | 7 | 4.300000000046566 | 7.399999999906868 | 4.9571 | 4.6 | 4.9 | 7.4 | 7.4 | 1.0154 | 7.399999999906868, 4.399999999906868, 4.7000000001862645, 4.899999999906868, 4.600000000093132, 4.399999999906868, 4.300000000046566 | bundle gzip bytes: 468736 |
| primitive-browser | marko | workspace | browser select row in 10k rows | unsupported | duration | ms | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | Marko's standalone browser primitive fixture requires the Marko client compiler/runtime integration; keep Marko covered by router browser probes until a stable standalone harness is added. |
| primitive-browser | qwik | workspace | browser select row in 10k rows | completed | duration | ms | 11.8 | +1211.11% | 7 | 8.700000000186265 | 50.10000000009313 | 17.6714 | 11.8 | 19.2 | 50.1 | 50.1 | 13.7449 | 11.800000000046566, 9.100000000093132, 19.199999999953434, 50.10000000009313, 8.899999999906868, 15.900000000139698, 8.700000000186265 | bundle gzip bytes: 468736 |
| primitive-browser | mreact | workspace | browser clear 10k rows | completed | duration | ms | 2.5 | +4.17% | 7 | 2.5 | 2.5999999998603016 | 2.5286 | 2.5 | 2.6 | 2.6 | 2.6 | 0.0452 | 2.5999999998603016, 2.5, 2.5, 2.5, 2.5, 2.5, 2.5999999998603016 | bundle gzip bytes: 468736 |
| primitive-browser | mreact react-compat | workspace | browser clear 10k rows | completed | duration | ms | 4.1 | +70.83% | 7 | 4.099999999860302 | 7.5 | 4.6429 | 4.1 | 4.3 | 7.5 | 7.5 | 1.1697 | 4.099999999860302, 4.100000000093132, 7.5, 4.300000000046566, 4.099999999860302, 4.099999999860302, 4.300000000046566 | bundle gzip bytes: 468736 |
| primitive-browser | react | workspace | browser clear 10k rows | completed | duration | ms | 7.5 | +212.5% | 7 | 7.199999999953434 | 8.899999999906868 | 7.6714 | 7.5 | 8 | 8.9 | 8.9 | 0.565 | 7.600000000093132, 7.5, 8.899999999906868, 8, 7.199999999953434, 7.300000000046566, 7.199999999953434 | bundle gzip bytes: 468736 |
| primitive-browser | solid | workspace | browser clear 10k rows | completed | duration | ms | 2.4 | best | 7 | 2.3999999999068677 | 2.5999999998603016 | 2.4571 | 2.4 | 2.5 | 2.6 | 2.6 | 0.0728 | 2.5999999998603016, 2.3999999999068677, 2.5, 2.3999999999068677, 2.5, 2.3999999999068677, 2.4000000001396984 | bundle gzip bytes: 468736 |
| primitive-browser | vue | workspace | browser clear 10k rows | completed | duration | ms | 5 | +108.33% | 7 | 4.800000000046566 | 22.199999999953434 | 8.1714 | 5 | 10.1 | 22.2 | 22.2 | 5.9945 | 10.099999999860302, 5.199999999953434, 5, 4.899999999906868, 5, 22.199999999953434, 4.800000000046566 | bundle gzip bytes: 468736 |
| primitive-browser | svelte | workspace | browser clear 10k rows | completed | duration | ms | 8.2 | +241.67% | 7 | 7.800000000046566 | 84.89999999990687 | 20.8143 | 8.2 | 20 | 84.9 | 84.9 | 26.4811 | 8.700000000186265, 8.200000000186265, 8, 20, 7.800000000046566, 84.89999999990687, 8.099999999860302 | bundle gzip bytes: 468736 |
| primitive-browser | angular | workspace | browser clear 10k rows | completed | duration | ms | 8.7 | +262.5% | 7 | 8.400000000139698 | 20.5 | 12.1286 | 8.7 | 19.6 | 20.5 | 20.5 | 5.07 | 8.699999999953434, 10.700000000186265, 20.5, 8.5, 8.5, 19.5999999998603, 8.400000000139698 | bundle gzip bytes: 468736 |
| primitive-browser | marko | workspace | browser clear 10k rows | unsupported | duration | ms | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | Marko's standalone browser primitive fixture requires the Marko client compiler/runtime integration; keep Marko covered by router browser probes until a stable standalone harness is added. |
| primitive-browser | qwik | workspace | browser clear 10k rows | completed | duration | ms | 5.8 | +141.67% | 7 | 5.699999999953434 | 9.299999999813735 | 6.3 | 5.8 | 5.9 | 9.3 | 9.3 | 1.2259 | 5.699999999953434, 9.299999999813735, 5.800000000046566, 5.800000000046566, 5.900000000139698, 5.800000000046566, 5.800000000046566 | bundle gzip bytes: 468736 |
