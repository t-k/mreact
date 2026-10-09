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

Framework order offset: 8
Framework run order: keyed/mreact, keyed/marko, keyed/vue, keyed/svelte, keyed/angular-cf, keyed/react-hooks, keyed/mreact-react-compat, keyed/mreact-react-compat-vdom, keyed/solid
Fixed diff anchor: react-hooks

## Unsupported Primitive Adapters

- qwik: krausest/js-framework-benchmark keyed/qwik currently fails the official isKeyed check and is categorized as non-keyed.
- qwik-v2: krausest/js-framework-benchmark does not currently provide a matching Qwik v2 keyed fixture.
- solid-v2: krausest/js-framework-benchmark does not currently provide a matching Solid v2 keyed fixture.

Raw JSON files are stored in `benchmarks/results/2026-10-09/001/js-framework-benchmark-results`.
Chrome trace files are stored in `benchmarks/results/2026-10-09/001/js-framework-benchmark-traces`.

## Rankings

Lower values are better for all js-framework-benchmark metrics reported here.

### create rows

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | **mreact-v0.0.230-local-keyed** | create rows | 75.3 | 6.3 | 67.6 | best |  | ms |
| 2 | marko-v6.4.5-keyed | create rows | 76.2 | 7.8 | 67.1 | +1.2% |  | ms |
| 3 | solid-v1.9.17-keyed | create rows | 76.6 | 7.8 | 67.4 | +1.73% |  | ms |
| 4 | svelte-v5.57.2-keyed | create rows | 78.6 | 10.6 | 66.5 | +4.38% |  | ms |
| 5 | vue-v3.5.43-keyed | create rows | 85.7 | 18.4 | 66.1 | +13.81% |  | ms |
| 6 | **mreact-react-compat-v0.0.230-local-keyed** | create rows | 87.6 | 18.3 | 67.6 | +16.33% |  | ms |
| 7 | react-hooks-v19.3.0-keyed | create rows | 89.4 | 19.1 | 68.3 | +18.73% |  | ms |
| 8 | **mreact-react-compat-vdom-v0.0.230-local-keyed** | create rows | 104.7 | 34.6 | 68.7 | +39.04% |  | ms |
| 9 | angular-cf-v22.2.0-keyed | create rows | 105.1 | 19.1 | 68.9 | +39.58% |  | ms |

### replace all rows

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | **mreact-v0.0.230-local-keyed** | replace all rows | 81.7 | 12.4 | 67.8 | best |  | ms |
| 2 | marko-v6.4.5-keyed | replace all rows | 82.9 | 16.1 | 65.6 | +1.47% |  | ms |
| 3 | solid-v1.9.17-keyed | replace all rows | 87.3 | 17.5 | 69.1 | +6.85% |  | ms |
| 4 | svelte-v5.57.2-keyed | replace all rows | 88.8 | 19.5 | 67.1 | +8.69% |  | ms |
| 5 | vue-v3.5.43-keyed | replace all rows | 97.4 | 26.5 | 68.6 | +19.22% |  | ms |
| 6 | **mreact-react-compat-v0.0.230-local-keyed** | replace all rows | 99 | 29.2 | 67.1 | +21.18% |  | ms |
| 7 | react-hooks-v19.3.0-keyed | replace all rows | 106.2 | 35.6 | 69.9 | +29.99% |  | ms |
| 8 | **mreact-react-compat-vdom-v0.0.230-local-keyed** | replace all rows | 118.3 | 50.4 | 67.8 | +44.8% |  | ms |
| 9 | angular-cf-v22.2.0-keyed | replace all rows | 121 | 34.8 | 70.9 | +48.1% |  | ms |

### partial update

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | solid-v1.9.17-keyed | partial update | 43.1 | 3 | 37 | best |  | ms |
| 2 | **mreact-react-compat-v0.0.230-local-keyed** | partial update | 46.5 | 7.2 | 36.6 | +7.89% |  | ms |
| 3 | angular-cf-v22.2.0-keyed | partial update | 46.6 | 3.4 | 41.4 | +8.12% |  | ms |
| 4 | **mreact-v0.0.230-local-keyed** | partial update | 47.4 | 4.2 | 39.2 | +9.98% |  | ms |
| 5 | vue-v3.5.43-keyed | partial update | 47.8 | 5.2 | 39.3 | +10.9% |  | ms |
| 6 | marko-v6.4.5-keyed | partial update | 48.9 | 3.5 | 41.2 | +13.46% |  | ms |
| 7 | svelte-v5.57.2-keyed | partial update | 49.9 | 4.8 | 40.9 | +15.78% |  | ms |
| 8 | react-hooks-v19.3.0-keyed | partial update | 51 | 11.4 | 36.8 | +18.33% |  | ms |
| 9 | **mreact-react-compat-vdom-v0.0.230-local-keyed** | partial update | 68 | 25.1 | 36.9 | +57.77% |  | ms |

