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

Framework order offset: 5
Framework run order: keyed/mreact-react-compat, keyed/mreact-react-compat-vdom, keyed/solid, keyed/mreact, keyed/marko, keyed/vue, keyed/svelte, keyed/angular-cf, keyed/react-hooks
Fixed diff anchor: react-hooks

## Unsupported Primitive Adapters

- qwik: krausest/js-framework-benchmark keyed/qwik currently fails the official isKeyed check and is categorized as non-keyed.
- qwik-v2: krausest/js-framework-benchmark does not currently provide a matching Qwik v2 keyed fixture.
- solid-v2: krausest/js-framework-benchmark does not currently provide a matching Solid v2 keyed fixture.

Raw JSON files are stored in `benchmarks/results/2026-09-06/002/js-framework-benchmark-results`.
Chrome trace files are stored in `benchmarks/results/2026-09-06/002/js-framework-benchmark-traces`.

## Rankings

Lower values are better for all js-framework-benchmark metrics reported here.

### create rows

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | **mreact-v0.0.211-local-keyed** | create rows | 66.1 | 6.3 | 59.1 | best |  | ms |
| 2 | marko-v6.3.49-keyed | create rows | 66.9 | 7.3 | 58.3 | +1.21% |  | ms |
| 3 | solid-v1.9.15-keyed | create rows | 67.6 | 7.1 | 59.5 | +2.27% |  | ms |
| 4 | svelte-v5.57.0-keyed | create rows | 69.4 | 9.7 | 58.5 | +4.99% |  | ms |
| 5 | vue-v3.5.42-keyed | create rows | 78.2 | 17.7 | 59.4 | +18.31% |  | ms |
| 6 | react-hooks-v19.2.8-keyed | create rows | 78.5 | 17.8 | 59.4 | +18.76% |  | ms |
| 7 | **mreact-react-compat-v0.0.211-local-keyed** | create rows | 79.5 | 18.2 | 59.9 | +20.27% |  | ms |
| 8 | angular-cf-v22.0.0-keyed | create rows | 94.8 | 16.6 | 61.3 | +43.42% |  | ms |
| 9 | **mreact-react-compat-vdom-v0.0.211-local-keyed** | create rows | 96.1 | 32.6 | 61.6 | +45.39% |  | ms |

### replace all rows

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | **mreact-v0.0.211-local-keyed** | replace all rows | 74 | 11.3 | 61.9 | best |  | ms |
| 2 | marko-v6.3.49-keyed | replace all rows | 75.9 | 14.7 | 60 | +2.57% |  | ms |
| 3 | solid-v1.9.15-keyed | replace all rows | 77.1 | 14.8 | 61 | +4.19% |  | ms |
| 4 | svelte-v5.57.0-keyed | replace all rows | 81.7 | 18.5 | 62.6 | +10.41% |  | ms |
| 5 | **mreact-react-compat-v0.0.211-local-keyed** | replace all rows | 88.7 | 26.8 | 61.4 | +19.86% |  | ms |
| 6 | vue-v3.5.42-keyed | replace all rows | 91.4 | 26.5 | 63.5 | +23.51% |  | ms |
| 7 | react-hooks-v19.2.8-keyed | replace all rows | 96.9 | 33.2 | 62.5 | +30.95% |  | ms |
| 8 | **mreact-react-compat-vdom-v0.0.211-local-keyed** | replace all rows | 106.8 | 44.8 | 61.3 | +44.32% |  | ms |
| 9 | angular-cf-v22.0.0-keyed | replace all rows | 108.3 | 30.8 | 62.1 | +46.35% |  | ms |

### partial update

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | angular-cf-v22.0.0-keyed | partial update | 43.7 | 3 | 39.4 | best |  | ms |
| 2 | solid-v1.9.15-keyed | partial update | 44.5 | 2.8 | 38.5 | +1.83% |  | ms |
| 3 | svelte-v5.57.0-keyed | partial update | 44.5 | 4.9 | 36 | +1.83% |  | ms |
| 4 | **mreact-v0.0.211-local-keyed** | partial update | 46.3 | 3.8 | 39.1 | +5.95% |  | ms |
| 5 | marko-v6.3.49-keyed | partial update | 46.8 | 3.4 | 40.5 | +7.09% |  | ms |
| 6 | vue-v3.5.42-keyed | partial update | 48.3 | 6.1 | 39 | +10.53% |  | ms |
| 7 | **mreact-react-compat-v0.0.211-local-keyed** | partial update | 52.3 | 7.3 | 41.7 | +19.68% |  | ms |
| 8 | react-hooks-v19.2.8-keyed | partial update | 53.8 | 11.3 | 39 | +23.11% |  | ms |
| 9 | **mreact-react-compat-vdom-v0.0.211-local-keyed** | partial update | 67.6 | 26.9 | 37.7 | +54.69% |  | ms |

