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

Raw JSON files are stored in `benchmarks/results/2026-09-09/001/js-framework-benchmark-results`.
Chrome trace files are stored in `benchmarks/results/2026-09-09/001/js-framework-benchmark-traces`.

## Rankings

Lower values are better for all js-framework-benchmark metrics reported here.

### create rows

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | marko-v6.3.49-keyed | create rows | 71.9 | 7.6 | 63.3 | best |  | ms |
| 2 | solid-v1.9.15-keyed | create rows | 72.9 | 7.7 | 63.9 | +1.39% |  | ms |
| 3 | **mreact-v0.0.214-local-keyed** | create rows | 74 | 7 | 65.7 | +2.92% |  | ms |
| 4 | svelte-v5.57.0-keyed | create rows | 75.7 | 10.6 | 64.2 | +5.29% |  | ms |
| 5 | vue-v3.5.42-keyed | create rows | 85.3 | 18.2 | 65.9 | +18.64% |  | ms |
| 6 | react-hooks-v19.2.8-keyed | create rows | 85.6 | 19.8 | 65.7 | +19.05% |  | ms |
| 7 | **mreact-react-compat-v0.0.214-local-keyed** | create rows | 88.8 | 18.6 | 68.2 | +23.5% |  | ms |
| 8 | **mreact-react-compat-vdom-v0.0.214-local-keyed** | create rows | 99.6 | 32 | 66.6 | +38.53% |  | ms |
| 9 | angular-cf-v22.0.0-keyed | create rows | 100.2 | 17.2 | 65.7 | +39.36% |  | ms |

### replace all rows

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | **mreact-v0.0.214-local-keyed** | replace all rows | 79.4 | 12.8 | 65.9 | best |  | ms |
| 2 | marko-v6.3.49-keyed | replace all rows | 81.6 | 15.8 | 64.4 | +2.77% |  | ms |
| 3 | solid-v1.9.15-keyed | replace all rows | 84.9 | 16.6 | 68 | +6.93% |  | ms |
| 4 | svelte-v5.57.0-keyed | replace all rows | 92.2 | 20.9 | 69.9 | +16.12% |  | ms |
| 5 | **mreact-react-compat-v0.0.214-local-keyed** | replace all rows | 96.1 | 28.3 | 65.4 | +21.03% |  | ms |
| 6 | react-hooks-v19.2.8-keyed | replace all rows | 102.3 | 35.4 | 65.1 | +28.84% |  | ms |
| 7 | vue-v3.5.42-keyed | replace all rows | 108.9 | 30.3 | 76.7 | +37.15% |  | ms |
| 8 | **mreact-react-compat-vdom-v0.0.214-local-keyed** | replace all rows | 110.5 | 44.8 | 64.5 | +39.17% |  | ms |
| 9 | angular-cf-v22.0.0-keyed | replace all rows | 115.6 | 32.6 | 67.4 | +45.59% |  | ms |

### partial update

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | vue-v3.5.42-keyed | partial update | 47.3 | 6.2 | 38.1 | best |  | ms |
| 2 | solid-v1.9.15-keyed | partial update | 49.7 | 3.1 | 42.8 | +5.07% |  | ms |
| 3 | svelte-v5.57.0-keyed | partial update | 52.8 | 5.1 | 42.9 | +11.63% |  | ms |
| 4 | react-hooks-v19.2.8-keyed | partial update | 58.7 | 11 | 43.8 | +24.1% |  | ms |
| 5 | angular-cf-v22.0.0-keyed | partial update | 58.8 | 3.6 | 52.9 | +24.31% |  | ms |
| 6 | **mreact-v0.0.214-local-keyed** | partial update | 59.8 | 4.7 | 49.5 | +26.43% |  | ms |
| 7 | marko-v6.3.49-keyed | partial update | 61.5 | 3.8 | 51.7 | +30.02% |  | ms |
| 8 | **mreact-react-compat-v0.0.214-local-keyed** | partial update | 62.6 | 8.7 | 48.4 | +32.35% |  | ms |
| 9 | **mreact-react-compat-vdom-v0.0.214-local-keyed** | partial update | 75.6 | 26.8 | 44.4 | +59.83% |  | ms |

