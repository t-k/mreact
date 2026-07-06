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

Raw JSON files are stored in `benchmarks/results/2026-07-06/001/js-framework-benchmark-results`.
Chrome trace files are stored in `benchmarks/results/2026-07-06/001/js-framework-benchmark-traces`.

## Rankings

Lower values are better for all js-framework-benchmark metrics reported here.

### create rows

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | marko-v6.2.2-keyed | create rows | 58.1 | 6.1 | 51 | best |  | ms |
| 2 | **mreact-v0.0.187-local-keyed** | create rows | 58.1 | 6.4 | 50.7 | 0% |  | ms |
| 3 | solid-v1.9.14-keyed | create rows | 58.2 | 6.3 | 51 | +0.17% |  | ms |
| 4 | svelte-v5.56.4-keyed | create rows | 62 | 9 | 52.2 | +6.71% |  | ms |
| 5 | vue-v3.6.0-beta.17-keyed | create rows | 68.9 | 17 | 50.9 | +18.59% |  | ms |
| 6 | react-hooks-v19.2.7-keyed | create rows | 70.3 | 18.2 | 51.2 | +21% |  | ms |
| 7 | **mreact-react-compat-v0.0.187-local-keyed** | create rows | 73.1 | 18.3 | 54.1 | +25.82% |  | ms |
| 8 | **mreact-react-compat-vdom-v0.0.187-local-keyed** | create rows | 81.6 | 26.9 | 52.4 | +40.45% |  | ms |
| 9 | angular-cf-v22.0.0-keyed | create rows | 86.3 | 15.8 | 53.1 | +48.54% |  | ms |

### replace all rows

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | **mreact-v0.0.187-local-keyed** | replace all rows | 64.4 | 11.9 | 51.5 | best |  | ms |
| 2 | marko-v6.2.2-keyed | replace all rows | 65.9 | 12.6 | 52.5 | +2.33% |  | ms |
| 3 | solid-v1.9.14-keyed | replace all rows | 66.7 | 13 | 52.5 | +3.57% |  | ms |
| 4 | svelte-v5.56.4-keyed | replace all rows | 71.1 | 15.9 | 53.2 | +10.4% |  | ms |
| 5 | **mreact-react-compat-v0.0.187-local-keyed** | replace all rows | 74.6 | 20.3 | 53 | +15.84% |  | ms |
| 6 | vue-v3.6.0-beta.17-keyed | replace all rows | 78.7 | 22 | 55.8 | +22.2% |  | ms |
| 7 | react-hooks-v19.2.7-keyed | replace all rows | 83.9 | 28.6 | 53.7 | +30.28% |  | ms |
| 8 | **mreact-react-compat-vdom-v0.0.187-local-keyed** | replace all rows | 84.7 | 31.8 | 51.7 | +31.52% |  | ms |
| 9 | angular-cf-v22.0.0-keyed | replace all rows | 97.6 | 28 | 53.5 | +51.55% |  | ms |

### partial update

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | solid-v1.9.14-keyed | partial update | 38.1 | 2.7 | 32.4 | best |  | ms |
| 2 | **mreact-v0.0.187-local-keyed** | partial update | 38.2 | 1.8 | 33.9 | +0.26% |  | ms |
| 3 | angular-cf-v22.0.0-keyed | partial update | 39.2 | 3.1 | 34.8 | +2.89% |  | ms |
| 4 | svelte-v5.56.4-keyed | partial update | 40.5 | 3.7 | 34.2 | +6.3% |  | ms |
| 5 | marko-v6.2.2-keyed | partial update | 41 | 3.8 | 33.9 | +7.61% |  | ms |
| 6 | vue-v3.6.0-beta.17-keyed | partial update | 44.2 | 5.5 | 36 | +16.01% |  | ms |
| 7 | **mreact-react-compat-v0.0.187-local-keyed** | partial update | 44.5 | 7.2 | 34.7 | +16.8% |  | ms |
| 8 | react-hooks-v19.2.7-keyed | partial update | 46.6 | 9 | 34.7 | +22.31% |  | ms |
| 9 | **mreact-react-compat-vdom-v0.0.187-local-keyed** | partial update | 56.5 | 18.7 | 34.8 | +48.29% |  | ms |