### select row

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | **mreact-v0.0.211-local-keyed** | select row | 8.2 | 1 | 6 | best |  | ms |
| 2 | marko-v6.3.49-keyed | select row | 8.5 | 1.4 | 5.9 | +3.66% |  | ms |
| 3 | vue-v3.5.42-keyed | select row | 9.3 | 2.4 | 5.8 | +13.41% |  | ms |
| 4 | solid-v1.9.15-keyed | select row | 9.8 | 1.9 | 6.7 | +19.51% |  | ms |
| 5 | **mreact-react-compat-v0.0.211-local-keyed** | select row | 11.7 | 4.1 | 6.2 | +42.68% |  | ms |
| 6 | angular-cf-v22.0.0-keyed | select row | 12.4 | 4.1 | 7.1 | +51.22% |  | ms |
| 7 | svelte-v5.57.0-keyed | select row | 13.6 | 6.6 | 6 | +65.85% |  | ms |
| 8 | react-hooks-v19.2.8-keyed | select row | 14.3 | 6.9 | 6.3 | +74.39% |  | ms |
| 9 | **mreact-react-compat-vdom-v0.0.211-local-keyed** | select row | 15.8 | 7.7 | 6.3 | +92.68% |  | ms |

### swap rows

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | solid-v1.9.15-keyed | swap rows | 44.7 | 1.9 | 38.8 | best |  | ms |
| 2 | marko-v6.3.49-keyed | swap rows | 45.3 | 2.3 | 40.2 | +1.34% |  | ms |
| 3 | **mreact-v0.0.211-local-keyed** | swap rows | 45.4 | 2.1 | 40.4 | +1.57% |  | ms |
| 4 | angular-cf-v22.0.0-keyed | swap rows | 47 | 2.8 | 42.6 | +5.15% |  | ms |
| 5 | vue-v3.5.42-keyed | swap rows | 47.3 | 2.6 | 41.3 | +5.82% |  | ms |
| 6 | **mreact-react-compat-v0.0.211-local-keyed** | swap rows | 47.8 | 4.2 | 40.4 | +6.94% |  | ms |
| 7 | svelte-v5.57.0-keyed | swap rows | 51.4 | 3.8 | 44.1 | +14.99% |  | ms |
| 8 | **mreact-react-compat-vdom-v0.0.211-local-keyed** | swap rows | 66.4 | 19.5 | 42.6 | +48.55% |  | ms |
| 9 | react-hooks-v19.2.8-keyed | swap rows | 316.1 | 48.8 | 262.8 | +607.16% |  | ms |

### remove row

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | angular-cf-v22.0.0-keyed | remove row | 30.2 | 1.6 | 27.9 | best |  | ms |
| 2 | **mreact-v0.0.211-local-keyed** | remove row | 33.6 | 1.1 | 30.7 | +11.26% |  | ms |
| 3 | solid-v1.9.15-keyed | remove row | 34.8 | 0.8 | 32.2 | +15.23% |  | ms |
| 4 | marko-v6.3.49-keyed | remove row | 35.1 | 1.2 | 32.2 | +16.23% |  | ms |
| 5 | **mreact-react-compat-v0.0.211-local-keyed** | remove row | 35.8 | 1.8 | 32.4 | +18.54% |  | ms |
| 6 | react-hooks-v19.2.8-keyed | remove row | 36.8 | 2.7 | 32.1 | +21.85% |  | ms |
| 7 | svelte-v5.57.0-keyed | remove row | 36.8 | 1.6 | 33.5 | +21.85% |  | ms |
| 8 | **mreact-react-compat-vdom-v0.0.211-local-keyed** | remove row | 39.8 | 6.1 | 32.5 | +31.79% |  | ms |
| 9 | vue-v3.5.42-keyed | remove row | 39.9 | 5.1 | 32.6 | +32.12% |  | ms |

