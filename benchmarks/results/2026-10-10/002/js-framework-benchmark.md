# js-framework-benchmark Results

Official krausest/js-framework-benchmark keyed DOM cases run for the primitive benchmark peers that have matching upstream fixtures.
The mreact fixtures use local package builds staged from this checkout, so unreleased runtime changes are included.

## Framework Mapping

| primitive adapter | official fixture |
| --- | --- |
| marko | keyed/marko |
| vue | keyed/vue |
| svelte | keyed/svelte |
| angular | keyed/angular-cf |
| react | keyed/react-hooks |
| mreact react-compat | keyed/mreact-react-compat |
| mreact react-compat (vdom) | keyed/mreact-react-compat-vdom |
| solid | keyed/solid |
| mreact | keyed/mreact |

## Run Order

Framework order offset: 9
Framework run order: keyed/marko, keyed/vue, keyed/svelte, keyed/angular-cf, keyed/react-hooks, keyed/mreact-react-compat, keyed/mreact-react-compat-vdom, keyed/solid, keyed/mreact
Fixed diff anchor: react-hooks

## Unsupported Primitive Adapters

- qwik: krausest/js-framework-benchmark keyed/qwik currently fails the official isKeyed check and is categorized as non-keyed.
- qwik-v2: krausest/js-framework-benchmark does not currently provide a matching Qwik v2 keyed fixture.
- solid-v2: krausest/js-framework-benchmark does not currently provide a matching Solid v2 keyed fixture.

Raw JSON files are stored in `benchmarks/results/2026-10-10/002/js-framework-benchmark-results`.
Chrome trace files are stored in `benchmarks/results/2026-10-10/002/js-framework-benchmark-traces`.

## Rankings

Lower values are better for all js-framework-benchmark metrics reported here.

### create rows

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | **mreact-v0.0.232-local-keyed** | create rows | 66.7 | 6.6 | 58.8 | best |  | ms |
| 2 | marko-v6.4.5-keyed | create rows | 67.4 | 7.4 | 59.1 | +1.05% |  | ms |
| 3 | solid-v1.9.17-keyed | create rows | 67.6 | 7.3 | 59 | +1.35% |  | ms |
| 4 | svelte-v5.57.2-keyed | create rows | 70.7 | 9.6 | 60.1 | +6% |  | ms |
| 5 | react-hooks-v19.3.0-keyed | create rows | 78.2 | 17.6 | 58.9 | +17.24% |  | ms |
| 6 | **mreact-react-compat-v0.0.232-local-keyed** | create rows | 79.2 | 17.9 | 59.8 | +18.74% |  | ms |
| 7 | vue-v3.5.43-keyed | create rows | 79.5 | 17.8 | 60.3 | +19.19% |  | ms |
| 8 | **mreact-react-compat-vdom-v0.0.232-local-keyed** | create rows | 92.8 | 31.8 | 60.5 | +39.13% |  | ms |
| 9 | angular-cf-v22.2.0-keyed | create rows | 95.2 | 17.7 | 61 | +42.73% |  | ms |

### replace all rows

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | **mreact-v0.0.232-local-keyed** | replace all rows | 71.4 | 11.3 | 59 | best |  | ms |
| 2 | marko-v6.4.5-keyed | replace all rows | 75 | 14.9 | 58.8 | +5.04% |  | ms |
| 3 | solid-v1.9.17-keyed | replace all rows | 75.5 | 14.8 | 59.1 | +5.74% |  | ms |
| 4 | svelte-v5.57.2-keyed | replace all rows | 77.6 | 17.1 | 59.2 | +8.68% |  | ms |
| 5 | vue-v3.5.43-keyed | replace all rows | 84.5 | 24.3 | 57.4 | +18.35% |  | ms |
| 6 | **mreact-react-compat-v0.0.232-local-keyed** | replace all rows | 88.9 | 27.8 | 59.2 | +24.51% |  | ms |
| 7 | react-hooks-v19.3.0-keyed | replace all rows | 92.3 | 31.8 | 60 | +29.27% |  | ms |
| 8 | **mreact-react-compat-vdom-v0.0.232-local-keyed** | replace all rows | 102.3 | 42.4 | 59.9 | +43.28% |  | ms |
| 9 | angular-cf-v22.2.0-keyed | replace all rows | 111.1 | 33.3 | 62.3 | +55.6% |  | ms |