### select row

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | **mreact-v0.0.187-local-keyed** | select row | 7.6 | 0.9 | 5.7 | best |  | ms |
| 2 | marko-v6.2.2-keyed | select row | 7.7 | 1 | 5.6 | +1.32% |  | ms |
| 3 | solid-v1.9.14-keyed | select row | 8.3 | 1.4 | 5.7 | +9.21% |  | ms |
| 4 | vue-v3.6.0-beta.17-keyed | select row | 9.1 | 2.1 | 5.6 | +19.74% |  | ms |
| 5 | angular-cf-v22.0.0-keyed | select row | 10.8 | 3.4 | 6.3 | +42.11% |  | ms |
| 6 | react-hooks-v19.2.7-keyed | select row | 12.4 | 5 | 6.1 | +63.16% |  | ms |
| 7 | **mreact-react-compat-v0.0.187-local-keyed** | select row | 12.5 | 5 | 5.8 | +64.47% |  | ms |
| 8 | svelte-v5.56.4-keyed | select row | 12.5 | 5.4 | 6 | +64.47% |  | ms |
| 9 | **mreact-react-compat-vdom-v0.0.187-local-keyed** | select row | 12.8 | 5.9 | 5.7 | +68.42% |  | ms |

### swap rows

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | angular-cf-v22.0.0-keyed | swap rows | 43.8 | 2.3 | 39.5 | best |  | ms |
| 2 | marko-v6.2.2-keyed | swap rows | 44.3 | 2.4 | 39 | +1.14% |  | ms |
| 3 | **mreact-v0.0.187-local-keyed** | swap rows | 44.8 | 1.6 | 40.3 | +2.28% |  | ms |
| 4 | solid-v1.9.14-keyed | swap rows | 45.1 | 1.7 | 40.4 | +2.97% |  | ms |
| 5 | vue-v3.6.0-beta.17-keyed | swap rows | 46.4 | 2.5 | 40.4 | +5.94% |  | ms |
| 6 | svelte-v5.56.4-keyed | swap rows | 47.2 | 3.3 | 40.2 | +7.76% |  | ms |
| 7 | **mreact-react-compat-v0.0.187-local-keyed** | swap rows | 51.2 | 8.6 | 39.4 | +16.89% |  | ms |
| 8 | **mreact-react-compat-vdom-v0.0.187-local-keyed** | swap rows | 60 | 16.6 | 40.3 | +36.99% |  | ms |
| 9 | react-hooks-v19.2.7-keyed | swap rows | 284.5 | 43.7 | 233.3 | +549.54% |  | ms |

### remove row

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | angular-cf-v22.0.0-keyed | remove row | 30.4 | 1.3 | 28.1 | best |  | ms |
| 2 | solid-v1.9.14-keyed | remove row | 32.1 | 0.7 | 29.6 | +5.59% |  | ms |
| 3 | svelte-v5.56.4-keyed | remove row | 32.1 | 1.5 | 29.3 | +5.59% |  | ms |
| 4 | marko-v6.2.2-keyed | remove row | 33.2 | 1.1 | 30.9 | +9.21% |  | ms |
| 5 | **mreact-react-compat-v0.0.187-local-keyed** | remove row | 34.9 | 2.5 | 30.7 | +14.8% |  | ms |
| 6 | react-hooks-v19.2.7-keyed | remove row | 35.1 | 2.5 | 30.5 | +15.46% |  | ms |
| 7 | **mreact-v0.0.187-local-keyed** | remove row | 36 | 0.9 | 33.3 | +18.42% |  | ms |
| 8 | vue-v3.6.0-beta.17-keyed | remove row | 36.2 | 4.7 | 30.1 | +19.08% |  | ms |
| 9 | **mreact-react-compat-vdom-v0.0.187-local-keyed** | remove row | 36.5 | 5.1 | 29.7 | +20.07% |  | ms |

### create many rows

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | **mreact-v0.0.187-local-keyed** | create many rows | 654.1 | 59.3 | 585.5 | best |  | ms |
| 2 | solid-v1.9.14-keyed | create many rows | 660.9 | 59.1 | 594.7 | +1.04% |  | ms |
| 3 | marko-v6.2.2-keyed | create many rows | 662 | 66.8 | 586.6 | +1.21% |  | ms |
| 4 | svelte-v5.56.4-keyed | create many rows | 673.7 | 80.5 | 587.4 | +3% |  | ms |
| 5 | vue-v3.6.0-beta.17-keyed | create many rows | 761.2 | 138.5 | 615 | +16.37% |  | ms |
| 6 | **mreact-react-compat-v0.0.187-local-keyed** | create many rows | 767 | 153.9 | 603 | +17.26% |  | ms |
| 7 | **mreact-react-compat-vdom-v0.0.187-local-keyed** | create many rows | 846.6 | 232.9 | 604.8 | +29.43% |  | ms |
| 8 | angular-cf-v22.0.0-keyed | create many rows | 862.1 | 163 | 616.8 | +31.8% |  | ms |
| 9 | react-hooks-v19.2.7-keyed | create many rows | 1001.5 | 337.9 | 648.9 | +53.11% |  | ms |

