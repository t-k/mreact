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

Framework order offset: 2
Framework run order: keyed/svelte, keyed/angular-cf, keyed/react-hooks, keyed/mreact-react-compat, keyed/mreact-react-compat-vdom, keyed/solid, keyed/mreact, keyed/marko, keyed/vue
Fixed diff anchor: react-hooks

## Unsupported Primitive Adapters

- qwik: krausest/js-framework-benchmark keyed/qwik currently fails the official isKeyed check and is categorized as non-keyed.
- qwik-v2: krausest/js-framework-benchmark does not currently provide a matching Qwik v2 keyed fixture.
- solid-v2: krausest/js-framework-benchmark does not currently provide a matching Solid v2 keyed fixture.

Raw JSON files are stored in `benchmarks/results/2026-08-03/001/js-framework-benchmark-results`.
Chrome trace files are stored in `benchmarks/results/2026-08-03/001/js-framework-benchmark-traces`.

## Rankings

Lower values are better for all js-framework-benchmark metrics reported here.

### create rows

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | solid-v1.9.14-keyed | create rows | 77.9 | 7.8 | 68.5 | best |  | ms |
| 2 | **mreact-v0.0.199-local-keyed** | create rows | 78.2 | 7.5 | 69.1 | +0.39% |  | ms |
| 3 | marko-v6.3.31-keyed | create rows | 78.5 | 7.2 | 69.7 | +0.77% |  | ms |
| 4 | svelte-v5.56.8-keyed | create rows | 80.8 | 11.2 | 68.4 | +3.72% |  | ms |
| 5 | **mreact-react-compat-v0.0.199-local-keyed** | create rows | 90.1 | 20.8 | 68.1 | +15.66% |  | ms |
| 6 | vue-v3.5.40-keyed | create rows | 90.7 | 22.1 | 67 | +16.43% |  | ms |
| 7 | react-hooks-v19.2.8-keyed | create rows | 98.6 | 24.7 | 72.4 | +26.57% |  | ms |
| 8 | angular-cf-v22.0.0-keyed | create rows | 105.7 | 20.7 | 67.5 | +35.69% |  | ms |
| 9 | **mreact-react-compat-vdom-v0.0.199-local-keyed** | create rows | 107.5 | 37.4 | 69.4 | +38% |  | ms |

### replace all rows

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | **mreact-v0.0.199-local-keyed** | replace all rows | 71.9 | 11.8 | 59.1 | best |  | ms |
| 2 | marko-v6.3.31-keyed | replace all rows | 80.9 | 14.7 | 64.8 | +12.52% |  | ms |
| 3 | solid-v1.9.14-keyed | replace all rows | 81.8 | 15.9 | 64.6 | +13.77% |  | ms |
| 4 | svelte-v5.56.8-keyed | replace all rows | 86.7 | 19.3 | 65.4 | +20.58% |  | ms |
| 5 | vue-v3.5.40-keyed | replace all rows | 97.1 | 27.4 | 67.3 | +35.05% |  | ms |
| 6 | **mreact-react-compat-v0.0.199-local-keyed** | replace all rows | 97.5 | 28.6 | 67.3 | +35.61% |  | ms |
| 7 | react-hooks-v19.2.8-keyed | replace all rows | 105.7 | 35.1 | 68 | +47.01% |  | ms |
| 8 | **mreact-react-compat-vdom-v0.0.199-local-keyed** | replace all rows | 110.8 | 42.9 | 65.6 | +54.1% |  | ms |
| 9 | angular-cf-v22.0.0-keyed | replace all rows | 118.1 | 32.1 | 69.6 | +64.26% |  | ms |

### partial update

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | vue-v3.5.40-keyed | partial update | 43.5 | 5.7 | 33.6 | best |  | ms |
| 2 | svelte-v5.56.8-keyed | partial update | 48.4 | 3.8 | 40.2 | +11.26% |  | ms |
| 3 | angular-cf-v22.0.0-keyed | partial update | 49.1 | 3.2 | 43.9 | +12.87% |  | ms |
| 4 | **mreact-v0.0.199-local-keyed** | partial update | 50.7 | 4.3 | 42 | +16.55% |  | ms |
| 5 | marko-v6.3.31-keyed | partial update | 51.5 | 3.6 | 43.4 | +18.39% |  | ms |
| 6 | solid-v1.9.14-keyed | partial update | 52 | 3.3 | 44.2 | +19.54% |  | ms |
| 7 | **mreact-react-compat-v0.0.199-local-keyed** | partial update | 52.4 | 7.3 | 40.8 | +20.46% |  | ms |
| 8 | react-hooks-v19.2.8-keyed | partial update | 58.4 | 11.7 | 42.8 | +34.25% |  | ms |
| 9 | **mreact-react-compat-vdom-v0.0.199-local-keyed** | partial update | 74.1 | 26.4 | 42.7 | +70.34% |  | ms |

