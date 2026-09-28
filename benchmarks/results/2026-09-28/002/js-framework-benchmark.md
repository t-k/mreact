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

Framework order offset: 27
Framework run order: keyed/marko, keyed/vue, keyed/svelte, keyed/angular-cf, keyed/react-hooks, keyed/mreact-react-compat, keyed/mreact-react-compat-vdom, keyed/solid, keyed/mreact
Fixed diff anchor: react-hooks

## Unsupported Primitive Adapters

- qwik: krausest/js-framework-benchmark keyed/qwik currently fails the official isKeyed check and is categorized as non-keyed.
- qwik-v2: krausest/js-framework-benchmark does not currently provide a matching Qwik v2 keyed fixture.
- solid-v2: krausest/js-framework-benchmark does not currently provide a matching Solid v2 keyed fixture.

Raw JSON files are stored in `benchmarks/results/2026-09-28/002/js-framework-benchmark-results`.
Chrome trace files are stored in `benchmarks/results/2026-09-28/002/js-framework-benchmark-traces`.

## Rankings

Lower values are better for all js-framework-benchmark metrics reported here.

### create rows

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | **mreact-v0.0.227-local-keyed** | create rows | 59.7 | 6 | 52.4 | best |  | ms |
| 2 | marko-v6.3.56-keyed | create rows | 59.9 | 6.6 | 52.3 | +0.34% |  | ms |
| 3 | solid-v1.9.15-keyed | create rows | 61.1 | 6.8 | 53.2 | +2.35% |  | ms |
| 4 | svelte-v5.57.1-keyed | create rows | 63.2 | 9.5 | 52.8 | +5.86% |  | ms |
| 5 | vue-v3.5.43-keyed | create rows | 70.4 | 16.1 | 53.3 | +17.92% |  | ms |
| 6 | **mreact-react-compat-v0.0.227-local-keyed** | create rows | 70.6 | 16.4 | 52.8 | +18.26% |  | ms |
| 7 | react-hooks-v19.3.0-keyed | create rows | 71.2 | 17.1 | 53 | +19.26% |  | ms |
| 8 | **mreact-react-compat-vdom-v0.0.227-local-keyed** | create rows | 84.9 | 29.4 | 54.4 | +42.21% |  | ms |
| 9 | angular-cf-v22.0.0-keyed | create rows | 87.8 | 14.7 | 55.7 | +47.07% |  | ms |

### replace all rows

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | **mreact-v0.0.227-local-keyed** | replace all rows | 65.6 | 10.1 | 54.1 | best |  | ms |
| 2 | marko-v6.3.56-keyed | replace all rows | 67.4 | 13 | 53.7 | +2.74% |  | ms |
| 3 | solid-v1.9.15-keyed | replace all rows | 70.1 | 13.5 | 54.9 | +6.86% |  | ms |
| 4 | svelte-v5.57.1-keyed | replace all rows | 73.9 | 18.8 | 54.5 | +12.65% |  | ms |
| 5 | vue-v3.5.43-keyed | replace all rows | 76.8 | 21.3 | 54.5 | +17.07% |  | ms |
| 6 | **mreact-react-compat-v0.0.227-local-keyed** | replace all rows | 81 | 24.8 | 55.2 | +23.48% |  | ms |
| 7 | react-hooks-v19.3.0-keyed | replace all rows | 84.4 | 27.7 | 55.4 | +28.66% |  | ms |
| 8 | **mreact-react-compat-vdom-v0.0.227-local-keyed** | replace all rows | 97.7 | 42.5 | 54.2 | +48.93% |  | ms |
| 9 | angular-cf-v22.0.0-keyed | replace all rows | 99.3 | 27.1 | 56.1 | +51.37% |  | ms |