### partial update

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | angular-cf-v22.2.0-keyed | partial update | 39.4 | 3.5 | 35.5 | best |  | ms |
| 2 | marko-v6.4.5-keyed | partial update | 44.3 | 3.9 | 37.1 | +12.44% |  | ms |
| 3 | **mreact-v0.0.232-local-keyed** | partial update | 45.1 | 3.7 | 37.5 | +14.47% |  | ms |
| 4 | solid-v1.9.17-keyed | partial update | 45.3 | 3.3 | 38.5 | +14.97% |  | ms |
| 5 | vue-v3.5.43-keyed | partial update | 48.6 | 5.8 | 39.2 | +23.35% |  | ms |
| 6 | svelte-v5.57.2-keyed | partial update | 49.1 | 4.6 | 40.3 | +24.62% |  | ms |
| 7 | **mreact-react-compat-v0.0.232-local-keyed** | partial update | 54 | 7.4 | 42.1 | +37.06% |  | ms |
| 8 | react-hooks-v19.3.0-keyed | partial update | 55.8 | 12.1 | 41 | +41.62% |  | ms |
| 9 | **mreact-react-compat-vdom-v0.0.232-local-keyed** | partial update | 70.8 | 26.5 | 38 | +79.7% |  | ms |

### select row

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | **mreact-v0.0.232-local-keyed** | select row | 8.9 | 1.1 | 6.2 | best |  | ms |
| 2 | vue-v3.5.43-keyed | select row | 9.4 | 2.4 | 6 | +5.62% |  | ms |
| 3 | marko-v6.4.5-keyed | select row | 9.5 | 1.4 | 6.4 | +6.74% |  | ms |
| 4 | solid-v1.9.17-keyed | select row | 9.9 | 1.9 | 6.5 | +11.24% |  | ms |
| 5 | **mreact-react-compat-v0.0.232-local-keyed** | select row | 11.5 | 3.9 | 6.4 | +29.21% |  | ms |
| 6 | svelte-v5.57.2-keyed | select row | 13.5 | 5.6 | 6.4 | +51.69% |  | ms |
| 7 | angular-cf-v22.2.0-keyed | select row | 14.1 | 4.3 | 8.4 | +58.43% |  | ms |
| 8 | react-hooks-v19.3.0-keyed | select row | 14.2 | 6 | 6.7 | +59.55% |  | ms |
| 9 | **mreact-react-compat-vdom-v0.0.232-local-keyed** | select row | 15.6 | 7.5 | 6.6 | +75.28% |  | ms |

### swap rows

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | angular-cf-v22.2.0-keyed | swap rows | 44.7 | 2.5 | 41.3 | best |  | ms |
| 2 | marko-v6.4.5-keyed | swap rows | 45.3 | 2.7 | 39.2 | +1.34% |  | ms |
| 3 | **mreact-v0.0.232-local-keyed** | swap rows | 47.1 | 2.1 | 41.6 | +5.37% |  | ms |
| 4 | **mreact-react-compat-v0.0.232-local-keyed** | swap rows | 48.1 | 4.2 | 40 | +7.61% |  | ms |
| 5 | vue-v3.5.43-keyed | swap rows | 48.1 | 2.9 | 41.6 | +7.61% |  | ms |
| 6 | solid-v1.9.17-keyed | swap rows | 49.3 | 2 | 43 | +10.29% |  | ms |
| 7 | svelte-v5.57.2-keyed | swap rows | 49.7 | 3.6 | 42.2 | +11.19% |  | ms |
| 8 | **mreact-react-compat-vdom-v0.0.232-local-keyed** | swap rows | 67.2 | 19.6 | 43.9 | +50.34% |  | ms |
| 9 | react-hooks-v19.3.0-keyed | swap rows | 346.2 | 54.6 | 282.4 | +674.5% |  | ms |

### remove row

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | angular-cf-v22.2.0-keyed | remove row | 31.7 | 1.5 | 29.1 | best |  | ms |
| 2 | solid-v1.9.17-keyed | remove row | 32.8 | 0.9 | 30 | +3.47% |  | ms |
| 3 | **mreact-v0.0.232-local-keyed** | remove row | 34 | 1.2 | 31.2 | +7.26% |  | ms |
| 4 | marko-v6.4.5-keyed | remove row | 34.9 | 1.4 | 31.6 | +10.09% |  | ms |
| 5 | **mreact-react-compat-v0.0.232-local-keyed** | remove row | 35.4 | 1.8 | 31.9 | +11.67% |  | ms |
| 6 | svelte-v5.57.2-keyed | remove row | 35.7 | 1.5 | 32.2 | +12.62% |  | ms |
| 7 | react-hooks-v19.3.0-keyed | remove row | 36.1 | 2.8 | 31.2 | +13.88% |  | ms |
| 8 | vue-v3.5.43-keyed | remove row | 39 | 4.8 | 32.2 | +23.03% |  | ms |
| 9 | **mreact-react-compat-vdom-v0.0.232-local-keyed** | remove row | 40.4 | 5.4 | 32.2 | +27.44% |  | ms |

