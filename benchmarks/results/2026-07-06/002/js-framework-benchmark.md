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

Raw JSON files are stored in `benchmarks/results/2026-07-06/002/js-framework-benchmark-results`.
Chrome trace files are stored in `benchmarks/results/2026-07-06/002/js-framework-benchmark-traces`.

## Rankings

Lower values are better for all js-framework-benchmark metrics reported here.

### create rows

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | **mreact-v0.0.187-local-keyed** | create rows | 67.3 | 7.6 | 58.6 | best |  | ms |
| 2 | solid-v1.9.14-keyed | create rows | 67.4 | 7.2 | 59 | +0.15% |  | ms |
| 3 | marko-v6.2.2-keyed | create rows | 68.3 | 7.5 | 59.5 | +1.49% |  | ms |
| 4 | svelte-v5.56.4-keyed | create rows | 72.8 | 10.7 | 59.6 | +8.17% |  | ms |
| 5 | vue-v3.6.0-beta.17-keyed | create rows | 81 | 19.6 | 60 | +20.36% |  | ms |
| 6 | **mreact-react-compat-v0.0.187-local-keyed** | create rows | 83 | 21.8 | 60 | +23.33% |  | ms |
| 7 | react-hooks-v19.2.7-keyed | create rows | 83.4 | 22.1 | 60.5 | +23.92% |  | ms |
| 8 | **mreact-react-compat-vdom-v0.0.187-local-keyed** | create rows | 94.9 | 35.2 | 58.9 | +41.01% |  | ms |
| 9 | angular-cf-v22.0.0-keyed | create rows | 95.5 | 18.2 | 61 | +41.9% |  | ms |

### replace all rows

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | solid-v1.9.14-keyed | replace all rows | 73.2 | 13.6 | 58.6 | best |  | ms |
| 2 | **mreact-v0.0.187-local-keyed** | replace all rows | 75.2 | 13.2 | 59.8 | +2.73% |  | ms |
| 3 | marko-v6.2.2-keyed | replace all rows | 75.8 | 14.1 | 60.4 | +3.55% |  | ms |
| 4 | svelte-v5.56.4-keyed | replace all rows | 78 | 16.6 | 59.9 | +6.56% |  | ms |
| 5 | **mreact-react-compat-v0.0.187-local-keyed** | replace all rows | 84.3 | 23 | 60.1 | +15.16% |  | ms |
| 6 | vue-v3.6.0-beta.17-keyed | replace all rows | 86.4 | 23.5 | 61.5 | +18.03% |  | ms |
| 7 | react-hooks-v19.2.7-keyed | replace all rows | 94.3 | 31.6 | 61.6 | +28.83% |  | ms |
| 8 | **mreact-react-compat-vdom-v0.0.187-local-keyed** | replace all rows | 100.8 | 40 | 60.1 | +37.7% |  | ms |
| 9 | angular-cf-v22.0.0-keyed | replace all rows | 107.8 | 28.2 | 63.8 | +47.27% |  | ms |

### partial update

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | angular-cf-v22.0.0-keyed | partial update | 38.8 | 3 | 34.4 | best |  | ms |
| 2 | **mreact-v0.0.187-local-keyed** | partial update | 39.9 | 1.7 | 33.9 | +2.84% |  | ms |
| 3 | solid-v1.9.14-keyed | partial update | 42.2 | 2.4 | 34.7 | +8.76% |  | ms |
| 4 | svelte-v5.56.4-keyed | partial update | 42.4 | 3.6 | 33.9 | +9.28% |  | ms |
| 5 | marko-v6.2.2-keyed | partial update | 42.5 | 4.1 | 34.4 | +9.54% |  | ms |
| 6 | vue-v3.6.0-beta.17-keyed | partial update | 46.2 | 6.5 | 35.8 | +19.07% |  | ms |
| 7 | **mreact-react-compat-v0.0.187-local-keyed** | partial update | 46.6 | 8.6 | 33.5 | +20.1% |  | ms |
| 8 | react-hooks-v19.2.7-keyed | partial update | 49.8 | 10.2 | 34.3 | +28.35% |  | ms |
| 9 | **mreact-react-compat-vdom-v0.0.187-local-keyed** | partial update | 59.2 | 20.8 | 34.4 | +52.58% |  | ms |