### select row

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | **mreact-v0.0.230-local-keyed** | select row | 8.6 | 1 | 6.5 | best |  | ms |
| 2 | marko-v6.4.5-keyed | select row | 9.2 | 1.3 | 6.9 | +6.98% |  | ms |
| 3 | solid-v1.9.17-keyed | select row | 10.7 | 1.8 | 6.9 | +24.42% |  | ms |
| 4 | **mreact-react-compat-v0.0.230-local-keyed** | select row | 11.7 | 4 | 6.6 | +36.05% |  | ms |
| 5 | vue-v3.5.43-keyed | select row | 12.4 | 3 | 8.1 | +44.19% |  | ms |
| 6 | angular-cf-v22.2.0-keyed | select row | 12.8 | 4.1 | 7.3 | +48.84% |  | ms |
| 7 | react-hooks-v19.3.0-keyed | select row | 15.9 | 6.6 | 7.5 | +84.88% |  | ms |
| 8 | svelte-v5.57.2-keyed | select row | 15.9 | 6.3 | 7.8 | +84.88% |  | ms |
| 9 | **mreact-react-compat-vdom-v0.0.230-local-keyed** | select row | 17 | 8.1 | 7.2 | +97.67% |  | ms |

### swap rows

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | **mreact-v0.0.230-local-keyed** | swap rows | 53.1 | 2.3 | 46.8 | best |  | ms |
| 2 | angular-cf-v22.2.0-keyed | swap rows | 54.8 | 3.4 | 48.9 | +3.2% |  | ms |
| 3 | **mreact-react-compat-v0.0.230-local-keyed** | swap rows | 57.5 | 4.1 | 49.2 | +8.29% |  | ms |
| 4 | marko-v6.4.5-keyed | swap rows | 57.7 | 2.9 | 50.3 | +8.66% |  | ms |
| 5 | vue-v3.5.43-keyed | swap rows | 62.2 | 3.3 | 53.1 | +17.14% |  | ms |
| 6 | solid-v1.9.17-keyed | swap rows | 63.4 | 2.8 | 55.9 | +19.4% |  | ms |
| 7 | svelte-v5.57.2-keyed | swap rows | 64.3 | 4.1 | 55.6 | +21.09% |  | ms |
| 8 | **mreact-react-compat-vdom-v0.0.230-local-keyed** | swap rows | 72.1 | 20 | 48.7 | +35.78% |  | ms |
| 9 | react-hooks-v19.3.0-keyed | swap rows | 365.8 | 57 | 301.8 | +588.89% |  | ms |

### remove row

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | angular-cf-v22.2.0-keyed | remove row | 40.8 | 1.8 | 38.1 | best |  | ms |
| 2 | solid-v1.9.17-keyed | remove row | 41.9 | 0.9 | 38.4 | +2.7% |  | ms |
| 3 | **mreact-v0.0.230-local-keyed** | remove row | 42.2 | 1.2 | 38.4 | +3.43% |  | ms |
| 4 | marko-v6.4.5-keyed | remove row | 42.9 | 1.6 | 39.1 | +5.15% |  | ms |
| 5 | **mreact-react-compat-v0.0.230-local-keyed** | remove row | 43.1 | 2 | 38.6 | +5.64% |  | ms |
| 6 | svelte-v5.57.2-keyed | remove row | 43.8 | 1.7 | 39.7 | +7.35% |  | ms |
| 7 | react-hooks-v19.3.0-keyed | remove row | 45.4 | 3.2 | 39.2 | +11.27% |  | ms |
| 8 | vue-v3.5.43-keyed | remove row | 46.4 | 5.5 | 38.3 | +13.73% |  | ms |
| 9 | **mreact-react-compat-vdom-v0.0.230-local-keyed** | remove row | 47.5 | 6 | 38.4 | +16.42% |  | ms |

