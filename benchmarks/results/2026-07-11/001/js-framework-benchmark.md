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

Framework order offset: 10
Framework run order: keyed/vue, keyed/svelte, keyed/angular-cf, keyed/react-hooks, keyed/mreact-react-compat, keyed/mreact-react-compat-vdom, keyed/solid, keyed/mreact, keyed/marko
Fixed diff anchor: react-hooks

## Unsupported Primitive Adapters

- qwik: krausest/js-framework-benchmark keyed/qwik currently fails the official isKeyed check and is categorized as non-keyed.
- qwik-v2: krausest/js-framework-benchmark does not currently provide a matching Qwik v2 keyed fixture.
- solid-v2: krausest/js-framework-benchmark does not currently provide a matching Solid v2 keyed fixture.

Raw JSON files are stored in `benchmarks/results/2026-07-11/001/js-framework-benchmark-results`.
Chrome trace files are stored in `benchmarks/results/2026-07-11/001/js-framework-benchmark-traces`.

## Rankings

Lower values are better for all js-framework-benchmark metrics reported here.

### create rows

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | **mreact-v0.0.191-local-keyed** | create rows | 68.6 | 8 | 59.5 | best |  | ms |
| 2 | marko-v6.3.2-keyed | create rows | 68.9 | 7.6 | 60.1 | +0.44% |  | ms |
| 3 | solid-v1.9.14-keyed | create rows | 71.1 | 7.9 | 61.7 | +3.64% |  | ms |
| 4 | svelte-v5.56.4-keyed | create rows | 75.1 | 11.2 | 63 | +9.48% |  | ms |
| 5 | vue-v3.6.0-beta.17-keyed | create rows | 85.8 | 21.3 | 63.2 | +25.07% |  | ms |
| 6 | **mreact-react-compat-v0.0.191-local-keyed** | create rows | 86 | 23.9 | 61.1 | +25.36% |  | ms |
| 7 | react-hooks-v19.2.7-keyed | create rows | 88.4 | 23 | 64.5 | +28.86% |  | ms |
| 8 | angular-cf-v22.0.0-keyed | create rows | 98.9 | 19.7 | 62.4 | +44.17% |  | ms |
| 9 | **mreact-react-compat-vdom-v0.0.191-local-keyed** | create rows | 100.2 | 35.6 | 63.3 | +46.06% |  | ms |

### replace all rows

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | solid-v1.9.14-keyed | replace all rows | 78.4 | 15.4 | 61.6 | best |  | ms |
| 2 | marko-v6.3.2-keyed | replace all rows | 81 | 15.3 | 64.6 | +3.32% |  | ms |
| 3 | **mreact-v0.0.191-local-keyed** | replace all rows | 81.2 | 14.7 | 65 | +3.57% |  | ms |
| 4 | svelte-v5.56.4-keyed | replace all rows | 88.1 | 19.8 | 66.6 | +12.37% |  | ms |
| 5 | **mreact-react-compat-v0.0.191-local-keyed** | replace all rows | 91.1 | 25.4 | 62.8 | +16.2% |  | ms |
| 6 | vue-v3.6.0-beta.17-keyed | replace all rows | 95.3 | 27.4 | 66.5 | +21.56% |  | ms |
| 7 | react-hooks-v19.2.7-keyed | replace all rows | 101.1 | 35.2 | 64.6 | +28.95% |  | ms |
| 8 | **mreact-react-compat-vdom-v0.0.191-local-keyed** | replace all rows | 106.1 | 42 | 62.8 | +35.33% |  | ms |
| 9 | angular-cf-v22.0.0-keyed | replace all rows | 115.3 | 33.1 | 67.9 | +47.07% |  | ms |