### create many rows

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | marko-v6.3.49-keyed | create many rows | 751.3 | 80.1 | 663.4 | best |  | ms |
| 2 | **mreact-v0.0.211-local-keyed** | create many rows | 751.8 | 64 | 678.7 | +0.07% |  | ms |
| 3 | solid-v1.9.15-keyed | create many rows | 764.7 | 70.9 | 685.5 | +1.78% |  | ms |
| 4 | svelte-v5.57.0-keyed | create many rows | 780.2 | 88.1 | 681.7 | +3.85% |  | ms |
| 5 | **mreact-react-compat-v0.0.211-local-keyed** | create many rows | 859.2 | 156.7 | 696.8 | +14.36% |  | ms |
| 6 | vue-v3.5.42-keyed | create many rows | 880.9 | 159 | 712.9 | +17.25% |  | ms |
| 7 | angular-cf-v22.0.0-keyed | create many rows | 965 | 180.8 | 700.8 | +28.44% |  | ms |
| 8 | **mreact-react-compat-vdom-v0.0.211-local-keyed** | create many rows | 982.4 | 289.2 | 684 | +30.76% |  | ms |
| 9 | react-hooks-v19.2.8-keyed | create many rows | 1141.8 | 404.8 | 727.3 | +51.98% |  | ms |

### append rows to large table

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | solid-v1.9.15-keyed | append rows to large table | 79.6 | 7.8 | 69.8 | best |  | ms |
| 2 | **mreact-v0.0.211-local-keyed** | append rows to large table | 80.3 | 7.3 | 71.2 | +0.88% |  | ms |
| 3 | marko-v6.3.49-keyed | append rows to large table | 82.4 | 9.3 | 71.1 | +3.52% |  | ms |
| 4 | svelte-v5.57.0-keyed | append rows to large table | 82.9 | 10.3 | 69.5 | +4.15% |  | ms |
| 5 | **mreact-react-compat-v0.0.211-local-keyed** | append rows to large table | 88 | 17.9 | 68.1 | +10.55% |  | ms |
| 6 | vue-v3.5.42-keyed | append rows to large table | 90.1 | 16.6 | 71.5 | +13.19% |  | ms |
| 7 | react-hooks-v19.2.8-keyed | append rows to large table | 91.5 | 20.1 | 69.9 | +14.95% |  | ms |
| 8 | angular-cf-v22.0.0-keyed | append rows to large table | 104.4 | 16.8 | 73.4 | +31.16% |  | ms |
| 9 | **mreact-react-compat-vdom-v0.0.211-local-keyed** | append rows to large table | 111 | 40 | 68.9 | +39.45% |  | ms |

### clear rows

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | marko-v6.3.49-keyed | clear rows | 28.4 | 24.7 | 3 | best |  | ms |
| 2 | **mreact-v0.0.211-local-keyed** | clear rows | 31.4 | 26.7 | 3 | +10.56% |  | ms |
| 3 | svelte-v5.57.0-keyed | clear rows | 32.2 | 28 | 3 | +13.38% |  | ms |
| 4 | solid-v1.9.15-keyed | clear rows | 35.6 | 31 | 3.1 | +25.35% |  | ms |
| 5 | **mreact-react-compat-vdom-v0.0.211-local-keyed** | clear rows | 42.8 | 37.1 | 3.2 | +50.7% |  | ms |
| 6 | vue-v3.5.42-keyed | clear rows | 42.9 | 38.5 | 3.2 | +51.06% |  | ms |
| 7 | **mreact-react-compat-v0.0.211-local-keyed** | clear rows | 43.3 | 38.3 | 3.1 | +52.46% |  | ms |
| 8 | react-hooks-v19.2.8-keyed | clear rows | 57.6 | 52.4 | 3.5 | +102.82% |  | ms |
| 9 | angular-cf-v22.0.0-keyed | clear rows | 60.3 | 55.6 | 3.3 | +112.32% |  | ms |