### create many rows

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | solid-v1.9.17-keyed | create many rows | 769.2 | 68 | 691.3 | best |  | ms |
| 2 | marko-v6.4.5-keyed | create many rows | 775 | 79.3 | 686.3 | +0.75% |  | ms |
| 3 | svelte-v5.57.2-keyed | create many rows | 778.4 | 83.7 | 684.2 | +1.2% |  | ms |
| 4 | **mreact-v0.0.230-local-keyed** | create many rows | 780.5 | 66.3 | 705 | +1.47% |  | ms |
| 5 | vue-v3.5.43-keyed | create many rows | 881 | 151.9 | 721.1 | +14.53% |  | ms |
| 6 | **mreact-react-compat-v0.0.230-local-keyed** | create many rows | 885.9 | 155.1 | 718.6 | +15.17% |  | ms |
| 7 | **mreact-react-compat-vdom-v0.0.230-local-keyed** | create many rows | 1007.9 | 290.1 | 706.1 | +31.03% |  | ms |
| 8 | angular-cf-v22.2.0-keyed | create many rows | 1028.8 | 201.7 | 745.9 | +33.75% |  | ms |
| 9 | react-hooks-v19.3.0-keyed | create many rows | 1197.7 | 466.7 | 721.5 | +55.71% |  | ms |

### append rows to large table

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | marko-v6.4.5-keyed | append rows to large table | 83.2 | 9.8 | 71.8 | best |  | ms |
| 2 | **mreact-v0.0.230-local-keyed** | append rows to large table | 85.9 | 9 | 75.5 | +3.25% |  | ms |
| 3 | solid-v1.9.17-keyed | append rows to large table | 89.9 | 9.4 | 78.3 | +8.05% |  | ms |
| 4 | svelte-v5.57.2-keyed | append rows to large table | 95.3 | 11 | 82 | +14.54% |  | ms |
| 5 | **mreact-react-compat-v0.0.230-local-keyed** | append rows to large table | 95.4 | 18.4 | 74.8 | +14.66% |  | ms |
| 6 | vue-v3.5.43-keyed | append rows to large table | 97.1 | 16.7 | 78.1 | +16.71% |  | ms |
| 7 | react-hooks-v19.3.0-keyed | append rows to large table | 104.8 | 21.5 | 81.8 | +25.96% |  | ms |
| 8 | angular-cf-v22.2.0-keyed | append rows to large table | 105.6 | 17.9 | 72.3 | +26.92% |  | ms |
| 9 | **mreact-react-compat-vdom-v0.0.230-local-keyed** | append rows to large table | 123.4 | 43.4 | 77.8 | +48.32% |  | ms |

### clear rows

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | marko-v6.4.5-keyed | clear rows | 29.6 | 25.4 | 2.7 | best |  | ms |
| 2 | **mreact-v0.0.230-local-keyed** | clear rows | 30.5 | 26.5 | 3.4 | +3.04% |  | ms |
| 3 | svelte-v5.57.2-keyed | clear rows | 33.9 | 29.7 | 3.3 | +14.53% |  | ms |
| 4 | solid-v1.9.17-keyed | clear rows | 35.6 | 31 | 3.3 | +20.27% |  | ms |
| 5 | **mreact-react-compat-v0.0.230-local-keyed** | clear rows | 42.8 | 37.5 | 3.2 | +44.59% |  | ms |
| 6 | **mreact-react-compat-vdom-v0.0.230-local-keyed** | clear rows | 43.6 | 38.9 | 3 | +47.3% |  | ms |
| 7 | vue-v3.5.43-keyed | clear rows | 47.6 | 42.4 | 3.2 | +60.81% |  | ms |
| 8 | angular-cf-v22.2.0-keyed | clear rows | 59.5 | 55.3 | 3.3 | +101.01% |  | ms |
| 9 | react-hooks-v19.3.0-keyed | clear rows | 59.7 | 54.1 | 3.8 | +101.69% |  | ms |