### select row

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | **mreact-v0.0.199-local-keyed** | select row | 9.6 | 1.1 | 7.1 | best |  | ms |
| 2 | marko-v6.3.31-keyed | select row | 10.5 | 1.4 | 7.6 | +9.38% |  | ms |
| 3 | vue-v3.5.40-keyed | select row | 11.1 | 2.4 | 6.8 | +15.63% |  | ms |
| 4 | solid-v1.9.14-keyed | select row | 11.5 | 2.1 | 7.8 | +19.79% |  | ms |
| 5 | angular-cf-v22.0.0-keyed | select row | 13.1 | 4.2 | 7.7 | +36.46% |  | ms |
| 6 | **mreact-react-compat-v0.0.199-local-keyed** | select row | 13.5 | 3.9 | 7.6 | +40.63% |  | ms |
| 7 | react-hooks-v19.2.8-keyed | select row | 16.2 | 6.7 | 7.5 | +68.75% |  | ms |
| 8 | svelte-v5.56.8-keyed | select row | 16.2 | 6.8 | 7.7 | +68.75% |  | ms |
| 9 | **mreact-react-compat-vdom-v0.0.199-local-keyed** | select row | 17.9 | 7.9 | 8.2 | +86.46% |  | ms |

### swap rows

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | angular-cf-v22.0.0-keyed | swap rows | 43.5 | 2.4 | 39.4 | best |  | ms |
| 2 | marko-v6.3.31-keyed | swap rows | 44.5 | 2.4 | 38.4 | +2.3% |  | ms |
| 3 | **mreact-react-compat-v0.0.199-local-keyed** | swap rows | 53.6 | 4.3 | 45.9 | +23.22% |  | ms |
| 4 | **mreact-v0.0.199-local-keyed** | swap rows | 55.6 | 2.3 | 47.6 | +27.82% |  | ms |
| 5 | solid-v1.9.14-keyed | swap rows | 61.9 | 2.2 | 53.6 | +42.3% |  | ms |
| 6 | vue-v3.5.40-keyed | swap rows | 62.1 | 3.3 | 53.9 | +42.76% |  | ms |
| 7 | svelte-v5.56.8-keyed | swap rows | 63.6 | 4.4 | 54.5 | +46.21% |  | ms |
| 8 | **mreact-react-compat-vdom-v0.0.199-local-keyed** | swap rows | 80.4 | 21.8 | 50.9 | +84.83% |  | ms |
| 9 | react-hooks-v19.2.8-keyed | swap rows | 367.6 | 55.4 | 306.9 | +745.06% |  | ms |

### remove row

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | angular-cf-v22.0.0-keyed | remove row | 32.1 | 1.6 | 29.5 | best |  | ms |
| 2 | svelte-v5.56.8-keyed | remove row | 35.7 | 1.6 | 32.2 | +11.21% |  | ms |
| 3 | solid-v1.9.14-keyed | remove row | 37.9 | 0.9 | 35 | +18.07% |  | ms |
| 4 | marko-v6.3.31-keyed | remove row | 43.6 | 1.5 | 39.4 | +35.83% |  | ms |
| 5 | **mreact-v0.0.199-local-keyed** | remove row | 45.8 | 1.1 | 41.8 | +42.68% |  | ms |
| 6 | react-hooks-v19.2.8-keyed | remove row | 46.7 | 2.8 | 41 | +45.48% |  | ms |
| 7 | **mreact-react-compat-v0.0.199-local-keyed** | remove row | 47.5 | 1.7 | 43.2 | +47.98% |  | ms |
| 8 | vue-v3.5.40-keyed | remove row | 49.7 | 5.4 | 41.2 | +54.83% |  | ms |
| 9 | **mreact-react-compat-vdom-v0.0.199-local-keyed** | remove row | 51.6 | 6 | 42.7 | +60.75% |  | ms |