### partial update

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | angular-cf-v22.0.0-keyed | partial update | 37.5 | 2.8 | 32.9 | best |  | ms |
| 2 | solid-v1.9.15-keyed | partial update | 37.6 | 2.6 | 31.7 | +0.27% |  | ms |
| 3 | svelte-v5.57.1-keyed | partial update | 38.2 | 3.8 | 31.8 | +1.87% |  | ms |
| 4 | **mreact-v0.0.227-local-keyed** | partial update | 38.4 | 3.2 | 31.6 | +2.4% |  | ms |
| 5 | marko-v6.3.56-keyed | partial update | 39 | 2.9 | 33.1 | +4% |  | ms |
| 6 | vue-v3.5.43-keyed | partial update | 39.3 | 4.8 | 31.3 | +4.8% |  | ms |
| 7 | **mreact-react-compat-v0.0.227-local-keyed** | partial update | 42 | 6.5 | 32.4 | +12% |  | ms |
| 8 | react-hooks-v19.3.0-keyed | partial update | 45.2 | 10.3 | 31.8 | +20.53% |  | ms |
| 9 | **mreact-react-compat-vdom-v0.0.227-local-keyed** | partial update | 57.5 | 21.6 | 32.2 | +53.33% |  | ms |

### select row

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | **mreact-v0.0.227-local-keyed** | select row | 8.5 | 1 | 5.9 | best |  | ms |
| 2 | marko-v6.3.56-keyed | select row | 8.8 | 1.1 | 6 | +3.53% |  | ms |
| 3 | solid-v1.9.15-keyed | select row | 9.2 | 1.6 | 6.2 | +8.24% |  | ms |
| 4 | vue-v3.5.43-keyed | select row | 9.8 | 2.5 | 5.9 | +15.29% |  | ms |
| 5 | **mreact-react-compat-v0.0.227-local-keyed** | select row | 11.4 | 3.8 | 6 | +34.12% |  | ms |
| 6 | angular-cf-v22.0.0-keyed | select row | 12.1 | 3.9 | 6.6 | +42.35% |  | ms |
| 7 | react-hooks-v19.3.0-keyed | select row | 13.1 | 5.9 | 5.8 | +54.12% |  | ms |
| 8 | svelte-v5.57.1-keyed | select row | 13.1 | 5.8 | 6 | +54.12% |  | ms |
| 9 | **mreact-react-compat-vdom-v0.0.227-local-keyed** | select row | 14.5 | 6.9 | 5.9 | +70.59% |  | ms |

### swap rows

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | **mreact-v0.0.227-local-keyed** | swap rows | 38.9 | 2 | 33.9 | best |  | ms |
| 2 | solid-v1.9.15-keyed | swap rows | 40.2 | 1.8 | 34.8 | +3.34% |  | ms |
| 3 | marko-v6.3.56-keyed | swap rows | 40.4 | 2.4 | 34.7 | +3.86% |  | ms |
| 4 | angular-cf-v22.0.0-keyed | swap rows | 41 | 2.7 | 36.6 | +5.4% |  | ms |
| 5 | **mreact-react-compat-v0.0.227-local-keyed** | swap rows | 41.4 | 4 | 34.3 | +6.43% |  | ms |
| 6 | svelte-v5.57.1-keyed | swap rows | 42.4 | 3.4 | 35.9 | +9% |  | ms |
| 7 | vue-v3.5.43-keyed | swap rows | 42.8 | 2.7 | 36.8 | +10.03% |  | ms |
| 8 | **mreact-react-compat-vdom-v0.0.227-local-keyed** | swap rows | 56.2 | 16.6 | 36.1 | +44.47% |  | ms |
| 9 | react-hooks-v19.3.0-keyed | swap rows | 264 | 43.1 | 215.4 | +578.66% |  | ms |

### remove row

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | angular-cf-v22.0.0-keyed | remove row | 28.3 | 1.3 | 25.9 | best |  | ms |
| 2 | solid-v1.9.15-keyed | remove row | 29.8 | 0.9 | 27 | +5.3% |  | ms |
| 3 | svelte-v5.57.1-keyed | remove row | 30.7 | 1.4 | 27.6 | +8.48% |  | ms |
| 4 | marko-v6.3.56-keyed | remove row | 32.2 | 1.4 | 28.6 | +13.78% |  | ms |
| 5 | react-hooks-v19.3.0-keyed | remove row | 32.3 | 2.5 | 28.2 | +14.13% |  | ms |
| 6 | **mreact-v0.0.227-local-keyed** | remove row | 32.7 | 1.1 | 29.9 | +15.55% |  | ms |
| 7 | **mreact-react-compat-v0.0.227-local-keyed** | remove row | 34.3 | 2.1 | 30.3 | +21.2% |  | ms |
| 8 | vue-v3.5.43-keyed | remove row | 34.7 | 4.3 | 28.7 | +22.61% |  | ms |
| 9 | **mreact-react-compat-vdom-v0.0.227-local-keyed** | remove row | 35.8 | 4.9 | 28.9 | +26.5% |  | ms |