### ready memory

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | marko-v6.3.49-keyed | ready memory | 1 |  |  | best |  | MB |
| 2 | **mreact-v0.0.211-local-keyed** | ready memory | 1 |  |  | +0.22% |  | MB |
| 3 | solid-v1.9.15-keyed | ready memory | 1 |  |  | +0.68% |  | MB |
| 4 | svelte-v5.57.0-keyed | ready memory | 1.2 |  |  | +12.11% |  | MB |
| 5 | vue-v3.5.42-keyed | ready memory | 1.3 |  |  | +24.27% |  | MB |
| 6 | **mreact-react-compat-vdom-v0.0.211-local-keyed** | ready memory | 1.4 |  |  | +33.54% |  | MB |
| 7 | **mreact-react-compat-v0.0.211-local-keyed** | ready memory | 1.5 |  |  | +43.35% |  | MB |
| 8 | react-hooks-v19.2.8-keyed | ready memory | 1.7 |  |  | +59.06% |  | MB |
| 9 | angular-cf-v22.0.0-keyed | ready memory | 2.1 |  |  | +98.61% |  | MB |

### run memory

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | **mreact-v0.0.211-local-keyed** | run memory | 2.7 |  |  | best |  | MB |
| 2 | marko-v6.3.49-keyed | run memory | 2.7 |  |  | +1.45% |  | MB |
| 3 | solid-v1.9.15-keyed | run memory | 3.2 |  |  | +17.18% |  | MB |
| 4 | svelte-v5.57.0-keyed | run memory | 3.5 |  |  | +29.61% |  | MB |
| 5 | vue-v3.5.42-keyed | run memory | 4.4 |  |  | +64.66% |  | MB |
| 6 | **mreact-react-compat-v0.0.211-local-keyed** | run memory | 4.6 |  |  | +71.27% |  | MB |
| 7 | react-hooks-v19.2.8-keyed | run memory | 4.9 |  |  | +80.84% |  | MB |
| 8 | **mreact-react-compat-vdom-v0.0.211-local-keyed** | run memory | 5 |  |  | +85.59% |  | MB |
| 9 | angular-cf-v22.0.0-keyed | run memory | 5.1 |  |  | +88.24% |  | MB |

### repeated clear memory

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | solid-v1.9.15-keyed | repeated clear memory | 1.3 |  |  | best |  | MB |
| 2 | marko-v6.3.49-keyed | repeated clear memory | 1.4 |  |  | +8.04% |  | MB |
| 3 | **mreact-v0.0.211-local-keyed** | repeated clear memory | 1.4 |  |  | +8.32% |  | MB |
| 4 | svelte-v5.57.0-keyed | repeated clear memory | 1.5 |  |  | +20.82% |  | MB |
| 5 | vue-v3.5.42-keyed | repeated clear memory | 1.7 |  |  | +30.04% |  | MB |
| 6 | **mreact-react-compat-v0.0.211-local-keyed** | repeated clear memory | 1.9 |  |  | +45.07% |  | MB |
| 7 | react-hooks-v19.2.8-keyed | repeated clear memory | 2.4 |  |  | +89.05% |  | MB |
| 8 | **mreact-react-compat-vdom-v0.0.211-local-keyed** | repeated clear memory | 2.6 |  |  | +102.9% |  | MB |
| 9 | angular-cf-v22.0.0-keyed | repeated clear memory | 2.7 |  |  | +112.27% |  | MB |

### total byte weight

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | solid-v1.9.15-keyed | total byte weight | 4.5 |  |  | best |  | kB |
| 2 | marko-v6.3.49-keyed | total byte weight | 4.8 |  |  | +6.67% |  | kB |
| 3 | **mreact-v0.0.211-local-keyed** | total byte weight | 9.9 |  |  | +120% |  | kB |
| 4 | svelte-v5.57.0-keyed | total byte weight | 11.5 |  |  | +155.56% |  | kB |
| 5 | vue-v3.5.42-keyed | total byte weight | 23.5 |  |  | +422.22% |  | kB |
| 6 | **mreact-react-compat-vdom-v0.0.211-local-keyed** | total byte weight | 35.1 |  |  | +680% |  | kB |
| 7 | **mreact-react-compat-v0.0.211-local-keyed** | total byte weight | 42.4 |  |  | +842.22% |  | kB |
| 8 | angular-cf-v22.0.0-keyed | total byte weight | 44.5 |  |  | +888.89% |  | kB |
| 9 | react-hooks-v19.2.8-keyed | total byte weight | 51.4 |  |  | +1042.22% |  | kB |

