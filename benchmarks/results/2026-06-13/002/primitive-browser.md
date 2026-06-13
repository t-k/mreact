# Primitive Browser Benchmark

## Environment

- Date: 2026-06-13
- Git commit: 6a614421ccbd5252bc05ed0a97f75be218b4fcd1
- Node: v24.16.0
- NODE_ENV: production
- pnpm: 10.19.0
- Platform: linux x64
- CPU: AMD EPYC 7763 64-Core Processor (4)
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
| 1 | solid | browser create 1k rows | 1.6 | best | ms |
| 2 | **mreact** | browser create 1k rows | 2.3 | +43.75% | ms |
| 3 | qwik | browser create 1k rows | 2.9 | +81.25% | ms |
| 4 | react | browser create 1k rows | 3 | +87.5% | ms |
| 5 | vue | browser create 1k rows | 3.2 | +100% | ms |
| 6 | svelte | browser create 1k rows | 4.4 | +175% | ms |
| 7 | **mreact react-compat** | browser create 1k rows | 4.6 | +187.5% | ms |
| 8 | angular | browser create 1k rows | 4.8 | +200% | ms |

### browser update every 10th in 10k rows

Updates every tenth row in a 10,000-row keyed DOM in real Chromium, exposing real DOM update costs hidden by happy-dom.

| rank | framework | case | value | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | --- |
| 1 | **mreact** | browser update every 10th in 10k rows | 0.9 | best | ms |
| 2 | svelte | browser update every 10th in 10k rows | 2.4 | +166.67% | ms |
| 3 | react | browser update every 10th in 10k rows | 2.8 | +211.11% | ms |
| 4 | angular | browser update every 10th in 10k rows | 4.3 | +377.78% | ms |
| 5 | **mreact react-compat** | browser update every 10th in 10k rows | 5.1 | +466.67% | ms |
| 6 | solid | browser update every 10th in 10k rows | 7.6 | +744.44% | ms |
| 7 | qwik | browser update every 10th in 10k rows | 11.2 | +1144.44% | ms |
| 8 | vue | browser update every 10th in 10k rows | 11.2 | +1144.44% | ms |

### browser select row in 10k rows

Toggles selection attributes for one row in a 10,000-row keyed DOM in real Chromium.

| rank | framework | case | value | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | --- |
| 1 | **mreact** | browser select row in 10k rows | 0.9 | best | ms |
| 2 | solid | browser select row in 10k rows | 0.9 | 0% | ms |
| 3 | react | browser select row in 10k rows | 2.5 | +177.78% | ms |
| 4 | **mreact react-compat** | browser select row in 10k rows | 3.7 | +311.11% | ms |
| 5 | svelte | browser select row in 10k rows | 3.8 | +322.22% | ms |
| 6 | angular | browser select row in 10k rows | 4 | +344.44% | ms |
| 7 | qwik | browser select row in 10k rows | 9.1 | +911.11% | ms |
| 8 | vue | browser select row in 10k rows | 9.7 | +977.78% | ms |

### browser clear 10k rows

Clears a 10,000-row keyed DOM in real Chromium to validate happy-dom clear rankings against browser behavior.

| rank | framework | case | value | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | --- |
| 1 | solid | browser clear 10k rows | 2.4 | best | ms |
| 2 | **mreact** | browser clear 10k rows | 2.5 | +4.17% | ms |
| 3 | **mreact react-compat** | browser clear 10k rows | 4.2 | +75% | ms |
| 4 | vue | browser clear 10k rows | 4.7 | +95.83% | ms |
| 5 | qwik | browser clear 10k rows | 5.7 | +137.5% | ms |
| 6 | angular | browser clear 10k rows | 8.6 | +258.33% | ms |
| 7 | svelte | browser clear 10k rows | 8.6 | +258.33% | ms |
| 8 | react | browser clear 10k rows | 8.9 | +270.83% | ms |

## Results