### select row

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | marko-v6.2.2-keyed | select row | 9.2 | 0.9 | 6.6 | best |  | ms |
| 2 | **mreact-v0.0.187-local-keyed** | select row | 9.3 | 0.9 | 6.9 | +1.09% |  | ms |
| 3 | solid-v1.9.14-keyed | select row | 10.1 | 2 | 6.2 | +9.78% |  | ms |
| 4 | vue-v3.6.0-beta.17-keyed | select row | 11.1 | 2.7 | 6.5 | +20.65% |  | ms |
| 5 | angular-cf-v22.0.0-keyed | select row | 13 | 4 | 7.4 | +41.3% |  | ms |
| 6 | **mreact-react-compat-v0.0.187-local-keyed** | select row | 14.5 | 5.9 | 6.6 | +57.61% |  | ms |
| 7 | svelte-v5.56.4-keyed | select row | 14.6 | 6 | 6.4 | +58.7% |  | ms |
| 8 | react-hooks-v19.2.7-keyed | select row | 14.7 | 6 | 6.8 | +59.78% |  | ms |
| 9 | **mreact-react-compat-vdom-v0.0.187-local-keyed** | select row | 15 | 6.8 | 6.5 | +63.04% |  | ms |

### swap rows

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | marko-v6.2.2-keyed | swap rows | 45 | 2.4 | 38.3 | best |  | ms |
| 2 | angular-cf-v22.0.0-keyed | swap rows | 45.9 | 3 | 39.7 | +2% |  | ms |
| 3 | **mreact-v0.0.187-local-keyed** | swap rows | 47.4 | 1.7 | 41.3 | +5.33% |  | ms |
| 4 | vue-v3.6.0-beta.17-keyed | swap rows | 47.6 | 3.2 | 39.9 | +5.78% |  | ms |
| 5 | solid-v1.9.14-keyed | swap rows | 47.8 | 2.1 | 40.6 | +6.22% |  | ms |
| 6 | svelte-v5.56.4-keyed | swap rows | 49.2 | 3.9 | 40.7 | +9.33% |  | ms |
| 7 | **mreact-react-compat-v0.0.187-local-keyed** | swap rows | 54.8 | 10.4 | 40 | +21.78% |  | ms |
| 8 | **mreact-react-compat-vdom-v0.0.187-local-keyed** | swap rows | 64.1 | 17.9 | 41.8 | +42.44% |  | ms |
| 9 | react-hooks-v19.2.7-keyed | swap rows | 309.4 | 42.4 | 260.3 | +587.56% |  | ms |

### remove row

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | angular-cf-v22.0.0-keyed | remove row | 34.4 | 1.8 | 32 | best |  | ms |
| 2 | **mreact-v0.0.187-local-keyed** | remove row | 34.9 | 0.9 | 31.9 | +1.45% |  | ms |
| 3 | solid-v1.9.14-keyed | remove row | 35 | 0.7 | 31.9 | +1.74% |  | ms |
| 4 | marko-v6.2.2-keyed | remove row | 35.4 | 1.2 | 32.1 | +2.91% |  | ms |
| 5 | svelte-v5.56.4-keyed | remove row | 36.4 | 1.6 | 32.5 | +5.81% |  | ms |
| 6 | **mreact-react-compat-v0.0.187-local-keyed** | remove row | 37.8 | 2.9 | 32.5 | +9.88% |  | ms |
| 7 | react-hooks-v19.2.7-keyed | remove row | 38.2 | 2.7 | 33 | +11.05% |  | ms |
| 8 | **mreact-react-compat-vdom-v0.0.187-local-keyed** | remove row | 40.2 | 4.8 | 32.7 | +16.86% |  | ms |
| 9 | vue-v3.6.0-beta.17-keyed | remove row | 40.8 | 4.9 | 32.8 | +18.6% |  | ms |