### partial update

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | solid-v1.9.14-keyed | partial update | 38.5 | 2.5 | 33.4 | best |  | ms |
| 2 | marko-v6.3.2-keyed | partial update | 41.4 | 4 | 33.9 | +7.53% |  | ms |
| 3 | angular-cf-v22.0.0-keyed | partial update | 42.9 | 3.1 | 38.8 | +11.43% |  | ms |
| 4 | **mreact-v0.0.191-local-keyed** | partial update | 43.1 | 2.1 | 38.2 | +11.95% |  | ms |
| 5 | svelte-v5.56.4-keyed | partial update | 45.2 | 3.9 | 37.7 | +17.4% |  | ms |
| 6 | vue-v3.6.0-beta.17-keyed | partial update | 48.5 | 6.2 | 38 | +25.97% |  | ms |
| 7 | **mreact-react-compat-v0.0.191-local-keyed** | partial update | 51.5 | 8.9 | 39 | +33.77% |  | ms |
| 8 | react-hooks-v19.2.7-keyed | partial update | 52.3 | 11 | 38 | +35.84% |  | ms |
| 9 | **mreact-react-compat-vdom-v0.0.191-local-keyed** | partial update | 65 | 23.8 | 38.2 | +68.83% |  | ms |

### select row

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | **mreact-v0.0.191-local-keyed** | select row | 8.8 | 1 | 6.4 | best |  | ms |
| 2 | solid-v1.9.14-keyed | select row | 9.6 | 1.9 | 6.4 | +9.09% |  | ms |
| 3 | marko-v6.3.2-keyed | select row | 9.7 | 1.5 | 7 | +10.23% |  | ms |
| 4 | vue-v3.6.0-beta.17-keyed | select row | 10.7 | 2.5 | 6.5 | +21.59% |  | ms |
| 5 | angular-cf-v22.0.0-keyed | select row | 12.9 | 4 | 7.5 | +46.59% |  | ms |
| 6 | react-hooks-v19.2.7-keyed | select row | 13.9 | 6.2 | 6.4 | +57.95% |  | ms |
| 7 | **mreact-react-compat-v0.0.191-local-keyed** | select row | 14.4 | 6.3 | 6.8 | +63.64% |  | ms |
| 8 | svelte-v5.56.4-keyed | select row | 14.7 | 6.7 | 6.4 | +67.05% |  | ms |
| 9 | **mreact-react-compat-vdom-v0.0.191-local-keyed** | select row | 14.8 | 7.2 | 6.4 | +68.18% |  | ms |

### swap rows

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | angular-cf-v22.0.0-keyed | swap rows | 46.7 | 2.9 | 41.3 | best |  | ms |
| 2 | marko-v6.3.2-keyed | swap rows | 47.4 | 2.9 | 41.4 | +1.5% |  | ms |
| 3 | **mreact-v0.0.191-local-keyed** | swap rows | 48.7 | 1.9 | 43.4 | +4.28% |  | ms |
| 4 | vue-v3.6.0-beta.17-keyed | swap rows | 50.2 | 3.3 | 43.5 | +7.49% |  | ms |
| 5 | solid-v1.9.14-keyed | swap rows | 50.9 | 2.1 | 44.6 | +8.99% |  | ms |
| 6 | svelte-v5.56.4-keyed | swap rows | 51 | 4 | 43.2 | +9.21% |  | ms |
| 7 | **mreact-react-compat-v0.0.191-local-keyed** | swap rows | 58.1 | 10.5 | 43.2 | +24.41% |  | ms |
| 8 | **mreact-react-compat-vdom-v0.0.191-local-keyed** | swap rows | 71.3 | 19.8 | 47.2 | +52.68% |  | ms |
| 9 | react-hooks-v19.2.7-keyed | swap rows | 371.4 | 53.4 | 309.1 | +695.29% |  | ms |

