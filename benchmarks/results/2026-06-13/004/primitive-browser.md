# Primitive Browser Benchmark

## Environment

- Date: 2026-06-13
- Git commit: ac3eca8d5cff4b8df7ad6a8584c1fbe62248d6bf
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
  - @reckona/mreact-compat: 0.0.165
  - @reckona/mreact-reactive-core: 0.0.165
  - @reckona/mreact-reactive-dom: 0.0.165
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
| 2 | qwik | browser create 1k rows | 2.7 | +68.75% | ms |
| 3 | **mreact** | browser create 1k rows | 3.1 | +93.75% | ms |
| 4 | react | browser create 1k rows | 3.4 | +112.5% | ms |
| 5 | vue | browser create 1k rows | 3.4 | +112.5% | ms |
| 6 | **mreact react-compat** | browser create 1k rows | 3.7 | +131.25% | ms |
| 7 | angular | browser create 1k rows | 4.8 | +200% | ms |
| 8 | svelte | browser create 1k rows | 5.2 | +225% | ms |

### browser update every 10th in 10k rows

Updates every tenth row in a 10,000-row keyed DOM in real Chromium, exposing real DOM update costs hidden by happy-dom.

| rank | framework | case | value | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | --- |
| 1 | **mreact** | browser update every 10th in 10k rows | 0.9 | best | ms |
| 2 | svelte | browser update every 10th in 10k rows | 2.5 | +177.78% | ms |
| 3 | react | browser update every 10th in 10k rows | 3 | +233.33% | ms |
| 4 | angular | browser update every 10th in 10k rows | 4.1 | +355.56% | ms |
| 5 | **mreact react-compat** | browser update every 10th in 10k rows | 5.5 | +511.11% | ms |
| 6 | solid | browser update every 10th in 10k rows | 8 | +788.89% | ms |
| 7 | qwik | browser update every 10th in 10k rows | 10.8 | +1100% | ms |
| 8 | vue | browser update every 10th in 10k rows | 12.9 | +1333.33% | ms |

### browser select row in 10k rows

Toggles selection attributes for one row in a 10,000-row keyed DOM in real Chromium.

| rank | framework | case | value | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | --- |
| 1 | solid | browser select row in 10k rows | 0.9 | best | ms |
| 2 | **mreact** | browser select row in 10k rows | 1 | +11.11% | ms |
| 3 | react | browser select row in 10k rows | 2.5 | +177.78% | ms |
| 4 | svelte | browser select row in 10k rows | 2.8 | +211.11% | ms |
| 5 | angular | browser select row in 10k rows | 3.6 | +300% | ms |
| 6 | **mreact react-compat** | browser select row in 10k rows | 3.8 | +322.22% | ms |
| 7 | qwik | browser select row in 10k rows | 10.2 | +1033.33% | ms |
| 8 | vue | browser select row in 10k rows | 10.8 | +1100% | ms |

### browser clear 10k rows

Clears a 10,000-row keyed DOM in real Chromium to validate happy-dom clear rankings against browser behavior.

| rank | framework | case | value | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | --- |
| 1 | **mreact** | browser clear 10k rows | 2.4 | best | ms |
| 2 | solid | browser clear 10k rows | 2.4 | 0% | ms |
| 3 | **mreact react-compat** | browser clear 10k rows | 4.2 | +75% | ms |
| 4 | vue | browser clear 10k rows | 5.1 | +112.5% | ms |
| 5 | qwik | browser clear 10k rows | 6.3 | +162.5% | ms |
| 6 | react | browser clear 10k rows | 8.1 | +237.5% | ms |
| 7 | angular | browser clear 10k rows | 8.8 | +266.67% | ms |
| 8 | svelte | browser clear 10k rows | 9 | +275% | ms |

## Results