### create many rows

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | marko-v6.2.2-keyed | create many rows | 723.2 | 82.2 | 632 | best |  | ms |
| 2 | **mreact-v0.0.187-local-keyed** | create many rows | 725.4 | 70.7 | 645.2 | +0.3% |  | ms |
| 3 | solid-v1.9.14-keyed | create many rows | 726.6 | 73.7 | 643.8 | +0.47% |  | ms |
| 4 | svelte-v5.56.4-keyed | create many rows | 742 | 93.7 | 634.6 | +2.6% |  | ms |
| 5 | vue-v3.6.0-beta.17-keyed | create many rows | 829.1 | 159.6 | 660.6 | +14.64% |  | ms |
| 6 | **mreact-react-compat-v0.0.187-local-keyed** | create many rows | 836.4 | 175.1 | 645.6 | +15.65% |  | ms |
| 7 | **mreact-react-compat-vdom-v0.0.187-local-keyed** | create many rows | 900.2 | 280.8 | 623.7 | +24.47% |  | ms |
| 8 | angular-cf-v22.0.0-keyed | create many rows | 937.4 | 193.1 | 666.6 | +29.62% |  | ms |
| 9 | react-hooks-v19.2.7-keyed | create many rows | 1113.8 | 443.9 | 658.7 | +54.01% |  | ms |

### append rows to large table

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | solid-v1.9.14-keyed | append rows to large table | 78.6 | 9 | 67.5 | best |  | ms |
| 2 | **mreact-v0.0.187-local-keyed** | append rows to large table | 78.7 | 8 | 68.7 | +0.13% |  | ms |
| 3 | marko-v6.2.2-keyed | append rows to large table | 79.2 | 9 | 68 | +0.76% |  | ms |
| 4 | svelte-v5.56.4-keyed | append rows to large table | 80.9 | 10.9 | 68.2 | +2.93% |  | ms |
| 5 | vue-v3.6.0-beta.17-keyed | append rows to large table | 86.1 | 16.4 | 67.4 | +9.54% |  | ms |
| 6 | **mreact-react-compat-v0.0.187-local-keyed** | append rows to large table | 90.3 | 20.7 | 67.8 | +14.89% |  | ms |
| 7 | react-hooks-v19.2.7-keyed | append rows to large table | 94.8 | 22.8 | 70.3 | +20.61% |  | ms |
| 8 | angular-cf-v22.0.0-keyed | append rows to large table | 100.7 | 16.2 | 68.7 | +28.12% |  | ms |
| 9 | **mreact-react-compat-vdom-v0.0.187-local-keyed** | append rows to large table | 104.2 | 35.4 | 66.5 | +32.57% |  | ms |

### clear rows

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | marko-v6.2.2-keyed | clear rows | 24.8 | 20.3 | 2.9 | best |  | ms |
| 2 | **mreact-v0.0.187-local-keyed** | clear rows | 25.5 | 20.8 | 3.1 | +2.82% |  | ms |
| 3 | svelte-v5.56.4-keyed | clear rows | 30 | 25.3 | 3.1 | +20.97% |  | ms |
| 4 | solid-v1.9.14-keyed | clear rows | 30.1 | 25.6 | 3.4 | +21.37% |  | ms |
| 5 | **mreact-react-compat-vdom-v0.0.187-local-keyed** | clear rows | 34 | 29.4 | 3.2 | +37.1% |  | ms |
| 6 | vue-v3.6.0-beta.17-keyed | clear rows | 35.1 | 30.2 | 3.5 | +41.53% |  | ms |
| 7 | **mreact-react-compat-v0.0.187-local-keyed** | clear rows | 40.8 | 36.1 | 3.2 | +64.52% |  | ms |
| 8 | react-hooks-v19.2.7-keyed | clear rows | 45.6 | 40.9 | 3.5 | +83.87% |  | ms |
| 9 | angular-cf-v22.0.0-keyed | clear rows | 48.3 | 43.8 | 4 | +94.76% |  | ms |