### create many rows

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | marko-v6.4.5-keyed | create many rows | 748.1 | 76.2 | 664.9 | best |  | ms |
| 2 | solid-v1.9.17-keyed | create many rows | 751.9 | 68.1 | 675.4 | +0.51% |  | ms |
| 3 | **mreact-v0.0.232-local-keyed** | create many rows | 754.8 | 64.9 | 680.1 | +0.9% |  | ms |
| 4 | svelte-v5.57.2-keyed | create many rows | 776.1 | 85.2 | 679.3 | +3.74% |  | ms |
| 5 | **mreact-react-compat-v0.0.232-local-keyed** | create many rows | 863.4 | 153 | 702.4 | +15.41% |  | ms |
| 6 | vue-v3.5.43-keyed | create many rows | 863.4 | 155 | 702.6 | +15.41% |  | ms |
| 7 | angular-cf-v22.2.0-keyed | create many rows | 977 | 195.1 | 700.2 | +30.6% |  | ms |
| 8 | **mreact-react-compat-vdom-v0.0.232-local-keyed** | create many rows | 984 | 286.3 | 689.1 | +31.53% |  | ms |
| 9 | react-hooks-v19.3.0-keyed | create many rows | 1189.5 | 467 | 714.5 | +59% |  | ms |

### append rows to large table

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | solid-v1.9.17-keyed | append rows to large table | 79 | 8.6 | 68.9 | best |  | ms |
| 2 | svelte-v5.57.2-keyed | append rows to large table | 79.8 | 9.2 | 69.6 | +1.01% |  | ms |
| 3 | **mreact-v0.0.232-local-keyed** | append rows to large table | 80.8 | 7.2 | 71.8 | +2.28% |  | ms |
| 4 | marko-v6.4.5-keyed | append rows to large table | 83.8 | 9.6 | 72.4 | +6.08% |  | ms |
| 5 | vue-v3.5.43-keyed | append rows to large table | 84.2 | 15.3 | 67.3 | +6.58% |  | ms |
| 6 | react-hooks-v19.3.0-keyed | append rows to large table | 89.5 | 19.3 | 68.9 | +13.29% |  | ms |
| 7 | **mreact-react-compat-v0.0.232-local-keyed** | append rows to large table | 90.1 | 18 | 70.3 | +14.05% |  | ms |
| 8 | angular-cf-v22.2.0-keyed | append rows to large table | 104.6 | 17.9 | 72.1 | +32.41% |  | ms |
| 9 | **mreact-react-compat-vdom-v0.0.232-local-keyed** | append rows to large table | 109.1 | 38.7 | 68.8 | +38.1% |  | ms |

### clear rows

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | marko-v6.4.5-keyed | clear rows | 27.4 | 23.7 | 3 | best |  | ms |
| 2 | **mreact-v0.0.232-local-keyed** | clear rows | 28.5 | 24.6 | 2.6 | +4.01% |  | ms |
| 3 | solid-v1.9.17-keyed | clear rows | 31.9 | 28.4 | 2.9 | +16.42% |  | ms |
| 4 | svelte-v5.57.2-keyed | clear rows | 34.3 | 30.9 | 3.4 | +25.18% |  | ms |
| 5 | **mreact-react-compat-vdom-v0.0.232-local-keyed** | clear rows | 38.6 | 34.9 | 2.8 | +40.88% |  | ms |
| 6 | **mreact-react-compat-v0.0.232-local-keyed** | clear rows | 41.5 | 37.5 | 2.7 | +51.46% |  | ms |
| 7 | vue-v3.5.43-keyed | clear rows | 46.9 | 42.8 | 3.4 | +71.17% |  | ms |
| 8 | react-hooks-v19.3.0-keyed | clear rows | 51.1 | 47.1 | 2.8 | +86.5% |  | ms |
| 9 | angular-cf-v22.2.0-keyed | clear rows | 56.1 | 52.5 | 3.3 | +104.74% |  | ms |