### select row

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | marko-v6.3.49-keyed | select row | 9.4 | 1.6 | 6.6 | best |  | ms |
| 2 | **mreact-v0.0.214-local-keyed** | select row | 9.4 | 1.2 | 6.8 | 0% |  | ms |
| 3 | solid-v1.9.15-keyed | select row | 10.4 | 2 | 7.1 | +10.64% |  | ms |
| 4 | **mreact-react-compat-v0.0.214-local-keyed** | select row | 12.2 | 4.1 | 6.7 | +29.79% |  | ms |
| 5 | vue-v3.5.42-keyed | select row | 12.7 | 2.7 | 8.2 | +35.11% |  | ms |
| 6 | angular-cf-v22.0.0-keyed | select row | 12.9 | 3.9 | 7.9 | +37.23% |  | ms |
| 7 | react-hooks-v19.2.8-keyed | select row | 14.9 | 6.9 | 6.9 | +58.51% |  | ms |
| 8 | **mreact-react-compat-vdom-v0.0.214-local-keyed** | select row | 15.6 | 7.8 | 6.5 | +65.96% |  | ms |
| 9 | svelte-v5.57.0-keyed | select row | 16.4 | 6.9 | 8 | +74.47% |  | ms |

### swap rows

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | marko-v6.3.49-keyed | swap rows | 51.7 | 2.7 | 46 | best |  | ms |
| 2 | solid-v1.9.15-keyed | swap rows | 52 | 2.2 | 45.9 | +0.58% |  | ms |
| 3 | **mreact-v0.0.214-local-keyed** | swap rows | 52.6 | 2.4 | 46.2 | +1.74% |  | ms |
| 4 | angular-cf-v22.0.0-keyed | swap rows | 54.1 | 2.6 | 49.7 | +4.64% |  | ms |
| 5 | vue-v3.5.42-keyed | swap rows | 55.3 | 3.3 | 48 | +6.96% |  | ms |
| 6 | svelte-v5.57.0-keyed | swap rows | 55.4 | 4.2 | 47.3 | +7.16% |  | ms |
| 7 | **mreact-react-compat-v0.0.214-local-keyed** | swap rows | 57.8 | 4.8 | 48.5 | +11.8% |  | ms |
| 8 | **mreact-react-compat-vdom-v0.0.214-local-keyed** | swap rows | 73.8 | 20.4 | 48.4 | +42.75% |  | ms |
| 9 | react-hooks-v19.2.8-keyed | swap rows | 342.1 | 53.1 | 283.3 | +561.7% |  | ms |

### remove row

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | angular-cf-v22.0.0-keyed | remove row | 36.6 | 1.7 | 34.1 | best |  | ms |
| 2 | svelte-v5.57.0-keyed | remove row | 37.8 | 1.6 | 34.2 | +3.28% |  | ms |
| 3 | solid-v1.9.15-keyed | remove row | 38.5 | 1 | 35.7 | +5.19% |  | ms |
| 4 | marko-v6.3.49-keyed | remove row | 38.9 | 1.6 | 35.8 | +6.28% |  | ms |
| 5 | **mreact-v0.0.214-local-keyed** | remove row | 39.2 | 1.2 | 35.9 | +7.1% |  | ms |
| 6 | **mreact-react-compat-v0.0.214-local-keyed** | remove row | 39.9 | 2.1 | 35.8 | +9.02% |  | ms |
| 7 | react-hooks-v19.2.8-keyed | remove row | 42.1 | 2.8 | 36.9 | +15.03% |  | ms |
| 8 | vue-v3.5.42-keyed | remove row | 44.1 | 5.4 | 36.2 | +20.49% |  | ms |
| 9 | **mreact-react-compat-vdom-v0.0.214-local-keyed** | remove row | 52.7 | 6.8 | 43 | +43.99% |  | ms |