### append rows to large table

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | **mreact-v0.0.187-local-keyed** | append rows to large table | 68.3 | 6.7 | 60 | best |  | ms |
| 2 | solid-v1.9.14-keyed | append rows to large table | 69.2 | 7.8 | 60 | +1.32% |  | ms |
| 3 | marko-v6.2.2-keyed | append rows to large table | 70.2 | 7.7 | 61.1 | +2.78% |  | ms |
| 4 | svelte-v5.56.4-keyed | append rows to large table | 70.8 | 9.1 | 60.4 | +3.66% |  | ms |
| 5 | vue-v3.6.0-beta.17-keyed | append rows to large table | 79.1 | 14.4 | 63.1 | +15.81% |  | ms |
| 6 | **mreact-react-compat-v0.0.187-local-keyed** | append rows to large table | 84.9 | 18 | 64.4 | +24.3% |  | ms |
| 7 | react-hooks-v19.2.7-keyed | append rows to large table | 88.4 | 19.2 | 67.9 | +29.43% |  | ms |
| 8 | angular-cf-v22.0.0-keyed | append rows to large table | 94.2 | 14.2 | 63.9 | +37.92% |  | ms |
| 9 | **mreact-react-compat-vdom-v0.0.187-local-keyed** | append rows to large table | 98.2 | 32.1 | 65.5 | +43.78% |  | ms |

### clear rows

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | marko-v6.2.2-keyed | clear rows | 25 | 21.1 | 2.9 | best |  | ms |
| 2 | **mreact-v0.0.187-local-keyed** | clear rows | 25.5 | 21.7 | 2.8 | +2% |  | ms |
| 3 | svelte-v5.56.4-keyed | clear rows | 27.4 | 23.8 | 3 | +9.6% |  | ms |
| 4 | solid-v1.9.14-keyed | clear rows | 29.6 | 25.9 | 2.6 | +18.4% |  | ms |
| 5 | **mreact-react-compat-vdom-v0.0.187-local-keyed** | clear rows | 35.5 | 31.3 | 3 | +42% |  | ms |
| 6 | vue-v3.6.0-beta.17-keyed | clear rows | 40.3 | 36.5 | 3.1 | +61.2% |  | ms |
| 7 | **mreact-react-compat-v0.0.187-local-keyed** | clear rows | 45.7 | 41.1 | 3.6 | +82.8% |  | ms |
| 8 | react-hooks-v19.2.7-keyed | clear rows | 48.3 | 43.9 | 3 | +93.2% |  | ms |
| 9 | angular-cf-v22.0.0-keyed | clear rows | 53.9 | 49.4 | 3.6 | +115.6% |  | ms |

### ready memory

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | solid-v1.9.14-keyed | ready memory | 1 |  |  | best |  | MB |
| 2 | marko-v6.2.2-keyed | ready memory | 1.1 |  |  | +5.5% |  | MB |
| 3 | **mreact-v0.0.187-local-keyed** | ready memory | 1.1 |  |  | +6.93% |  | MB |
| 4 | svelte-v5.56.4-keyed | ready memory | 1.2 |  |  | +14.4% |  | MB |
| 5 | vue-v3.6.0-beta.17-keyed | ready memory | 1.3 |  |  | +27.23% |  | MB |
| 6 | **mreact-react-compat-vdom-v0.0.187-local-keyed** | ready memory | 1.4 |  |  | +30.18% |  | MB |
| 7 | **mreact-react-compat-v0.0.187-local-keyed** | ready memory | 1.4 |  |  | +32.88% |  | MB |
| 8 | react-hooks-v19.2.7-keyed | ready memory | 1.6 |  |  | +55.46% |  | MB |
| 9 | angular-cf-v22.0.0-keyed | ready memory | 2.1 |  |  | +97.77% |  | MB |