## Results

| suite | framework | case | status | metric | unit | value | script | paint | diff vs 1st | diff vs react-hooks |
| --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | create rows | completed | duration | ms | 94.8 | 16.6 | 61.3 | +43.42% |  |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | replace all rows | completed | duration | ms | 108.3 | 30.8 | 62.1 | +46.35% |  |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | partial update | completed | duration | ms | 43.7 | 3 | 39.4 | best |  |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | select row | completed | duration | ms | 12.4 | 4.1 | 7.1 | +51.22% |  |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | swap rows | completed | duration | ms | 47 | 2.8 | 42.6 | +5.15% |  |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | remove row | completed | duration | ms | 30.2 | 1.6 | 27.9 | best |  |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | create many rows | completed | duration | ms | 965 | 180.8 | 700.8 | +28.44% |  |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | append rows to large table | completed | duration | ms | 104.4 | 16.8 | 73.4 | +31.16% |  |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | clear rows | completed | duration | ms | 60.3 | 55.6 | 3.3 | +112.32% |  |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | ready memory | completed | memory | MB | 2.1 |  |  | +98.61% |  |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | run memory | completed | memory | MB | 5.1 |  |  | +88.24% |  |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | repeated clear memory | completed | memory | MB | 2.7 |  |  | +112.27% |  |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | total byte weight | completed | size | kB | 44.5 |  |  | +888.89% |  |
| js-framework-benchmark | marko-v6.3.49-keyed | create rows | completed | duration | ms | 66.9 | 7.3 | 58.3 | +1.21% |  |
| js-framework-benchmark | marko-v6.3.49-keyed | replace all rows | completed | duration | ms | 75.9 | 14.7 | 60 | +2.57% |  |
| js-framework-benchmark | marko-v6.3.49-keyed | partial update | completed | duration | ms | 46.8 | 3.4 | 40.5 | +7.09% |  |
| js-framework-benchmark | marko-v6.3.49-keyed | select row | completed | duration | ms | 8.5 | 1.4 | 5.9 | +3.66% |  |
| js-framework-benchmark | marko-v6.3.49-keyed | swap rows | completed | duration | ms | 45.3 | 2.3 | 40.2 | +1.34% |  |
| js-framework-benchmark | marko-v6.3.49-keyed | remove row | completed | duration | ms | 35.1 | 1.2 | 32.2 | +16.23% |  |
| js-framework-benchmark | marko-v6.3.49-keyed | create many rows | completed | duration | ms | 751.3 | 80.1 | 663.4 | best |  |
| js-framework-benchmark | marko-v6.3.49-keyed | append rows to large table | completed | duration | ms | 82.4 | 9.3 | 71.1 | +3.52% |  |
| js-framework-benchmark | marko-v6.3.49-keyed | clear rows | completed | duration | ms | 28.4 | 24.7 | 3 | best |  |
| js-framework-benchmark | marko-v6.3.49-keyed | ready memory | completed | memory | MB | 1 |  |  | best |  |
| js-framework-benchmark | marko-v6.3.49-keyed | run memory | completed | memory | MB | 2.7 |  |  | +1.45% |  |
| js-framework-benchmark | marko-v6.3.49-keyed | repeated clear memory | completed | memory | MB | 1.4 |  |  | +8.04% |  |
| js-framework-benchmark | marko-v6.3.49-keyed | total byte weight | completed | size | kB | 4.8 |  |  | +6.67% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.211-local-keyed** | create rows | completed | duration | ms | 79.5 | 18.2 | 59.9 | +20.27% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.211-local-keyed** | replace all rows | completed | duration | ms | 88.7 | 26.8 | 61.4 | +19.86% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.211-local-keyed** | partial update | completed | duration | ms | 52.3 | 7.3 | 41.7 | +19.68% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.211-local-keyed** | select row | completed | duration | ms | 11.7 | 4.1 | 6.2 | +42.68% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.211-local-keyed** | swap rows | completed | duration | ms | 47.8 | 4.2 | 40.4 | +6.94% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.211-local-keyed** | remove row | completed | duration | ms | 35.8 | 1.8 | 32.4 | +18.54% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.211-local-keyed** | create many rows | completed | duration | ms | 859.2 | 156.7 | 696.8 | +14.36% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.211-local-keyed** | append rows to large table | completed | duration | ms | 88 | 17.9 | 68.1 | +10.55% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.211-local-keyed** | clear rows | completed | duration | ms | 43.3 | 38.3 | 3.1 | +52.46% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.211-local-keyed** | ready memory | completed | memory | MB | 1.5 |  |  | +43.35% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.211-local-keyed** | run memory | completed | memory | MB | 4.6 |  |  | +71.27% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.211-local-keyed** | repeated clear memory | completed | memory | MB | 1.9 |  |  | +45.07% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.211-local-keyed** | total byte weight | completed | size | kB | 42.4 |  |  | +842.22% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.211-local-keyed** | create rows | completed | duration | ms | 96.1 | 32.6 | 61.6 | +45.39% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.211-local-keyed** | replace all rows | completed | duration | ms | 106.8 | 44.8 | 61.3 | +44.32% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.211-local-keyed** | partial update | completed | duration | ms | 67.6 | 26.9 | 37.7 | +54.69% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.211-local-keyed** | select row | completed | duration | ms | 15.8 | 7.7 | 6.3 | +92.68% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.211-local-keyed** | swap rows | completed | duration | ms | 66.4 | 19.5 | 42.6 | +48.55% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.211-local-keyed** | remove row | completed | duration | ms | 39.8 | 6.1 | 32.5 | +31.79% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.211-local-keyed** | create many rows | completed | duration | ms | 982.4 | 289.2 | 684 | +30.76% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.211-local-keyed** | append rows to large table | completed | duration | ms | 111 | 40 | 68.9 | +39.45% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.211-local-keyed** | clear rows | completed | duration | ms | 42.8 | 37.1 | 3.2 | +50.7% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.211-local-keyed** | ready memory | completed | memory | MB | 1.4 |  |  | +33.54% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.211-local-keyed** | run memory | completed | memory | MB | 5 |  |  | +85.59% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.211-local-keyed** | repeated clear memory | completed | memory | MB | 2.6 |  |  | +102.9% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.211-local-keyed** | total byte weight | completed | size | kB | 35.1 |  |  | +680% |  |
| js-framework-benchmark | **mreact-v0.0.211-local-keyed** | create rows | completed | duration | ms | 66.1 | 6.3 | 59.1 | best |  |
| js-framework-benchmark | **mreact-v0.0.211-local-keyed** | replace all rows | completed | duration | ms | 74 | 11.3 | 61.9 | best |  |
| js-framework-benchmark | **mreact-v0.0.211-local-keyed** | partial update | completed | duration | ms | 46.3 | 3.8 | 39.1 | +5.95% |  |
| js-framework-benchmark | **mreact-v0.0.211-local-keyed** | select row | completed | duration | ms | 8.2 | 1 | 6 | best |  |
| js-framework-benchmark | **mreact-v0.0.211-local-keyed** | swap rows | completed | duration | ms | 45.4 | 2.1 | 40.4 | +1.57% |  |
| js-framework-benchmark | **mreact-v0.0.211-local-keyed** | remove row | completed | duration | ms | 33.6 | 1.1 | 30.7 | +11.26% |  |
| js-framework-benchmark | **mreact-v0.0.211-local-keyed** | create many rows | completed | duration | ms | 751.8 | 64 | 678.7 | +0.07% |  |
| js-framework-benchmark | **mreact-v0.0.211-local-keyed** | append rows to large table | completed | duration | ms | 80.3 | 7.3 | 71.2 | +0.88% |  |
| js-framework-benchmark | **mreact-v0.0.211-local-keyed** | clear rows | completed | duration | ms | 31.4 | 26.7 | 3 | +10.56% |  |
| js-framework-benchmark | **mreact-v0.0.211-local-keyed** | ready memory | completed | memory | MB | 1 |  |  | +0.22% |  |
| js-framework-benchmark | **mreact-v0.0.211-local-keyed** | run memory | completed | memory | MB | 2.7 |  |  | best |  |
| js-framework-benchmark | **mreact-v0.0.211-local-keyed** | repeated clear memory | completed | memory | MB | 1.4 |  |  | +8.32% |  |
| js-framework-benchmark | **mreact-v0.0.211-local-keyed** | total byte weight | completed | size | kB | 9.9 |  |  | +120% |  |
| js-framework-benchmark | react-hooks-v19.2.8-keyed | create rows | completed | duration | ms | 78.5 | 17.8 | 59.4 | +18.76% |  |
| js-framework-benchmark | react-hooks-v19.2.8-keyed | replace all rows | completed | duration | ms | 96.9 | 33.2 | 62.5 | +30.95% |  |
| js-framework-benchmark | react-hooks-v19.2.8-keyed | partial update | completed | duration | ms | 53.8 | 11.3 | 39 | +23.11% |  |
| js-framework-benchmark | react-hooks-v19.2.8-keyed | select row | completed | duration | ms | 14.3 | 6.9 | 6.3 | +74.39% |  |
| js-framework-benchmark | react-hooks-v19.2.8-keyed | swap rows | completed | duration | ms | 316.1 | 48.8 | 262.8 | +607.16% |  |
| js-framework-benchmark | react-hooks-v19.2.8-keyed | remove row | completed | duration | ms | 36.8 | 2.7 | 32.1 | +21.85% |  |
| js-framework-benchmark | react-hooks-v19.2.8-keyed | create many rows | completed | duration | ms | 1141.8 | 404.8 | 727.3 | +51.98% |  |
| js-framework-benchmark | react-hooks-v19.2.8-keyed | append rows to large table | completed | duration | ms | 91.5 | 20.1 | 69.9 | +14.95% |  |
| js-framework-benchmark | react-hooks-v19.2.8-keyed | clear rows | completed | duration | ms | 57.6 | 52.4 | 3.5 | +102.82% |  |
| js-framework-benchmark | react-hooks-v19.2.8-keyed | ready memory | completed | memory | MB | 1.7 |  |  | +59.06% |  |
| js-framework-benchmark | react-hooks-v19.2.8-keyed | run memory | completed | memory | MB | 4.9 |  |  | +80.84% |  |
| js-framework-benchmark | react-hooks-v19.2.8-keyed | repeated clear memory | completed | memory | MB | 2.4 |  |  | +89.05% |  |
| js-framework-benchmark | react-hooks-v19.2.8-keyed | total byte weight | completed | size | kB | 51.4 |  |  | +1042.22% |  |
| js-framework-benchmark | solid-v1.9.15-keyed | create rows | completed | duration | ms | 67.6 | 7.1 | 59.5 | +2.27% |  |
| js-framework-benchmark | solid-v1.9.15-keyed | replace all rows | completed | duration | ms | 77.1 | 14.8 | 61 | +4.19% |  |
| js-framework-benchmark | solid-v1.9.15-keyed | partial update | completed | duration | ms | 44.5 | 2.8 | 38.5 | +1.83% |  |
| js-framework-benchmark | solid-v1.9.15-keyed | select row | completed | duration | ms | 9.8 | 1.9 | 6.7 | +19.51% |  |
| js-framework-benchmark | solid-v1.9.15-keyed | swap rows | completed | duration | ms | 44.7 | 1.9 | 38.8 | best |  |
| js-framework-benchmark | solid-v1.9.15-keyed | remove row | completed | duration | ms | 34.8 | 0.8 | 32.2 | +15.23% |  |
| js-framework-benchmark | solid-v1.9.15-keyed | create many rows | completed | duration | ms | 764.7 | 70.9 | 685.5 | +1.78% |  |
| js-framework-benchmark | solid-v1.9.15-keyed | append rows to large table | completed | duration | ms | 79.6 | 7.8 | 69.8 | best |  |
| js-framework-benchmark | solid-v1.9.15-keyed | clear rows | completed | duration | ms | 35.6 | 31 | 3.1 | +25.35% |  |
| js-framework-benchmark | solid-v1.9.15-keyed | ready memory | completed | memory | MB | 1 |  |  | +0.68% |  |
| js-framework-benchmark | solid-v1.9.15-keyed | run memory | completed | memory | MB | 3.2 |  |  | +17.18% |  |
| js-framework-benchmark | solid-v1.9.15-keyed | repeated clear memory | completed | memory | MB | 1.3 |  |  | best |  |
| js-framework-benchmark | solid-v1.9.15-keyed | total byte weight | completed | size | kB | 4.5 |  |  | best |  |
| js-framework-benchmark | svelte-v5.57.0-keyed | create rows | completed | duration | ms | 69.4 | 9.7 | 58.5 | +4.99% |  |
| js-framework-benchmark | svelte-v5.57.0-keyed | replace all rows | completed | duration | ms | 81.7 | 18.5 | 62.6 | +10.41% |  |
| js-framework-benchmark | svelte-v5.57.0-keyed | partial update | completed | duration | ms | 44.5 | 4.9 | 36 | +1.83% |  |
| js-framework-benchmark | svelte-v5.57.0-keyed | select row | completed | duration | ms | 13.6 | 6.6 | 6 | +65.85% |  |
| js-framework-benchmark | svelte-v5.57.0-keyed | swap rows | completed | duration | ms | 51.4 | 3.8 | 44.1 | +14.99% |  |
| js-framework-benchmark | svelte-v5.57.0-keyed | remove row | completed | duration | ms | 36.8 | 1.6 | 33.5 | +21.85% |  |
| js-framework-benchmark | svelte-v5.57.0-keyed | create many rows | completed | duration | ms | 780.2 | 88.1 | 681.7 | +3.85% |  |
| js-framework-benchmark | svelte-v5.57.0-keyed | append rows to large table | completed | duration | ms | 82.9 | 10.3 | 69.5 | +4.15% |  |
| js-framework-benchmark | svelte-v5.57.0-keyed | clear rows | completed | duration | ms | 32.2 | 28 | 3 | +13.38% |  |
| js-framework-benchmark | svelte-v5.57.0-keyed | ready memory | completed | memory | MB | 1.2 |  |  | +12.11% |  |
| js-framework-benchmark | svelte-v5.57.0-keyed | run memory | completed | memory | MB | 3.5 |  |  | +29.61% |  |
| js-framework-benchmark | svelte-v5.57.0-keyed | repeated clear memory | completed | memory | MB | 1.5 |  |  | +20.82% |  |
| js-framework-benchmark | svelte-v5.57.0-keyed | total byte weight | completed | size | kB | 11.5 |  |  | +155.56% |  |
| js-framework-benchmark | vue-v3.5.42-keyed | create rows | completed | duration | ms | 78.2 | 17.7 | 59.4 | +18.31% |  |
| js-framework-benchmark | vue-v3.5.42-keyed | replace all rows | completed | duration | ms | 91.4 | 26.5 | 63.5 | +23.51% |  |
| js-framework-benchmark | vue-v3.5.42-keyed | partial update | completed | duration | ms | 48.3 | 6.1 | 39 | +10.53% |  |
| js-framework-benchmark | vue-v3.5.42-keyed | select row | completed | duration | ms | 9.3 | 2.4 | 5.8 | +13.41% |  |
| js-framework-benchmark | vue-v3.5.42-keyed | swap rows | completed | duration | ms | 47.3 | 2.6 | 41.3 | +5.82% |  |
| js-framework-benchmark | vue-v3.5.42-keyed | remove row | completed | duration | ms | 39.9 | 5.1 | 32.6 | +32.12% |  |
| js-framework-benchmark | vue-v3.5.42-keyed | create many rows | completed | duration | ms | 880.9 | 159 | 712.9 | +17.25% |  |
| js-framework-benchmark | vue-v3.5.42-keyed | append rows to large table | completed | duration | ms | 90.1 | 16.6 | 71.5 | +13.19% |  |
| js-framework-benchmark | vue-v3.5.42-keyed | clear rows | completed | duration | ms | 42.9 | 38.5 | 3.2 | +51.06% |  |
| js-framework-benchmark | vue-v3.5.42-keyed | ready memory | completed | memory | MB | 1.3 |  |  | +24.27% |  |
| js-framework-benchmark | vue-v3.5.42-keyed | run memory | completed | memory | MB | 4.4 |  |  | +64.66% |  |
| js-framework-benchmark | vue-v3.5.42-keyed | repeated clear memory | completed | memory | MB | 1.7 |  |  | +30.04% |  |
| js-framework-benchmark | vue-v3.5.42-keyed | total byte weight | completed | size | kB | 23.5 |  |  | +422.22% |  |