### create many rows

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | marko-v6.3.56-keyed | create many rows | 660 | 67.4 | 583.4 | best |  | ms |
| 2 | **mreact-v0.0.227-local-keyed** | create many rows | 661.2 | 59.5 | 591.7 | +0.18% |  | ms |
| 3 | solid-v1.9.15-keyed | create many rows | 669.3 | 62.9 | 600.2 | +1.41% |  | ms |
| 4 | svelte-v5.57.1-keyed | create many rows | 681.8 | 75.1 | 596.2 | +3.3% |  | ms |
| 5 | **mreact-react-compat-v0.0.227-local-keyed** | create many rows | 754.2 | 139.8 | 605.7 | +14.27% |  | ms |
| 6 | vue-v3.5.43-keyed | create many rows | 757.6 | 132 | 614.8 | +14.79% |  | ms |
| 7 | **mreact-react-compat-vdom-v0.0.227-local-keyed** | create many rows | 831.1 | 252.7 | 569.1 | +25.92% |  | ms |
| 8 | angular-cf-v22.0.0-keyed | create many rows | 877.2 | 163.3 | 625.6 | +32.91% |  | ms |
| 9 | react-hooks-v19.3.0-keyed | create many rows | 1007.7 | 385.6 | 617.2 | +52.68% |  | ms |

### append rows to large table

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | **mreact-v0.0.227-local-keyed** | append rows to large table | 68.9 | 6.6 | 60.8 | best |  | ms |
| 2 | marko-v6.3.56-keyed | append rows to large table | 72 | 8.5 | 62 | +4.5% |  | ms |
| 3 | solid-v1.9.15-keyed | append rows to large table | 73.1 | 8 | 63.7 | +6.1% |  | ms |
| 4 | svelte-v5.57.1-keyed | append rows to large table | 75.6 | 8.7 | 65 | +9.72% |  | ms |
| 5 | vue-v3.5.43-keyed | append rows to large table | 76.9 | 14.2 | 61.4 | +11.61% |  | ms |
| 6 | **mreact-react-compat-v0.0.227-local-keyed** | append rows to large table | 81.4 | 16.5 | 62.9 | +18.14% |  | ms |
| 7 | react-hooks-v19.3.0-keyed | append rows to large table | 85 | 17.8 | 65.6 | +23.37% |  | ms |
| 8 | angular-cf-v22.0.0-keyed | append rows to large table | 93.4 | 14.6 | 63.5 | +35.56% |  | ms |
| 9 | **mreact-react-compat-vdom-v0.0.227-local-keyed** | append rows to large table | 99.9 | 36.3 | 61.8 | +44.99% |  | ms |

### clear rows

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | marko-v6.3.56-keyed | clear rows | 24.9 | 20.5 | 3.1 | best |  | ms |
| 2 | **mreact-v0.0.227-local-keyed** | clear rows | 25.6 | 21.5 | 3.2 | +2.81% |  | ms |
| 3 | svelte-v5.57.1-keyed | clear rows | 28.4 | 23.9 | 3.2 | +14.06% |  | ms |
| 4 | solid-v1.9.15-keyed | clear rows | 28.6 | 24.3 | 3.3 | +14.86% |  | ms |
| 5 | **mreact-react-compat-v0.0.227-local-keyed** | clear rows | 34.1 | 29.9 | 3.2 | +36.95% |  | ms |
| 6 | **mreact-react-compat-vdom-v0.0.227-local-keyed** | clear rows | 34.8 | 30.3 | 3.2 | +39.76% |  | ms |
| 7 | vue-v3.5.43-keyed | clear rows | 35.3 | 30.8 | 3.5 | +41.77% |  | ms |
| 8 | angular-cf-v22.0.0-keyed | clear rows | 41.3 | 37.1 | 3.7 | +65.86% |  | ms |
| 9 | react-hooks-v19.3.0-keyed | clear rows | 45.3 | 40.5 | 3.6 | +81.93% |  | ms |