### ready memory

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | marko-v6.4.5-keyed | ready memory | 1 |  |  | best |  | MB |
| 2 | solid-v1.9.17-keyed | ready memory | 1.1 |  |  | +5.33% |  | MB |
| 3 | **mreact-v0.0.232-local-keyed** | ready memory | 1.1 |  |  | +9.26% |  | MB |
| 4 | svelte-v5.57.2-keyed | ready memory | 1.2 |  |  | +13.77% |  | MB |
| 5 | vue-v3.5.43-keyed | ready memory | 1.3 |  |  | +26.23% |  | MB |
| 6 | **mreact-react-compat-vdom-v0.0.232-local-keyed** | ready memory | 1.3 |  |  | +30.82% |  | MB |
| 7 | **mreact-react-compat-v0.0.232-local-keyed** | ready memory | 1.4 |  |  | +38% |  | MB |
| 8 | react-hooks-v19.3.0-keyed | ready memory | 1.7 |  |  | +61.36% |  | MB |
| 9 | angular-cf-v22.2.0-keyed | ready memory | 2 |  |  | +98.02% |  | MB |

### run memory

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | marko-v6.4.5-keyed | run memory | 2.7 |  |  | best |  | MB |
| 2 | **mreact-v0.0.232-local-keyed** | run memory | 2.7 |  |  | +0.13% |  | MB |
| 3 | solid-v1.9.17-keyed | run memory | 3.2 |  |  | +16.09% |  | MB |
| 4 | svelte-v5.57.2-keyed | run memory | 3.5 |  |  | +27.98% |  | MB |
| 5 | vue-v3.5.43-keyed | run memory | 4.4 |  |  | +62.03% |  | MB |
| 6 | **mreact-react-compat-v0.0.232-local-keyed** | run memory | 4.7 |  |  | +70.46% |  | MB |
| 7 | **mreact-react-compat-vdom-v0.0.232-local-keyed** | run memory | 4.9 |  |  | +80.17% |  | MB |
| 8 | react-hooks-v19.3.0-keyed | run memory | 5 |  |  | +83.06% |  | MB |
| 9 | angular-cf-v22.2.0-keyed | run memory | 5.1 |  |  | +85.92% |  | MB |

### repeated clear memory

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | solid-v1.9.17-keyed | repeated clear memory | 1.3 |  |  | best |  | MB |
| 2 | **mreact-v0.0.232-local-keyed** | repeated clear memory | 1.4 |  |  | +6.65% |  | MB |
| 3 | marko-v6.4.5-keyed | repeated clear memory | 1.4 |  |  | +7.33% |  | MB |
| 4 | svelte-v5.57.2-keyed | repeated clear memory | 1.5 |  |  | +16.78% |  | MB |
| 5 | vue-v3.5.43-keyed | repeated clear memory | 1.6 |  |  | +28.81% |  | MB |
| 6 | **mreact-react-compat-v0.0.232-local-keyed** | repeated clear memory | 1.8 |  |  | +44.39% |  | MB |
| 7 | react-hooks-v19.3.0-keyed | repeated clear memory | 2.5 |  |  | +97.34% |  | MB |
| 8 | **mreact-react-compat-vdom-v0.0.232-local-keyed** | repeated clear memory | 2.6 |  |  | +104.31% |  | MB |
| 9 | angular-cf-v22.2.0-keyed | repeated clear memory | 2.8 |  |  | +117.01% |  | MB |

### total byte weight

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | solid-v1.9.17-keyed | total byte weight | 4.5 |  |  | best |  | kB |
| 2 | marko-v6.4.5-keyed | total byte weight | 4.6 |  |  | +2.22% |  | kB |
| 3 | **mreact-v0.0.232-local-keyed** | total byte weight | 10.5 |  |  | +133.33% |  | kB |
| 4 | svelte-v5.57.2-keyed | total byte weight | 11.6 |  |  | +157.78% |  | kB |
| 5 | vue-v3.5.43-keyed | total byte weight | 23.7 |  |  | +426.67% |  | kB |
| 6 | **mreact-react-compat-vdom-v0.0.232-local-keyed** | total byte weight | 36.3 |  |  | +706.67% |  | kB |
| 7 | **mreact-react-compat-v0.0.232-local-keyed** | total byte weight | 43.8 |  |  | +873.33% |  | kB |
| 8 | angular-cf-v22.2.0-keyed | total byte weight | 45.5 |  |  | +911.11% |  | kB |
| 9 | react-hooks-v19.3.0-keyed | total byte weight | 58.7 |  |  | +1204.44% |  | kB |