### remove row

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | **mreact-v0.0.191-local-keyed** | remove row | 35 | 0.8 | 32.4 | best |  | ms |
| 2 | solid-v1.9.14-keyed | remove row | 35 | 0.7 | 32.1 | 0% |  | ms |
| 3 | svelte-v5.56.4-keyed | remove row | 35.5 | 1.6 | 31.7 | +1.43% |  | ms |
| 4 | angular-cf-v22.0.0-keyed | remove row | 35.9 | 1.4 | 33.6 | +2.57% |  | ms |
| 5 | marko-v6.3.2-keyed | remove row | 36.3 | 1.2 | 33.3 | +3.71% |  | ms |
| 6 | react-hooks-v19.2.7-keyed | remove row | 36.8 | 2.8 | 32.1 | +5.14% |  | ms |
| 7 | **mreact-react-compat-v0.0.191-local-keyed** | remove row | 37.8 | 2.9 | 32.4 | +8% |  | ms |
| 8 | vue-v3.6.0-beta.17-keyed | remove row | 39.6 | 5.3 | 31.9 | +13.14% |  | ms |
| 9 | **mreact-react-compat-vdom-v0.0.191-local-keyed** | remove row | 40.7 | 5.4 | 33 | +16.29% |  | ms |

### create many rows

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | **mreact-v0.0.191-local-keyed** | create many rows | 782.7 | 72.3 | 700 | best |  | ms |
| 2 | marko-v6.3.2-keyed | create many rows | 787.3 | 83.7 | 694.1 | +0.59% |  | ms |
| 3 | solid-v1.9.14-keyed | create many rows | 797 | 75.7 | 710.4 | +1.83% |  | ms |
| 4 | svelte-v5.56.4-keyed | create many rows | 809 | 98.6 | 699.9 | +3.36% |  | ms |
| 5 | vue-v3.6.0-beta.17-keyed | create many rows | 912.7 | 171.5 | 732 | +16.61% |  | ms |
| 6 | **mreact-react-compat-v0.0.191-local-keyed** | create many rows | 920.4 | 194.2 | 718.1 | +17.59% |  | ms |
| 7 | angular-cf-v22.0.0-keyed | create many rows | 1012.1 | 208.9 | 726.3 | +29.31% |  | ms |
| 8 | **mreact-react-compat-vdom-v0.0.191-local-keyed** | create many rows | 1046.7 | 309.6 | 731.1 | +33.73% |  | ms |
| 9 | react-hooks-v19.2.7-keyed | create many rows | 1250.3 | 463.2 | 760 | +59.74% |  | ms |

### append rows to large table

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | **mreact-v0.0.191-local-keyed** | append rows to large table | 83 | 8.5 | 72.8 | best |  | ms |
| 2 | solid-v1.9.14-keyed | append rows to large table | 85.7 | 9.1 | 74.7 | +3.25% |  | ms |
| 3 | marko-v6.3.2-keyed | append rows to large table | 86.1 | 9.7 | 74.5 | +3.73% |  | ms |
| 4 | svelte-v5.56.4-keyed | append rows to large table | 89.2 | 13.1 | 74.5 | +7.47% |  | ms |
| 5 | vue-v3.6.0-beta.17-keyed | append rows to large table | 89.7 | 17.3 | 70.7 | +8.07% |  | ms |
| 6 | **mreact-react-compat-v0.0.191-local-keyed** | append rows to large table | 98.8 | 21.5 | 75 | +19.04% |  | ms |
| 7 | react-hooks-v19.2.7-keyed | append rows to large table | 101.3 | 23.8 | 75.7 | +22.05% |  | ms |
| 8 | angular-cf-v22.0.0-keyed | append rows to large table | 108.4 | 17.8 | 75.3 | +30.6% |  | ms |
| 9 | **mreact-react-compat-vdom-v0.0.191-local-keyed** | append rows to large table | 112.8 | 35.8 | 73.8 | +35.9% |  | ms |

### clear rows

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | marko-v6.3.2-keyed | clear rows | 28 | 24.2 | 2.5 | best |  | ms |
| 2 | **mreact-v0.0.191-local-keyed** | clear rows | 29 | 24.7 | 3.2 | +3.57% |  | ms |
| 3 | svelte-v5.56.4-keyed | clear rows | 36.4 | 31.5 | 3.5 | +30% |  | ms |
| 4 | solid-v1.9.14-keyed | clear rows | 37.6 | 32.8 | 3.2 | +34.29% |  | ms |
| 5 | **mreact-react-compat-vdom-v0.0.191-local-keyed** | clear rows | 41.3 | 36.7 | 3.6 | +47.5% |  | ms |
| 6 | vue-v3.6.0-beta.17-keyed | clear rows | 47.3 | 42.1 | 2.8 | +68.93% |  | ms |
| 7 | **mreact-react-compat-v0.0.191-local-keyed** | clear rows | 49.5 | 45.5 | 3 | +76.79% |  | ms |
| 8 | react-hooks-v19.2.7-keyed | clear rows | 58.6 | 53.4 | 3.4 | +109.29% |  | ms |
| 9 | angular-cf-v22.0.0-keyed | clear rows | 60.4 | 55.2 | 3.4 | +115.71% |  | ms |