### ready memory

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | marko-v6.3.56-keyed | ready memory | 1 |  |  | best |  | MB |
| 2 | solid-v1.9.15-keyed | ready memory | 1.1 |  |  | +3.65% |  | MB |
| 3 | svelte-v5.57.1-keyed | ready memory | 1.1 |  |  | +8.47% |  | MB |
| 4 | **mreact-v0.0.227-local-keyed** | ready memory | 1.2 |  |  | +11.46% |  | MB |
| 5 | vue-v3.5.43-keyed | ready memory | 1.4 |  |  | +30.31% |  | MB |
| 6 | **mreact-react-compat-vdom-v0.0.227-local-keyed** | ready memory | 1.4 |  |  | +31.57% |  | MB |
| 7 | **mreact-react-compat-v0.0.227-local-keyed** | ready memory | 1.5 |  |  | +42.87% |  | MB |
| 8 | react-hooks-v19.3.0-keyed | ready memory | 1.7 |  |  | +64.99% |  | MB |
| 9 | angular-cf-v22.0.0-keyed | ready memory | 2.1 |  |  | +98.94% |  | MB |

### run memory

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | marko-v6.3.56-keyed | run memory | 2.7 |  |  | best |  | MB |
| 2 | **mreact-v0.0.227-local-keyed** | run memory | 2.7 |  |  | +2.22% |  | MB |
| 3 | solid-v1.9.15-keyed | run memory | 3.2 |  |  | +18.17% |  | MB |
| 4 | svelte-v5.57.1-keyed | run memory | 3.5 |  |  | +30.54% |  | MB |
| 5 | vue-v3.5.43-keyed | run memory | 4.4 |  |  | +65.2% |  | MB |
| 6 | **mreact-react-compat-v0.0.227-local-keyed** | run memory | 4.6 |  |  | +71.03% |  | MB |
| 7 | react-hooks-v19.3.0-keyed | run memory | 5 |  |  | +86.17% |  | MB |
| 8 | **mreact-react-compat-vdom-v0.0.227-local-keyed** | run memory | 5 |  |  | +87.16% |  | MB |
| 9 | angular-cf-v22.0.0-keyed | run memory | 5.1 |  |  | +89.42% |  | MB |

### repeated clear memory

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | solid-v1.9.15-keyed | repeated clear memory | 1.3 |  |  | best |  | MB |
| 2 | marko-v6.3.56-keyed | repeated clear memory | 1.3 |  |  | +3.04% |  | MB |
| 3 | **mreact-v0.0.227-local-keyed** | repeated clear memory | 1.4 |  |  | +10.78% |  | MB |
| 4 | svelte-v5.57.1-keyed | repeated clear memory | 1.5 |  |  | +17.7% |  | MB |
| 5 | vue-v3.5.43-keyed | repeated clear memory | 1.7 |  |  | +34.23% |  | MB |
| 6 | **mreact-react-compat-v0.0.227-local-keyed** | repeated clear memory | 1.9 |  |  | +46.14% |  | MB |
| 7 | react-hooks-v19.3.0-keyed | repeated clear memory | 2.6 |  |  | +101.72% |  | MB |
| 8 | **mreact-react-compat-vdom-v0.0.227-local-keyed** | repeated clear memory | 2.6 |  |  | +105.33% |  | MB |
| 9 | angular-cf-v22.0.0-keyed | repeated clear memory | 2.7 |  |  | +113.59% |  | MB |

### total byte weight

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | solid-v1.9.15-keyed | total byte weight | 4.5 |  |  | best |  | kB |
| 2 | marko-v6.3.56-keyed | total byte weight | 4.7 |  |  | +4.44% |  | kB |
| 3 | **mreact-v0.0.227-local-keyed** | total byte weight | 10.5 |  |  | +133.33% |  | kB |
| 4 | svelte-v5.57.1-keyed | total byte weight | 11.5 |  |  | +155.56% |  | kB |
| 5 | vue-v3.5.43-keyed | total byte weight | 23.7 |  |  | +426.67% |  | kB |
| 6 | **mreact-react-compat-vdom-v0.0.227-local-keyed** | total byte weight | 36.2 |  |  | +704.44% |  | kB |
| 7 | **mreact-react-compat-v0.0.227-local-keyed** | total byte weight | 43.7 |  |  | +871.11% |  | kB |
| 8 | angular-cf-v22.0.0-keyed | total byte weight | 44.5 |  |  | +888.89% |  | kB |
| 9 | react-hooks-v19.3.0-keyed | total byte weight | 58.7 |  |  | +1204.44% |  | kB |