| suite | framework | version | case | status | metric | unit | value | diff vs 1st | sample count | min | max | mean | median | p75 | p95 | p99 | standard deviation | raw samples | notes |
| --- | --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| primitive-browser | mreact | workspace | browser create 1k rows | completed | duration | ms | 3.1 | +93.75% | 7 | 2.1000000000931323 | 4 | 3 | 3.1 | 3.9 | 4 | 4 | 0.7483 | 3.1000000000931323, 4, 3.4000000001396984, 2.300000000046566, 2.199999999953434, 3.9000000001396984, 2.1000000000931323 | bundle gzip bytes: 470151 |
| primitive-browser | mreact react-compat | workspace | browser create 1k rows | completed | duration | ms | 3.7 | +131.25% | 7 | 2.5999999998603016 | 6.099999999860302 | 3.8143 | 3.7 | 4.4 | 6.1 | 6.1 | 1.0999 | 4.400000000139698, 3.9000000001396984, 2.800000000046566, 3.199999999953434, 2.5999999998603016, 6.099999999860302, 3.7000000001862645 | bundle gzip bytes: 470151 |
| primitive-browser | react | workspace | browser create 1k rows | completed | duration | ms | 3.4 | +112.5% | 7 | 3.2999999998137355 | 4 | 3.5 | 3.4 | 3.7 | 4 | 4 | 0.239 | 4, 3.4000000001396984, 3.699999999953434, 3.4000000001396984, 3.300000000046566, 3.2999999998137355, 3.4000000001396984 | bundle gzip bytes: 470151 |
| primitive-browser | solid | workspace | browser create 1k rows | completed | duration | ms | 1.6 | best | 7 | 1.5 | 2 | 1.6571 | 1.6 | 1.7 | 2 | 2 | 0.1498 | 1.6000000000931323, 2, 1.6000000000931323, 1.5, 1.6000000000931323, 1.6000000000931323, 1.6999999999534339 | bundle gzip bytes: 470151 |
| primitive-browser | vue | workspace | browser create 1k rows | completed | duration | ms | 3.4 | +112.5% | 7 | 3.199999999953434 | 4.300000000046566 | 3.5429 | 3.4 | 3.7 | 4.3 | 4.3 | 0.3659 | 3.699999999953434, 4.300000000046566, 3.4000000001396984, 3.7000000001862645, 3.199999999953434, 3.2000000001862645, 3.300000000046566 | bundle gzip bytes: 470151 |
| primitive-browser | svelte | workspace | browser create 1k rows | completed | duration | ms | 5.2 | +225% | 7 | 3.5999999998603016 | 20.699999999953434 | 7.8857 | 5.2 | 13.1 | 20.7 | 20.7 | 6.0932 | 13.100000000093132, 20.699999999953434, 5.400000000139698, 3.6000000000931323, 3.5999999998603016, 3.6000000000931323, 5.2000000001862645 | bundle gzip bytes: 470151 |
| primitive-browser | angular | workspace | browser create 1k rows | completed | duration | ms | 4.8 | +200% | 7 | 4.5 | 7.400000000139698 | 5.2429 | 4.8 | 5.9 | 7.4 | 7.4 | 0.981 | 5.900000000139698, 4.7999999998137355, 4.599999999860302, 4.699999999953434, 4.5, 4.800000000046566, 7.400000000139698 | bundle gzip bytes: 470151 |
| primitive-browser | marko | workspace | browser create 1k rows | unsupported | duration | ms | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | Marko's standalone browser primitive fixture requires the Marko client compiler/runtime integration; keep Marko covered by router browser probes until a stable standalone harness is added. |
| primitive-browser | qwik | workspace | browser create 1k rows | completed | duration | ms | 2.7 | +68.75% | 7 | 2.5 | 2.800000000046566 | 2.6857 | 2.7 | 2.8 | 2.8 | 2.8 | 0.1125 | 2.5, 2.5999999998603016, 2.800000000046566, 2.800000000046566, 2.800000000046566, 2.699999999953434, 2.6000000000931323 | bundle gzip bytes: 470151 |
| primitive-browser | mreact | workspace | browser update every 10th in 10k rows | completed | duration | ms | 0.9 | best | 7 | 0.8999999999068677 | 1.4000000001396984 | 1.0571 | 0.9 | 1.3 | 1.4 | 1.4 | 0.199 | 1.2999999998137355, 0.8999999999068677, 0.9000000001396984, 1.4000000001396984, 1.0999999998603016, 0.9000000001396984, 0.8999999999068677 | bundle gzip bytes: 470151 |
| primitive-browser | mreact react-compat | workspace | browser update every 10th in 10k rows | completed | duration | ms | 5.5 | +511.11% | 7 | 5.300000000046566 | 5.5 | 5.4143 | 5.5 | 5.5 | 5.5 | 5.5 | 0.099 | 5.5, 5.300000000046566, 5.5, 5.300000000046566, 5.5, 5.300000000046566, 5.5 | bundle gzip bytes: 470151 |
| primitive-browser | react | workspace | browser update every 10th in 10k rows | completed | duration | ms | 3 | +233.33% | 7 | 2.800000000046566 | 7.7000000001862645 | 3.8143 | 3 | 3.9 | 7.7 | 7.7 | 1.6208 | 3.9000000001396984, 3.300000000046566, 3, 7.7000000001862645, 2.800000000046566, 3, 3 | bundle gzip bytes: 470151 |
| primitive-browser | solid | workspace | browser update every 10th in 10k rows | completed | duration | ms | 8 | +788.89% | 7 | 6.899999999906868 | 8.300000000046566 | 7.8857 | 8 | 8.1 | 8.3 | 8.3 | 0.4189 | 6.899999999906868, 8, 8, 8, 7.899999999906868, 8.099999999860302, 8.300000000046566 | bundle gzip bytes: 470151 |
| primitive-browser | vue | workspace | browser update every 10th in 10k rows | completed | duration | ms | 12.9 | +1333.33% | 7 | 11.599999999860302 | 23.5 | 15.4857 | 12.9 | 20.4 | 23.5 | 23.5 | 4.3185 | 11.599999999860302, 20.399999999906868, 15.399999999906868, 12.899999999906868, 12.099999999860302, 23.5, 12.5 | bundle gzip bytes: 470151 |
| primitive-browser | svelte | workspace | browser update every 10th in 10k rows | completed | duration | ms | 2.5 | +177.78% | 7 | 2.2999999998137355 | 4.800000000046566 | 2.8429 | 2.5 | 2.7 | 4.8 | 4.8 | 0.8069 | 4.800000000046566, 2.699999999953434, 2.5999999998603016, 2.5, 2.5, 2.5, 2.2999999998137355 | bundle gzip bytes: 470151 |
| primitive-browser | angular | workspace | browser update every 10th in 10k rows | completed | duration | ms | 4.1 | +355.56% | 7 | 3.8999999999068677 | 4.400000000139698 | 4.1143 | 4.1 | 4.2 | 4.4 | 4.4 | 0.1552 | 4, 4.199999999953434, 4.400000000139698, 3.8999999999068677, 4.099999999860302, 4, 4.199999999953434 | bundle gzip bytes: 470151 |
| primitive-browser | marko | workspace | browser update every 10th in 10k rows | unsupported | duration | ms | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | Marko's standalone browser primitive fixture requires the Marko client compiler/runtime integration; keep Marko covered by router browser probes until a stable standalone harness is added. |
| primitive-browser | qwik | workspace | browser update every 10th in 10k rows | completed | duration | ms | 10.8 | +1100% | 7 | 9.199999999953434 | 33.39999999990687 | 14.7429 | 10.8 | 19.9 | 33.4 | 33.4 | 8.3751 | 11, 9.399999999906868, 19.899999999906868, 9.5, 9.199999999953434, 33.39999999990687, 10.800000000046566 | bundle gzip bytes: 470151 |
| primitive-browser | mreact | workspace | browser select row in 10k rows | completed | duration | ms | 1 | +11.11% | 7 | 0.8999999999068677 | 1.1000000000931323 | 1.0143 | 1 | 1.1 | 1.1 | 1.1 | 0.0639 | 1, 0.8999999999068677, 1.1000000000931323, 1, 1.0999999998603016, 1, 1 | bundle gzip bytes: 470151 |
| primitive-browser | mreact react-compat | workspace | browser select row in 10k rows | completed | duration | ms | 3.8 | +322.22% | 7 | 3.699999999953434 | 14.300000000046566 | 5.4429 | 3.8 | 5 | 14.3 | 14.3 | 3.6414 | 14.300000000046566, 3.800000000046566, 3.699999999953434, 3.699999999953434, 3.800000000046566, 3.800000000046566, 5 | bundle gzip bytes: 470151 |
| primitive-browser | react | workspace | browser select row in 10k rows | completed | duration | ms | 2.5 | +177.78% | 7 | 2.4000000001396984 | 2.6000000000931323 | 2.4857 | 2.5 | 2.5 | 2.6 | 2.6 | 0.0639 | 2.5, 2.4000000001396984, 2.5, 2.5, 2.4000000001396984, 2.5, 2.6000000000931323 | bundle gzip bytes: 470151 |
| primitive-browser | solid | workspace | browser select row in 10k rows | completed | duration | ms | 0.9 | best | 7 | 0.8999999999068677 | 1 | 0.9286 | 0.9 | 1 | 1 | 1 | 0.0452 | 0.8999999999068677, 0.8999999999068677, 1, 0.8999999999068677, 0.8999999999068677, 1, 0.8999999999068677 | bundle gzip bytes: 470151 |
| primitive-browser | vue | workspace | browser select row in 10k rows | completed | duration | ms | 10.8 | +1100% | 7 | 10.5 | 13.5 | 11.3857 | 10.8 | 12.7 | 13.5 | 13.5 | 1.109 | 13.5, 10.5, 12.699999999953434, 10.799999999813735, 10.800000000046566, 10.699999999953434, 10.699999999953434 | bundle gzip bytes: 470151 |
| primitive-browser | svelte | workspace | browser select row in 10k rows | completed | duration | ms | 2.8 | +211.11% | 7 | 2.7999999998137355 | 3 | 2.8714 | 2.8 | 3 | 3 | 3 | 0.0881 | 3, 3, 2.9000000001396984, 2.7999999998137355, 2.800000000046566, 2.800000000046566, 2.800000000046566 | bundle gzip bytes: 470151 |
| primitive-browser | angular | workspace | browser select row in 10k rows | completed | duration | ms | 3.6 | +300% | 7 | 3.5 | 17 | 5.5 | 3.6 | 3.7 | 17 | 17 | 4.6953 | 3.6000000000931323, 3.7000000001862645, 17, 3.6000000000931323, 3.5, 3.5, 3.5999999998603016 | bundle gzip bytes: 470151 |
| primitive-browser | marko | workspace | browser select row in 10k rows | unsupported | duration | ms | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | Marko's standalone browser primitive fixture requires the Marko client compiler/runtime integration; keep Marko covered by router browser probes until a stable standalone harness is added. |
| primitive-browser | qwik | workspace | browser select row in 10k rows | completed | duration | ms | 10.2 | +1033.33% | 7 | 9 | 21.100000000093132 | 12.8857 | 10.2 | 20.6 | 21.1 | 21.1 | 5.0615 | 9.800000000046566, 20.600000000093132, 9, 9.100000000093132, 21.100000000093132, 10.199999999953434, 10.400000000139698 | bundle gzip bytes: 470151 |
| primitive-browser | mreact | workspace | browser clear 10k rows | completed | duration | ms | 2.4 | best | 7 | 2.199999999953434 | 4 | 2.6 | 2.4 | 2.6 | 4 | 4 | 0.5831 | 2.6000000000931323, 4, 2.300000000046566, 2.3999999999068677, 2.300000000046566, 2.4000000001396984, 2.199999999953434 | bundle gzip bytes: 470151 |
| primitive-browser | mreact react-compat | workspace | browser clear 10k rows | completed | duration | ms | 4.2 | +75% | 7 | 4.100000000093132 | 16.199999999953434 | 5.9143 | 4.2 | 4.4 | 16.2 | 16.2 | 4.2001 | 4.199999999953434, 4.199999999953434, 16.199999999953434, 4.400000000139698, 4.199999999953434, 4.100000000093132, 4.100000000093132 | bundle gzip bytes: 470151 |
| primitive-browser | react | workspace | browser clear 10k rows | completed | duration | ms | 8.1 | +237.5% | 7 | 7.7000000001862645 | 15 | 9.0857 | 8.1 | 8.6 | 15 | 15 | 2.4275 | 8.100000000093132, 8, 8, 8.599999999860302, 7.7000000001862645, 15, 8.199999999953434 | bundle gzip bytes: 470151 |
| primitive-browser | solid | workspace | browser clear 10k rows | completed | duration | ms | 2.4 | 0% | 7 | 2.300000000046566 | 2.5 | 2.3857 | 2.4 | 2.4 | 2.5 | 2.5 | 0.0639 | 2.4000000001396984, 2.4000000001396984, 2.5, 2.300000000046566, 2.4000000001396984, 2.300000000046566, 2.4000000001396984 | bundle gzip bytes: 470151 |
| primitive-browser | vue | workspace | browser clear 10k rows | completed | duration | ms | 5.1 | +112.5% | 7 | 4.5 | 32.5 | 8.8571 | 5.1 | 5.7 | 32.5 | 32.5 | 9.6605 | 5.699999999953434, 5.100000000093132, 4.599999999860302, 5.100000000093132, 4.5, 4.5, 32.5 | bundle gzip bytes: 470151 |
| primitive-browser | svelte | workspace | browser clear 10k rows | completed | duration | ms | 9 | +275% | 7 | 8.5 | 106.60000000009313 | 23.4286 | 9 | 12.9 | 106.6 | 106.6 | 33.9842 | 106.60000000009313, 9.600000000093132, 9, 8.600000000093132, 8.800000000046566, 12.900000000139698, 8.5 | bundle gzip bytes: 470151 |
| primitive-browser | angular | workspace | browser clear 10k rows | completed | duration | ms | 8.8 | +266.67% | 7 | 8.600000000093132 | 11.099999999860302 | 9.3286 | 8.8 | 10.3 | 11.1 | 11.1 | 0.9223 | 11.099999999860302, 10.299999999813735, 8.600000000093132, 9.300000000046566, 8.600000000093132, 8.600000000093132, 8.800000000046566 | bundle gzip bytes: 470151 |
| primitive-browser | marko | workspace | browser clear 10k rows | unsupported | duration | ms | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | Marko's standalone browser primitive fixture requires the Marko client compiler/runtime integration; keep Marko covered by router browser probes until a stable standalone harness is added. |
| primitive-browser | qwik | workspace | browser clear 10k rows | completed | duration | ms | 6.3 | +162.5% | 7 | 6.099999999860302 | 6.5 | 6.3 | 6.3 | 6.4 | 6.5 | 6.5 | 0.1414 | 6.099999999860302, 6.300000000046566, 6.300000000046566, 6.400000000139698, 6.400000000139698, 6.100000000093132, 6.5 | bundle gzip bytes: 470151 |