### ready memory

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | solid-v1.9.14-keyed | ready memory | 1.1 |  |  | best |  | MB |
| 2 | marko-v6.3.2-keyed | ready memory | 1.1 |  |  | +3.19% |  | MB |
| 3 | **mreact-v0.0.191-local-keyed** | ready memory | 1.1 |  |  | +4.1% |  | MB |
| 4 | svelte-v5.56.4-keyed | ready memory | 1.2 |  |  | +16.95% |  | MB |
| 5 | **mreact-react-compat-vdom-v0.0.191-local-keyed** | ready memory | 1.3 |  |  | +24.08% |  | MB |
| 6 | vue-v3.6.0-beta.17-keyed | ready memory | 1.3 |  |  | +24.49% |  | MB |
| 7 | **mreact-react-compat-v0.0.191-local-keyed** | ready memory | 1.4 |  |  | +27.91% |  | MB |
| 8 | react-hooks-v19.2.7-keyed | ready memory | 1.6 |  |  | +49.19% |  | MB |
| 9 | angular-cf-v22.0.0-keyed | ready memory | 2.1 |  |  | +99.27% |  | MB |

### run memory

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | marko-v6.3.2-keyed | run memory | 2.8 |  |  | best |  | MB |
| 2 | **mreact-v0.0.191-local-keyed** | run memory | 2.8 |  |  | +2.84% |  | MB |
| 3 | solid-v1.9.14-keyed | run memory | 3.2 |  |  | +14.71% |  | MB |
| 4 | svelte-v5.56.4-keyed | run memory | 3.5 |  |  | +27.01% |  | MB |
| 5 | vue-v3.6.0-beta.17-keyed | run memory | 4.4 |  |  | +58.64% |  | MB |
| 6 | react-hooks-v19.2.7-keyed | run memory | 4.9 |  |  | +77.2% |  | MB |
| 7 | **mreact-react-compat-vdom-v0.0.191-local-keyed** | run memory | 4.9 |  |  | +77.48% |  | MB |
| 8 | **mreact-react-compat-v0.0.191-local-keyed** | run memory | 5 |  |  | +78.98% |  | MB |
| 9 | angular-cf-v22.0.0-keyed | run memory | 5 |  |  | +81.73% |  | MB |

### repeated clear memory

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | solid-v1.9.14-keyed | repeated clear memory | 1.2 |  |  | best |  | MB |
| 2 | **mreact-v0.0.191-local-keyed** | repeated clear memory | 1.3 |  |  | +8.39% |  | MB |
| 3 | marko-v6.3.2-keyed | repeated clear memory | 1.4 |  |  | +14.79% |  | MB |
| 4 | svelte-v5.56.4-keyed | repeated clear memory | 1.6 |  |  | +34.77% |  | MB |
| 5 | vue-v3.6.0-beta.17-keyed | repeated clear memory | 1.7 |  |  | +37.95% |  | MB |
| 6 | **mreact-react-compat-v0.0.191-local-keyed** | repeated clear memory | 1.9 |  |  | +55.46% |  | MB |
| 7 | react-hooks-v19.2.7-keyed | repeated clear memory | 2.4 |  |  | +102.29% |  | MB |
| 8 | **mreact-react-compat-vdom-v0.0.191-local-keyed** | repeated clear memory | 2.5 |  |  | +103.07% |  | MB |
| 9 | angular-cf-v22.0.0-keyed | repeated clear memory | 2.7 |  |  | +124.58% |  | MB |