## Results

| suite | framework | case | status | metric | unit | value | script | paint | diff vs 1st | diff vs react-hooks |
| --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | create rows | completed | duration | ms | 87.8 | 14.7 | 55.7 | +47.07% |  |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | replace all rows | completed | duration | ms | 99.3 | 27.1 | 56.1 | +51.37% |  |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | partial update | completed | duration | ms | 37.5 | 2.8 | 32.9 | best |  |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | select row | completed | duration | ms | 12.1 | 3.9 | 6.6 | +42.35% |  |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | swap rows | completed | duration | ms | 41 | 2.7 | 36.6 | +5.4% |  |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | remove row | completed | duration | ms | 28.3 | 1.3 | 25.9 | best |  |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | create many rows | completed | duration | ms | 877.2 | 163.3 | 625.6 | +32.91% |  |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | append rows to large table | completed | duration | ms | 93.4 | 14.6 | 63.5 | +35.56% |  |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | clear rows | completed | duration | ms | 41.3 | 37.1 | 3.7 | +65.86% |  |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | ready memory | completed | memory | MB | 2.1 |  |  | +98.94% |  |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | run memory | completed | memory | MB | 5.1 |  |  | +89.42% |  |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | repeated clear memory | completed | memory | MB | 2.7 |  |  | +113.59% |  |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | total byte weight | completed | size | kB | 44.5 |  |  | +888.89% |  |
| js-framework-benchmark | marko-v6.3.56-keyed | create rows | completed | duration | ms | 59.9 | 6.6 | 52.3 | +0.34% |  |
| js-framework-benchmark | marko-v6.3.56-keyed | replace all rows | completed | duration | ms | 67.4 | 13 | 53.7 | +2.74% |  |
| js-framework-benchmark | marko-v6.3.56-keyed | partial update | completed | duration | ms | 39 | 2.9 | 33.1 | +4% |  |
| js-framework-benchmark | marko-v6.3.56-keyed | select row | completed | duration | ms | 8.8 | 1.1 | 6 | +3.53% |  |
| js-framework-benchmark | marko-v6.3.56-keyed | swap rows | completed | duration | ms | 40.4 | 2.4 | 34.7 | +3.86% |  |
| js-framework-benchmark | marko-v6.3.56-keyed | remove row | completed | duration | ms | 32.2 | 1.4 | 28.6 | +13.78% |  |
| js-framework-benchmark | marko-v6.3.56-keyed | create many rows | completed | duration | ms | 660 | 67.4 | 583.4 | best |  |
| js-framework-benchmark | marko-v6.3.56-keyed | append rows to large table | completed | duration | ms | 72 | 8.5 | 62 | +4.5% |  |
| js-framework-benchmark | marko-v6.3.56-keyed | clear rows | completed | duration | ms | 24.9 | 20.5 | 3.1 | best |  |
| js-framework-benchmark | marko-v6.3.56-keyed | ready memory | completed | memory | MB | 1 |  |  | best |  |
| js-framework-benchmark | marko-v6.3.56-keyed | run memory | completed | memory | MB | 2.7 |  |  | best |  |
| js-framework-benchmark | marko-v6.3.56-keyed | repeated clear memory | completed | memory | MB | 1.3 |  |  | +3.04% |  |
| js-framework-benchmark | marko-v6.3.56-keyed | total byte weight | completed | size | kB | 4.7 |  |  | +4.44% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.227-local-keyed** | create rows | completed | duration | ms | 70.6 | 16.4 | 52.8 | +18.26% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.227-local-keyed** | replace all rows | completed | duration | ms | 81 | 24.8 | 55.2 | +23.48% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.227-local-keyed** | partial update | completed | duration | ms | 42 | 6.5 | 32.4 | +12% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.227-local-keyed** | select row | completed | duration | ms | 11.4 | 3.8 | 6 | +34.12% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.227-local-keyed** | swap rows | completed | duration | ms | 41.4 | 4 | 34.3 | +6.43% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.227-local-keyed** | remove row | completed | duration | ms | 34.3 | 2.1 | 30.3 | +21.2% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.227-local-keyed** | create many rows | completed | duration | ms | 754.2 | 139.8 | 605.7 | +14.27% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.227-local-keyed** | append rows to large table | completed | duration | ms | 81.4 | 16.5 | 62.9 | +18.14% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.227-local-keyed** | clear rows | completed | duration | ms | 34.1 | 29.9 | 3.2 | +36.95% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.227-local-keyed** | ready memory | completed | memory | MB | 1.5 |  |  | +42.87% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.227-local-keyed** | run memory | completed | memory | MB | 4.6 |  |  | +71.03% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.227-local-keyed** | repeated clear memory | completed | memory | MB | 1.9 |  |  | +46.14% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.227-local-keyed** | total byte weight | completed | size | kB | 43.7 |  |  | +871.11% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.227-local-keyed** | create rows | completed | duration | ms | 84.9 | 29.4 | 54.4 | +42.21% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.227-local-keyed** | replace all rows | completed | duration | ms | 97.7 | 42.5 | 54.2 | +48.93% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.227-local-keyed** | partial update | completed | duration | ms | 57.5 | 21.6 | 32.2 | +53.33% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.227-local-keyed** | select row | completed | duration | ms | 14.5 | 6.9 | 5.9 | +70.59% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.227-local-keyed** | swap rows | completed | duration | ms | 56.2 | 16.6 | 36.1 | +44.47% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.227-local-keyed** | remove row | completed | duration | ms | 35.8 | 4.9 | 28.9 | +26.5% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.227-local-keyed** | create many rows | completed | duration | ms | 831.1 | 252.7 | 569.1 | +25.92% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.227-local-keyed** | append rows to large table | completed | duration | ms | 99.9 | 36.3 | 61.8 | +44.99% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.227-local-keyed** | clear rows | completed | duration | ms | 34.8 | 30.3 | 3.2 | +39.76% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.227-local-keyed** | ready memory | completed | memory | MB | 1.4 |  |  | +31.57% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.227-local-keyed** | run memory | completed | memory | MB | 5 |  |  | +87.16% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.227-local-keyed** | repeated clear memory | completed | memory | MB | 2.6 |  |  | +105.33% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.227-local-keyed** | total byte weight | completed | size | kB | 36.2 |  |  | +704.44% |  |
| js-framework-benchmark | **mreact-v0.0.227-local-keyed** | create rows | completed | duration | ms | 59.7 | 6 | 52.4 | best |  |
| js-framework-benchmark | **mreact-v0.0.227-local-keyed** | replace all rows | completed | duration | ms | 65.6 | 10.1 | 54.1 | best |  |
| js-framework-benchmark | **mreact-v0.0.227-local-keyed** | partial update | completed | duration | ms | 38.4 | 3.2 | 31.6 | +2.4% |  |
| js-framework-benchmark | **mreact-v0.0.227-local-keyed** | select row | completed | duration | ms | 8.5 | 1 | 5.9 | best |  |
| js-framework-benchmark | **mreact-v0.0.227-local-keyed** | swap rows | completed | duration | ms | 38.9 | 2 | 33.9 | best |  |
| js-framework-benchmark | **mreact-v0.0.227-local-keyed** | remove row | completed | duration | ms | 32.7 | 1.1 | 29.9 | +15.55% |  |
| js-framework-benchmark | **mreact-v0.0.227-local-keyed** | create many rows | completed | duration | ms | 661.2 | 59.5 | 591.7 | +0.18% |  |
| js-framework-benchmark | **mreact-v0.0.227-local-keyed** | append rows to large table | completed | duration | ms | 68.9 | 6.6 | 60.8 | best |  |
| js-framework-benchmark | **mreact-v0.0.227-local-keyed** | clear rows | completed | duration | ms | 25.6 | 21.5 | 3.2 | +2.81% |  |
| js-framework-benchmark | **mreact-v0.0.227-local-keyed** | ready memory | completed | memory | MB | 1.2 |  |  | +11.46% |  |
| js-framework-benchmark | **mreact-v0.0.227-local-keyed** | run memory | completed | memory | MB | 2.7 |  |  | +2.22% |  |
| js-framework-benchmark | **mreact-v0.0.227-local-keyed** | repeated clear memory | completed | memory | MB | 1.4 |  |  | +10.78% |  |
| js-framework-benchmark | **mreact-v0.0.227-local-keyed** | total byte weight | completed | size | kB | 10.5 |  |  | +133.33% |  |
| js-framework-benchmark | react-hooks-v19.3.0-keyed | create rows | completed | duration | ms | 71.2 | 17.1 | 53 | +19.26% |  |
| js-framework-benchmark | react-hooks-v19.3.0-keyed | replace all rows | completed | duration | ms | 84.4 | 27.7 | 55.4 | +28.66% |  |
| js-framework-benchmark | react-hooks-v19.3.0-keyed | partial update | completed | duration | ms | 45.2 | 10.3 | 31.8 | +20.53% |  |
| js-framework-benchmark | react-hooks-v19.3.0-keyed | select row | completed | duration | ms | 13.1 | 5.9 | 5.8 | +54.12% |  |
| js-framework-benchmark | react-hooks-v19.3.0-keyed | swap rows | completed | duration | ms | 264 | 43.1 | 215.4 | +578.66% |  |
| js-framework-benchmark | react-hooks-v19.3.0-keyed | remove row | completed | duration | ms | 32.3 | 2.5 | 28.2 | +14.13% |  |
| js-framework-benchmark | react-hooks-v19.3.0-keyed | create many rows | completed | duration | ms | 1007.7 | 385.6 | 617.2 | +52.68% |  |
| js-framework-benchmark | react-hooks-v19.3.0-keyed | append rows to large table | completed | duration | ms | 85 | 17.8 | 65.6 | +23.37% |  |
| js-framework-benchmark | react-hooks-v19.3.0-keyed | clear rows | completed | duration | ms | 45.3 | 40.5 | 3.6 | +81.93% |  |
| js-framework-benchmark | react-hooks-v19.3.0-keyed | ready memory | completed | memory | MB | 1.7 |  |  | +64.99% |  |
| js-framework-benchmark | react-hooks-v19.3.0-keyed | run memory | completed | memory | MB | 5 |  |  | +86.17% |  |
| js-framework-benchmark | react-hooks-v19.3.0-keyed | repeated clear memory | completed | memory | MB | 2.6 |  |  | +101.72% |  |
| js-framework-benchmark | react-hooks-v19.3.0-keyed | total byte weight | completed | size | kB | 58.7 |  |  | +1204.44% |  |
| js-framework-benchmark | solid-v1.9.15-keyed | create rows | completed | duration | ms | 61.1 | 6.8 | 53.2 | +2.35% |  |
| js-framework-benchmark | solid-v1.9.15-keyed | replace all rows | completed | duration | ms | 70.1 | 13.5 | 54.9 | +6.86% |  |
| js-framework-benchmark | solid-v1.9.15-keyed | partial update | completed | duration | ms | 37.6 | 2.6 | 31.7 | +0.27% |  |
| js-framework-benchmark | solid-v1.9.15-keyed | select row | completed | duration | ms | 9.2 | 1.6 | 6.2 | +8.24% |  |
| js-framework-benchmark | solid-v1.9.15-keyed | swap rows | completed | duration | ms | 40.2 | 1.8 | 34.8 | +3.34% |  |
| js-framework-benchmark | solid-v1.9.15-keyed | remove row | completed | duration | ms | 29.8 | 0.9 | 27 | +5.3% |  |
| js-framework-benchmark | solid-v1.9.15-keyed | create many rows | completed | duration | ms | 669.3 | 62.9 | 600.2 | +1.41% |  |
| js-framework-benchmark | solid-v1.9.15-keyed | append rows to large table | completed | duration | ms | 73.1 | 8 | 63.7 | +6.1% |  |
| js-framework-benchmark | solid-v1.9.15-keyed | clear rows | completed | duration | ms | 28.6 | 24.3 | 3.3 | +14.86% |  |
| js-framework-benchmark | solid-v1.9.15-keyed | ready memory | completed | memory | MB | 1.1 |  |  | +3.65% |  |
| js-framework-benchmark | solid-v1.9.15-keyed | run memory | completed | memory | MB | 3.2 |  |  | +18.17% |  |
| js-framework-benchmark | solid-v1.9.15-keyed | repeated clear memory | completed | memory | MB | 1.3 |  |  | best |  |
| js-framework-benchmark | solid-v1.9.15-keyed | total byte weight | completed | size | kB | 4.5 |  |  | best |  |
| js-framework-benchmark | svelte-v5.57.1-keyed | create rows | completed | duration | ms | 63.2 | 9.5 | 52.8 | +5.86% |  |
| js-framework-benchmark | svelte-v5.57.1-keyed | replace all rows | completed | duration | ms | 73.9 | 18.8 | 54.5 | +12.65% |  |
| js-framework-benchmark | svelte-v5.57.1-keyed | partial update | completed | duration | ms | 38.2 | 3.8 | 31.8 | +1.87% |  |
| js-framework-benchmark | svelte-v5.57.1-keyed | select row | completed | duration | ms | 13.1 | 5.8 | 6 | +54.12% |  |
| js-framework-benchmark | svelte-v5.57.1-keyed | swap rows | completed | duration | ms | 42.4 | 3.4 | 35.9 | +9% |  |
| js-framework-benchmark | svelte-v5.57.1-keyed | remove row | completed | duration | ms | 30.7 | 1.4 | 27.6 | +8.48% |  |
| js-framework-benchmark | svelte-v5.57.1-keyed | create many rows | completed | duration | ms | 681.8 | 75.1 | 596.2 | +3.3% |  |
| js-framework-benchmark | svelte-v5.57.1-keyed | append rows to large table | completed | duration | ms | 75.6 | 8.7 | 65 | +9.72% |  |
| js-framework-benchmark | svelte-v5.57.1-keyed | clear rows | completed | duration | ms | 28.4 | 23.9 | 3.2 | +14.06% |  |
| js-framework-benchmark | svelte-v5.57.1-keyed | ready memory | completed | memory | MB | 1.1 |  |  | +8.47% |  |
| js-framework-benchmark | svelte-v5.57.1-keyed | run memory | completed | memory | MB | 3.5 |  |  | +30.54% |  |
| js-framework-benchmark | svelte-v5.57.1-keyed | repeated clear memory | completed | memory | MB | 1.5 |  |  | +17.7% |  |
| js-framework-benchmark | svelte-v5.57.1-keyed | total byte weight | completed | size | kB | 11.5 |  |  | +155.56% |  |
| js-framework-benchmark | vue-v3.5.43-keyed | create rows | completed | duration | ms | 70.4 | 16.1 | 53.3 | +17.92% |  |
| js-framework-benchmark | vue-v3.5.43-keyed | replace all rows | completed | duration | ms | 76.8 | 21.3 | 54.5 | +17.07% |  |
| js-framework-benchmark | vue-v3.5.43-keyed | partial update | completed | duration | ms | 39.3 | 4.8 | 31.3 | +4.8% |  |
| js-framework-benchmark | vue-v3.5.43-keyed | select row | completed | duration | ms | 9.8 | 2.5 | 5.9 | +15.29% |  |
| js-framework-benchmark | vue-v3.5.43-keyed | swap rows | completed | duration | ms | 42.8 | 2.7 | 36.8 | +10.03% |  |
| js-framework-benchmark | vue-v3.5.43-keyed | remove row | completed | duration | ms | 34.7 | 4.3 | 28.7 | +22.61% |  |
| js-framework-benchmark | vue-v3.5.43-keyed | create many rows | completed | duration | ms | 757.6 | 132 | 614.8 | +14.79% |  |
| js-framework-benchmark | vue-v3.5.43-keyed | append rows to large table | completed | duration | ms | 76.9 | 14.2 | 61.4 | +11.61% |  |
| js-framework-benchmark | vue-v3.5.43-keyed | clear rows | completed | duration | ms | 35.3 | 30.8 | 3.5 | +41.77% |  |
| js-framework-benchmark | vue-v3.5.43-keyed | ready memory | completed | memory | MB | 1.4 |  |  | +30.31% |  |
| js-framework-benchmark | vue-v3.5.43-keyed | run memory | completed | memory | MB | 4.4 |  |  | +65.2% |  |
| js-framework-benchmark | vue-v3.5.43-keyed | repeated clear memory | completed | memory | MB | 1.7 |  |  | +34.23% |  |
| js-framework-benchmark | vue-v3.5.43-keyed | total byte weight | completed | size | kB | 23.7 |  |  | +426.67% |  |