| suite | framework | version | case | status | metric | unit | value | diff vs 1st | sample count | min | max | mean | median | p75 | p95 | p99 | standard deviation | raw samples | notes |
| --- | --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| primitive-browser | mreact | workspace | browser create 1k rows | completed | duration | ms | 2.3 | +43.75% | 7 | 1.9000000001396984 | 4 | 2.5714 | 2.3 | 2.9 | 4 | 4 | 0.6713 | 2.8999999999068677, 4, 2.199999999953434, 2.300000000046566, 1.9000000001396984, 2, 2.699999999953434 | bundle gzip bytes: 468736 |
| primitive-browser | mreact react-compat | workspace | browser create 1k rows | completed | duration | ms | 4.6 | +187.5% | 7 | 2.5999999998603016 | 6.899999999906868 | 4.4714 | 4.6 | 6.3 | 6.9 | 6.9 | 1.5434 | 6.899999999906868, 4.600000000093132, 4.600000000093132, 6.300000000046566, 3.5999999998603016, 2.699999999953434, 2.5999999998603016 | bundle gzip bytes: 468736 |
| primitive-browser | react | workspace | browser create 1k rows | completed | duration | ms | 3 | +87.5% | 7 | 2.9000000001396984 | 3.5999999998603016 | 3.1857 | 3 | 3.5 | 3.6 | 3.6 | 0.2587 | 3.5999999998603016, 3.300000000046566, 3.5, 3, 3, 2.9000000001396984, 3 | bundle gzip bytes: 468736 |
| primitive-browser | solid | workspace | browser create 1k rows | completed | duration | ms | 1.6 | best | 7 | 1.3999999999068677 | 2.6000000000931323 | 1.8429 | 1.6 | 2.6 | 2.6 | 2.6 | 0.4836 | 1.5999999998603016, 2.6000000000931323, 2.5999999998603016, 1.3999999999068677, 1.5, 1.6000000000931323, 1.6000000000931323 | bundle gzip bytes: 468736 |
| primitive-browser | vue | workspace | browser create 1k rows | completed | duration | ms | 3.2 | +100% | 7 | 2.699999999953434 | 7.5 | 3.7 | 3.2 | 3.6 | 7.5 | 7.5 | 1.5766 | 3.6000000000931323, 7.5, 3.2000000001862645, 3.199999999953434, 2.699999999953434, 2.800000000046566, 2.8999999999068677 | bundle gzip bytes: 468736 |
| primitive-browser | svelte | workspace | browser create 1k rows | completed | duration | ms | 4.4 | +175% | 7 | 3.199999999953434 | 20.199999999953434 | 6.6571 | 4.4 | 5.9 | 20.2 | 20.2 | 5.603 | 20.199999999953434, 4.100000000093132, 5.899999999906868, 3.199999999953434, 3.3999999999068677, 4.399999999906868, 5.400000000139698 | bundle gzip bytes: 468736 |
| primitive-browser | angular | workspace | browser create 1k rows | completed | duration | ms | 4.8 | +200% | 7 | 4.300000000046566 | 8 | 5.8571 | 4.8 | 7.9 | 8 | 8 | 1.5296 | 6.800000000046566, 4.699999999953434, 7.899999999906868, 4.800000000046566, 4.300000000046566, 4.5, 8 | bundle gzip bytes: 468736 |
| primitive-browser | marko | workspace | browser create 1k rows | unsupported | duration | ms | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | Marko's standalone browser primitive fixture requires the Marko client compiler/runtime integration; keep Marko covered by router browser probes until a stable standalone harness is added. |
| primitive-browser | qwik | workspace | browser create 1k rows | completed | duration | ms | 2.9 | +81.25% | 7 | 2.699999999953434 | 7.800000000046566 | 3.8429 | 2.9 | 4.1 | 7.8 | 7.8 | 1.7037 | 3.8999999999068677, 2.699999999953434, 2.699999999953434, 4.100000000093132, 2.8999999999068677, 2.800000000046566, 7.800000000046566 | bundle gzip bytes: 468736 |
| primitive-browser | mreact | workspace | browser update every 10th in 10k rows | completed | duration | ms | 0.9 | best | 7 | 0.8000000000465661 | 1.9000000001396984 | 1.1 | 0.9 | 1.4 | 1.9 | 1.9 | 0.378 | 1.9000000001396984, 0.8000000000465661, 1, 0.8000000000465661, 0.9000000001396984, 0.8999999999068677, 1.4000000001396984 | bundle gzip bytes: 468736 |
| primitive-browser | mreact react-compat | workspace | browser update every 10th in 10k rows | completed | duration | ms | 5.1 | +466.67% | 7 | 4.899999999906868 | 5.600000000093132 | 5.1429 | 5.1 | 5.4 | 5.6 | 5.6 | 0.2556 | 5.600000000093132, 5.199999999953434, 5.399999999906868, 4.900000000139698, 5.099999999860302, 4.899999999906868, 4.900000000139698 | bundle gzip bytes: 468736 |
| primitive-browser | react | workspace | browser update every 10th in 10k rows | completed | duration | ms | 2.8 | +211.11% | 7 | 2.699999999953434 | 3.5 | 2.9286 | 2.8 | 3 | 3.5 | 3.5 | 0.2603 | 3.5, 3, 3, 2.800000000046566, 2.800000000046566, 2.699999999953434, 2.7000000001862645 | bundle gzip bytes: 468736 |
| primitive-browser | solid | workspace | browser update every 10th in 10k rows | completed | duration | ms | 7.6 | +744.44% | 7 | 6.699999999953434 | 7.800000000046566 | 7.3571 | 7.6 | 7.7 | 7.8 | 7.8 | 0.4238 | 6.800000000046566, 6.699999999953434, 7.199999999953434, 7.699999999953434, 7.800000000046566, 7.600000000093132, 7.699999999953434 | bundle gzip bytes: 468736 |
| primitive-browser | vue | workspace | browser update every 10th in 10k rows | completed | duration | ms | 11.2 | +1144.44% | 7 | 10.399999999906868 | 21.199999999953434 | 13.6 | 11.2 | 18.3 | 21.2 | 21.2 | 4.05 | 10.399999999906868, 18.300000000046566, 13, 10.599999999860302, 10.5, 21.199999999953434, 11.200000000186265 | bundle gzip bytes: 468736 |
| primitive-browser | svelte | workspace | browser update every 10th in 10k rows | completed | duration | ms | 2.4 | +166.67% | 7 | 2.199999999953434 | 3.199999999953434 | 2.5429 | 2.4 | 2.7 | 3.2 | 3.2 | 0.3245 | 3.199999999953434, 2.2999999998137355, 2.699999999953434, 2.699999999953434, 2.3999999999068677, 2.300000000046566, 2.199999999953434 | bundle gzip bytes: 468736 |
| primitive-browser | angular | workspace | browser update every 10th in 10k rows | completed | duration | ms | 4.3 | +377.78% | 7 | 4.099999999860302 | 4.600000000093132 | 4.3143 | 4.3 | 4.5 | 4.6 | 4.6 | 0.1807 | 4.5, 4.600000000093132, 4.400000000139698, 4.100000000093132, 4.300000000046566, 4.099999999860302, 4.199999999953434 | bundle gzip bytes: 468736 |
| primitive-browser | marko | workspace | browser update every 10th in 10k rows | unsupported | duration | ms | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | Marko's standalone browser primitive fixture requires the Marko client compiler/runtime integration; keep Marko covered by router browser probes until a stable standalone harness is added. |
| primitive-browser | qwik | workspace | browser update every 10th in 10k rows | completed | duration | ms | 11.2 | +1144.44% | 7 | 9 | 19.300000000046566 | 13.1714 | 11.2 | 17.4 | 19.3 | 19.3 | 4.1524 | 16.799999999813735, 11.199999999953434, 19.300000000046566, 9.399999999906868, 9, 17.4000000001397, 9.100000000093132 | bundle gzip bytes: 468736 |
| primitive-browser | mreact | workspace | browser select row in 10k rows | completed | duration | ms | 0.9 | best | 7 | 0.7999999998137355 | 1 | 0.9 | 0.9 | 1 | 1 | 1 | 0.0756 | 0.8999999999068677, 0.7999999998137355, 1, 1, 0.8999999999068677, 0.9000000001396984, 0.8000000000465661 | bundle gzip bytes: 468736 |
| primitive-browser | mreact react-compat | workspace | browser select row in 10k rows | completed | duration | ms | 3.7 | +311.11% | 7 | 3.699999999953434 | 3.800000000046566 | 3.7143 | 3.7 | 3.7 | 3.8 | 3.8 | 0.035 | 3.800000000046566, 3.699999999953434, 3.7000000001862645, 3.699999999953434, 3.699999999953434, 3.699999999953434, 3.699999999953434 | bundle gzip bytes: 468736 |
| primitive-browser | react | workspace | browser select row in 10k rows | completed | duration | ms | 2.5 | +177.78% | 7 | 2.2999999998137355 | 3.6000000000931323 | 2.6429 | 2.5 | 2.8 | 3.6 | 3.6 | 0.417 | 2.3999999999068677, 2.3999999999068677, 3.6000000000931323, 2.5, 2.800000000046566, 2.5, 2.2999999998137355 | bundle gzip bytes: 468736 |
| primitive-browser | solid | workspace | browser select row in 10k rows | completed | duration | ms | 0.9 | 0% | 7 | 0.8000000000465661 | 1 | 0.8857 | 0.9 | 0.9 | 1 | 1 | 0.0639 | 0.9000000001396984, 0.9000000001396984, 1, 0.9000000001396984, 0.8000000000465661, 0.8000000000465661, 0.8999999999068677 | bundle gzip bytes: 468736 |
| primitive-browser | vue | workspace | browser select row in 10k rows | completed | duration | ms | 9.7 | +977.78% | 7 | 9.5 | 12.399999999906868 | 10.2 | 9.7 | 10.3 | 12.4 | 12.4 | 0.9502 | 10.300000000046566, 9.5, 10.300000000046566, 9.600000000093132, 9.700000000186265, 9.599999999860302, 12.399999999906868 | bundle gzip bytes: 468736 |
| primitive-browser | svelte | workspace | browser select row in 10k rows | completed | duration | ms | 3.8 | +322.22% | 7 | 3.699999999953434 | 4 | 3.8429 | 3.8 | 3.9 | 4 | 4 | 0.0904 | 4, 3.9000000001396984, 3.800000000046566, 3.800000000046566, 3.800000000046566, 3.699999999953434, 3.8999999999068677 | bundle gzip bytes: 468736 |
| primitive-browser | angular | workspace | browser select row in 10k rows | completed | duration | ms | 4 | +344.44% | 7 | 3.800000000046566 | 4.100000000093132 | 3.9857 | 4 | 4.1 | 4.1 | 4.1 | 0.1125 | 4.100000000093132, 3.9000000001396984, 3.800000000046566, 4, 4.100000000093132, 3.9000000001396984, 4.099999999860302 | bundle gzip bytes: 468736 |
| primitive-browser | marko | workspace | browser select row in 10k rows | unsupported | duration | ms | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | Marko's standalone browser primitive fixture requires the Marko client compiler/runtime integration; keep Marko covered by router browser probes until a stable standalone harness is added. |
| primitive-browser | qwik | workspace | browser select row in 10k rows | completed | duration | ms | 9.1 | +911.11% | 7 | 8.699999999953434 | 19.199999999953434 | 11.6714 | 9.1 | 15.6 | 19.2 | 19.2 | 3.8462 | 11.400000000139698, 8.800000000046566, 15.599999999860302, 8.699999999953434, 8.899999999906868, 19.199999999953434, 9.099999999860302 | bundle gzip bytes: 468736 |
| primitive-browser | mreact | workspace | browser clear 10k rows | completed | duration | ms | 2.5 | +4.17% | 7 | 2.3999999999068677 | 2.5 | 2.4571 | 2.5 | 2.5 | 2.5 | 2.5 | 0.0495 | 2.5, 2.5, 2.3999999999068677, 2.4000000001396984, 2.5, 2.3999999999068677, 2.5 | bundle gzip bytes: 468736 |
| primitive-browser | mreact react-compat | workspace | browser clear 10k rows | completed | duration | ms | 4.2 | +75% | 7 | 4 | 7.300000000046566 | 4.5714 | 4.2 | 4.2 | 7.3 | 7.3 | 1.117 | 4.2000000001862645, 4.199999999953434, 7.300000000046566, 4.199999999953434, 4.100000000093132, 4, 4 | bundle gzip bytes: 468736 |
| primitive-browser | react | workspace | browser clear 10k rows | completed | duration | ms | 8.9 | +270.83% | 7 | 8.699999999953434 | 9.600000000093132 | 8.9571 | 8.9 | 9 | 9.6 | 9.6 | 0.2821 | 9, 8.900000000139698, 8.699999999953434, 9.600000000093132, 8.900000000139698, 8.699999999953434, 8.900000000139698 | bundle gzip bytes: 468736 |
| primitive-browser | solid | workspace | browser clear 10k rows | completed | duration | ms | 2.4 | best | 7 | 2.300000000046566 | 2.5 | 2.4143 | 2.4 | 2.5 | 2.5 | 2.5 | 0.0639 | 2.5, 2.3999999999068677, 2.5, 2.3999999999068677, 2.3999999999068677, 2.3999999999068677, 2.300000000046566 | bundle gzip bytes: 468736 |
| primitive-browser | vue | workspace | browser clear 10k rows | completed | duration | ms | 4.7 | +95.83% | 7 | 4.599999999860302 | 20.4000000001397 | 7.1286 | 4.7 | 5.8 | 20.4 | 20.4 | 5.4339 | 5.800000000046566, 5.199999999953434, 4.600000000093132, 20.4000000001397, 4.699999999953434, 4.599999999860302, 4.600000000093132 | bundle gzip bytes: 468736 |
| primitive-browser | svelte | workspace | browser clear 10k rows | completed | duration | ms | 8.6 | +258.33% | 7 | 7.800000000046566 | 12.5 | 9.2286 | 8.6 | 11.2 | 12.5 | 12.5 | 1.7252 | 8.700000000186265, 8.600000000093132, 7.900000000139698, 11.199999999953434, 7.800000000046566, 12.5, 7.899999999906868 | bundle gzip bytes: 468736 |
| primitive-browser | angular | workspace | browser clear 10k rows | completed | duration | ms | 8.6 | +258.33% | 7 | 8.400000000139698 | 40.10000000009313 | 13.1143 | 8.6 | 8.9 | 40.1 | 40.1 | 11.0178 | 8.700000000186265, 8.899999999906868, 8.400000000139698, 8.5, 8.600000000093132, 40.10000000009313, 8.599999999860302 | bundle gzip bytes: 468736 |
| primitive-browser | marko | workspace | browser clear 10k rows | unsupported | duration | ms | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | Marko's standalone browser primitive fixture requires the Marko client compiler/runtime integration; keep Marko covered by router browser probes until a stable standalone harness is added. |
| primitive-browser | qwik | workspace | browser clear 10k rows | completed | duration | ms | 5.7 | +137.5% | 7 | 5.599999999860302 | 5.899999999906868 | 5.7286 | 5.7 | 5.8 | 5.9 | 5.9 | 0.103 | 5.600000000093132, 5.599999999860302, 5.699999999953434, 5.7999999998137355, 5.699999999953434, 5.800000000046566, 5.899999999906868 | bundle gzip bytes: 468736 |