### ready memory

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | solid-v1.9.14-keyed | ready memory | 1 |  |  | best |  | MB |
| 2 | **mreact-v0.0.187-local-keyed** | ready memory | 1.1 |  |  | +4.86% |  | MB |
| 3 | marko-v6.2.2-keyed | ready memory | 1.1 |  |  | +5.91% |  | MB |
| 4 | svelte-v5.56.4-keyed | ready memory | 1.2 |  |  | +15.55% |  | MB |
| 5 | vue-v3.6.0-beta.17-keyed | ready memory | 1.3 |  |  | +22.6% |  | MB |
| 6 | **mreact-react-compat-vdom-v0.0.187-local-keyed** | ready memory | 1.3 |  |  | +28.53% |  | MB |
| 7 | **mreact-react-compat-v0.0.187-local-keyed** | ready memory | 1.4 |  |  | +29.04% |  | MB |
| 8 | react-hooks-v19.2.7-keyed | ready memory | 1.7 |  |  | +59.01% |  | MB |
| 9 | angular-cf-v22.0.0-keyed | ready memory | 2 |  |  | +90.55% |  | MB |

### run memory

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | marko-v6.2.2-keyed | run memory | 2.8 |  |  | best |  | MB |
| 2 | **mreact-v0.0.187-local-keyed** | run memory | 2.9 |  |  | +3.32% |  | MB |
| 3 | solid-v1.9.14-keyed | run memory | 3.1 |  |  | +8.65% |  | MB |
| 4 | svelte-v5.56.4-keyed | run memory | 3.5 |  |  | +23.49% |  | MB |
| 5 | vue-v3.6.0-beta.17-keyed | run memory | 4.4 |  |  | +54.19% |  | MB |
| 6 | **mreact-react-compat-vdom-v0.0.187-local-keyed** | run memory | 4.9 |  |  | +72.75% |  | MB |
| 7 | react-hooks-v19.2.7-keyed | run memory | 4.9 |  |  | +72.97% |  | MB |
| 8 | **mreact-react-compat-v0.0.187-local-keyed** | run memory | 5 |  |  | +76.36% |  | MB |
| 9 | angular-cf-v22.0.0-keyed | run memory | 5 |  |  | +76.77% |  | MB |

### repeated clear memory

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | solid-v1.9.14-keyed | repeated clear memory | 1.3 |  |  | best |  | MB |
| 2 | **mreact-v0.0.187-local-keyed** | repeated clear memory | 1.4 |  |  | +8.28% |  | MB |
| 3 | marko-v6.2.2-keyed | repeated clear memory | 1.4 |  |  | +10.72% |  | MB |
| 4 | svelte-v5.56.4-keyed | repeated clear memory | 1.6 |  |  | +23.85% |  | MB |
| 5 | vue-v3.6.0-beta.17-keyed | repeated clear memory | 1.7 |  |  | +31.23% |  | MB |
| 6 | **mreact-react-compat-v0.0.187-local-keyed** | repeated clear memory | 1.9 |  |  | +53.14% |  | MB |
| 7 | **mreact-react-compat-vdom-v0.0.187-local-keyed** | repeated clear memory | 2.5 |  |  | +94.58% |  | MB |
| 8 | react-hooks-v19.2.7-keyed | repeated clear memory | 2.5 |  |  | +97.17% |  | MB |
| 9 | angular-cf-v22.0.0-keyed | repeated clear memory | 2.6 |  |  | +102.39% |  | MB |