### ready memory

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | solid-v1.9.17-keyed | ready memory | 1 |  |  | best |  | MB |
| 2 | svelte-v5.57.2-keyed | ready memory | 1.1 |  |  | +9.33% |  | MB |
| 3 | marko-v6.4.5-keyed | ready memory | 1.1 |  |  | +11.1% |  | MB |
| 4 | **mreact-v0.0.230-local-keyed** | ready memory | 1.1 |  |  | +13.47% |  | MB |
| 5 | vue-v3.5.43-keyed | ready memory | 1.2 |  |  | +25.75% |  | MB |
| 6 | **mreact-react-compat-vdom-v0.0.230-local-keyed** | ready memory | 1.4 |  |  | +42.4% |  | MB |
| 7 | **mreact-react-compat-v0.0.230-local-keyed** | ready memory | 1.5 |  |  | +51.81% |  | MB |
| 8 | react-hooks-v19.3.0-keyed | ready memory | 1.7 |  |  | +70.87% |  | MB |
| 9 | angular-cf-v22.2.0-keyed | ready memory | 2.1 |  |  | +108.94% |  | MB |

### run memory

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | marko-v6.4.5-keyed | run memory | 2.7 |  |  | best |  | MB |
| 2 | **mreact-v0.0.230-local-keyed** | run memory | 2.7 |  |  | +0.19% |  | MB |
| 3 | solid-v1.9.17-keyed | run memory | 3.1 |  |  | +15.49% |  | MB |
| 4 | svelte-v5.57.2-keyed | run memory | 3.5 |  |  | +27.86% |  | MB |
| 5 | vue-v3.5.43-keyed | run memory | 4.4 |  |  | +62.43% |  | MB |
| 6 | **mreact-react-compat-v0.0.230-local-keyed** | run memory | 4.6 |  |  | +69.65% |  | MB |
| 7 | react-hooks-v19.3.0-keyed | run memory | 5 |  |  | +82.93% |  | MB |
| 8 | **mreact-react-compat-vdom-v0.0.230-local-keyed** | run memory | 5 |  |  | +83.52% |  | MB |
| 9 | angular-cf-v22.2.0-keyed | run memory | 5.1 |  |  | +87.12% |  | MB |

### repeated clear memory

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | solid-v1.9.17-keyed | repeated clear memory | 1.3 |  |  | best |  | MB |
| 2 | **mreact-v0.0.230-local-keyed** | repeated clear memory | 1.4 |  |  | +6.42% |  | MB |
| 3 | marko-v6.4.5-keyed | repeated clear memory | 1.4 |  |  | +7.65% |  | MB |
| 4 | svelte-v5.57.2-keyed | repeated clear memory | 1.4 |  |  | +12.47% |  | MB |
| 5 | vue-v3.5.43-keyed | repeated clear memory | 1.7 |  |  | +31.13% |  | MB |
| 6 | **mreact-react-compat-v0.0.230-local-keyed** | repeated clear memory | 1.9 |  |  | +45.55% |  | MB |
| 7 | react-hooks-v19.3.0-keyed | repeated clear memory | 2.6 |  |  | +99.08% |  | MB |
| 8 | **mreact-react-compat-vdom-v0.0.230-local-keyed** | repeated clear memory | 2.6 |  |  | +105.02% |  | MB |
| 9 | angular-cf-v22.2.0-keyed | repeated clear memory | 2.7 |  |  | +114.13% |  | MB |

### total byte weight

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | solid-v1.9.17-keyed | total byte weight | 4.5 |  |  | best |  | kB |
| 2 | marko-v6.4.5-keyed | total byte weight | 4.6 |  |  | +2.22% |  | kB |
| 3 | **mreact-v0.0.230-local-keyed** | total byte weight | 10.5 |  |  | +133.33% |  | kB |
| 4 | svelte-v5.57.2-keyed | total byte weight | 11.6 |  |  | +157.78% |  | kB |
| 5 | vue-v3.5.43-keyed | total byte weight | 23.7 |  |  | +426.67% |  | kB |
| 6 | **mreact-react-compat-vdom-v0.0.230-local-keyed** | total byte weight | 36.2 |  |  | +704.44% |  | kB |
| 7 | **mreact-react-compat-v0.0.230-local-keyed** | total byte weight | 43.7 |  |  | +871.11% |  | kB |
| 8 | angular-cf-v22.2.0-keyed | total byte weight | 45.5 |  |  | +911.11% |  | kB |
| 9 | react-hooks-v19.3.0-keyed | total byte weight | 58.7 |  |  | +1204.44% |  | kB |

## Results