### create many rows

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | **mreact-v0.0.214-local-keyed** | create many rows | 821.7 | 65.9 | 743.7 | best |  | ms |
| 2 | marko-v6.3.49-keyed | create many rows | 826.7 | 84.7 | 731.8 | +0.61% |  | ms |
| 3 | solid-v1.9.15-keyed | create many rows | 829.1 | 74.1 | 744.1 | +0.9% |  | ms |
| 4 | svelte-v5.57.0-keyed | create many rows | 844.5 | 92.1 | 738.9 | +2.77% |  | ms |
| 5 | vue-v3.5.42-keyed | create many rows | 944.4 | 164.6 | 770.4 | +14.93% |  | ms |
| 6 | **mreact-react-compat-v0.0.214-local-keyed** | create many rows | 957.1 | 170.8 | 776.2 | +16.48% |  | ms |
| 7 | angular-cf-v22.0.0-keyed | create many rows | 1060.9 | 188 | 777 | +29.11% |  | ms |
| 8 | **mreact-react-compat-vdom-v0.0.214-local-keyed** | create many rows | 1092.1 | 305.8 | 776 | +32.91% |  | ms |
| 9 | react-hooks-v19.2.8-keyed | create many rows | 1257.9 | 432 | 802 | +53.09% |  | ms |

### append rows to large table

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | solid-v1.9.15-keyed | append rows to large table | 87 | 8.9 | 76.9 | best |  | ms |
| 2 | svelte-v5.57.0-keyed | append rows to large table | 87.1 | 10.2 | 75.1 | +0.11% |  | ms |
| 3 | **mreact-v0.0.214-local-keyed** | append rows to large table | 87.5 | 9 | 76.9 | +0.57% |  | ms |
| 4 | marko-v6.3.49-keyed | append rows to large table | 87.8 | 9.6 | 76.4 | +0.92% |  | ms |
| 5 | vue-v3.5.42-keyed | append rows to large table | 91.2 | 16.5 | 72.6 | +4.83% |  | ms |
| 6 | **mreact-react-compat-v0.0.214-local-keyed** | append rows to large table | 93.6 | 18 | 73.9 | +7.59% |  | ms |
| 7 | react-hooks-v19.2.8-keyed | append rows to large table | 103.3 | 21 | 80.5 | +18.74% |  | ms |
| 8 | angular-cf-v22.0.0-keyed | append rows to large table | 110.5 | 17.1 | 78.5 | +27.01% |  | ms |
| 9 | **mreact-react-compat-vdom-v0.0.214-local-keyed** | append rows to large table | 120.7 | 42.5 | 78 | +38.74% |  | ms |

### clear rows

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | marko-v6.3.49-keyed | clear rows | 30.1 | 26.2 | 3.1 | best |  | ms |
| 2 | **mreact-v0.0.214-local-keyed** | clear rows | 31.7 | 27.2 | 3 | +5.32% |  | ms |
| 3 | svelte-v5.57.0-keyed | clear rows | 36.3 | 31.7 | 3.5 | +20.6% |  | ms |
| 4 | solid-v1.9.15-keyed | clear rows | 37.2 | 32.7 | 3.3 | +23.59% |  | ms |
| 5 | **mreact-react-compat-vdom-v0.0.214-local-keyed** | clear rows | 46.1 | 40.8 | 3.5 | +53.16% |  | ms |
| 6 | **mreact-react-compat-v0.0.214-local-keyed** | clear rows | 48 | 42.8 | 3.7 | +59.47% |  | ms |
| 7 | vue-v3.5.42-keyed | clear rows | 48.3 | 42.9 | 3.3 | +60.47% |  | ms |
| 8 | react-hooks-v19.2.8-keyed | clear rows | 58.5 | 53.6 | 3.6 | +94.35% |  | ms |
| 9 | angular-cf-v22.0.0-keyed | clear rows | 61.1 | 55.9 | 3.8 | +102.99% |  | ms |

### ready memory

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | solid-v1.9.15-keyed | ready memory | 1.1 |  |  | best |  | MB |
| 2 | marko-v6.3.49-keyed | ready memory | 1.1 |  |  | +0.81% |  | MB |
| 3 | svelte-v5.57.0-keyed | ready memory | 1.1 |  |  | +1.21% |  | MB |
| 4 | **mreact-v0.0.214-local-keyed** | ready memory | 1.2 |  |  | +6.42% |  | MB |
| 5 | vue-v3.5.42-keyed | ready memory | 1.3 |  |  | +24.3% |  | MB |
| 6 | **mreact-react-compat-vdom-v0.0.214-local-keyed** | ready memory | 1.4 |  |  | +30.97% |  | MB |
| 7 | **mreact-react-compat-v0.0.214-local-keyed** | ready memory | 1.5 |  |  | +36.53% |  | MB |
| 8 | react-hooks-v19.2.8-keyed | ready memory | 1.6 |  |  | +47.8% |  | MB |
| 9 | angular-cf-v22.0.0-keyed | ready memory | 2.1 |  |  | +89.76% |  | MB |