### create many rows

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | **mreact-v0.0.199-local-keyed** | create many rows | 773.1 | 70.9 | 691.3 | best |  | ms |
| 2 | marko-v6.3.31-keyed | create many rows | 778 | 77 | 691.8 | +0.63% |  | ms |
| 3 | solid-v1.9.14-keyed | create many rows | 779.4 | 73.8 | 694.2 | +0.81% |  | ms |
| 4 | svelte-v5.56.8-keyed | create many rows | 799.7 | 98.8 | 688.4 | +3.44% |  | ms |
| 5 | vue-v3.5.40-keyed | create many rows | 900.2 | 173 | 718.2 | +16.44% |  | ms |
| 6 | **mreact-react-compat-v0.0.199-local-keyed** | create many rows | 901.2 | 175.8 | 715.8 | +16.57% |  | ms |
| 7 | angular-cf-v22.0.0-keyed | create many rows | 1013.9 | 211.1 | 725 | +31.15% |  | ms |
| 8 | **mreact-react-compat-vdom-v0.0.199-local-keyed** | create many rows | 1033.3 | 306.7 | 713.9 | +33.66% |  | ms |
| 9 | react-hooks-v19.2.8-keyed | create many rows | 1175.8 | 405.6 | 738.4 | +52.09% |  | ms |

### append rows to large table

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | **mreact-v0.0.199-local-keyed** | append rows to large table | 84.8 | 8 | 74.8 | best |  | ms |
| 2 | marko-v6.3.31-keyed | append rows to large table | 85.6 | 9.1 | 74.6 | +0.94% |  | ms |
| 3 | solid-v1.9.14-keyed | append rows to large table | 88 | 9.5 | 76.5 | +3.77% |  | ms |
| 4 | svelte-v5.56.8-keyed | append rows to large table | 88.5 | 11 | 75 | +4.36% |  | ms |
| 5 | **mreact-react-compat-v0.0.199-local-keyed** | append rows to large table | 96.3 | 18.9 | 75 | +13.56% |  | ms |
| 6 | vue-v3.5.40-keyed | append rows to large table | 97 | 18.1 | 76.7 | +14.39% |  | ms |
| 7 | react-hooks-v19.2.8-keyed | append rows to large table | 102.8 | 23.8 | 76.8 | +21.23% |  | ms |
| 8 | angular-cf-v22.0.0-keyed | append rows to large table | 109.3 | 17.5 | 76.1 | +28.89% |  | ms |
| 9 | **mreact-react-compat-vdom-v0.0.199-local-keyed** | append rows to large table | 117.1 | 36.2 | 78.3 | +38.09% |  | ms |

### clear rows

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | marko-v6.3.31-keyed | clear rows | 29.6 | 24.7 | 3 | best |  | ms |
| 2 | **mreact-v0.0.199-local-keyed** | clear rows | 30.7 | 26.1 | 3.3 | +3.72% |  | ms |
| 3 | svelte-v5.56.8-keyed | clear rows | 36.4 | 31.1 | 3.4 | +22.97% |  | ms |
| 4 | solid-v1.9.14-keyed | clear rows | 38.6 | 34 | 3.3 | +30.41% |  | ms |
| 5 | **mreact-react-compat-vdom-v0.0.199-local-keyed** | clear rows | 42.4 | 37.7 | 3 | +43.24% |  | ms |
| 6 | **mreact-react-compat-v0.0.199-local-keyed** | clear rows | 43.4 | 38.3 | 3.1 | +46.62% |  | ms |
| 7 | vue-v3.5.40-keyed | clear rows | 46.1 | 41.2 | 3.2 | +55.74% |  | ms |
| 8 | react-hooks-v19.2.8-keyed | clear rows | 57.5 | 52.2 | 3.1 | +94.26% |  | ms |
| 9 | angular-cf-v22.0.0-keyed | clear rows | 60.2 | 56.1 | 3.3 | +103.38% |  | ms |