### total byte weight

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | solid-v1.9.14-keyed | total byte weight | 4.5 |  |  | best |  | kB |
| 2 | marko-v6.2.2-keyed | total byte weight | 5 |  |  | +11.11% |  | kB |
| 3 | **mreact-v0.0.187-local-keyed** | total byte weight | 8.8 |  |  | +95.56% |  | kB |
| 4 | svelte-v5.56.4-keyed | total byte weight | 14.3 |  |  | +217.78% |  | kB |
| 5 | vue-v3.6.0-beta.17-keyed | total byte weight | 23.9 |  |  | +431.11% |  | kB |
| 6 | **mreact-react-compat-vdom-v0.0.187-local-keyed** | total byte weight | 29.1 |  |  | +546.67% |  | kB |
| 7 | **mreact-react-compat-v0.0.187-local-keyed** | total byte weight | 31.6 |  |  | +602.22% |  | kB |
| 8 | angular-cf-v22.0.0-keyed | total byte weight | 44.5 |  |  | +888.89% |  | kB |
| 9 | react-hooks-v19.2.7-keyed | total byte weight | 51.4 |  |  | +1042.22% |  | kB |

## Results

| suite | framework | case | status | metric | unit | value | script | paint | diff vs 1st | diff vs react-hooks |
| --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | create rows | completed | duration | ms | 95.5 | 18.2 | 61 | +41.9% |  |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | replace all rows | completed | duration | ms | 107.8 | 28.2 | 63.8 | +47.27% |  |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | partial update | completed | duration | ms | 38.8 | 3 | 34.4 | best |  |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | select row | completed | duration | ms | 13 | 4 | 7.4 | +41.3% |  |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | swap rows | completed | duration | ms | 45.9 | 3 | 39.7 | +2% |  |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | remove row | completed | duration | ms | 34.4 | 1.8 | 32 | best |  |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | create many rows | completed | duration | ms | 937.4 | 193.1 | 666.6 | +29.62% |  |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | append rows to large table | completed | duration | ms | 100.7 | 16.2 | 68.7 | +28.12% |  |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | clear rows | completed | duration | ms | 48.3 | 43.8 | 4 | +94.76% |  |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | ready memory | completed | memory | MB | 2 |  |  | +90.55% |  |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | run memory | completed | memory | MB | 5 |  |  | +76.77% |  |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | repeated clear memory | completed | memory | MB | 2.6 |  |  | +102.39% |  |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | total byte weight | completed | size | kB | 44.5 |  |  | +888.89% |  |
| js-framework-benchmark | marko-v6.2.2-keyed | create rows | completed | duration | ms | 68.3 | 7.5 | 59.5 | +1.49% |  |
| js-framework-benchmark | marko-v6.2.2-keyed | replace all rows | completed | duration | ms | 75.8 | 14.1 | 60.4 | +3.55% |  |
| js-framework-benchmark | marko-v6.2.2-keyed | partial update | completed | duration | ms | 42.5 | 4.1 | 34.4 | +9.54% |  |
| js-framework-benchmark | marko-v6.2.2-keyed | select row | completed | duration | ms | 9.2 | 0.9 | 6.6 | best |  |
| js-framework-benchmark | marko-v6.2.2-keyed | swap rows | completed | duration | ms | 45 | 2.4 | 38.3 | best |  |
| js-framework-benchmark | marko-v6.2.2-keyed | remove row | completed | duration | ms | 35.4 | 1.2 | 32.1 | +2.91% |  |
| js-framework-benchmark | marko-v6.2.2-keyed | create many rows | completed | duration | ms | 723.2 | 82.2 | 632 | best |  |
| js-framework-benchmark | marko-v6.2.2-keyed | append rows to large table | completed | duration | ms | 79.2 | 9 | 68 | +0.76% |  |
| js-framework-benchmark | marko-v6.2.2-keyed | clear rows | completed | duration | ms | 24.8 | 20.3 | 2.9 | best |  |
| js-framework-benchmark | marko-v6.2.2-keyed | ready memory | completed | memory | MB | 1.1 |  |  | +5.91% |  |
| js-framework-benchmark | marko-v6.2.2-keyed | run memory | completed | memory | MB | 2.8 |  |  | best |  |
| js-framework-benchmark | marko-v6.2.2-keyed | repeated clear memory | completed | memory | MB | 1.4 |  |  | +10.72% |  |
| js-framework-benchmark | marko-v6.2.2-keyed | total byte weight | completed | size | kB | 5 |  |  | +11.11% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.187-local-keyed** | create rows | completed | duration | ms | 83 | 21.8 | 60 | +23.33% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.187-local-keyed** | replace all rows | completed | duration | ms | 84.3 | 23 | 60.1 | +15.16% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.187-local-keyed** | partial update | completed | duration | ms | 46.6 | 8.6 | 33.5 | +20.1% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.187-local-keyed** | select row | completed | duration | ms | 14.5 | 5.9 | 6.6 | +57.61% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.187-local-keyed** | swap rows | completed | duration | ms | 54.8 | 10.4 | 40 | +21.78% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.187-local-keyed** | remove row | completed | duration | ms | 37.8 | 2.9 | 32.5 | +9.88% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.187-local-keyed** | create many rows | completed | duration | ms | 836.4 | 175.1 | 645.6 | +15.65% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.187-local-keyed** | append rows to large table | completed | duration | ms | 90.3 | 20.7 | 67.8 | +14.89% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.187-local-keyed** | clear rows | completed | duration | ms | 40.8 | 36.1 | 3.2 | +64.52% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.187-local-keyed** | ready memory | completed | memory | MB | 1.4 |  |  | +29.04% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.187-local-keyed** | run memory | completed | memory | MB | 5 |  |  | +76.36% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.187-local-keyed** | repeated clear memory | completed | memory | MB | 1.9 |  |  | +53.14% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.187-local-keyed** | total byte weight | completed | size | kB | 31.6 |  |  | +602.22% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.187-local-keyed** | create rows | completed | duration | ms | 94.9 | 35.2 | 58.9 | +41.01% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.187-local-keyed** | replace all rows | completed | duration | ms | 100.8 | 40 | 60.1 | +37.7% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.187-local-keyed** | partial update | completed | duration | ms | 59.2 | 20.8 | 34.4 | +52.58% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.187-local-keyed** | select row | completed | duration | ms | 15 | 6.8 | 6.5 | +63.04% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.187-local-keyed** | swap rows | completed | duration | ms | 64.1 | 17.9 | 41.8 | +42.44% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.187-local-keyed** | remove row | completed | duration | ms | 40.2 | 4.8 | 32.7 | +16.86% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.187-local-keyed** | create many rows | completed | duration | ms | 900.2 | 280.8 | 623.7 | +24.47% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.187-local-keyed** | append rows to large table | completed | duration | ms | 104.2 | 35.4 | 66.5 | +32.57% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.187-local-keyed** | clear rows | completed | duration | ms | 34 | 29.4 | 3.2 | +37.1% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.187-local-keyed** | ready memory | completed | memory | MB | 1.3 |  |  | +28.53% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.187-local-keyed** | run memory | completed | memory | MB | 4.9 |  |  | +72.75% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.187-local-keyed** | repeated clear memory | completed | memory | MB | 2.5 |  |  | +94.58% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.187-local-keyed** | total byte weight | completed | size | kB | 29.1 |  |  | +546.67% |  |
| js-framework-benchmark | **mreact-v0.0.187-local-keyed** | create rows | completed | duration | ms | 67.3 | 7.6 | 58.6 | best |  |
| js-framework-benchmark | **mreact-v0.0.187-local-keyed** | replace all rows | completed | duration | ms | 75.2 | 13.2 | 59.8 | +2.73% |  |
| js-framework-benchmark | **mreact-v0.0.187-local-keyed** | partial update | completed | duration | ms | 39.9 | 1.7 | 33.9 | +2.84% |  |
| js-framework-benchmark | **mreact-v0.0.187-local-keyed** | select row | completed | duration | ms | 9.3 | 0.9 | 6.9 | +1.09% |  |
| js-framework-benchmark | **mreact-v0.0.187-local-keyed** | swap rows | completed | duration | ms | 47.4 | 1.7 | 41.3 | +5.33% |  |
| js-framework-benchmark | **mreact-v0.0.187-local-keyed** | remove row | completed | duration | ms | 34.9 | 0.9 | 31.9 | +1.45% |  |
| js-framework-benchmark | **mreact-v0.0.187-local-keyed** | create many rows | completed | duration | ms | 725.4 | 70.7 | 645.2 | +0.3% |  |
| js-framework-benchmark | **mreact-v0.0.187-local-keyed** | append rows to large table | completed | duration | ms | 78.7 | 8 | 68.7 | +0.13% |  |
| js-framework-benchmark | **mreact-v0.0.187-local-keyed** | clear rows | completed | duration | ms | 25.5 | 20.8 | 3.1 | +2.82% |  |
| js-framework-benchmark | **mreact-v0.0.187-local-keyed** | ready memory | completed | memory | MB | 1.1 |  |  | +4.86% |  |
| js-framework-benchmark | **mreact-v0.0.187-local-keyed** | run memory | completed | memory | MB | 2.9 |  |  | +3.32% |  |
| js-framework-benchmark | **mreact-v0.0.187-local-keyed** | repeated clear memory | completed | memory | MB | 1.4 |  |  | +8.28% |  |
| js-framework-benchmark | **mreact-v0.0.187-local-keyed** | total byte weight | completed | size | kB | 8.8 |  |  | +95.56% |  |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | create rows | completed | duration | ms | 83.4 | 22.1 | 60.5 | +23.92% |  |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | replace all rows | completed | duration | ms | 94.3 | 31.6 | 61.6 | +28.83% |  |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | partial update | completed | duration | ms | 49.8 | 10.2 | 34.3 | +28.35% |  |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | select row | completed | duration | ms | 14.7 | 6 | 6.8 | +59.78% |  |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | swap rows | completed | duration | ms | 309.4 | 42.4 | 260.3 | +587.56% |  |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | remove row | completed | duration | ms | 38.2 | 2.7 | 33 | +11.05% |  |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | create many rows | completed | duration | ms | 1113.8 | 443.9 | 658.7 | +54.01% |  |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | append rows to large table | completed | duration | ms | 94.8 | 22.8 | 70.3 | +20.61% |  |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | clear rows | completed | duration | ms | 45.6 | 40.9 | 3.5 | +83.87% |  |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | ready memory | completed | memory | MB | 1.7 |  |  | +59.01% |  |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | run memory | completed | memory | MB | 4.9 |  |  | +72.97% |  |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | repeated clear memory | completed | memory | MB | 2.5 |  |  | +97.17% |  |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | total byte weight | completed | size | kB | 51.4 |  |  | +1042.22% |  |
| js-framework-benchmark | solid-v1.9.14-keyed | create rows | completed | duration | ms | 67.4 | 7.2 | 59 | +0.15% |  |
| js-framework-benchmark | solid-v1.9.14-keyed | replace all rows | completed | duration | ms | 73.2 | 13.6 | 58.6 | best |  |
| js-framework-benchmark | solid-v1.9.14-keyed | partial update | completed | duration | ms | 42.2 | 2.4 | 34.7 | +8.76% |  |
| js-framework-benchmark | solid-v1.9.14-keyed | select row | completed | duration | ms | 10.1 | 2 | 6.2 | +9.78% |  |
| js-framework-benchmark | solid-v1.9.14-keyed | swap rows | completed | duration | ms | 47.8 | 2.1 | 40.6 | +6.22% |  |
| js-framework-benchmark | solid-v1.9.14-keyed | remove row | completed | duration | ms | 35 | 0.7 | 31.9 | +1.74% |  |
| js-framework-benchmark | solid-v1.9.14-keyed | create many rows | completed | duration | ms | 726.6 | 73.7 | 643.8 | +0.47% |  |
| js-framework-benchmark | solid-v1.9.14-keyed | append rows to large table | completed | duration | ms | 78.6 | 9 | 67.5 | best |  |
| js-framework-benchmark | solid-v1.9.14-keyed | clear rows | completed | duration | ms | 30.1 | 25.6 | 3.4 | +21.37% |  |
| js-framework-benchmark | solid-v1.9.14-keyed | ready memory | completed | memory | MB | 1 |  |  | best |  |
| js-framework-benchmark | solid-v1.9.14-keyed | run memory | completed | memory | MB | 3.1 |  |  | +8.65% |  |
| js-framework-benchmark | solid-v1.9.14-keyed | repeated clear memory | completed | memory | MB | 1.3 |  |  | best |  |
| js-framework-benchmark | solid-v1.9.14-keyed | total byte weight | completed | size | kB | 4.5 |  |  | best |  |
| js-framework-benchmark | svelte-v5.56.4-keyed | create rows | completed | duration | ms | 72.8 | 10.7 | 59.6 | +8.17% |  |
| js-framework-benchmark | svelte-v5.56.4-keyed | replace all rows | completed | duration | ms | 78 | 16.6 | 59.9 | +6.56% |  |
| js-framework-benchmark | svelte-v5.56.4-keyed | partial update | completed | duration | ms | 42.4 | 3.6 | 33.9 | +9.28% |  |
| js-framework-benchmark | svelte-v5.56.4-keyed | select row | completed | duration | ms | 14.6 | 6 | 6.4 | +58.7% |  |
| js-framework-benchmark | svelte-v5.56.4-keyed | swap rows | completed | duration | ms | 49.2 | 3.9 | 40.7 | +9.33% |  |
| js-framework-benchmark | svelte-v5.56.4-keyed | remove row | completed | duration | ms | 36.4 | 1.6 | 32.5 | +5.81% |  |
| js-framework-benchmark | svelte-v5.56.4-keyed | create many rows | completed | duration | ms | 742 | 93.7 | 634.6 | +2.6% |  |
| js-framework-benchmark | svelte-v5.56.4-keyed | append rows to large table | completed | duration | ms | 80.9 | 10.9 | 68.2 | +2.93% |  |
| js-framework-benchmark | svelte-v5.56.4-keyed | clear rows | completed | duration | ms | 30 | 25.3 | 3.1 | +20.97% |  |
| js-framework-benchmark | svelte-v5.56.4-keyed | ready memory | completed | memory | MB | 1.2 |  |  | +15.55% |  |
| js-framework-benchmark | svelte-v5.56.4-keyed | run memory | completed | memory | MB | 3.5 |  |  | +23.49% |  |
| js-framework-benchmark | svelte-v5.56.4-keyed | repeated clear memory | completed | memory | MB | 1.6 |  |  | +23.85% |  |
| js-framework-benchmark | svelte-v5.56.4-keyed | total byte weight | completed | size | kB | 14.3 |  |  | +217.78% |  |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | create rows | completed | duration | ms | 81 | 19.6 | 60 | +20.36% |  |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | replace all rows | completed | duration | ms | 86.4 | 23.5 | 61.5 | +18.03% |  |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | partial update | completed | duration | ms | 46.2 | 6.5 | 35.8 | +19.07% |  |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | select row | completed | duration | ms | 11.1 | 2.7 | 6.5 | +20.65% |  |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | swap rows | completed | duration | ms | 47.6 | 3.2 | 39.9 | +5.78% |  |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | remove row | completed | duration | ms | 40.8 | 4.9 | 32.8 | +18.6% |  |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | create many rows | completed | duration | ms | 829.1 | 159.6 | 660.6 | +14.64% |  |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | append rows to large table | completed | duration | ms | 86.1 | 16.4 | 67.4 | +9.54% |  |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | clear rows | completed | duration | ms | 35.1 | 30.2 | 3.5 | +41.53% |  |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | ready memory | completed | memory | MB | 1.3 |  |  | +22.6% |  |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | run memory | completed | memory | MB | 4.4 |  |  | +54.19% |  |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | repeated clear memory | completed | memory | MB | 1.7 |  |  | +31.23% |  |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | total byte weight | completed | size | kB | 23.9 |  |  | +431.11% |  |