### run memory

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | **mreact-v0.0.214-local-keyed** | run memory | 2.7 |  |  | best |  | MB |
| 2 | marko-v6.3.49-keyed | run memory | 2.7 |  |  | +0.17% |  | MB |
| 3 | solid-v1.9.15-keyed | run memory | 3.2 |  |  | +15.92% |  | MB |
| 4 | svelte-v5.57.0-keyed | run memory | 3.5 |  |  | +26.93% |  | MB |
| 5 | vue-v3.5.42-keyed | run memory | 4.4 |  |  | +61.59% |  | MB |
| 6 | **mreact-react-compat-v0.0.214-local-keyed** | run memory | 4.6 |  |  | +69.31% |  | MB |
| 7 | react-hooks-v19.2.8-keyed | run memory | 4.9 |  |  | +81.01% |  | MB |
| 8 | **mreact-react-compat-vdom-v0.0.214-local-keyed** | run memory | 5 |  |  | +82.62% |  | MB |
| 9 | angular-cf-v22.0.0-keyed | run memory | 5.1 |  |  | +85.95% |  | MB |

### repeated clear memory

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | solid-v1.9.15-keyed | repeated clear memory | 1.3 |  |  | best |  | MB |
| 2 | marko-v6.3.49-keyed | repeated clear memory | 1.4 |  |  | +8.25% |  | MB |
| 3 | **mreact-v0.0.214-local-keyed** | repeated clear memory | 1.4 |  |  | +9.94% |  | MB |
| 4 | svelte-v5.57.0-keyed | repeated clear memory | 1.6 |  |  | +22.61% |  | MB |
| 5 | vue-v3.5.42-keyed | repeated clear memory | 1.6 |  |  | +27.27% |  | MB |
| 6 | **mreact-react-compat-v0.0.214-local-keyed** | repeated clear memory | 1.9 |  |  | +46.92% |  | MB |
| 7 | react-hooks-v19.2.8-keyed | repeated clear memory | 2.5 |  |  | +93.48% |  | MB |
| 8 | **mreact-react-compat-vdom-v0.0.214-local-keyed** | repeated clear memory | 2.6 |  |  | +104.98% |  | MB |
| 9 | angular-cf-v22.0.0-keyed | repeated clear memory | 2.7 |  |  | +113.34% |  | MB |

### total byte weight

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | solid-v1.9.15-keyed | total byte weight | 4.5 |  |  | best |  | kB |
| 2 | marko-v6.3.49-keyed | total byte weight | 4.8 |  |  | +6.67% |  | kB |
| 3 | **mreact-v0.0.214-local-keyed** | total byte weight | 10.3 |  |  | +128.89% |  | kB |
| 4 | svelte-v5.57.0-keyed | total byte weight | 11.5 |  |  | +155.56% |  | kB |
| 5 | vue-v3.5.42-keyed | total byte weight | 23.5 |  |  | +422.22% |  | kB |
| 6 | **mreact-react-compat-vdom-v0.0.214-local-keyed** | total byte weight | 35.5 |  |  | +688.89% |  | kB |
| 7 | **mreact-react-compat-v0.0.214-local-keyed** | total byte weight | 42.9 |  |  | +853.33% |  | kB |
| 8 | angular-cf-v22.0.0-keyed | total byte weight | 44.5 |  |  | +888.89% |  | kB |
| 9 | react-hooks-v19.2.8-keyed | total byte weight | 51.4 |  |  | +1042.22% |  | kB |

## Results

