# Primitive Browser Benchmark

## Environment

- Date: 2026-06-14
- Git commit: 5c41fd4999dc9a1881af434f063c0c01263a7f61
- Node: v24.16.0
- NODE_ENV: production
- pnpm: 10.19.0
- Platform: linux x64
- CPU: AMD EPYC 9V74 80-Core Processor (4)
- Memory: 16766418944 bytes
- Package versions:
  - @angular/core: 22.0.1
  - @builder.io/qwik: 1.20.0
  - @playwright/test: 1.60.0
  - @reckona/mreact-compat: 0.0.166
  - @reckona/mreact-reactive-core: 0.0.166
  - @reckona/mreact-reactive-dom: 0.0.166
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
| 2 | **mreact** | browser create 1k rows | 2.4 | +50% | ms |
| 3 | qwik | browser create 1k rows | 2.7 | +68.75% | ms |
| 4 | vue | browser create 1k rows | 3.3 | +106.25% | ms |
| 5 | react | browser create 1k rows | 3.4 | +112.5% | ms |
| 6 | **mreact react-compat** | browser create 1k rows | 3.5 | +118.75% | ms |
| 7 | svelte | browser create 1k rows | 3.8 | +137.5% | ms |
| 8 | angular | browser create 1k rows | 4.6 | +187.5% | ms |

### browser update every 10th in 10k rows

Updates every tenth row in a 10,000-row keyed DOM in real Chromium, exposing real DOM update costs hidden by happy-dom.

| rank | framework | case | value | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | --- |
| 1 | **mreact** | browser update every 10th in 10k rows | 1.5 | best | ms |
| 2 | svelte | browser update every 10th in 10k rows | 2.5 | +66.67% | ms |
| 3 | react | browser update every 10th in 10k rows | 2.9 | +93.33% | ms |
| 4 | angular | browser update every 10th in 10k rows | 3.9 | +160% | ms |
| 5 | **mreact react-compat** | browser update every 10th in 10k rows | 5.1 | +240% | ms |
| 6 | solid | browser update every 10th in 10k rows | 6.7 | +346.67% | ms |
| 7 | qwik | browser update every 10th in 10k rows | 8.7 | +480% | ms |
| 8 | vue | browser update every 10th in 10k rows | 11.1 | +640% | ms |

### browser select row in 10k rows

Toggles selection attributes for one row in a 10,000-row keyed DOM in real Chromium.

| rank | framework | case | value | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | --- |
| 1 | **mreact** | browser select row in 10k rows | 1 | best | ms |
| 2 | solid | browser select row in 10k rows | 1 | 0% | ms |
| 3 | react | browser select row in 10k rows | 2.5 | +150% | ms |
| 4 | svelte | browser select row in 10k rows | 3 | +200% | ms |
| 5 | angular | browser select row in 10k rows | 3.5 | +250% | ms |
| 6 | **mreact react-compat** | browser select row in 10k rows | 4 | +300% | ms |
| 7 | qwik | browser select row in 10k rows | 8.1 | +710% | ms |
| 8 | vue | browser select row in 10k rows | 9.8 | +880% | ms |

### browser clear 10k rows

Clears a 10,000-row keyed DOM in real Chromium to validate happy-dom clear rankings against browser behavior.

| rank | framework | case | value | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | --- |
| 1 | **mreact** | browser clear 10k rows | 2.3 | best | ms |
| 2 | solid | browser clear 10k rows | 2.4 | +4.35% | ms |
| 3 | **mreact react-compat** | browser clear 10k rows | 4.1 | +78.26% | ms |
| 4 | vue | browser clear 10k rows | 4.8 | +108.7% | ms |
| 5 | qwik | browser clear 10k rows | 6 | +160.87% | ms |
| 6 | react | browser clear 10k rows | 6.8 | +195.65% | ms |
| 7 | angular | browser clear 10k rows | 8.3 | +260.87% | ms |
| 8 | svelte | browser clear 10k rows | 8.5 | +269.57% | ms |