### run memory

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | marko-v6.2.2-keyed | run memory | 2.9 |  |  | best |  | MB |
| 2 | **mreact-v0.0.187-local-keyed** | run memory | 2.9 |  |  | +0.09% |  | MB |
| 3 | solid-v1.9.14-keyed | run memory | 3.1 |  |  | +7.77% |  | MB |
| 4 | svelte-v5.56.4-keyed | run memory | 3.5 |  |  | +20.59% |  | MB |
| 5 | vue-v3.6.0-beta.17-keyed | run memory | 4.4 |  |  | +51.07% |  | MB |
| 6 | **mreact-react-compat-vdom-v0.0.187-local-keyed** | run memory | 4.9 |  |  | +69.32% |  | MB |
| 7 | react-hooks-v19.2.7-keyed | run memory | 4.9 |  |  | +69.45% |  | MB |
| 8 | **mreact-react-compat-v0.0.187-local-keyed** | run memory | 5 |  |  | +71.2% |  | MB |
| 9 | angular-cf-v22.0.0-keyed | run memory | 5.1 |  |  | +74.67% |  | MB |

### repeated clear memory

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | solid-v1.9.14-keyed | repeated clear memory | 1.3 |  |  | best |  | MB |
| 2 | **mreact-v0.0.187-local-keyed** | repeated clear memory | 1.3 |  |  | +0.79% |  | MB |
| 3 | marko-v6.2.2-keyed | repeated clear memory | 1.3 |  |  | +3.54% |  | MB |
| 4 | svelte-v5.56.4-keyed | repeated clear memory | 1.6 |  |  | +24.19% |  | MB |
| 5 | vue-v3.6.0-beta.17-keyed | repeated clear memory | 1.7 |  |  | +30.36% |  | MB |
| 6 | **mreact-react-compat-v0.0.187-local-keyed** | repeated clear memory | 1.9 |  |  | +49.96% |  | MB |
| 7 | **mreact-react-compat-vdom-v0.0.187-local-keyed** | repeated clear memory | 2.4 |  |  | +88.48% |  | MB |
| 8 | react-hooks-v19.2.7-keyed | repeated clear memory | 2.5 |  |  | +93.2% |  | MB |
| 9 | angular-cf-v22.0.0-keyed | repeated clear memory | 2.6 |  |  | +99.89% |  | MB |

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
| js-framework-benchmark | angular-cf-v22.0.0-keyed | create rows | completed | duration | ms | 86.3 | 15.8 | 53.1 | +48.54% |  |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | replace all rows | completed | duration | ms | 97.6 | 28 | 53.5 | +51.55% |  |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | partial update | completed | duration | ms | 39.2 | 3.1 | 34.8 | +2.89% |  |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | select row | completed | duration | ms | 10.8 | 3.4 | 6.3 | +42.11% |  |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | swap rows | completed | duration | ms | 43.8 | 2.3 | 39.5 | best |  |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | remove row | completed | duration | ms | 30.4 | 1.3 | 28.1 | best |  |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | create many rows | completed | duration | ms | 862.1 | 163 | 616.8 | +31.8% |  |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | append rows to large table | completed | duration | ms | 94.2 | 14.2 | 63.9 | +37.92% |  |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | clear rows | completed | duration | ms | 53.9 | 49.4 | 3.6 | +115.6% |  |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | ready memory | completed | memory | MB | 2.1 |  |  | +97.77% |  |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | run memory | completed | memory | MB | 5.1 |  |  | +74.67% |  |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | repeated clear memory | completed | memory | MB | 2.6 |  |  | +99.89% |  |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | total byte weight | completed | size | kB | 44.5 |  |  | +888.89% |  |
| js-framework-benchmark | marko-v6.2.2-keyed | create rows | completed | duration | ms | 58.1 | 6.1 | 51 | best |  |
| js-framework-benchmark | marko-v6.2.2-keyed | replace all rows | completed | duration | ms | 65.9 | 12.6 | 52.5 | +2.33% |  |
| js-framework-benchmark | marko-v6.2.2-keyed | partial update | completed | duration | ms | 41 | 3.8 | 33.9 | +7.61% |  |
| js-framework-benchmark | marko-v6.2.2-keyed | select row | completed | duration | ms | 7.7 | 1 | 5.6 | +1.32% |  |
| js-framework-benchmark | marko-v6.2.2-keyed | swap rows | completed | duration | ms | 44.3 | 2.4 | 39 | +1.14% |  |
| js-framework-benchmark | marko-v6.2.2-keyed | remove row | completed | duration | ms | 33.2 | 1.1 | 30.9 | +9.21% |  |
| js-framework-benchmark | marko-v6.2.2-keyed | create many rows | completed | duration | ms | 662 | 66.8 | 586.6 | +1.21% |  |
| js-framework-benchmark | marko-v6.2.2-keyed | append rows to large table | completed | duration | ms | 70.2 | 7.7 | 61.1 | +2.78% |  |
| js-framework-benchmark | marko-v6.2.2-keyed | clear rows | completed | duration | ms | 25 | 21.1 | 2.9 | best |  |
| js-framework-benchmark | marko-v6.2.2-keyed | ready memory | completed | memory | MB | 1.1 |  |  | +5.5% |  |
| js-framework-benchmark | marko-v6.2.2-keyed | run memory | completed | memory | MB | 2.9 |  |  | best |  |
| js-framework-benchmark | marko-v6.2.2-keyed | repeated clear memory | completed | memory | MB | 1.3 |  |  | +3.54% |  |
| js-framework-benchmark | marko-v6.2.2-keyed | total byte weight | completed | size | kB | 5 |  |  | +11.11% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.187-local-keyed** | create rows | completed | duration | ms | 73.1 | 18.3 | 54.1 | +25.82% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.187-local-keyed** | replace all rows | completed | duration | ms | 74.6 | 20.3 | 53 | +15.84% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.187-local-keyed** | partial update | completed | duration | ms | 44.5 | 7.2 | 34.7 | +16.8% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.187-local-keyed** | select row | completed | duration | ms | 12.5 | 5 | 5.8 | +64.47% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.187-local-keyed** | swap rows | completed | duration | ms | 51.2 | 8.6 | 39.4 | +16.89% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.187-local-keyed** | remove row | completed | duration | ms | 34.9 | 2.5 | 30.7 | +14.8% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.187-local-keyed** | create many rows | completed | duration | ms | 767 | 153.9 | 603 | +17.26% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.187-local-keyed** | append rows to large table | completed | duration | ms | 84.9 | 18 | 64.4 | +24.3% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.187-local-keyed** | clear rows | completed | duration | ms | 45.7 | 41.1 | 3.6 | +82.8% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.187-local-keyed** | ready memory | completed | memory | MB | 1.4 |  |  | +32.88% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.187-local-keyed** | run memory | completed | memory | MB | 5 |  |  | +71.2% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.187-local-keyed** | repeated clear memory | completed | memory | MB | 1.9 |  |  | +49.96% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.187-local-keyed** | total byte weight | completed | size | kB | 31.6 |  |  | +602.22% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.187-local-keyed** | create rows | completed | duration | ms | 81.6 | 26.9 | 52.4 | +40.45% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.187-local-keyed** | replace all rows | completed | duration | ms | 84.7 | 31.8 | 51.7 | +31.52% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.187-local-keyed** | partial update | completed | duration | ms | 56.5 | 18.7 | 34.8 | +48.29% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.187-local-keyed** | select row | completed | duration | ms | 12.8 | 5.9 | 5.7 | +68.42% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.187-local-keyed** | swap rows | completed | duration | ms | 60 | 16.6 | 40.3 | +36.99% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.187-local-keyed** | remove row | completed | duration | ms | 36.5 | 5.1 | 29.7 | +20.07% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.187-local-keyed** | create many rows | completed | duration | ms | 846.6 | 232.9 | 604.8 | +29.43% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.187-local-keyed** | append rows to large table | completed | duration | ms | 98.2 | 32.1 | 65.5 | +43.78% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.187-local-keyed** | clear rows | completed | duration | ms | 35.5 | 31.3 | 3 | +42% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.187-local-keyed** | ready memory | completed | memory | MB | 1.4 |  |  | +30.18% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.187-local-keyed** | run memory | completed | memory | MB | 4.9 |  |  | +69.32% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.187-local-keyed** | repeated clear memory | completed | memory | MB | 2.4 |  |  | +88.48% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.187-local-keyed** | total byte weight | completed | size | kB | 29.1 |  |  | +546.67% |  |
| js-framework-benchmark | **mreact-v0.0.187-local-keyed** | create rows | completed | duration | ms | 58.1 | 6.4 | 50.7 | 0% |  |
| js-framework-benchmark | **mreact-v0.0.187-local-keyed** | replace all rows | completed | duration | ms | 64.4 | 11.9 | 51.5 | best |  |
| js-framework-benchmark | **mreact-v0.0.187-local-keyed** | partial update | completed | duration | ms | 38.2 | 1.8 | 33.9 | +0.26% |  |
| js-framework-benchmark | **mreact-v0.0.187-local-keyed** | select row | completed | duration | ms | 7.6 | 0.9 | 5.7 | best |  |
| js-framework-benchmark | **mreact-v0.0.187-local-keyed** | swap rows | completed | duration | ms | 44.8 | 1.6 | 40.3 | +2.28% |  |
| js-framework-benchmark | **mreact-v0.0.187-local-keyed** | remove row | completed | duration | ms | 36 | 0.9 | 33.3 | +18.42% |  |
| js-framework-benchmark | **mreact-v0.0.187-local-keyed** | create many rows | completed | duration | ms | 654.1 | 59.3 | 585.5 | best |  |
| js-framework-benchmark | **mreact-v0.0.187-local-keyed** | append rows to large table | completed | duration | ms | 68.3 | 6.7 | 60 | best |  |
| js-framework-benchmark | **mreact-v0.0.187-local-keyed** | clear rows | completed | duration | ms | 25.5 | 21.7 | 2.8 | +2% |  |
| js-framework-benchmark | **mreact-v0.0.187-local-keyed** | ready memory | completed | memory | MB | 1.1 |  |  | +6.93% |  |
| js-framework-benchmark | **mreact-v0.0.187-local-keyed** | run memory | completed | memory | MB | 2.9 |  |  | +0.09% |  |
| js-framework-benchmark | **mreact-v0.0.187-local-keyed** | repeated clear memory | completed | memory | MB | 1.3 |  |  | +0.79% |  |
| js-framework-benchmark | **mreact-v0.0.187-local-keyed** | total byte weight | completed | size | kB | 8.8 |  |  | +95.56% |  |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | create rows | completed | duration | ms | 70.3 | 18.2 | 51.2 | +21% |  |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | replace all rows | completed | duration | ms | 83.9 | 28.6 | 53.7 | +30.28% |  |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | partial update | completed | duration | ms | 46.6 | 9 | 34.7 | +22.31% |  |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | select row | completed | duration | ms | 12.4 | 5 | 6.1 | +63.16% |  |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | swap rows | completed | duration | ms | 284.5 | 43.7 | 233.3 | +549.54% |  |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | remove row | completed | duration | ms | 35.1 | 2.5 | 30.5 | +15.46% |  |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | create many rows | completed | duration | ms | 1001.5 | 337.9 | 648.9 | +53.11% |  |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | append rows to large table | completed | duration | ms | 88.4 | 19.2 | 67.9 | +29.43% |  |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | clear rows | completed | duration | ms | 48.3 | 43.9 | 3 | +93.2% |  |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | ready memory | completed | memory | MB | 1.6 |  |  | +55.46% |  |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | run memory | completed | memory | MB | 4.9 |  |  | +69.45% |  |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | repeated clear memory | completed | memory | MB | 2.5 |  |  | +93.2% |  |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | total byte weight | completed | size | kB | 51.4 |  |  | +1042.22% |  |
| js-framework-benchmark | solid-v1.9.14-keyed | create rows | completed | duration | ms | 58.2 | 6.3 | 51 | +0.17% |  |
| js-framework-benchmark | solid-v1.9.14-keyed | replace all rows | completed | duration | ms | 66.7 | 13 | 52.5 | +3.57% |  |
| js-framework-benchmark | solid-v1.9.14-keyed | partial update | completed | duration | ms | 38.1 | 2.7 | 32.4 | best |  |
| js-framework-benchmark | solid-v1.9.14-keyed | select row | completed | duration | ms | 8.3 | 1.4 | 5.7 | +9.21% |  |
| js-framework-benchmark | solid-v1.9.14-keyed | swap rows | completed | duration | ms | 45.1 | 1.7 | 40.4 | +2.97% |  |
| js-framework-benchmark | solid-v1.9.14-keyed | remove row | completed | duration | ms | 32.1 | 0.7 | 29.6 | +5.59% |  |
| js-framework-benchmark | solid-v1.9.14-keyed | create many rows | completed | duration | ms | 660.9 | 59.1 | 594.7 | +1.04% |  |
| js-framework-benchmark | solid-v1.9.14-keyed | append rows to large table | completed | duration | ms | 69.2 | 7.8 | 60 | +1.32% |  |
| js-framework-benchmark | solid-v1.9.14-keyed | clear rows | completed | duration | ms | 29.6 | 25.9 | 2.6 | +18.4% |  |
| js-framework-benchmark | solid-v1.9.14-keyed | ready memory | completed | memory | MB | 1 |  |  | best |  |
| js-framework-benchmark | solid-v1.9.14-keyed | run memory | completed | memory | MB | 3.1 |  |  | +7.77% |  |
| js-framework-benchmark | solid-v1.9.14-keyed | repeated clear memory | completed | memory | MB | 1.3 |  |  | best |  |
| js-framework-benchmark | solid-v1.9.14-keyed | total byte weight | completed | size | kB | 4.5 |  |  | best |  |
| js-framework-benchmark | svelte-v5.56.4-keyed | create rows | completed | duration | ms | 62 | 9 | 52.2 | +6.71% |  |
| js-framework-benchmark | svelte-v5.56.4-keyed | replace all rows | completed | duration | ms | 71.1 | 15.9 | 53.2 | +10.4% |  |
| js-framework-benchmark | svelte-v5.56.4-keyed | partial update | completed | duration | ms | 40.5 | 3.7 | 34.2 | +6.3% |  |
| js-framework-benchmark | svelte-v5.56.4-keyed | select row | completed | duration | ms | 12.5 | 5.4 | 6 | +64.47% |  |
| js-framework-benchmark | svelte-v5.56.4-keyed | swap rows | completed | duration | ms | 47.2 | 3.3 | 40.2 | +7.76% |  |
| js-framework-benchmark | svelte-v5.56.4-keyed | remove row | completed | duration | ms | 32.1 | 1.5 | 29.3 | +5.59% |  |
| js-framework-benchmark | svelte-v5.56.4-keyed | create many rows | completed | duration | ms | 673.7 | 80.5 | 587.4 | +3% |  |
| js-framework-benchmark | svelte-v5.56.4-keyed | append rows to large table | completed | duration | ms | 70.8 | 9.1 | 60.4 | +3.66% |  |
| js-framework-benchmark | svelte-v5.56.4-keyed | clear rows | completed | duration | ms | 27.4 | 23.8 | 3 | +9.6% |  |
| js-framework-benchmark | svelte-v5.56.4-keyed | ready memory | completed | memory | MB | 1.2 |  |  | +14.4% |  |
| js-framework-benchmark | svelte-v5.56.4-keyed | run memory | completed | memory | MB | 3.5 |  |  | +20.59% |  |
| js-framework-benchmark | svelte-v5.56.4-keyed | repeated clear memory | completed | memory | MB | 1.6 |  |  | +24.19% |  |
| js-framework-benchmark | svelte-v5.56.4-keyed | total byte weight | completed | size | kB | 14.3 |  |  | +217.78% |  |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | create rows | completed | duration | ms | 68.9 | 17 | 50.9 | +18.59% |  |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | replace all rows | completed | duration | ms | 78.7 | 22 | 55.8 | +22.2% |  |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | partial update | completed | duration | ms | 44.2 | 5.5 | 36 | +16.01% |  |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | select row | completed | duration | ms | 9.1 | 2.1 | 5.6 | +19.74% |  |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | swap rows | completed | duration | ms | 46.4 | 2.5 | 40.4 | +5.94% |  |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | remove row | completed | duration | ms | 36.2 | 4.7 | 30.1 | +19.08% |  |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | create many rows | completed | duration | ms | 761.2 | 138.5 | 615 | +16.37% |  |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | append rows to large table | completed | duration | ms | 79.1 | 14.4 | 63.1 | +15.81% |  |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | clear rows | completed | duration | ms | 40.3 | 36.5 | 3.1 | +61.2% |  |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | ready memory | completed | memory | MB | 1.3 |  |  | +27.23% |  |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | run memory | completed | memory | MB | 4.4 |  |  | +51.07% |  |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | repeated clear memory | completed | memory | MB | 1.7 |  |  | +30.36% |  |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | total byte weight | completed | size | kB | 23.9 |  |  | +431.11% |  |