| suite | framework | case | status | metric | unit | value | script | paint | diff vs 1st | diff vs react-hooks |
| --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | create rows | completed | duration | ms | 100.2 | 17.2 | 65.7 | +39.36% |  |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | replace all rows | completed | duration | ms | 115.6 | 32.6 | 67.4 | +45.59% |  |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | partial update | completed | duration | ms | 58.8 | 3.6 | 52.9 | +24.31% |  |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | select row | completed | duration | ms | 12.9 | 3.9 | 7.9 | +37.23% |  |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | swap rows | completed | duration | ms | 54.1 | 2.6 | 49.7 | +4.64% |  |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | remove row | completed | duration | ms | 36.6 | 1.7 | 34.1 | best |  |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | create many rows | completed | duration | ms | 1060.9 | 188 | 777 | +29.11% |  |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | append rows to large table | completed | duration | ms | 110.5 | 17.1 | 78.5 | +27.01% |  |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | clear rows | completed | duration | ms | 61.1 | 55.9 | 3.8 | +102.99% |  |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | ready memory | completed | memory | MB | 2.1 |  |  | +89.76% |  |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | run memory | completed | memory | MB | 5.1 |  |  | +85.95% |  |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | repeated clear memory | completed | memory | MB | 2.7 |  |  | +113.34% |  |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | total byte weight | completed | size | kB | 44.5 |  |  | +888.89% |  |
| js-framework-benchmark | marko-v6.3.49-keyed | create rows | completed | duration | ms | 71.9 | 7.6 | 63.3 | best |  |
| js-framework-benchmark | marko-v6.3.49-keyed | replace all rows | completed | duration | ms | 81.6 | 15.8 | 64.4 | +2.77% |  |
| js-framework-benchmark | marko-v6.3.49-keyed | partial update | completed | duration | ms | 61.5 | 3.8 | 51.7 | +30.02% |  |
| js-framework-benchmark | marko-v6.3.49-keyed | select row | completed | duration | ms | 9.4 | 1.6 | 6.6 | best |  |
| js-framework-benchmark | marko-v6.3.49-keyed | swap rows | completed | duration | ms | 51.7 | 2.7 | 46 | best |  |
| js-framework-benchmark | marko-v6.3.49-keyed | remove row | completed | duration | ms | 38.9 | 1.6 | 35.8 | +6.28% |  |
| js-framework-benchmark | marko-v6.3.49-keyed | create many rows | completed | duration | ms | 826.7 | 84.7 | 731.8 | +0.61% |  |
| js-framework-benchmark | marko-v6.3.49-keyed | append rows to large table | completed | duration | ms | 87.8 | 9.6 | 76.4 | +0.92% |  |
| js-framework-benchmark | marko-v6.3.49-keyed | clear rows | completed | duration | ms | 30.1 | 26.2 | 3.1 | best |  |
| js-framework-benchmark | marko-v6.3.49-keyed | ready memory | completed | memory | MB | 1.1 |  |  | +0.81% |  |
| js-framework-benchmark | marko-v6.3.49-keyed | run memory | completed | memory | MB | 2.7 |  |  | +0.17% |  |
| js-framework-benchmark | marko-v6.3.49-keyed | repeated clear memory | completed | memory | MB | 1.4 |  |  | +8.25% |  |
| js-framework-benchmark | marko-v6.3.49-keyed | total byte weight | completed | size | kB | 4.8 |  |  | +6.67% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.214-local-keyed** | create rows | completed | duration | ms | 88.8 | 18.6 | 68.2 | +23.5% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.214-local-keyed** | replace all rows | completed | duration | ms | 96.1 | 28.3 | 65.4 | +21.03% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.214-local-keyed** | partial update | completed | duration | ms | 62.6 | 8.7 | 48.4 | +32.35% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.214-local-keyed** | select row | completed | duration | ms | 12.2 | 4.1 | 6.7 | +29.79% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.214-local-keyed** | swap rows | completed | duration | ms | 57.8 | 4.8 | 48.5 | +11.8% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.214-local-keyed** | remove row | completed | duration | ms | 39.9 | 2.1 | 35.8 | +9.02% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.214-local-keyed** | create many rows | completed | duration | ms | 957.1 | 170.8 | 776.2 | +16.48% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.214-local-keyed** | append rows to large table | completed | duration | ms | 93.6 | 18 | 73.9 | +7.59% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.214-local-keyed** | clear rows | completed | duration | ms | 48 | 42.8 | 3.7 | +59.47% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.214-local-keyed** | ready memory | completed | memory | MB | 1.5 |  |  | +36.53% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.214-local-keyed** | run memory | completed | memory | MB | 4.6 |  |  | +69.31% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.214-local-keyed** | repeated clear memory | completed | memory | MB | 1.9 |  |  | +46.92% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.214-local-keyed** | total byte weight | completed | size | kB | 42.9 |  |  | +853.33% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.214-local-keyed** | create rows | completed | duration | ms | 99.6 | 32 | 66.6 | +38.53% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.214-local-keyed** | replace all rows | completed | duration | ms | 110.5 | 44.8 | 64.5 | +39.17% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.214-local-keyed** | partial update | completed | duration | ms | 75.6 | 26.8 | 44.4 | +59.83% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.214-local-keyed** | select row | completed | duration | ms | 15.6 | 7.8 | 6.5 | +65.96% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.214-local-keyed** | swap rows | completed | duration | ms | 73.8 | 20.4 | 48.4 | +42.75% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.214-local-keyed** | remove row | completed | duration | ms | 52.7 | 6.8 | 43 | +43.99% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.214-local-keyed** | create many rows | completed | duration | ms | 1092.1 | 305.8 | 776 | +32.91% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.214-local-keyed** | append rows to large table | completed | duration | ms | 120.7 | 42.5 | 78 | +38.74% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.214-local-keyed** | clear rows | completed | duration | ms | 46.1 | 40.8 | 3.5 | +53.16% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.214-local-keyed** | ready memory | completed | memory | MB | 1.4 |  |  | +30.97% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.214-local-keyed** | run memory | completed | memory | MB | 5 |  |  | +82.62% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.214-local-keyed** | repeated clear memory | completed | memory | MB | 2.6 |  |  | +104.98% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.214-local-keyed** | total byte weight | completed | size | kB | 35.5 |  |  | +688.89% |  |
| js-framework-benchmark | **mreact-v0.0.214-local-keyed** | create rows | completed | duration | ms | 74 | 7 | 65.7 | +2.92% |  |
| js-framework-benchmark | **mreact-v0.0.214-local-keyed** | replace all rows | completed | duration | ms | 79.4 | 12.8 | 65.9 | best |  |
| js-framework-benchmark | **mreact-v0.0.214-local-keyed** | partial update | completed | duration | ms | 59.8 | 4.7 | 49.5 | +26.43% |  |
| js-framework-benchmark | **mreact-v0.0.214-local-keyed** | select row | completed | duration | ms | 9.4 | 1.2 | 6.8 | 0% |  |
| js-framework-benchmark | **mreact-v0.0.214-local-keyed** | swap rows | completed | duration | ms | 52.6 | 2.4 | 46.2 | +1.74% |  |
| js-framework-benchmark | **mreact-v0.0.214-local-keyed** | remove row | completed | duration | ms | 39.2 | 1.2 | 35.9 | +7.1% |  |
| js-framework-benchmark | **mreact-v0.0.214-local-keyed** | create many rows | completed | duration | ms | 821.7 | 65.9 | 743.7 | best |  |
| js-framework-benchmark | **mreact-v0.0.214-local-keyed** | append rows to large table | completed | duration | ms | 87.5 | 9 | 76.9 | +0.57% |  |
| js-framework-benchmark | **mreact-v0.0.214-local-keyed** | clear rows | completed | duration | ms | 31.7 | 27.2 | 3 | +5.32% |  |
| js-framework-benchmark | **mreact-v0.0.214-local-keyed** | ready memory | completed | memory | MB | 1.2 |  |  | +6.42% |  |
| js-framework-benchmark | **mreact-v0.0.214-local-keyed** | run memory | completed | memory | MB | 2.7 |  |  | best |  |
| js-framework-benchmark | **mreact-v0.0.214-local-keyed** | repeated clear memory | completed | memory | MB | 1.4 |  |  | +9.94% |  |
| js-framework-benchmark | **mreact-v0.0.214-local-keyed** | total byte weight | completed | size | kB | 10.3 |  |  | +128.89% |  |
| js-framework-benchmark | react-hooks-v19.2.8-keyed | create rows | completed | duration | ms | 85.6 | 19.8 | 65.7 | +19.05% |  |
| js-framework-benchmark | react-hooks-v19.2.8-keyed | replace all rows | completed | duration | ms | 102.3 | 35.4 | 65.1 | +28.84% |  |
| js-framework-benchmark | react-hooks-v19.2.8-keyed | partial update | completed | duration | ms | 58.7 | 11 | 43.8 | +24.1% |  |
| js-framework-benchmark | react-hooks-v19.2.8-keyed | select row | completed | duration | ms | 14.9 | 6.9 | 6.9 | +58.51% |  |
| js-framework-benchmark | react-hooks-v19.2.8-keyed | swap rows | completed | duration | ms | 342.1 | 53.1 | 283.3 | +561.7% |  |
| js-framework-benchmark | react-hooks-v19.2.8-keyed | remove row | completed | duration | ms | 42.1 | 2.8 | 36.9 | +15.03% |  |
| js-framework-benchmark | react-hooks-v19.2.8-keyed | create many rows | completed | duration | ms | 1257.9 | 432 | 802 | +53.09% |  |
| js-framework-benchmark | react-hooks-v19.2.8-keyed | append rows to large table | completed | duration | ms | 103.3 | 21 | 80.5 | +18.74% |  |
| js-framework-benchmark | react-hooks-v19.2.8-keyed | clear rows | completed | duration | ms | 58.5 | 53.6 | 3.6 | +94.35% |  |
| js-framework-benchmark | react-hooks-v19.2.8-keyed | ready memory | completed | memory | MB | 1.6 |  |  | +47.8% |  |
| js-framework-benchmark | react-hooks-v19.2.8-keyed | run memory | completed | memory | MB | 4.9 |  |  | +81.01% |  |
| js-framework-benchmark | react-hooks-v19.2.8-keyed | repeated clear memory | completed | memory | MB | 2.5 |  |  | +93.48% |  |
| js-framework-benchmark | react-hooks-v19.2.8-keyed | total byte weight | completed | size | kB | 51.4 |  |  | +1042.22% |  |
| js-framework-benchmark | solid-v1.9.15-keyed | create rows | completed | duration | ms | 72.9 | 7.7 | 63.9 | +1.39% |  |
| js-framework-benchmark | solid-v1.9.15-keyed | replace all rows | completed | duration | ms | 84.9 | 16.6 | 68 | +6.93% |  |
| js-framework-benchmark | solid-v1.9.15-keyed | partial update | completed | duration | ms | 49.7 | 3.1 | 42.8 | +5.07% |  |
| js-framework-benchmark | solid-v1.9.15-keyed | select row | completed | duration | ms | 10.4 | 2 | 7.1 | +10.64% |  |
| js-framework-benchmark | solid-v1.9.15-keyed | swap rows | completed | duration | ms | 52 | 2.2 | 45.9 | +0.58% |  |
| js-framework-benchmark | solid-v1.9.15-keyed | remove row | completed | duration | ms | 38.5 | 1 | 35.7 | +5.19% |  |
| js-framework-benchmark | solid-v1.9.15-keyed | create many rows | completed | duration | ms | 829.1 | 74.1 | 744.1 | +0.9% |  |
| js-framework-benchmark | solid-v1.9.15-keyed | append rows to large table | completed | duration | ms | 87 | 8.9 | 76.9 | best |  |
| js-framework-benchmark | solid-v1.9.15-keyed | clear rows | completed | duration | ms | 37.2 | 32.7 | 3.3 | +23.59% |  |
| js-framework-benchmark | solid-v1.9.15-keyed | ready memory | completed | memory | MB | 1.1 |  |  | best |  |
| js-framework-benchmark | solid-v1.9.15-keyed | run memory | completed | memory | MB | 3.2 |  |  | +15.92% |  |
| js-framework-benchmark | solid-v1.9.15-keyed | repeated clear memory | completed | memory | MB | 1.3 |  |  | best |  |
| js-framework-benchmark | solid-v1.9.15-keyed | total byte weight | completed | size | kB | 4.5 |  |  | best |  |
| js-framework-benchmark | svelte-v5.57.0-keyed | create rows | completed | duration | ms | 75.7 | 10.6 | 64.2 | +5.29% |  |
| js-framework-benchmark | svelte-v5.57.0-keyed | replace all rows | completed | duration | ms | 92.2 | 20.9 | 69.9 | +16.12% |  |
| js-framework-benchmark | svelte-v5.57.0-keyed | partial update | completed | duration | ms | 52.8 | 5.1 | 42.9 | +11.63% |  |
| js-framework-benchmark | svelte-v5.57.0-keyed | select row | completed | duration | ms | 16.4 | 6.9 | 8 | +74.47% |  |
| js-framework-benchmark | svelte-v5.57.0-keyed | swap rows | completed | duration | ms | 55.4 | 4.2 | 47.3 | +7.16% |  |
| js-framework-benchmark | svelte-v5.57.0-keyed | remove row | completed | duration | ms | 37.8 | 1.6 | 34.2 | +3.28% |  |
| js-framework-benchmark | svelte-v5.57.0-keyed | create many rows | completed | duration | ms | 844.5 | 92.1 | 738.9 | +2.77% |  |
| js-framework-benchmark | svelte-v5.57.0-keyed | append rows to large table | completed | duration | ms | 87.1 | 10.2 | 75.1 | +0.11% |  |
| js-framework-benchmark | svelte-v5.57.0-keyed | clear rows | completed | duration | ms | 36.3 | 31.7 | 3.5 | +20.6% |  |
| js-framework-benchmark | svelte-v5.57.0-keyed | ready memory | completed | memory | MB | 1.1 |  |  | +1.21% |  |
| js-framework-benchmark | svelte-v5.57.0-keyed | run memory | completed | memory | MB | 3.5 |  |  | +26.93% |  |
| js-framework-benchmark | svelte-v5.57.0-keyed | repeated clear memory | completed | memory | MB | 1.6 |  |  | +22.61% |  |
| js-framework-benchmark | svelte-v5.57.0-keyed | total byte weight | completed | size | kB | 11.5 |  |  | +155.56% |  |
| js-framework-benchmark | vue-v3.5.42-keyed | create rows | completed | duration | ms | 85.3 | 18.2 | 65.9 | +18.64% |  |
| js-framework-benchmark | vue-v3.5.42-keyed | replace all rows | completed | duration | ms | 108.9 | 30.3 | 76.7 | +37.15% |  |
| js-framework-benchmark | vue-v3.5.42-keyed | partial update | completed | duration | ms | 47.3 | 6.2 | 38.1 | best |  |
| js-framework-benchmark | vue-v3.5.42-keyed | select row | completed | duration | ms | 12.7 | 2.7 | 8.2 | +35.11% |  |
| js-framework-benchmark | vue-v3.5.42-keyed | swap rows | completed | duration | ms | 55.3 | 3.3 | 48 | +6.96% |  |
| js-framework-benchmark | vue-v3.5.42-keyed | remove row | completed | duration | ms | 44.1 | 5.4 | 36.2 | +20.49% |  |
| js-framework-benchmark | vue-v3.5.42-keyed | create many rows | completed | duration | ms | 944.4 | 164.6 | 770.4 | +14.93% |  |
| js-framework-benchmark | vue-v3.5.42-keyed | append rows to large table | completed | duration | ms | 91.2 | 16.5 | 72.6 | +4.83% |  |
| js-framework-benchmark | vue-v3.5.42-keyed | clear rows | completed | duration | ms | 48.3 | 42.9 | 3.3 | +60.47% |  |
| js-framework-benchmark | vue-v3.5.42-keyed | ready memory | completed | memory | MB | 1.3 |  |  | +24.3% |  |
| js-framework-benchmark | vue-v3.5.42-keyed | run memory | completed | memory | MB | 4.4 |  |  | +61.59% |  |
| js-framework-benchmark | vue-v3.5.42-keyed | repeated clear memory | completed | memory | MB | 1.6 |  |  | +27.27% |  |
| js-framework-benchmark | vue-v3.5.42-keyed | total byte weight | completed | size | kB | 23.5 |  |  | +422.22% |  |