### ready memory

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | solid-v1.9.14-keyed | ready memory | 1.1 |  |  | best |  | MB |
| 2 | marko-v6.3.31-keyed | ready memory | 1.1 |  |  | +5.22% |  | MB |
| 3 | **mreact-v0.0.199-local-keyed** | ready memory | 1.1 |  |  | +6.66% |  | MB |
| 4 | svelte-v5.56.8-keyed | ready memory | 1.2 |  |  | +11.63% |  | MB |
| 5 | **mreact-react-compat-vdom-v0.0.199-local-keyed** | ready memory | 1.3 |  |  | +25.14% |  | MB |
| 6 | vue-v3.5.40-keyed | ready memory | 1.3 |  |  | +25.98% |  | MB |
| 7 | **mreact-react-compat-v0.0.199-local-keyed** | ready memory | 1.4 |  |  | +35.81% |  | MB |
| 8 | react-hooks-v19.2.8-keyed | ready memory | 1.6 |  |  | +53.53% |  | MB |
| 9 | angular-cf-v22.0.0-keyed | ready memory | 2 |  |  | +91.35% |  | MB |

### run memory

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | marko-v6.3.31-keyed | run memory | 2.7 |  |  | best |  | MB |
| 2 | **mreact-v0.0.199-local-keyed** | run memory | 2.7 |  |  | +0.34% |  | MB |
| 3 | solid-v1.9.14-keyed | run memory | 3.1 |  |  | +17.39% |  | MB |
| 4 | svelte-v5.56.8-keyed | run memory | 3.5 |  |  | +31.16% |  | MB |
| 5 | vue-v3.5.40-keyed | run memory | 4.3 |  |  | +61.92% |  | MB |
| 6 | **mreact-react-compat-v0.0.199-local-keyed** | run memory | 4.4 |  |  | +64.03% |  | MB |
| 7 | **mreact-react-compat-vdom-v0.0.199-local-keyed** | run memory | 4.9 |  |  | +81.8% |  | MB |
| 8 | react-hooks-v19.2.8-keyed | run memory | 4.9 |  |  | +83.02% |  | MB |
| 9 | angular-cf-v22.0.0-keyed | run memory | 5.1 |  |  | +88.63% |  | MB |

### repeated clear memory

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | solid-v1.9.14-keyed | repeated clear memory | 1.3 |  |  | best |  | MB |
| 2 | **mreact-v0.0.199-local-keyed** | repeated clear memory | 1.4 |  |  | +8.6% |  | MB |
| 3 | marko-v6.3.31-keyed | repeated clear memory | 1.4 |  |  | +11.03% |  | MB |
| 4 | svelte-v5.56.8-keyed | repeated clear memory | 1.6 |  |  | +25.67% |  | MB |
| 5 | vue-v3.5.40-keyed | repeated clear memory | 1.7 |  |  | +33.69% |  | MB |
| 6 | **mreact-react-compat-v0.0.199-local-keyed** | repeated clear memory | 1.8 |  |  | +43.71% |  | MB |
| 7 | react-hooks-v19.2.8-keyed | repeated clear memory | 2.5 |  |  | +95.14% |  | MB |
| 8 | **mreact-react-compat-vdom-v0.0.199-local-keyed** | repeated clear memory | 2.5 |  |  | +97.46% |  | MB |
| 9 | angular-cf-v22.0.0-keyed | repeated clear memory | 2.7 |  |  | +116.43% |  | MB |

### total byte weight

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | solid-v1.9.14-keyed | total byte weight | 4.5 |  |  | best |  | kB |
| 2 | marko-v6.3.31-keyed | total byte weight | 5 |  |  | +11.11% |  | kB |
| 3 | **mreact-v0.0.199-local-keyed** | total byte weight | 9.7 |  |  | +115.56% |  | kB |
| 4 | svelte-v5.56.8-keyed | total byte weight | 14.3 |  |  | +217.78% |  | kB |
| 5 | vue-v3.5.40-keyed | total byte weight | 23.3 |  |  | +417.78% |  | kB |
| 6 | **mreact-react-compat-vdom-v0.0.199-local-keyed** | total byte weight | 30.4 |  |  | +575.56% |  | kB |
| 7 | **mreact-react-compat-v0.0.199-local-keyed** | total byte weight | 37.6 |  |  | +735.56% |  | kB |
| 8 | angular-cf-v22.0.0-keyed | total byte weight | 44.5 |  |  | +888.89% |  | kB |
| 9 | react-hooks-v19.2.8-keyed | total byte weight | 51.4 |  |  | +1042.22% |  | kB |