### total byte weight

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | solid-v1.9.14-keyed | total byte weight | 4.5 |  |  | best |  | kB |
| 2 | marko-v6.3.2-keyed | total byte weight | 4.9 |  |  | +8.89% |  | kB |
| 3 | **mreact-v0.0.191-local-keyed** | total byte weight | 8.8 |  |  | +95.56% |  | kB |
| 4 | svelte-v5.56.4-keyed | total byte weight | 14.3 |  |  | +217.78% |  | kB |
| 5 | vue-v3.6.0-beta.17-keyed | total byte weight | 23.9 |  |  | +431.11% |  | kB |
| 6 | **mreact-react-compat-vdom-v0.0.191-local-keyed** | total byte weight | 30.1 |  |  | +568.89% |  | kB |
| 7 | **mreact-react-compat-v0.0.191-local-keyed** | total byte weight | 31.7 |  |  | +604.44% |  | kB |
| 8 | angular-cf-v22.0.0-keyed | total byte weight | 44.5 |  |  | +888.89% |  | kB |
| 9 | react-hooks-v19.2.7-keyed | total byte weight | 51.4 |  |  | +1042.22% |  | kB |

## Results

| suite | framework | case | status | metric | unit | value | script | paint | diff vs 1st | diff vs react-hooks |
| --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | create rows | completed | duration | ms | 98.9 | 19.7 | 62.4 | +44.17% |  |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | replace all rows | completed | duration | ms | 115.3 | 33.1 | 67.9 | +47.07% |  |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | partial update | completed | duration | ms | 42.9 | 3.1 | 38.8 | +11.43% |  |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | select row | completed | duration | ms | 12.9 | 4 | 7.5 | +46.59% |  |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | swap rows | completed | duration | ms | 46.7 | 2.9 | 41.3 | best |  |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | remove row | completed | duration | ms | 35.9 | 1.4 | 33.6 | +2.57% |  |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | create many rows | completed | duration | ms | 1012.1 | 208.9 | 726.3 | +29.31% |  |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | append rows to large table | completed | duration | ms | 108.4 | 17.8 | 75.3 | +30.6% |  |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | clear rows | completed | duration | ms | 60.4 | 55.2 | 3.4 | +115.71% |  |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | ready memory | completed | memory | MB | 2.1 |  |  | +99.27% |  |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | run memory | completed | memory | MB | 5 |  |  | +81.73% |  |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | repeated clear memory | completed | memory | MB | 2.7 |  |  | +124.58% |  |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | total byte weight | completed | size | kB | 44.5 |  |  | +888.89% |  |
| js-framework-benchmark | marko-v6.3.2-keyed | create rows | completed | duration | ms | 68.9 | 7.6 | 60.1 | +0.44% |  |
| js-framework-benchmark | marko-v6.3.2-keyed | replace all rows | completed | duration | ms | 81 | 15.3 | 64.6 | +3.32% |  |
| js-framework-benchmark | marko-v6.3.2-keyed | partial update | completed | duration | ms | 41.4 | 4 | 33.9 | +7.53% |  |
| js-framework-benchmark | marko-v6.3.2-keyed | select row | completed | duration | ms | 9.7 | 1.5 | 7 | +10.23% |  |
| js-framework-benchmark | marko-v6.3.2-keyed | swap rows | completed | duration | ms | 47.4 | 2.9 | 41.4 | +1.5% |  |
| js-framework-benchmark | marko-v6.3.2-keyed | remove row | completed | duration | ms | 36.3 | 1.2 | 33.3 | +3.71% |  |
| js-framework-benchmark | marko-v6.3.2-keyed | create many rows | completed | duration | ms | 787.3 | 83.7 | 694.1 | +0.59% |  |
| js-framework-benchmark | marko-v6.3.2-keyed | append rows to large table | completed | duration | ms | 86.1 | 9.7 | 74.5 | +3.73% |  |
| js-framework-benchmark | marko-v6.3.2-keyed | clear rows | completed | duration | ms | 28 | 24.2 | 2.5 | best |  |
| js-framework-benchmark | marko-v6.3.2-keyed | ready memory | completed | memory | MB | 1.1 |  |  | +3.19% |  |
| js-framework-benchmark | marko-v6.3.2-keyed | run memory | completed | memory | MB | 2.8 |  |  | best |  |
| js-framework-benchmark | marko-v6.3.2-keyed | repeated clear memory | completed | memory | MB | 1.4 |  |  | +14.79% |  |
| js-framework-benchmark | marko-v6.3.2-keyed | total byte weight | completed | size | kB | 4.9 |  |  | +8.89% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.191-local-keyed** | create rows | completed | duration | ms | 86 | 23.9 | 61.1 | +25.36% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.191-local-keyed** | replace all rows | completed | duration | ms | 91.1 | 25.4 | 62.8 | +16.2% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.191-local-keyed** | partial update | completed | duration | ms | 51.5 | 8.9 | 39 | +33.77% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.191-local-keyed** | select row | completed | duration | ms | 14.4 | 6.3 | 6.8 | +63.64% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.191-local-keyed** | swap rows | completed | duration | ms | 58.1 | 10.5 | 43.2 | +24.41% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.191-local-keyed** | remove row | completed | duration | ms | 37.8 | 2.9 | 32.4 | +8% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.191-local-keyed** | create many rows | completed | duration | ms | 920.4 | 194.2 | 718.1 | +17.59% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.191-local-keyed** | append rows to large table | completed | duration | ms | 98.8 | 21.5 | 75 | +19.04% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.191-local-keyed** | clear rows | completed | duration | ms | 49.5 | 45.5 | 3 | +76.79% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.191-local-keyed** | ready memory | completed | memory | MB | 1.4 |  |  | +27.91% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.191-local-keyed** | run memory | completed | memory | MB | 5 |  |  | +78.98% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.191-local-keyed** | repeated clear memory | completed | memory | MB | 1.9 |  |  | +55.46% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.191-local-keyed** | total byte weight | completed | size | kB | 31.7 |  |  | +604.44% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.191-local-keyed** | create rows | completed | duration | ms | 100.2 | 35.6 | 63.3 | +46.06% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.191-local-keyed** | replace all rows | completed | duration | ms | 106.1 | 42 | 62.8 | +35.33% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.191-local-keyed** | partial update | completed | duration | ms | 65 | 23.8 | 38.2 | +68.83% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.191-local-keyed** | select row | completed | duration | ms | 14.8 | 7.2 | 6.4 | +68.18% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.191-local-keyed** | swap rows | completed | duration | ms | 71.3 | 19.8 | 47.2 | +52.68% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.191-local-keyed** | remove row | completed | duration | ms | 40.7 | 5.4 | 33 | +16.29% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.191-local-keyed** | create many rows | completed | duration | ms | 1046.7 | 309.6 | 731.1 | +33.73% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.191-local-keyed** | append rows to large table | completed | duration | ms | 112.8 | 35.8 | 73.8 | +35.9% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.191-local-keyed** | clear rows | completed | duration | ms | 41.3 | 36.7 | 3.6 | +47.5% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.191-local-keyed** | ready memory | completed | memory | MB | 1.3 |  |  | +24.08% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.191-local-keyed** | run memory | completed | memory | MB | 4.9 |  |  | +77.48% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.191-local-keyed** | repeated clear memory | completed | memory | MB | 2.5 |  |  | +103.07% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.191-local-keyed** | total byte weight | completed | size | kB | 30.1 |  |  | +568.89% |  |
| js-framework-benchmark | **mreact-v0.0.191-local-keyed** | create rows | completed | duration | ms | 68.6 | 8 | 59.5 | best |  |
| js-framework-benchmark | **mreact-v0.0.191-local-keyed** | replace all rows | completed | duration | ms | 81.2 | 14.7 | 65 | +3.57% |  |
| js-framework-benchmark | **mreact-v0.0.191-local-keyed** | partial update | completed | duration | ms | 43.1 | 2.1 | 38.2 | +11.95% |  |
| js-framework-benchmark | **mreact-v0.0.191-local-keyed** | select row | completed | duration | ms | 8.8 | 1 | 6.4 | best |  |
| js-framework-benchmark | **mreact-v0.0.191-local-keyed** | swap rows | completed | duration | ms | 48.7 | 1.9 | 43.4 | +4.28% |  |
| js-framework-benchmark | **mreact-v0.0.191-local-keyed** | remove row | completed | duration | ms | 35 | 0.8 | 32.4 | best |  |
| js-framework-benchmark | **mreact-v0.0.191-local-keyed** | create many rows | completed | duration | ms | 782.7 | 72.3 | 700 | best |  |
| js-framework-benchmark | **mreact-v0.0.191-local-keyed** | append rows to large table | completed | duration | ms | 83 | 8.5 | 72.8 | best |  |
| js-framework-benchmark | **mreact-v0.0.191-local-keyed** | clear rows | completed | duration | ms | 29 | 24.7 | 3.2 | +3.57% |  |
| js-framework-benchmark | **mreact-v0.0.191-local-keyed** | ready memory | completed | memory | MB | 1.1 |  |  | +4.1% |  |
| js-framework-benchmark | **mreact-v0.0.191-local-keyed** | run memory | completed | memory | MB | 2.8 |  |  | +2.84% |  |
| js-framework-benchmark | **mreact-v0.0.191-local-keyed** | repeated clear memory | completed | memory | MB | 1.3 |  |  | +8.39% |  |
| js-framework-benchmark | **mreact-v0.0.191-local-keyed** | total byte weight | completed | size | kB | 8.8 |  |  | +95.56% |  |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | create rows | completed | duration | ms | 88.4 | 23 | 64.5 | +28.86% |  |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | replace all rows | completed | duration | ms | 101.1 | 35.2 | 64.6 | +28.95% |  |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | partial update | completed | duration | ms | 52.3 | 11 | 38 | +35.84% |  |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | select row | completed | duration | ms | 13.9 | 6.2 | 6.4 | +57.95% |  |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | swap rows | completed | duration | ms | 371.4 | 53.4 | 309.1 | +695.29% |  |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | remove row | completed | duration | ms | 36.8 | 2.8 | 32.1 | +5.14% |  |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | create many rows | completed | duration | ms | 1250.3 | 463.2 | 760 | +59.74% |  |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | append rows to large table | completed | duration | ms | 101.3 | 23.8 | 75.7 | +22.05% |  |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | clear rows | completed | duration | ms | 58.6 | 53.4 | 3.4 | +109.29% |  |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | ready memory | completed | memory | MB | 1.6 |  |  | +49.19% |  |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | run memory | completed | memory | MB | 4.9 |  |  | +77.2% |  |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | repeated clear memory | completed | memory | MB | 2.4 |  |  | +102.29% |  |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | total byte weight | completed | size | kB | 51.4 |  |  | +1042.22% |  |
| js-framework-benchmark | solid-v1.9.14-keyed | create rows | completed | duration | ms | 71.1 | 7.9 | 61.7 | +3.64% |  |
| js-framework-benchmark | solid-v1.9.14-keyed | replace all rows | completed | duration | ms | 78.4 | 15.4 | 61.6 | best |  |
| js-framework-benchmark | solid-v1.9.14-keyed | partial update | completed | duration | ms | 38.5 | 2.5 | 33.4 | best |  |
| js-framework-benchmark | solid-v1.9.14-keyed | select row | completed | duration | ms | 9.6 | 1.9 | 6.4 | +9.09% |  |
| js-framework-benchmark | solid-v1.9.14-keyed | swap rows | completed | duration | ms | 50.9 | 2.1 | 44.6 | +8.99% |  |
| js-framework-benchmark | solid-v1.9.14-keyed | remove row | completed | duration | ms | 35 | 0.7 | 32.1 | 0% |  |
| js-framework-benchmark | solid-v1.9.14-keyed | create many rows | completed | duration | ms | 797 | 75.7 | 710.4 | +1.83% |  |
| js-framework-benchmark | solid-v1.9.14-keyed | append rows to large table | completed | duration | ms | 85.7 | 9.1 | 74.7 | +3.25% |  |
| js-framework-benchmark | solid-v1.9.14-keyed | clear rows | completed | duration | ms | 37.6 | 32.8 | 3.2 | +34.29% |  |
| js-framework-benchmark | solid-v1.9.14-keyed | ready memory | completed | memory | MB | 1.1 |  |  | best |  |
| js-framework-benchmark | solid-v1.9.14-keyed | run memory | completed | memory | MB | 3.2 |  |  | +14.71% |  |
| js-framework-benchmark | solid-v1.9.14-keyed | repeated clear memory | completed | memory | MB | 1.2 |  |  | best |  |
| js-framework-benchmark | solid-v1.9.14-keyed | total byte weight | completed | size | kB | 4.5 |  |  | best |  |
| js-framework-benchmark | svelte-v5.56.4-keyed | create rows | completed | duration | ms | 75.1 | 11.2 | 63 | +9.48% |  |
| js-framework-benchmark | svelte-v5.56.4-keyed | replace all rows | completed | duration | ms | 88.1 | 19.8 | 66.6 | +12.37% |  |
| js-framework-benchmark | svelte-v5.56.4-keyed | partial update | completed | duration | ms | 45.2 | 3.9 | 37.7 | +17.4% |  |
| js-framework-benchmark | svelte-v5.56.4-keyed | select row | completed | duration | ms | 14.7 | 6.7 | 6.4 | +67.05% |  |
| js-framework-benchmark | svelte-v5.56.4-keyed | swap rows | completed | duration | ms | 51 | 4 | 43.2 | +9.21% |  |
| js-framework-benchmark | svelte-v5.56.4-keyed | remove row | completed | duration | ms | 35.5 | 1.6 | 31.7 | +1.43% |  |
| js-framework-benchmark | svelte-v5.56.4-keyed | create many rows | completed | duration | ms | 809 | 98.6 | 699.9 | +3.36% |  |
| js-framework-benchmark | svelte-v5.56.4-keyed | append rows to large table | completed | duration | ms | 89.2 | 13.1 | 74.5 | +7.47% |  |
| js-framework-benchmark | svelte-v5.56.4-keyed | clear rows | completed | duration | ms | 36.4 | 31.5 | 3.5 | +30% |  |
| js-framework-benchmark | svelte-v5.56.4-keyed | ready memory | completed | memory | MB | 1.2 |  |  | +16.95% |  |
| js-framework-benchmark | svelte-v5.56.4-keyed | run memory | completed | memory | MB | 3.5 |  |  | +27.01% |  |
| js-framework-benchmark | svelte-v5.56.4-keyed | repeated clear memory | completed | memory | MB | 1.6 |  |  | +34.77% |  |
| js-framework-benchmark | svelte-v5.56.4-keyed | total byte weight | completed | size | kB | 14.3 |  |  | +217.78% |  |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | create rows | completed | duration | ms | 85.8 | 21.3 | 63.2 | +25.07% |  |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | replace all rows | completed | duration | ms | 95.3 | 27.4 | 66.5 | +21.56% |  |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | partial update | completed | duration | ms | 48.5 | 6.2 | 38 | +25.97% |  |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | select row | completed | duration | ms | 10.7 | 2.5 | 6.5 | +21.59% |  |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | swap rows | completed | duration | ms | 50.2 | 3.3 | 43.5 | +7.49% |  |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | remove row | completed | duration | ms | 39.6 | 5.3 | 31.9 | +13.14% |  |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | create many rows | completed | duration | ms | 912.7 | 171.5 | 732 | +16.61% |  |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | append rows to large table | completed | duration | ms | 89.7 | 17.3 | 70.7 | +8.07% |  |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | clear rows | completed | duration | ms | 47.3 | 42.1 | 2.8 | +68.93% |  |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | ready memory | completed | memory | MB | 1.3 |  |  | +24.49% |  |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | run memory | completed | memory | MB | 4.4 |  |  | +58.64% |  |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | repeated clear memory | completed | memory | MB | 1.7 |  |  | +37.95% |  |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | total byte weight | completed | size | kB | 23.9 |  |  | +431.11% |  |