| suite | framework | case | status | metric | unit | value | script | paint | diff vs 1st | diff vs react-hooks |
| --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| js-framework-benchmark | angular-cf-v22.2.0-keyed | create rows | completed | duration | ms | 105.1 | 19.1 | 68.9 | +39.58% |  |
| js-framework-benchmark | angular-cf-v22.2.0-keyed | replace all rows | completed | duration | ms | 121 | 34.8 | 70.9 | +48.1% |  |
| js-framework-benchmark | angular-cf-v22.2.0-keyed | partial update | completed | duration | ms | 46.6 | 3.4 | 41.4 | +8.12% |  |
| js-framework-benchmark | angular-cf-v22.2.0-keyed | select row | completed | duration | ms | 12.8 | 4.1 | 7.3 | +48.84% |  |
| js-framework-benchmark | angular-cf-v22.2.0-keyed | swap rows | completed | duration | ms | 54.8 | 3.4 | 48.9 | +3.2% |  |
| js-framework-benchmark | angular-cf-v22.2.0-keyed | remove row | completed | duration | ms | 40.8 | 1.8 | 38.1 | best |  |
| js-framework-benchmark | angular-cf-v22.2.0-keyed | create many rows | completed | duration | ms | 1028.8 | 201.7 | 745.9 | +33.75% |  |
| js-framework-benchmark | angular-cf-v22.2.0-keyed | append rows to large table | completed | duration | ms | 105.6 | 17.9 | 72.3 | +26.92% |  |
| js-framework-benchmark | angular-cf-v22.2.0-keyed | clear rows | completed | duration | ms | 59.5 | 55.3 | 3.3 | +101.01% |  |
| js-framework-benchmark | angular-cf-v22.2.0-keyed | ready memory | completed | memory | MB | 2.1 |  |  | +108.94% |  |
| js-framework-benchmark | angular-cf-v22.2.0-keyed | run memory | completed | memory | MB | 5.1 |  |  | +87.12% |  |
| js-framework-benchmark | angular-cf-v22.2.0-keyed | repeated clear memory | completed | memory | MB | 2.7 |  |  | +114.13% |  |
| js-framework-benchmark | angular-cf-v22.2.0-keyed | total byte weight | completed | size | kB | 45.5 |  |  | +911.11% |  |
| js-framework-benchmark | marko-v6.4.5-keyed | create rows | completed | duration | ms | 76.2 | 7.8 | 67.1 | +1.2% |  |
| js-framework-benchmark | marko-v6.4.5-keyed | replace all rows | completed | duration | ms | 82.9 | 16.1 | 65.6 | +1.47% |  |
| js-framework-benchmark | marko-v6.4.5-keyed | partial update | completed | duration | ms | 48.9 | 3.5 | 41.2 | +13.46% |  |
| js-framework-benchmark | marko-v6.4.5-keyed | select row | completed | duration | ms | 9.2 | 1.3 | 6.9 | +6.98% |  |
| js-framework-benchmark | marko-v6.4.5-keyed | swap rows | completed | duration | ms | 57.7 | 2.9 | 50.3 | +8.66% |  |
| js-framework-benchmark | marko-v6.4.5-keyed | remove row | completed | duration | ms | 42.9 | 1.6 | 39.1 | +5.15% |  |
| js-framework-benchmark | marko-v6.4.5-keyed | create many rows | completed | duration | ms | 775 | 79.3 | 686.3 | +0.75% |  |
| js-framework-benchmark | marko-v6.4.5-keyed | append rows to large table | completed | duration | ms | 83.2 | 9.8 | 71.8 | best |  |
| js-framework-benchmark | marko-v6.4.5-keyed | clear rows | completed | duration | ms | 29.6 | 25.4 | 2.7 | best |  |
| js-framework-benchmark | marko-v6.4.5-keyed | ready memory | completed | memory | MB | 1.1 |  |  | +11.1% |  |
| js-framework-benchmark | marko-v6.4.5-keyed | run memory | completed | memory | MB | 2.7 |  |  | best |  |
| js-framework-benchmark | marko-v6.4.5-keyed | repeated clear memory | completed | memory | MB | 1.4 |  |  | +7.65% |  |
| js-framework-benchmark | marko-v6.4.5-keyed | total byte weight | completed | size | kB | 4.6 |  |  | +2.22% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.230-local-keyed** | create rows | completed | duration | ms | 87.6 | 18.3 | 67.6 | +16.33% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.230-local-keyed** | replace all rows | completed | duration | ms | 99 | 29.2 | 67.1 | +21.18% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.230-local-keyed** | partial update | completed | duration | ms | 46.5 | 7.2 | 36.6 | +7.89% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.230-local-keyed** | select row | completed | duration | ms | 11.7 | 4 | 6.6 | +36.05% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.230-local-keyed** | swap rows | completed | duration | ms | 57.5 | 4.1 | 49.2 | +8.29% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.230-local-keyed** | remove row | completed | duration | ms | 43.1 | 2 | 38.6 | +5.64% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.230-local-keyed** | create many rows | completed | duration | ms | 885.9 | 155.1 | 718.6 | +15.17% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.230-local-keyed** | append rows to large table | completed | duration | ms | 95.4 | 18.4 | 74.8 | +14.66% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.230-local-keyed** | clear rows | completed | duration | ms | 42.8 | 37.5 | 3.2 | +44.59% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.230-local-keyed** | ready memory | completed | memory | MB | 1.5 |  |  | +51.81% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.230-local-keyed** | run memory | completed | memory | MB | 4.6 |  |  | +69.65% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.230-local-keyed** | repeated clear memory | completed | memory | MB | 1.9 |  |  | +45.55% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.230-local-keyed** | total byte weight | completed | size | kB | 43.7 |  |  | +871.11% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.230-local-keyed** | create rows | completed | duration | ms | 104.7 | 34.6 | 68.7 | +39.04% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.230-local-keyed** | replace all rows | completed | duration | ms | 118.3 | 50.4 | 67.8 | +44.8% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.230-local-keyed** | partial update | completed | duration | ms | 68 | 25.1 | 36.9 | +57.77% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.230-local-keyed** | select row | completed | duration | ms | 17 | 8.1 | 7.2 | +97.67% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.230-local-keyed** | swap rows | completed | duration | ms | 72.1 | 20 | 48.7 | +35.78% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.230-local-keyed** | remove row | completed | duration | ms | 47.5 | 6 | 38.4 | +16.42% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.230-local-keyed** | create many rows | completed | duration | ms | 1007.9 | 290.1 | 706.1 | +31.03% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.230-local-keyed** | append rows to large table | completed | duration | ms | 123.4 | 43.4 | 77.8 | +48.32% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.230-local-keyed** | clear rows | completed | duration | ms | 43.6 | 38.9 | 3 | +47.3% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.230-local-keyed** | ready memory | completed | memory | MB | 1.4 |  |  | +42.4% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.230-local-keyed** | run memory | completed | memory | MB | 5 |  |  | +83.52% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.230-local-keyed** | repeated clear memory | completed | memory | MB | 2.6 |  |  | +105.02% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.230-local-keyed** | total byte weight | completed | size | kB | 36.2 |  |  | +704.44% |  |
| js-framework-benchmark | **mreact-v0.0.230-local-keyed** | create rows | completed | duration | ms | 75.3 | 6.3 | 67.6 | best |  |
| js-framework-benchmark | **mreact-v0.0.230-local-keyed** | replace all rows | completed | duration | ms | 81.7 | 12.4 | 67.8 | best |  |
| js-framework-benchmark | **mreact-v0.0.230-local-keyed** | partial update | completed | duration | ms | 47.4 | 4.2 | 39.2 | +9.98% |  |
| js-framework-benchmark | **mreact-v0.0.230-local-keyed** | select row | completed | duration | ms | 8.6 | 1 | 6.5 | best |  |
| js-framework-benchmark | **mreact-v0.0.230-local-keyed** | swap rows | completed | duration | ms | 53.1 | 2.3 | 46.8 | best |  |
| js-framework-benchmark | **mreact-v0.0.230-local-keyed** | remove row | completed | duration | ms | 42.2 | 1.2 | 38.4 | +3.43% |  |
| js-framework-benchmark | **mreact-v0.0.230-local-keyed** | create many rows | completed | duration | ms | 780.5 | 66.3 | 705 | +1.47% |  |
| js-framework-benchmark | **mreact-v0.0.230-local-keyed** | append rows to large table | completed | duration | ms | 85.9 | 9 | 75.5 | +3.25% |  |
| js-framework-benchmark | **mreact-v0.0.230-local-keyed** | clear rows | completed | duration | ms | 30.5 | 26.5 | 3.4 | +3.04% |  |
| js-framework-benchmark | **mreact-v0.0.230-local-keyed** | ready memory | completed | memory | MB | 1.1 |  |  | +13.47% |  |
| js-framework-benchmark | **mreact-v0.0.230-local-keyed** | run memory | completed | memory | MB | 2.7 |  |  | +0.19% |  |
| js-framework-benchmark | **mreact-v0.0.230-local-keyed** | repeated clear memory | completed | memory | MB | 1.4 |  |  | +6.42% |  |
| js-framework-benchmark | **mreact-v0.0.230-local-keyed** | total byte weight | completed | size | kB | 10.5 |  |  | +133.33% |  |
| js-framework-benchmark | react-hooks-v19.3.0-keyed | create rows | completed | duration | ms | 89.4 | 19.1 | 68.3 | +18.73% |  |
| js-framework-benchmark | react-hooks-v19.3.0-keyed | replace all rows | completed | duration | ms | 106.2 | 35.6 | 69.9 | +29.99% |  |
| js-framework-benchmark | react-hooks-v19.3.0-keyed | partial update | completed | duration | ms | 51 | 11.4 | 36.8 | +18.33% |  |
| js-framework-benchmark | react-hooks-v19.3.0-keyed | select row | completed | duration | ms | 15.9 | 6.6 | 7.5 | +84.88% |  |
| js-framework-benchmark | react-hooks-v19.3.0-keyed | swap rows | completed | duration | ms | 365.8 | 57 | 301.8 | +588.89% |  |
| js-framework-benchmark | react-hooks-v19.3.0-keyed | remove row | completed | duration | ms | 45.4 | 3.2 | 39.2 | +11.27% |  |
| js-framework-benchmark | react-hooks-v19.3.0-keyed | create many rows | completed | duration | ms | 1197.7 | 466.7 | 721.5 | +55.71% |  |
| js-framework-benchmark | react-hooks-v19.3.0-keyed | append rows to large table | completed | duration | ms | 104.8 | 21.5 | 81.8 | +25.96% |  |
| js-framework-benchmark | react-hooks-v19.3.0-keyed | clear rows | completed | duration | ms | 59.7 | 54.1 | 3.8 | +101.69% |  |
| js-framework-benchmark | react-hooks-v19.3.0-keyed | ready memory | completed | memory | MB | 1.7 |  |  | +70.87% |  |
| js-framework-benchmark | react-hooks-v19.3.0-keyed | run memory | completed | memory | MB | 5 |  |  | +82.93% |  |
| js-framework-benchmark | react-hooks-v19.3.0-keyed | repeated clear memory | completed | memory | MB | 2.6 |  |  | +99.08% |  |
| js-framework-benchmark | react-hooks-v19.3.0-keyed | total byte weight | completed | size | kB | 58.7 |  |  | +1204.44% |  |
| js-framework-benchmark | solid-v1.9.17-keyed | create rows | completed | duration | ms | 76.6 | 7.8 | 67.4 | +1.73% |  |
| js-framework-benchmark | solid-v1.9.17-keyed | replace all rows | completed | duration | ms | 87.3 | 17.5 | 69.1 | +6.85% |  |
| js-framework-benchmark | solid-v1.9.17-keyed | partial update | completed | duration | ms | 43.1 | 3 | 37 | best |  |
| js-framework-benchmark | solid-v1.9.17-keyed | select row | completed | duration | ms | 10.7 | 1.8 | 6.9 | +24.42% |  |
| js-framework-benchmark | solid-v1.9.17-keyed | swap rows | completed | duration | ms | 63.4 | 2.8 | 55.9 | +19.4% |  |
| js-framework-benchmark | solid-v1.9.17-keyed | remove row | completed | duration | ms | 41.9 | 0.9 | 38.4 | +2.7% |  |
| js-framework-benchmark | solid-v1.9.17-keyed | create many rows | completed | duration | ms | 769.2 | 68 | 691.3 | best |  |
| js-framework-benchmark | solid-v1.9.17-keyed | append rows to large table | completed | duration | ms | 89.9 | 9.4 | 78.3 | +8.05% |  |
| js-framework-benchmark | solid-v1.9.17-keyed | clear rows | completed | duration | ms | 35.6 | 31 | 3.3 | +20.27% |  |
| js-framework-benchmark | solid-v1.9.17-keyed | ready memory | completed | memory | MB | 1 |  |  | best |  |
| js-framework-benchmark | solid-v1.9.17-keyed | run memory | completed | memory | MB | 3.1 |  |  | +15.49% |  |
| js-framework-benchmark | solid-v1.9.17-keyed | repeated clear memory | completed | memory | MB | 1.3 |  |  | best |  |
| js-framework-benchmark | solid-v1.9.17-keyed | total byte weight | completed | size | kB | 4.5 |  |  | best |  |
| js-framework-benchmark | svelte-v5.57.2-keyed | create rows | completed | duration | ms | 78.6 | 10.6 | 66.5 | +4.38% |  |
| js-framework-benchmark | svelte-v5.57.2-keyed | replace all rows | completed | duration | ms | 88.8 | 19.5 | 67.1 | +8.69% |  |
| js-framework-benchmark | svelte-v5.57.2-keyed | partial update | completed | duration | ms | 49.9 | 4.8 | 40.9 | +15.78% |  |
| js-framework-benchmark | svelte-v5.57.2-keyed | select row | completed | duration | ms | 15.9 | 6.3 | 7.8 | +84.88% |  |
| js-framework-benchmark | svelte-v5.57.2-keyed | swap rows | completed | duration | ms | 64.3 | 4.1 | 55.6 | +21.09% |  |
| js-framework-benchmark | svelte-v5.57.2-keyed | remove row | completed | duration | ms | 43.8 | 1.7 | 39.7 | +7.35% |  |
| js-framework-benchmark | svelte-v5.57.2-keyed | create many rows | completed | duration | ms | 778.4 | 83.7 | 684.2 | +1.2% |  |
| js-framework-benchmark | svelte-v5.57.2-keyed | append rows to large table | completed | duration | ms | 95.3 | 11 | 82 | +14.54% |  |
| js-framework-benchmark | svelte-v5.57.2-keyed | clear rows | completed | duration | ms | 33.9 | 29.7 | 3.3 | +14.53% |  |
| js-framework-benchmark | svelte-v5.57.2-keyed | ready memory | completed | memory | MB | 1.1 |  |  | +9.33% |  |
| js-framework-benchmark | svelte-v5.57.2-keyed | run memory | completed | memory | MB | 3.5 |  |  | +27.86% |  |
| js-framework-benchmark | svelte-v5.57.2-keyed | repeated clear memory | completed | memory | MB | 1.4 |  |  | +12.47% |  |
| js-framework-benchmark | svelte-v5.57.2-keyed | total byte weight | completed | size | kB | 11.6 |  |  | +157.78% |  |
| js-framework-benchmark | vue-v3.5.43-keyed | create rows | completed | duration | ms | 85.7 | 18.4 | 66.1 | +13.81% |  |
| js-framework-benchmark | vue-v3.5.43-keyed | replace all rows | completed | duration | ms | 97.4 | 26.5 | 68.6 | +19.22% |  |
| js-framework-benchmark | vue-v3.5.43-keyed | partial update | completed | duration | ms | 47.8 | 5.2 | 39.3 | +10.9% |  |
| js-framework-benchmark | vue-v3.5.43-keyed | select row | completed | duration | ms | 12.4 | 3 | 8.1 | +44.19% |  |
| js-framework-benchmark | vue-v3.5.43-keyed | swap rows | completed | duration | ms | 62.2 | 3.3 | 53.1 | +17.14% |  |
| js-framework-benchmark | vue-v3.5.43-keyed | remove row | completed | duration | ms | 46.4 | 5.5 | 38.3 | +13.73% |  |
| js-framework-benchmark | vue-v3.5.43-keyed | create many rows | completed | duration | ms | 881 | 151.9 | 721.1 | +14.53% |  |
| js-framework-benchmark | vue-v3.5.43-keyed | append rows to large table | completed | duration | ms | 97.1 | 16.7 | 78.1 | +16.71% |  |
| js-framework-benchmark | vue-v3.5.43-keyed | clear rows | completed | duration | ms | 47.6 | 42.4 | 3.2 | +60.81% |  |
| js-framework-benchmark | vue-v3.5.43-keyed | ready memory | completed | memory | MB | 1.2 |  |  | +25.75% |  |
| js-framework-benchmark | vue-v3.5.43-keyed | run memory | completed | memory | MB | 4.4 |  |  | +62.43% |  |
| js-framework-benchmark | vue-v3.5.43-keyed | repeated clear memory | completed | memory | MB | 1.7 |  |  | +31.13% |  |
| js-framework-benchmark | vue-v3.5.43-keyed | total byte weight | completed | size | kB | 23.7 |  |  | +426.67% |  |