## Results

| suite | framework | case | status | metric | unit | value | script | paint | diff vs 1st | diff vs react-hooks |
| --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | create rows | completed | duration | ms | 105.7 | 20.7 | 67.5 | +35.69% |  |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | replace all rows | completed | duration | ms | 118.1 | 32.1 | 69.6 | +64.26% |  |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | partial update | completed | duration | ms | 49.1 | 3.2 | 43.9 | +12.87% |  |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | select row | completed | duration | ms | 13.1 | 4.2 | 7.7 | +36.46% |  |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | swap rows | completed | duration | ms | 43.5 | 2.4 | 39.4 | best |  |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | remove row | completed | duration | ms | 32.1 | 1.6 | 29.5 | best |  |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | create many rows | completed | duration | ms | 1013.9 | 211.1 | 725 | +31.15% |  |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | append rows to large table | completed | duration | ms | 109.3 | 17.5 | 76.1 | +28.89% |  |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | clear rows | completed | duration | ms | 60.2 | 56.1 | 3.3 | +103.38% |  |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | ready memory | completed | memory | MB | 2 |  |  | +91.35% |  |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | run memory | completed | memory | MB | 5.1 |  |  | +88.63% |  |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | repeated clear memory | completed | memory | MB | 2.7 |  |  | +116.43% |  |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | total byte weight | completed | size | kB | 44.5 |  |  | +888.89% |  |
| js-framework-benchmark | marko-v6.3.31-keyed | create rows | completed | duration | ms | 78.5 | 7.2 | 69.7 | +0.77% |  |
| js-framework-benchmark | marko-v6.3.31-keyed | replace all rows | completed | duration | ms | 80.9 | 14.7 | 64.8 | +12.52% |  |
| js-framework-benchmark | marko-v6.3.31-keyed | partial update | completed | duration | ms | 51.5 | 3.6 | 43.4 | +18.39% |  |
| js-framework-benchmark | marko-v6.3.31-keyed | select row | completed | duration | ms | 10.5 | 1.4 | 7.6 | +9.38% |  |
| js-framework-benchmark | marko-v6.3.31-keyed | swap rows | completed | duration | ms | 44.5 | 2.4 | 38.4 | +2.3% |  |
| js-framework-benchmark | marko-v6.3.31-keyed | remove row | completed | duration | ms | 43.6 | 1.5 | 39.4 | +35.83% |  |
| js-framework-benchmark | marko-v6.3.31-keyed | create many rows | completed | duration | ms | 778 | 77 | 691.8 | +0.63% |  |
| js-framework-benchmark | marko-v6.3.31-keyed | append rows to large table | completed | duration | ms | 85.6 | 9.1 | 74.6 | +0.94% |  |
| js-framework-benchmark | marko-v6.3.31-keyed | clear rows | completed | duration | ms | 29.6 | 24.7 | 3 | best |  |
| js-framework-benchmark | marko-v6.3.31-keyed | ready memory | completed | memory | MB | 1.1 |  |  | +5.22% |  |
| js-framework-benchmark | marko-v6.3.31-keyed | run memory | completed | memory | MB | 2.7 |  |  | best |  |
| js-framework-benchmark | marko-v6.3.31-keyed | repeated clear memory | completed | memory | MB | 1.4 |  |  | +11.03% |  |
| js-framework-benchmark | marko-v6.3.31-keyed | total byte weight | completed | size | kB | 5 |  |  | +11.11% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.199-local-keyed** | create rows | completed | duration | ms | 90.1 | 20.8 | 68.1 | +15.66% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.199-local-keyed** | replace all rows | completed | duration | ms | 97.5 | 28.6 | 67.3 | +35.61% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.199-local-keyed** | partial update | completed | duration | ms | 52.4 | 7.3 | 40.8 | +20.46% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.199-local-keyed** | select row | completed | duration | ms | 13.5 | 3.9 | 7.6 | +40.63% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.199-local-keyed** | swap rows | completed | duration | ms | 53.6 | 4.3 | 45.9 | +23.22% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.199-local-keyed** | remove row | completed | duration | ms | 47.5 | 1.7 | 43.2 | +47.98% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.199-local-keyed** | create many rows | completed | duration | ms | 901.2 | 175.8 | 715.8 | +16.57% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.199-local-keyed** | append rows to large table | completed | duration | ms | 96.3 | 18.9 | 75 | +13.56% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.199-local-keyed** | clear rows | completed | duration | ms | 43.4 | 38.3 | 3.1 | +46.62% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.199-local-keyed** | ready memory | completed | memory | MB | 1.4 |  |  | +35.81% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.199-local-keyed** | run memory | completed | memory | MB | 4.4 |  |  | +64.03% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.199-local-keyed** | repeated clear memory | completed | memory | MB | 1.8 |  |  | +43.71% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.199-local-keyed** | total byte weight | completed | size | kB | 37.6 |  |  | +735.56% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.199-local-keyed** | create rows | completed | duration | ms | 107.5 | 37.4 | 69.4 | +38% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.199-local-keyed** | replace all rows | completed | duration | ms | 110.8 | 42.9 | 65.6 | +54.1% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.199-local-keyed** | partial update | completed | duration | ms | 74.1 | 26.4 | 42.7 | +70.34% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.199-local-keyed** | select row | completed | duration | ms | 17.9 | 7.9 | 8.2 | +86.46% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.199-local-keyed** | swap rows | completed | duration | ms | 80.4 | 21.8 | 50.9 | +84.83% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.199-local-keyed** | remove row | completed | duration | ms | 51.6 | 6 | 42.7 | +60.75% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.199-local-keyed** | create many rows | completed | duration | ms | 1033.3 | 306.7 | 713.9 | +33.66% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.199-local-keyed** | append rows to large table | completed | duration | ms | 117.1 | 36.2 | 78.3 | +38.09% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.199-local-keyed** | clear rows | completed | duration | ms | 42.4 | 37.7 | 3 | +43.24% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.199-local-keyed** | ready memory | completed | memory | MB | 1.3 |  |  | +25.14% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.199-local-keyed** | run memory | completed | memory | MB | 4.9 |  |  | +81.8% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.199-local-keyed** | repeated clear memory | completed | memory | MB | 2.5 |  |  | +97.46% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.199-local-keyed** | total byte weight | completed | size | kB | 30.4 |  |  | +575.56% |  |
| js-framework-benchmark | **mreact-v0.0.199-local-keyed** | create rows | completed | duration | ms | 78.2 | 7.5 | 69.1 | +0.39% |  |
| js-framework-benchmark | **mreact-v0.0.199-local-keyed** | replace all rows | completed | duration | ms | 71.9 | 11.8 | 59.1 | best |  |
| js-framework-benchmark | **mreact-v0.0.199-local-keyed** | partial update | completed | duration | ms | 50.7 | 4.3 | 42 | +16.55% |  |
| js-framework-benchmark | **mreact-v0.0.199-local-keyed** | select row | completed | duration | ms | 9.6 | 1.1 | 7.1 | best |  |
| js-framework-benchmark | **mreact-v0.0.199-local-keyed** | swap rows | completed | duration | ms | 55.6 | 2.3 | 47.6 | +27.82% |  |
| js-framework-benchmark | **mreact-v0.0.199-local-keyed** | remove row | completed | duration | ms | 45.8 | 1.1 | 41.8 | +42.68% |  |
| js-framework-benchmark | **mreact-v0.0.199-local-keyed** | create many rows | completed | duration | ms | 773.1 | 70.9 | 691.3 | best |  |
| js-framework-benchmark | **mreact-v0.0.199-local-keyed** | append rows to large table | completed | duration | ms | 84.8 | 8 | 74.8 | best |  |
| js-framework-benchmark | **mreact-v0.0.199-local-keyed** | clear rows | completed | duration | ms | 30.7 | 26.1 | 3.3 | +3.72% |  |
| js-framework-benchmark | **mreact-v0.0.199-local-keyed** | ready memory | completed | memory | MB | 1.1 |  |  | +6.66% |  |
| js-framework-benchmark | **mreact-v0.0.199-local-keyed** | run memory | completed | memory | MB | 2.7 |  |  | +0.34% |  |
| js-framework-benchmark | **mreact-v0.0.199-local-keyed** | repeated clear memory | completed | memory | MB | 1.4 |  |  | +8.6% |  |
| js-framework-benchmark | **mreact-v0.0.199-local-keyed** | total byte weight | completed | size | kB | 9.7 |  |  | +115.56% |  |
| js-framework-benchmark | react-hooks-v19.2.8-keyed | create rows | completed | duration | ms | 98.6 | 24.7 | 72.4 | +26.57% |  |
| js-framework-benchmark | react-hooks-v19.2.8-keyed | replace all rows | completed | duration | ms | 105.7 | 35.1 | 68 | +47.01% |  |
| js-framework-benchmark | react-hooks-v19.2.8-keyed | partial update | completed | duration | ms | 58.4 | 11.7 | 42.8 | +34.25% |  |
| js-framework-benchmark | react-hooks-v19.2.8-keyed | select row | completed | duration | ms | 16.2 | 6.7 | 7.5 | +68.75% |  |
| js-framework-benchmark | react-hooks-v19.2.8-keyed | swap rows | completed | duration | ms | 367.6 | 55.4 | 306.9 | +745.06% |  |
| js-framework-benchmark | react-hooks-v19.2.8-keyed | remove row | completed | duration | ms | 46.7 | 2.8 | 41 | +45.48% |  |
| js-framework-benchmark | react-hooks-v19.2.8-keyed | create many rows | completed | duration | ms | 1175.8 | 405.6 | 738.4 | +52.09% |  |
| js-framework-benchmark | react-hooks-v19.2.8-keyed | append rows to large table | completed | duration | ms | 102.8 | 23.8 | 76.8 | +21.23% |  |
| js-framework-benchmark | react-hooks-v19.2.8-keyed | clear rows | completed | duration | ms | 57.5 | 52.2 | 3.1 | +94.26% |  |
| js-framework-benchmark | react-hooks-v19.2.8-keyed | ready memory | completed | memory | MB | 1.6 |  |  | +53.53% |  |
| js-framework-benchmark | react-hooks-v19.2.8-keyed | run memory | completed | memory | MB | 4.9 |  |  | +83.02% |  |
| js-framework-benchmark | react-hooks-v19.2.8-keyed | repeated clear memory | completed | memory | MB | 2.5 |  |  | +95.14% |  |
| js-framework-benchmark | react-hooks-v19.2.8-keyed | total byte weight | completed | size | kB | 51.4 |  |  | +1042.22% |  |
| js-framework-benchmark | solid-v1.9.14-keyed | create rows | completed | duration | ms | 77.9 | 7.8 | 68.5 | best |  |
| js-framework-benchmark | solid-v1.9.14-keyed | replace all rows | completed | duration | ms | 81.8 | 15.9 | 64.6 | +13.77% |  |
| js-framework-benchmark | solid-v1.9.14-keyed | partial update | completed | duration | ms | 52 | 3.3 | 44.2 | +19.54% |  |
| js-framework-benchmark | solid-v1.9.14-keyed | select row | completed | duration | ms | 11.5 | 2.1 | 7.8 | +19.79% |  |
| js-framework-benchmark | solid-v1.9.14-keyed | swap rows | completed | duration | ms | 61.9 | 2.2 | 53.6 | +42.3% |  |
| js-framework-benchmark | solid-v1.9.14-keyed | remove row | completed | duration | ms | 37.9 | 0.9 | 35 | +18.07% |  |
| js-framework-benchmark | solid-v1.9.14-keyed | create many rows | completed | duration | ms | 779.4 | 73.8 | 694.2 | +0.81% |  |
| js-framework-benchmark | solid-v1.9.14-keyed | append rows to large table | completed | duration | ms | 88 | 9.5 | 76.5 | +3.77% |  |
| js-framework-benchmark | solid-v1.9.14-keyed | clear rows | completed | duration | ms | 38.6 | 34 | 3.3 | +30.41% |  |
| js-framework-benchmark | solid-v1.9.14-keyed | ready memory | completed | memory | MB | 1.1 |  |  | best |  |
| js-framework-benchmark | solid-v1.9.14-keyed | run memory | completed | memory | MB | 3.1 |  |  | +17.39% |  |
| js-framework-benchmark | solid-v1.9.14-keyed | repeated clear memory | completed | memory | MB | 1.3 |  |  | best |  |
| js-framework-benchmark | solid-v1.9.14-keyed | total byte weight | completed | size | kB | 4.5 |  |  | best |  |
| js-framework-benchmark | svelte-v5.56.8-keyed | create rows | completed | duration | ms | 80.8 | 11.2 | 68.4 | +3.72% |  |
| js-framework-benchmark | svelte-v5.56.8-keyed | replace all rows | completed | duration | ms | 86.7 | 19.3 | 65.4 | +20.58% |  |
| js-framework-benchmark | svelte-v5.56.8-keyed | partial update | completed | duration | ms | 48.4 | 3.8 | 40.2 | +11.26% |  |
| js-framework-benchmark | svelte-v5.56.8-keyed | select row | completed | duration | ms | 16.2 | 6.8 | 7.7 | +68.75% |  |
| js-framework-benchmark | svelte-v5.56.8-keyed | swap rows | completed | duration | ms | 63.6 | 4.4 | 54.5 | +46.21% |  |
| js-framework-benchmark | svelte-v5.56.8-keyed | remove row | completed | duration | ms | 35.7 | 1.6 | 32.2 | +11.21% |  |
| js-framework-benchmark | svelte-v5.56.8-keyed | create many rows | completed | duration | ms | 799.7 | 98.8 | 688.4 | +3.44% |  |
| js-framework-benchmark | svelte-v5.56.8-keyed | append rows to large table | completed | duration | ms | 88.5 | 11 | 75 | +4.36% |  |
| js-framework-benchmark | svelte-v5.56.8-keyed | clear rows | completed | duration | ms | 36.4 | 31.1 | 3.4 | +22.97% |  |
| js-framework-benchmark | svelte-v5.56.8-keyed | ready memory | completed | memory | MB | 1.2 |  |  | +11.63% |  |
| js-framework-benchmark | svelte-v5.56.8-keyed | run memory | completed | memory | MB | 3.5 |  |  | +31.16% |  |
| js-framework-benchmark | svelte-v5.56.8-keyed | repeated clear memory | completed | memory | MB | 1.6 |  |  | +25.67% |  |
| js-framework-benchmark | svelte-v5.56.8-keyed | total byte weight | completed | size | kB | 14.3 |  |  | +217.78% |  |
| js-framework-benchmark | vue-v3.5.40-keyed | create rows | completed | duration | ms | 90.7 | 22.1 | 67 | +16.43% |  |
| js-framework-benchmark | vue-v3.5.40-keyed | replace all rows | completed | duration | ms | 97.1 | 27.4 | 67.3 | +35.05% |  |
| js-framework-benchmark | vue-v3.5.40-keyed | partial update | completed | duration | ms | 43.5 | 5.7 | 33.6 | best |  |
| js-framework-benchmark | vue-v3.5.40-keyed | select row | completed | duration | ms | 11.1 | 2.4 | 6.8 | +15.63% |  |
| js-framework-benchmark | vue-v3.5.40-keyed | swap rows | completed | duration | ms | 62.1 | 3.3 | 53.9 | +42.76% |  |
| js-framework-benchmark | vue-v3.5.40-keyed | remove row | completed | duration | ms | 49.7 | 5.4 | 41.2 | +54.83% |  |
| js-framework-benchmark | vue-v3.5.40-keyed | create many rows | completed | duration | ms | 900.2 | 173 | 718.2 | +16.44% |  |
| js-framework-benchmark | vue-v3.5.40-keyed | append rows to large table | completed | duration | ms | 97 | 18.1 | 76.7 | +14.39% |  |
| js-framework-benchmark | vue-v3.5.40-keyed | clear rows | completed | duration | ms | 46.1 | 41.2 | 3.2 | +55.74% |  |
| js-framework-benchmark | vue-v3.5.40-keyed | ready memory | completed | memory | MB | 1.3 |  |  | +25.98% |  |
| js-framework-benchmark | vue-v3.5.40-keyed | run memory | completed | memory | MB | 4.3 |  |  | +61.92% |  |
| js-framework-benchmark | vue-v3.5.40-keyed | repeated clear memory | completed | memory | MB | 1.7 |  |  | +33.69% |  |
| js-framework-benchmark | vue-v3.5.40-keyed | total byte weight | completed | size | kB | 23.3 |  |  | +417.78% |  |