## Results

| suite | framework | case | status | metric | unit | value | script | paint | diff vs 1st | diff vs react-hooks |
| --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| js-framework-benchmark | angular-cf-v22.2.0-keyed | create rows | completed | duration | ms | 95.2 | 17.7 | 61 | +42.73% |  |
| js-framework-benchmark | angular-cf-v22.2.0-keyed | replace all rows | completed | duration | ms | 111.1 | 33.3 | 62.3 | +55.6% |  |
| js-framework-benchmark | angular-cf-v22.2.0-keyed | partial update | completed | duration | ms | 39.4 | 3.5 | 35.5 | best |  |
| js-framework-benchmark | angular-cf-v22.2.0-keyed | select row | completed | duration | ms | 14.1 | 4.3 | 8.4 | +58.43% |  |
| js-framework-benchmark | angular-cf-v22.2.0-keyed | swap rows | completed | duration | ms | 44.7 | 2.5 | 41.3 | best |  |
| js-framework-benchmark | angular-cf-v22.2.0-keyed | remove row | completed | duration | ms | 31.7 | 1.5 | 29.1 | best |  |
| js-framework-benchmark | angular-cf-v22.2.0-keyed | create many rows | completed | duration | ms | 977 | 195.1 | 700.2 | +30.6% |  |
| js-framework-benchmark | angular-cf-v22.2.0-keyed | append rows to large table | completed | duration | ms | 104.6 | 17.9 | 72.1 | +32.41% |  |
| js-framework-benchmark | angular-cf-v22.2.0-keyed | clear rows | completed | duration | ms | 56.1 | 52.5 | 3.3 | +104.74% |  |
| js-framework-benchmark | angular-cf-v22.2.0-keyed | ready memory | completed | memory | MB | 2 |  |  | +98.02% |  |
| js-framework-benchmark | angular-cf-v22.2.0-keyed | run memory | completed | memory | MB | 5.1 |  |  | +85.92% |  |
| js-framework-benchmark | angular-cf-v22.2.0-keyed | repeated clear memory | completed | memory | MB | 2.8 |  |  | +117.01% |  |
| js-framework-benchmark | angular-cf-v22.2.0-keyed | total byte weight | completed | size | kB | 45.5 |  |  | +911.11% |  |
| js-framework-benchmark | marko-v6.4.5-keyed | create rows | completed | duration | ms | 67.4 | 7.4 | 59.1 | +1.05% |  |
| js-framework-benchmark | marko-v6.4.5-keyed | replace all rows | completed | duration | ms | 75 | 14.9 | 58.8 | +5.04% |  |
| js-framework-benchmark | marko-v6.4.5-keyed | partial update | completed | duration | ms | 44.3 | 3.9 | 37.1 | +12.44% |  |
| js-framework-benchmark | marko-v6.4.5-keyed | select row | completed | duration | ms | 9.5 | 1.4 | 6.4 | +6.74% |  |
| js-framework-benchmark | marko-v6.4.5-keyed | swap rows | completed | duration | ms | 45.3 | 2.7 | 39.2 | +1.34% |  |
| js-framework-benchmark | marko-v6.4.5-keyed | remove row | completed | duration | ms | 34.9 | 1.4 | 31.6 | +10.09% |  |
| js-framework-benchmark | marko-v6.4.5-keyed | create many rows | completed | duration | ms | 748.1 | 76.2 | 664.9 | best |  |
| js-framework-benchmark | marko-v6.4.5-keyed | append rows to large table | completed | duration | ms | 83.8 | 9.6 | 72.4 | +6.08% |  |
| js-framework-benchmark | marko-v6.4.5-keyed | clear rows | completed | duration | ms | 27.4 | 23.7 | 3 | best |  |
| js-framework-benchmark | marko-v6.4.5-keyed | ready memory | completed | memory | MB | 1 |  |  | best |  |
| js-framework-benchmark | marko-v6.4.5-keyed | run memory | completed | memory | MB | 2.7 |  |  | best |  |
| js-framework-benchmark | marko-v6.4.5-keyed | repeated clear memory | completed | memory | MB | 1.4 |  |  | +7.33% |  |
| js-framework-benchmark | marko-v6.4.5-keyed | total byte weight | completed | size | kB | 4.6 |  |  | +2.22% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.232-local-keyed** | create rows | completed | duration | ms | 79.2 | 17.9 | 59.8 | +18.74% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.232-local-keyed** | replace all rows | completed | duration | ms | 88.9 | 27.8 | 59.2 | +24.51% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.232-local-keyed** | partial update | completed | duration | ms | 54 | 7.4 | 42.1 | +37.06% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.232-local-keyed** | select row | completed | duration | ms | 11.5 | 3.9 | 6.4 | +29.21% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.232-local-keyed** | swap rows | completed | duration | ms | 48.1 | 4.2 | 40 | +7.61% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.232-local-keyed** | remove row | completed | duration | ms | 35.4 | 1.8 | 31.9 | +11.67% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.232-local-keyed** | create many rows | completed | duration | ms | 863.4 | 153 | 702.4 | +15.41% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.232-local-keyed** | append rows to large table | completed | duration | ms | 90.1 | 18 | 70.3 | +14.05% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.232-local-keyed** | clear rows | completed | duration | ms | 41.5 | 37.5 | 2.7 | +51.46% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.232-local-keyed** | ready memory | completed | memory | MB | 1.4 |  |  | +38% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.232-local-keyed** | run memory | completed | memory | MB | 4.7 |  |  | +70.46% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.232-local-keyed** | repeated clear memory | completed | memory | MB | 1.8 |  |  | +44.39% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.232-local-keyed** | total byte weight | completed | size | kB | 43.8 |  |  | +873.33% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.232-local-keyed** | create rows | completed | duration | ms | 92.8 | 31.8 | 60.5 | +39.13% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.232-local-keyed** | replace all rows | completed | duration | ms | 102.3 | 42.4 | 59.9 | +43.28% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.232-local-keyed** | partial update | completed | duration | ms | 70.8 | 26.5 | 38 | +79.7% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.232-local-keyed** | select row | completed | duration | ms | 15.6 | 7.5 | 6.6 | +75.28% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.232-local-keyed** | swap rows | completed | duration | ms | 67.2 | 19.6 | 43.9 | +50.34% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.232-local-keyed** | remove row | completed | duration | ms | 40.4 | 5.4 | 32.2 | +27.44% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.232-local-keyed** | create many rows | completed | duration | ms | 984 | 286.3 | 689.1 | +31.53% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.232-local-keyed** | append rows to large table | completed | duration | ms | 109.1 | 38.7 | 68.8 | +38.1% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.232-local-keyed** | clear rows | completed | duration | ms | 38.6 | 34.9 | 2.8 | +40.88% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.232-local-keyed** | ready memory | completed | memory | MB | 1.3 |  |  | +30.82% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.232-local-keyed** | run memory | completed | memory | MB | 4.9 |  |  | +80.17% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.232-local-keyed** | repeated clear memory | completed | memory | MB | 2.6 |  |  | +104.31% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.232-local-keyed** | total byte weight | completed | size | kB | 36.3 |  |  | +706.67% |  |
| js-framework-benchmark | **mreact-v0.0.232-local-keyed** | create rows | completed | duration | ms | 66.7 | 6.6 | 58.8 | best |  |
| js-framework-benchmark | **mreact-v0.0.232-local-keyed** | replace all rows | completed | duration | ms | 71.4 | 11.3 | 59 | best |  |
| js-framework-benchmark | **mreact-v0.0.232-local-keyed** | partial update | completed | duration | ms | 45.1 | 3.7 | 37.5 | +14.47% |  |
| js-framework-benchmark | **mreact-v0.0.232-local-keyed** | select row | completed | duration | ms | 8.9 | 1.1 | 6.2 | best |  |
| js-framework-benchmark | **mreact-v0.0.232-local-keyed** | swap rows | completed | duration | ms | 47.1 | 2.1 | 41.6 | +5.37% |  |
| js-framework-benchmark | **mreact-v0.0.232-local-keyed** | remove row | completed | duration | ms | 34 | 1.2 | 31.2 | +7.26% |  |
| js-framework-benchmark | **mreact-v0.0.232-local-keyed** | create many rows | completed | duration | ms | 754.8 | 64.9 | 680.1 | +0.9% |  |
| js-framework-benchmark | **mreact-v0.0.232-local-keyed** | append rows to large table | completed | duration | ms | 80.8 | 7.2 | 71.8 | +2.28% |  |
| js-framework-benchmark | **mreact-v0.0.232-local-keyed** | clear rows | completed | duration | ms | 28.5 | 24.6 | 2.6 | +4.01% |  |
| js-framework-benchmark | **mreact-v0.0.232-local-keyed** | ready memory | completed | memory | MB | 1.1 |  |  | +9.26% |  |
| js-framework-benchmark | **mreact-v0.0.232-local-keyed** | run memory | completed | memory | MB | 2.7 |  |  | +0.13% |  |
| js-framework-benchmark | **mreact-v0.0.232-local-keyed** | repeated clear memory | completed | memory | MB | 1.4 |  |  | +6.65% |  |
| js-framework-benchmark | **mreact-v0.0.232-local-keyed** | total byte weight | completed | size | kB | 10.5 |  |  | +133.33% |  |
| js-framework-benchmark | react-hooks-v19.3.0-keyed | create rows | completed | duration | ms | 78.2 | 17.6 | 58.9 | +17.24% |  |
| js-framework-benchmark | react-hooks-v19.3.0-keyed | replace all rows | completed | duration | ms | 92.3 | 31.8 | 60 | +29.27% |  |
| js-framework-benchmark | react-hooks-v19.3.0-keyed | partial update | completed | duration | ms | 55.8 | 12.1 | 41 | +41.62% |  |
| js-framework-benchmark | react-hooks-v19.3.0-keyed | select row | completed | duration | ms | 14.2 | 6 | 6.7 | +59.55% |  |
| js-framework-benchmark | react-hooks-v19.3.0-keyed | swap rows | completed | duration | ms | 346.2 | 54.6 | 282.4 | +674.5% |  |
| js-framework-benchmark | react-hooks-v19.3.0-keyed | remove row | completed | duration | ms | 36.1 | 2.8 | 31.2 | +13.88% |  |
| js-framework-benchmark | react-hooks-v19.3.0-keyed | create many rows | completed | duration | ms | 1189.5 | 467 | 714.5 | +59% |  |
| js-framework-benchmark | react-hooks-v19.3.0-keyed | append rows to large table | completed | duration | ms | 89.5 | 19.3 | 68.9 | +13.29% |  |
| js-framework-benchmark | react-hooks-v19.3.0-keyed | clear rows | completed | duration | ms | 51.1 | 47.1 | 2.8 | +86.5% |  |
| js-framework-benchmark | react-hooks-v19.3.0-keyed | ready memory | completed | memory | MB | 1.7 |  |  | +61.36% |  |
| js-framework-benchmark | react-hooks-v19.3.0-keyed | run memory | completed | memory | MB | 5 |  |  | +83.06% |  |
| js-framework-benchmark | react-hooks-v19.3.0-keyed | repeated clear memory | completed | memory | MB | 2.5 |  |  | +97.34% |  |
| js-framework-benchmark | react-hooks-v19.3.0-keyed | total byte weight | completed | size | kB | 58.7 |  |  | +1204.44% |  |
| js-framework-benchmark | solid-v1.9.17-keyed | create rows | completed | duration | ms | 67.6 | 7.3 | 59 | +1.35% |  |
| js-framework-benchmark | solid-v1.9.17-keyed | replace all rows | completed | duration | ms | 75.5 | 14.8 | 59.1 | +5.74% |  |
| js-framework-benchmark | solid-v1.9.17-keyed | partial update | completed | duration | ms | 45.3 | 3.3 | 38.5 | +14.97% |  |
| js-framework-benchmark | solid-v1.9.17-keyed | select row | completed | duration | ms | 9.9 | 1.9 | 6.5 | +11.24% |  |
| js-framework-benchmark | solid-v1.9.17-keyed | swap rows | completed | duration | ms | 49.3 | 2 | 43 | +10.29% |  |
| js-framework-benchmark | solid-v1.9.17-keyed | remove row | completed | duration | ms | 32.8 | 0.9 | 30 | +3.47% |  |
| js-framework-benchmark | solid-v1.9.17-keyed | create many rows | completed | duration | ms | 751.9 | 68.1 | 675.4 | +0.51% |  |
| js-framework-benchmark | solid-v1.9.17-keyed | append rows to large table | completed | duration | ms | 79 | 8.6 | 68.9 | best |  |
| js-framework-benchmark | solid-v1.9.17-keyed | clear rows | completed | duration | ms | 31.9 | 28.4 | 2.9 | +16.42% |  |
| js-framework-benchmark | solid-v1.9.17-keyed | ready memory | completed | memory | MB | 1.1 |  |  | +5.33% |  |
| js-framework-benchmark | solid-v1.9.17-keyed | run memory | completed | memory | MB | 3.2 |  |  | +16.09% |  |
| js-framework-benchmark | solid-v1.9.17-keyed | repeated clear memory | completed | memory | MB | 1.3 |  |  | best |  |
| js-framework-benchmark | solid-v1.9.17-keyed | total byte weight | completed | size | kB | 4.5 |  |  | best |  |
| js-framework-benchmark | svelte-v5.57.2-keyed | create rows | completed | duration | ms | 70.7 | 9.6 | 60.1 | +6% |  |
| js-framework-benchmark | svelte-v5.57.2-keyed | replace all rows | completed | duration | ms | 77.6 | 17.1 | 59.2 | +8.68% |  |
| js-framework-benchmark | svelte-v5.57.2-keyed | partial update | completed | duration | ms | 49.1 | 4.6 | 40.3 | +24.62% |  |
| js-framework-benchmark | svelte-v5.57.2-keyed | select row | completed | duration | ms | 13.5 | 5.6 | 6.4 | +51.69% |  |
| js-framework-benchmark | svelte-v5.57.2-keyed | swap rows | completed | duration | ms | 49.7 | 3.6 | 42.2 | +11.19% |  |
| js-framework-benchmark | svelte-v5.57.2-keyed | remove row | completed | duration | ms | 35.7 | 1.5 | 32.2 | +12.62% |  |
| js-framework-benchmark | svelte-v5.57.2-keyed | create many rows | completed | duration | ms | 776.1 | 85.2 | 679.3 | +3.74% |  |
| js-framework-benchmark | svelte-v5.57.2-keyed | append rows to large table | completed | duration | ms | 79.8 | 9.2 | 69.6 | +1.01% |  |
| js-framework-benchmark | svelte-v5.57.2-keyed | clear rows | completed | duration | ms | 34.3 | 30.9 | 3.4 | +25.18% |  |
| js-framework-benchmark | svelte-v5.57.2-keyed | ready memory | completed | memory | MB | 1.2 |  |  | +13.77% |  |
| js-framework-benchmark | svelte-v5.57.2-keyed | run memory | completed | memory | MB | 3.5 |  |  | +27.98% |  |
| js-framework-benchmark | svelte-v5.57.2-keyed | repeated clear memory | completed | memory | MB | 1.5 |  |  | +16.78% |  |
| js-framework-benchmark | svelte-v5.57.2-keyed | total byte weight | completed | size | kB | 11.6 |  |  | +157.78% |  |
| js-framework-benchmark | vue-v3.5.43-keyed | create rows | completed | duration | ms | 79.5 | 17.8 | 60.3 | +19.19% |  |
| js-framework-benchmark | vue-v3.5.43-keyed | replace all rows | completed | duration | ms | 84.5 | 24.3 | 57.4 | +18.35% |  |
| js-framework-benchmark | vue-v3.5.43-keyed | partial update | completed | duration | ms | 48.6 | 5.8 | 39.2 | +23.35% |  |
| js-framework-benchmark | vue-v3.5.43-keyed | select row | completed | duration | ms | 9.4 | 2.4 | 6 | +5.62% |  |
| js-framework-benchmark | vue-v3.5.43-keyed | swap rows | completed | duration | ms | 48.1 | 2.9 | 41.6 | +7.61% |  |
| js-framework-benchmark | vue-v3.5.43-keyed | remove row | completed | duration | ms | 39 | 4.8 | 32.2 | +23.03% |  |
| js-framework-benchmark | vue-v3.5.43-keyed | create many rows | completed | duration | ms | 863.4 | 155 | 702.6 | +15.41% |  |
| js-framework-benchmark | vue-v3.5.43-keyed | append rows to large table | completed | duration | ms | 84.2 | 15.3 | 67.3 | +6.58% |  |
| js-framework-benchmark | vue-v3.5.43-keyed | clear rows | completed | duration | ms | 46.9 | 42.8 | 3.4 | +71.17% |  |
| js-framework-benchmark | vue-v3.5.43-keyed | ready memory | completed | memory | MB | 1.3 |  |  | +26.23% |  |
| js-framework-benchmark | vue-v3.5.43-keyed | run memory | completed | memory | MB | 4.4 |  |  | +62.03% |  |
| js-framework-benchmark | vue-v3.5.43-keyed | repeated clear memory | completed | memory | MB | 1.6 |  |  | +28.81% |  |
| js-framework-benchmark | vue-v3.5.43-keyed | total byte weight | completed | size | kB | 23.7 |  |  | +426.67% |  |