## Results

| suite | framework | version | case | status | metric | unit | value | diff vs 1st | sample count | min | max | mean | median | p75 | p95 | p99 | standard deviation | raw samples | notes |
| --- | --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| primitive-browser | mreact | workspace | browser create 1k rows | completed | duration | ms | 2.4 | +50% | 7 | 2 | 3.800000000046566 | 2.6 | 2.4 | 2.8 | 3.8 | 3.8 | 0.5529 | 2.699999999953434, 2.800000000046566, 2.199999999953434, 2.3999999999068677, 2.300000000046566, 3.800000000046566, 2 | bundle gzip bytes: 470151 |
| primitive-browser | mreact react-compat | workspace | browser create 1k rows | completed | duration | ms | 3.5 | +118.75% | 7 | 2.6000000000931323 | 5.600000000093132 | 3.8 | 3.5 | 4.5 | 5.6 | 5.6 | 0.8976 | 4.5, 3.5, 3.300000000046566, 3.6000000000931323, 2.6000000000931323, 5.600000000093132, 3.5 | bundle gzip bytes: 470151 |
| primitive-browser | react | workspace | browser create 1k rows | completed | duration | ms | 3.4 | +112.5% | 7 | 3.2999999998137355 | 4.2000000001862645 | 3.5286 | 3.4 | 3.6 | 4.2 | 4.2 | 0.2914 | 4.2000000001862645, 3.5, 3.6000000000931323, 3.300000000046566, 3.4000000001396984, 3.3999999999068677, 3.2999999998137355 | bundle gzip bytes: 470151 |
| primitive-browser | solid | workspace | browser create 1k rows | completed | duration | ms | 1.6 | best | 7 | 1.5 | 1.7000000001862645 | 1.6143 | 1.6 | 1.7 | 1.7 | 1.7 | 0.0639 | 1.6000000000931323, 1.6000000000931323, 1.5, 1.7000000001862645, 1.5999999998603016, 1.5999999998603016, 1.6999999999534339 | bundle gzip bytes: 470151 |
| primitive-browser | vue | workspace | browser create 1k rows | completed | duration | ms | 3.3 | +106.25% | 7 | 3 | 4.199999999953434 | 3.5 | 3.3 | 3.8 | 4.2 | 4.2 | 0.4036 | 3.800000000046566, 4.199999999953434, 3.300000000046566, 3.7999999998137355, 3.199999999953434, 3, 3.199999999953434 | bundle gzip bytes: 470151 |
| primitive-browser | svelte | workspace | browser create 1k rows | completed | duration | ms | 3.8 | +137.5% | 7 | 3.6000000000931323 | 20.800000000046566 | 7.3 | 3.8 | 11.5 | 20.8 | 20.8 | 6.1249 | 11.5, 20.800000000046566, 3.9000000001396984, 3.800000000046566, 3.7999999998137355, 3.6000000000931323, 3.699999999953434 | bundle gzip bytes: 470151 |
| primitive-browser | angular | workspace | browser create 1k rows | completed | duration | ms | 4.6 | +187.5% | 7 | 4.399999999906868 | 7.300000000046566 | 5.1143 | 4.6 | 5.7 | 7.3 | 7.3 | 0.9819 | 5.699999999953434, 4.800000000046566, 4.399999999906868, 4.600000000093132, 4.5, 4.5, 7.300000000046566 | bundle gzip bytes: 470151 |
| primitive-browser | marko | workspace | browser create 1k rows | unsupported | duration | ms | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | Marko's standalone browser primitive fixture requires the Marko client compiler/runtime integration; keep Marko covered by router browser probes until a stable standalone harness is added. |
| primitive-browser | qwik | workspace | browser create 1k rows | completed | duration | ms | 2.7 | +68.75% | 7 | 2.4000000001396984 | 2.8999999999068677 | 2.6714 | 2.7 | 2.8 | 2.9 | 2.9 | 0.1666 | 2.5, 2.4000000001396984, 2.699999999953434, 2.7999999998137355, 2.800000000046566, 2.8999999999068677, 2.6000000000931323 | bundle gzip bytes: 470151 |
| primitive-browser | mreact | workspace | browser update every 10th in 10k rows | completed | duration | ms | 1.5 | best | 7 | 0.6000000000931323 | 18.5 | 3.7286 | 1.5 | 2.3 | 18.5 | 18.5 | 6.0575 | 1.5, 18.5, 2.300000000046566, 1.6999999999534339, 0.6999999999534339, 0.6000000000931323, 0.8000000000465661 | bundle gzip bytes: 470151 |
| primitive-browser | mreact react-compat | workspace | browser update every 10th in 10k rows | completed | duration | ms | 5.1 | +240% | 7 | 4.800000000046566 | 5.600000000093132 | 5.1286 | 5.1 | 5.3 | 5.6 | 5.6 | 0.2373 | 5.600000000093132, 5.100000000093132, 5.2999999998137355, 5.099999999860302, 5, 4.800000000046566, 5 | bundle gzip bytes: 470151 |
| primitive-browser | react | workspace | browser update every 10th in 10k rows | completed | duration | ms | 2.9 | +93.33% | 7 | 2.699999999953434 | 4.5 | 3.2286 | 2.9 | 3.8 | 4.5 | 4.5 | 0.6318 | 3.800000000046566, 3.199999999953434, 2.8999999999068677, 2.699999999953434, 2.7000000001862645, 4.5, 2.7999999998137355 | bundle gzip bytes: 470151 |
| primitive-browser | solid | workspace | browser update every 10th in 10k rows | completed | duration | ms | 6.7 | +346.67% | 7 | 6.599999999860302 | 6.899999999906868 | 6.7429 | 6.7 | 6.8 | 6.9 | 6.9 | 0.0904 | 6.699999999953434, 6.800000000046566, 6.899999999906868, 6.800000000046566, 6.699999999953434, 6.599999999860302, 6.7000000001862645 | bundle gzip bytes: 470151 |
| primitive-browser | vue | workspace | browser update every 10th in 10k rows | completed | duration | ms | 11.1 | +640% | 7 | 11 | 19.299999999813735 | 13.3571 | 11.1 | 18.8 | 19.3 | 19.3 | 3.6043 | 11, 18.800000000046566, 11.299999999813735, 19.299999999813735, 11, 11.100000000093132, 11 | bundle gzip bytes: 470151 |
| primitive-browser | svelte | workspace | browser update every 10th in 10k rows | completed | duration | ms | 2.5 | +66.67% | 7 | 2.300000000046566 | 3 | 2.5429 | 2.5 | 2.7 | 3 | 3 | 0.2321 | 3, 2.699999999953434, 2.6000000000931323, 2.5, 2.300000000046566, 2.3999999999068677, 2.300000000046566 | bundle gzip bytes: 470151 |
| primitive-browser | angular | workspace | browser update every 10th in 10k rows | completed | duration | ms | 3.9 | +160% | 7 | 3.699999999953434 | 4.2000000001862645 | 3.9286 | 3.9 | 4.1 | 4.2 | 4.2 | 0.175 | 3.9000000001396984, 4.2000000001862645, 4.099999999860302, 3.699999999953434, 3.9000000001396984, 3.699999999953434, 4 | bundle gzip bytes: 470151 |
| primitive-browser | marko | workspace | browser update every 10th in 10k rows | unsupported | duration | ms | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | Marko's standalone browser primitive fixture requires the Marko client compiler/runtime integration; keep Marko covered by router browser probes until a stable standalone harness is added. |
| primitive-browser | qwik | workspace | browser update every 10th in 10k rows | completed | duration | ms | 8.7 | +480% | 7 | 8.099999999860302 | 25.699999999953434 | 13.8571 | 8.7 | 19.5 | 25.7 | 25.7 | 6.7882 | 25.699999999953434, 8.699999999953434, 8.100000000093132, 19.5, 8.099999999860302, 8.100000000093132, 18.799999999813735 | bundle gzip bytes: 470151 |
| primitive-browser | mreact | workspace | browser select row in 10k rows | completed | duration | ms | 1 | best | 7 | 0.8999999999068677 | 1.1000000000931323 | 0.9714 | 1 | 1 | 1.1 | 1.1 | 0.07 | 0.8999999999068677, 1.1000000000931323, 0.9000000001396984, 1, 1, 0.9000000001396984, 1 | bundle gzip bytes: 470151 |
| primitive-browser | mreact react-compat | workspace | browser select row in 10k rows | completed | duration | ms | 4 | +300% | 7 | 3.800000000046566 | 4.199999999953434 | 3.9857 | 4 | 4.1 | 4.2 | 4.2 | 0.1245 | 4.100000000093132, 4.199999999953434, 4, 4, 3.8999999999068677, 3.800000000046566, 3.8999999999068677 | bundle gzip bytes: 470151 |
| primitive-browser | react | workspace | browser select row in 10k rows | completed | duration | ms | 2.5 | +150% | 7 | 2.3999999999068677 | 6.900000000139698 | 3.0857 | 2.5 | 2.5 | 6.9 | 6.9 | 1.5579 | 2.5, 2.4000000001396984, 2.4000000001396984, 6.900000000139698, 2.5, 2.5, 2.3999999999068677 | bundle gzip bytes: 470151 |
| primitive-browser | solid | workspace | browser select row in 10k rows | completed | duration | ms | 1 | 0% | 7 | 0.8999999999068677 | 1 | 0.9571 | 1 | 1 | 1 | 1 | 0.0495 | 0.8999999999068677, 1, 0.8999999999068677, 1, 1, 1, 0.9000000001396984 | bundle gzip bytes: 470151 |
| primitive-browser | vue | workspace | browser select row in 10k rows | completed | duration | ms | 9.8 | +880% | 7 | 9.300000000046566 | 14.199999999953434 | 10.6429 | 9.8 | 12 | 14.2 | 14.2 | 1.6706 | 12, 9.899999999906868, 9.600000000093132, 9.800000000046566, 9.699999999953434, 9.300000000046566, 14.199999999953434 | bundle gzip bytes: 470151 |
| primitive-browser | svelte | workspace | browser select row in 10k rows | completed | duration | ms | 3 | +200% | 7 | 2.8999999999068677 | 6.199999999953434 | 3.4857 | 3 | 3.2 | 6.2 | 6.2 | 1.1115 | 3, 6.199999999953434, 3.199999999953434, 3.1000000000931323, 2.8999999999068677, 3, 3 | bundle gzip bytes: 470151 |
| primitive-browser | angular | workspace | browser select row in 10k rows | completed | duration | ms | 3.5 | +250% | 7 | 3.4000000001396984 | 17.600000000093132 | 7.0429 | 3.5 | 14.2 | 17.6 | 17.6 | 5.6757 | 14.199999999953434, 3.4000000001396984, 3.5, 17.600000000093132, 3.4000000001396984, 3.5, 3.7000000001862645 | bundle gzip bytes: 470151 |
| primitive-browser | marko | workspace | browser select row in 10k rows | unsupported | duration | ms | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | Marko's standalone browser primitive fixture requires the Marko client compiler/runtime integration; keep Marko covered by router browser probes until a stable standalone harness is added. |
| primitive-browser | qwik | workspace | browser select row in 10k rows | completed | duration | ms | 8.1 | +710% | 7 | 7.699999999953434 | 21.0999999998603 | 11.8286 | 8.1 | 19.3 | 21.1 | 21.1 | 5.3859 | 10.5, 8.099999999860302, 7.699999999953434, 21.0999999998603, 8.100000000093132, 8, 19.300000000046566 | bundle gzip bytes: 470151 |
| primitive-browser | mreact | workspace | browser clear 10k rows | completed | duration | ms | 2.3 | best | 7 | 2.199999999953434 | 3.5999999998603016 | 2.5 | 2.3 | 2.5 | 3.6 | 3.6 | 0.466 | 2.5, 2.2000000001862645, 2.199999999953434, 2.5, 2.300000000046566, 2.2000000001862645, 3.5999999998603016 | bundle gzip bytes: 470151 |
| primitive-browser | mreact react-compat | workspace | browser clear 10k rows | completed | duration | ms | 4.1 | +78.26% | 7 | 4 | 7 | 4.5286 | 4.1 | 4.3 | 7 | 7 | 1.0138 | 4.2000000001862645, 4.099999999860302, 7, 4.300000000046566, 4, 4, 4.099999999860302 | bundle gzip bytes: 470151 |
| primitive-browser | react | workspace | browser clear 10k rows | completed | duration | ms | 6.8 | +195.65% | 7 | 6.600000000093132 | 11.799999999813735 | 7.4571 | 6.8 | 6.8 | 11.8 | 11.8 | 1.7743 | 6.600000000093132, 6.800000000046566, 6.699999999953434, 11.799999999813735, 6.800000000046566, 6.800000000046566, 6.699999999953434 | bundle gzip bytes: 470151 |
| primitive-browser | solid | workspace | browser clear 10k rows | completed | duration | ms | 2.4 | +4.35% | 7 | 2.300000000046566 | 2.3999999999068677 | 2.3571 | 2.4 | 2.4 | 2.4 | 2.4 | 0.0495 | 2.300000000046566, 2.3999999999068677, 2.3999999999068677, 2.3999999999068677, 2.300000000046566, 2.300000000046566, 2.3999999999068677 | bundle gzip bytes: 470151 |
| primitive-browser | vue | workspace | browser clear 10k rows | completed | duration | ms | 4.8 | +108.7% | 7 | 4.600000000093132 | 10.5 | 5.6571 | 4.8 | 5.3 | 10.5 | 10.5 | 1.9877 | 5.300000000046566, 4.900000000139698, 10.5, 4.7999999998137355, 4.800000000046566, 4.699999999953434, 4.600000000093132 | bundle gzip bytes: 470151 |
| primitive-browser | svelte | workspace | browser clear 10k rows | completed | duration | ms | 8.5 | +269.57% | 7 | 8 | 9.099999999860302 | 8.5429 | 8.5 | 9 | 9.1 | 9.1 | 0.358 | 9, 8.5, 8.399999999906868, 8.300000000046566, 8, 9.099999999860302, 8.5 | bundle gzip bytes: 470151 |
| primitive-browser | angular | workspace | browser clear 10k rows | completed | duration | ms | 8.3 | +260.87% | 7 | 8.299999999813735 | 8.899999999906868 | 8.4429 | 8.3 | 8.6 | 8.9 | 8.9 | 0.2129 | 8.899999999906868, 8.600000000093132, 8.300000000046566, 8.300000000046566, 8.400000000139698, 8.300000000046566, 8.299999999813735 | bundle gzip bytes: 470151 |
| primitive-browser | marko | workspace | browser clear 10k rows | unsupported | duration | ms | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | Marko's standalone browser primitive fixture requires the Marko client compiler/runtime integration; keep Marko covered by router browser probes until a stable standalone harness is added. |
| primitive-browser | qwik | workspace | browser clear 10k rows | completed | duration | ms | 6 | +160.87% | 7 | 5.900000000139698 | 10.099999999860302 | 6.6286 | 6 | 6.4 | 10.1 | 10.1 | 1.425 | 6, 10.099999999860302, 6.400000000139698, 6, 6, 5.900000000139698, 6 | bundle gzip bytes: 470151 |
