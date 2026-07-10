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

Raw JSON files are stored in `benchmarks/results/2026-07-10/001/js-framework-benchmark-results`.
Chrome trace files are stored in `benchmarks/results/2026-07-10/001/js-framework-benchmark-traces`.

## Rankings

Lower values are better for all js-framework-benchmark metrics reported here.

### create rows

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | solid-v1.9.14-keyed | create rows | 70.6 | 7.6 | 62.1 | best |  | ms |
| 2 | marko-v6.2.5-keyed | create rows | 71.6 | 8 | 62.6 | +1.42% |  | ms |
| 3 | **mreact-v0.0.190-local-keyed** | create rows | 73.2 | 8.4 | 63.6 | +3.68% |  | ms |
| 4 | svelte-v5.56.4-keyed | create rows | 74 | 10.5 | 62.5 | +4.82% |  | ms |
| 5 | vue-v3.6.0-beta.17-keyed | create rows | 85.5 | 20.7 | 63.7 | +21.1% |  | ms |
| 6 | **mreact-react-compat-v0.0.190-local-keyed** | create rows | 86.5 | 21.9 | 63.4 | +22.52% |  | ms |
| 7 | react-hooks-v19.2.7-keyed | create rows | 87.6 | 22.5 | 64 | +24.08% |  | ms |
| 8 | **mreact-react-compat-vdom-v0.0.190-local-keyed** | create rows | 96.8 | 32.7 | 62.7 | +37.11% |  | ms |
| 9 | angular-cf-v22.0.0-keyed | create rows | 101.9 | 19.4 | 64.4 | +44.33% |  | ms |

### replace all rows

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | marko-v6.2.5-keyed | replace all rows | 76.3 | 14.6 | 60.6 | best |  | ms |
| 2 | solid-v1.9.14-keyed | replace all rows | 76.3 | 14.9 | 60.3 | 0% |  | ms |
| 3 | **mreact-v0.0.190-local-keyed** | replace all rows | 78.2 | 14.3 | 62.6 | +2.49% |  | ms |
| 4 | svelte-v5.56.4-keyed | replace all rows | 84.7 | 18.9 | 63.6 | +11.01% |  | ms |
| 5 | **mreact-react-compat-v0.0.190-local-keyed** | replace all rows | 88.9 | 25 | 62.8 | +16.51% |  | ms |
| 6 | vue-v3.6.0-beta.17-keyed | replace all rows | 94.8 | 27.2 | 66.1 | +24.25% |  | ms |
| 7 | react-hooks-v19.2.7-keyed | replace all rows | 100.7 | 35 | 64.7 | +31.98% |  | ms |
| 8 | **mreact-react-compat-vdom-v0.0.190-local-keyed** | replace all rows | 105.6 | 41.4 | 63 | +38.4% |  | ms |
| 9 | angular-cf-v22.0.0-keyed | replace all rows | 115.2 | 32.8 | 66.6 | +50.98% |  | ms |

### partial update

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | **mreact-v0.0.190-local-keyed** | partial update | 42.1 | 2 | 37 | best |  | ms |
| 2 | angular-cf-v22.0.0-keyed | partial update | 43.7 | 2.9 | 38.8 | +3.8% |  | ms |
| 3 | svelte-v5.56.4-keyed | partial update | 49.8 | 4.4 | 42.2 | +18.29% |  | ms |
| 4 | marko-v6.2.5-keyed | partial update | 50.4 | 4.4 | 43 | +19.71% |  | ms |
| 5 | solid-v1.9.14-keyed | partial update | 51.4 | 3.2 | 43.5 | +22.09% |  | ms |
| 6 | **mreact-react-compat-v0.0.190-local-keyed** | partial update | 53.7 | 9.2 | 41.2 | +27.55% |  | ms |
| 7 | vue-v3.6.0-beta.17-keyed | partial update | 62.1 | 7.2 | 49.2 | +47.51% |  | ms |
| 8 | react-hooks-v19.2.7-keyed | partial update | 63.1 | 11.8 | 47.8 | +49.88% |  | ms |
| 9 | **mreact-react-compat-vdom-v0.0.190-local-keyed** | partial update | 71 | 23.2 | 43.5 | +68.65% |  | ms |

### select row

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | **mreact-v0.0.190-local-keyed** | select row | 9.6 | 1.1 | 7.2 | best |  | ms |
| 2 | marko-v6.2.5-keyed | select row | 10.5 | 1.6 | 7.4 | +9.38% |  | ms |
| 3 | solid-v1.9.14-keyed | select row | 11.3 | 1.9 | 7.7 | +17.71% |  | ms |
| 4 | vue-v3.6.0-beta.17-keyed | select row | 12.7 | 2.9 | 8.5 | +32.29% |  | ms |
| 5 | angular-cf-v22.0.0-keyed | select row | 14.7 | 4.2 | 8.6 | +53.13% |  | ms |
| 6 | **mreact-react-compat-v0.0.190-local-keyed** | select row | 16.8 | 7 | 7.9 | +75% |  | ms |
| 7 | svelte-v5.56.4-keyed | select row | 17.2 | 6.3 | 9.2 | +79.17% |  | ms |
| 8 | react-hooks-v19.2.7-keyed | select row | 17.8 | 6.9 | 9.1 | +85.42% |  | ms |
| 9 | **mreact-react-compat-vdom-v0.0.190-local-keyed** | select row | 18.8 | 7.8 | 8.4 | +95.83% |  | ms |

### swap rows

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | marko-v6.2.5-keyed | swap rows | 58.9 | 3.2 | 51.4 | best |  | ms |
| 2 | **mreact-v0.0.190-local-keyed** | swap rows | 59.5 | 2.1 | 53.8 | +1.02% |  | ms |
| 3 | vue-v3.6.0-beta.17-keyed | swap rows | 65.3 | 3.4 | 56.8 | +10.87% |  | ms |
| 4 | angular-cf-v22.0.0-keyed | swap rows | 65.8 | 3.4 | 59.1 | +11.71% |  | ms |
| 5 | solid-v1.9.14-keyed | swap rows | 66.5 | 2.4 | 59.3 | +12.9% |  | ms |
| 6 | svelte-v5.56.4-keyed | swap rows | 66.6 | 4.5 | 58.2 | +13.07% |  | ms |
| 7 | **mreact-react-compat-v0.0.190-local-keyed** | swap rows | 73.2 | 11.6 | 56.4 | +24.28% |  | ms |
| 8 | **mreact-react-compat-vdom-v0.0.190-local-keyed** | swap rows | 87.1 | 23.3 | 57.9 | +47.88% |  | ms |
| 9 | react-hooks-v19.2.7-keyed | swap rows | 384.1 | 55.6 | 319.7 | +552.12% |  | ms |

### remove row

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | angular-cf-v22.0.0-keyed | remove row | 40.3 | 1.9 | 37.5 | best |  | ms |
| 2 | solid-v1.9.14-keyed | remove row | 40.5 | 0.9 | 37.3 | +0.5% |  | ms |
| 3 | svelte-v5.56.4-keyed | remove row | 42 | 1.6 | 37.6 | +4.22% |  | ms |
| 4 | **mreact-react-compat-v0.0.190-local-keyed** | remove row | 42.4 | 3 | 37.4 | +5.21% |  | ms |
| 5 | **mreact-v0.0.190-local-keyed** | remove row | 44.5 | 1 | 40.7 | +10.42% |  | ms |
| 6 | react-hooks-v19.2.7-keyed | remove row | 46.6 | 2.7 | 40.7 | +15.63% |  | ms |
| 7 | **mreact-react-compat-vdom-v0.0.190-local-keyed** | remove row | 47.2 | 5.4 | 38.2 | +17.12% |  | ms |
| 8 | marko-v6.2.5-keyed | remove row | 47.3 | 1.1 | 43.5 | +17.37% |  | ms |
| 9 | vue-v3.6.0-beta.17-keyed | remove row | 49.2 | 5.8 | 40.8 | +22.08% |  | ms |

### create many rows

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | **mreact-v0.0.190-local-keyed** | create many rows | 805.1 | 72.4 | 723.3 | best |  | ms |
| 2 | solid-v1.9.14-keyed | create many rows | 807.7 | 74.7 | 724.2 | +0.32% |  | ms |
| 3 | marko-v6.2.5-keyed | create many rows | 812.3 | 83.6 | 720.3 | +0.89% |  | ms |
| 4 | svelte-v5.56.4-keyed | create many rows | 833.1 | 98.6 | 723.7 | +3.48% |  | ms |
| 5 | vue-v3.6.0-beta.17-keyed | create many rows | 937.1 | 168.2 | 758.4 | +16.4% |  | ms |
| 6 | **mreact-react-compat-v0.0.190-local-keyed** | create many rows | 945.7 | 186.3 | 750.9 | +17.46% |  | ms |
| 7 | **mreact-react-compat-vdom-v0.0.190-local-keyed** | create many rows | 1050 | 290.8 | 750.5 | +30.42% |  | ms |
| 8 | angular-cf-v22.0.0-keyed | create many rows | 1054.8 | 205.4 | 760.3 | +31.01% |  | ms |
| 9 | react-hooks-v19.2.7-keyed | create many rows | 1275.4 | 481.6 | 790.9 | +58.42% |  | ms |

### append rows to large table

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | **mreact-v0.0.190-local-keyed** | append rows to large table | 83.5 | 8.4 | 73.3 | best |  | ms |
| 2 | marko-v6.2.5-keyed | append rows to large table | 84 | 9.3 | 73.2 | +0.6% |  | ms |
| 3 | solid-v1.9.14-keyed | append rows to large table | 85 | 9.1 | 74.5 | +1.8% |  | ms |
| 4 | svelte-v5.56.4-keyed | append rows to large table | 90.9 | 11 | 78.3 | +8.86% |  | ms |
| 5 | vue-v3.6.0-beta.17-keyed | append rows to large table | 97.4 | 18 | 78 | +16.65% |  | ms |
| 6 | **mreact-react-compat-v0.0.190-local-keyed** | append rows to large table | 98.5 | 21 | 75.6 | +17.96% |  | ms |
| 7 | react-hooks-v19.2.7-keyed | append rows to large table | 99.4 | 22.9 | 74.8 | +19.04% |  | ms |
| 8 | angular-cf-v22.0.0-keyed | append rows to large table | 106.1 | 17.2 | 74.3 | +27.07% |  | ms |
| 9 | **mreact-react-compat-vdom-v0.0.190-local-keyed** | append rows to large table | 113.4 | 34.5 | 76.2 | +35.81% |  | ms |

### clear rows

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | marko-v6.2.5-keyed | clear rows | 29 | 24.5 | 3.1 | best |  | ms |
| 2 | **mreact-v0.0.190-local-keyed** | clear rows | 32.5 | 27.5 | 3.4 | +12.07% |  | ms |
| 3 | svelte-v5.56.4-keyed | clear rows | 32.5 | 28.2 | 3.5 | +12.07% |  | ms |
| 4 | solid-v1.9.14-keyed | clear rows | 34.7 | 30.2 | 3.2 | +19.66% |  | ms |
| 5 | **mreact-react-compat-vdom-v0.0.190-local-keyed** | clear rows | 42.7 | 37.9 | 3.6 | +47.24% |  | ms |
| 6 | vue-v3.6.0-beta.17-keyed | clear rows | 45.8 | 40.7 | 2.9 | +57.93% |  | ms |
| 7 | **mreact-react-compat-v0.0.190-local-keyed** | clear rows | 54.7 | 49.8 | 3.7 | +88.62% |  | ms |
| 8 | react-hooks-v19.2.7-keyed | clear rows | 58.9 | 53.9 | 3 | +103.1% |  | ms |
| 9 | angular-cf-v22.0.0-keyed | clear rows | 66.2 | 61.1 | 4 | +128.28% |  | ms |

### ready memory

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | marko-v6.2.5-keyed | ready memory | 1.1 |  |  | best |  | MB |
| 2 | solid-v1.9.14-keyed | ready memory | 1.1 |  |  | +1.83% |  | MB |
| 3 | **mreact-v0.0.190-local-keyed** | ready memory | 1.1 |  |  | +2.37% |  | MB |
| 4 | svelte-v5.56.4-keyed | ready memory | 1.2 |  |  | +12.34% |  | MB |
| 5 | vue-v3.6.0-beta.17-keyed | ready memory | 1.3 |  |  | +26.02% |  | MB |
| 6 | **mreact-react-compat-vdom-v0.0.190-local-keyed** | ready memory | 1.4 |  |  | +26.99% |  | MB |
| 7 | **mreact-react-compat-v0.0.190-local-keyed** | ready memory | 1.4 |  |  | +27.82% |  | MB |
| 8 | react-hooks-v19.2.7-keyed | ready memory | 1.7 |  |  | +54.71% |  | MB |
| 9 | angular-cf-v22.0.0-keyed | ready memory | 2.1 |  |  | +92.5% |  | MB |

### run memory

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | marko-v6.2.5-keyed | run memory | 2.7 |  |  | best |  | MB |
| 2 | **mreact-v0.0.190-local-keyed** | run memory | 2.8 |  |  | +4.04% |  | MB |
| 3 | solid-v1.9.14-keyed | run memory | 3.2 |  |  | +16.39% |  | MB |
| 4 | svelte-v5.56.4-keyed | run memory | 3.5 |  |  | +29.82% |  | MB |
| 5 | vue-v3.6.0-beta.17-keyed | run memory | 4.4 |  |  | +63.33% |  | MB |
| 6 | **mreact-react-compat-vdom-v0.0.190-local-keyed** | run memory | 4.9 |  |  | +79.3% |  | MB |
| 7 | react-hooks-v19.2.7-keyed | run memory | 4.9 |  |  | +81.21% |  | MB |
| 8 | **mreact-react-compat-v0.0.190-local-keyed** | run memory | 4.9 |  |  | +82.35% |  | MB |
| 9 | angular-cf-v22.0.0-keyed | run memory | 5 |  |  | +85.68% |  | MB |

### repeated clear memory

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | solid-v1.9.14-keyed | repeated clear memory | 1.3 |  |  | best |  | MB |
| 2 | **mreact-v0.0.190-local-keyed** | repeated clear memory | 1.3 |  |  | +2.77% |  | MB |
| 3 | marko-v6.2.5-keyed | repeated clear memory | 1.4 |  |  | +10.66% |  | MB |
| 4 | svelte-v5.56.4-keyed | repeated clear memory | 1.5 |  |  | +21.17% |  | MB |
| 5 | vue-v3.6.0-beta.17-keyed | repeated clear memory | 1.7 |  |  | +37.31% |  | MB |
| 6 | **mreact-react-compat-v0.0.190-local-keyed** | repeated clear memory | 1.9 |  |  | +50.73% |  | MB |
| 7 | **mreact-react-compat-vdom-v0.0.190-local-keyed** | repeated clear memory | 2.4 |  |  | +93.1% |  | MB |
| 8 | react-hooks-v19.2.7-keyed | repeated clear memory | 2.5 |  |  | +94.89% |  | MB |
| 9 | angular-cf-v22.0.0-keyed | repeated clear memory | 2.7 |  |  | +110.18% |  | MB |

### total byte weight

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | solid-v1.9.14-keyed | total byte weight | 4.5 |  |  | best |  | kB |
| 2 | marko-v6.2.5-keyed | total byte weight | 4.9 |  |  | +8.89% |  | kB |
| 3 | **mreact-v0.0.190-local-keyed** | total byte weight | 8.8 |  |  | +95.56% |  | kB |
| 4 | svelte-v5.56.4-keyed | total byte weight | 14.3 |  |  | +217.78% |  | kB |
| 5 | vue-v3.6.0-beta.17-keyed | total byte weight | 23.9 |  |  | +431.11% |  | kB |
| 6 | **mreact-react-compat-vdom-v0.0.190-local-keyed** | total byte weight | 29.9 |  |  | +564.44% |  | kB |
| 7 | **mreact-react-compat-v0.0.190-local-keyed** | total byte weight | 31.6 |  |  | +602.22% |  | kB |
| 8 | angular-cf-v22.0.0-keyed | total byte weight | 44.5 |  |  | +888.89% |  | kB |
| 9 | react-hooks-v19.2.7-keyed | total byte weight | 51.4 |  |  | +1042.22% |  | kB |

## Results

| suite | framework | case | status | metric | unit | value | script | paint | diff vs 1st | diff vs react-hooks |
| --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | create rows | completed | duration | ms | 101.9 | 19.4 | 64.4 | +44.33% |  |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | replace all rows | completed | duration | ms | 115.2 | 32.8 | 66.6 | +50.98% |  |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | partial update | completed | duration | ms | 43.7 | 2.9 | 38.8 | +3.8% |  |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | select row | completed | duration | ms | 14.7 | 4.2 | 8.6 | +53.13% |  |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | swap rows | completed | duration | ms | 65.8 | 3.4 | 59.1 | +11.71% |  |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | remove row | completed | duration | ms | 40.3 | 1.9 | 37.5 | best |  |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | create many rows | completed | duration | ms | 1054.8 | 205.4 | 760.3 | +31.01% |  |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | append rows to large table | completed | duration | ms | 106.1 | 17.2 | 74.3 | +27.07% |  |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | clear rows | completed | duration | ms | 66.2 | 61.1 | 4 | +128.28% |  |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | ready memory | completed | memory | MB | 2.1 |  |  | +92.5% |  |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | run memory | completed | memory | MB | 5 |  |  | +85.68% |  |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | repeated clear memory | completed | memory | MB | 2.7 |  |  | +110.18% |  |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | total byte weight | completed | size | kB | 44.5 |  |  | +888.89% |  |
| js-framework-benchmark | marko-v6.2.5-keyed | create rows | completed | duration | ms | 71.6 | 8 | 62.6 | +1.42% |  |
| js-framework-benchmark | marko-v6.2.5-keyed | replace all rows | completed | duration | ms | 76.3 | 14.6 | 60.6 | best |  |
| js-framework-benchmark | marko-v6.2.5-keyed | partial update | completed | duration | ms | 50.4 | 4.4 | 43 | +19.71% |  |
| js-framework-benchmark | marko-v6.2.5-keyed | select row | completed | duration | ms | 10.5 | 1.6 | 7.4 | +9.38% |  |
| js-framework-benchmark | marko-v6.2.5-keyed | swap rows | completed | duration | ms | 58.9 | 3.2 | 51.4 | best |  |
| js-framework-benchmark | marko-v6.2.5-keyed | remove row | completed | duration | ms | 47.3 | 1.1 | 43.5 | +17.37% |  |
| js-framework-benchmark | marko-v6.2.5-keyed | create many rows | completed | duration | ms | 812.3 | 83.6 | 720.3 | +0.89% |  |
| js-framework-benchmark | marko-v6.2.5-keyed | append rows to large table | completed | duration | ms | 84 | 9.3 | 73.2 | +0.6% |  |
| js-framework-benchmark | marko-v6.2.5-keyed | clear rows | completed | duration | ms | 29 | 24.5 | 3.1 | best |  |
| js-framework-benchmark | marko-v6.2.5-keyed | ready memory | completed | memory | MB | 1.1 |  |  | best |  |
| js-framework-benchmark | marko-v6.2.5-keyed | run memory | completed | memory | MB | 2.7 |  |  | best |  |
| js-framework-benchmark | marko-v6.2.5-keyed | repeated clear memory | completed | memory | MB | 1.4 |  |  | +10.66% |  |
| js-framework-benchmark | marko-v6.2.5-keyed | total byte weight | completed | size | kB | 4.9 |  |  | +8.89% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.190-local-keyed** | create rows | completed | duration | ms | 86.5 | 21.9 | 63.4 | +22.52% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.190-local-keyed** | replace all rows | completed | duration | ms | 88.9 | 25 | 62.8 | +16.51% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.190-local-keyed** | partial update | completed | duration | ms | 53.7 | 9.2 | 41.2 | +27.55% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.190-local-keyed** | select row | completed | duration | ms | 16.8 | 7 | 7.9 | +75% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.190-local-keyed** | swap rows | completed | duration | ms | 73.2 | 11.6 | 56.4 | +24.28% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.190-local-keyed** | remove row | completed | duration | ms | 42.4 | 3 | 37.4 | +5.21% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.190-local-keyed** | create many rows | completed | duration | ms | 945.7 | 186.3 | 750.9 | +17.46% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.190-local-keyed** | append rows to large table | completed | duration | ms | 98.5 | 21 | 75.6 | +17.96% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.190-local-keyed** | clear rows | completed | duration | ms | 54.7 | 49.8 | 3.7 | +88.62% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.190-local-keyed** | ready memory | completed | memory | MB | 1.4 |  |  | +27.82% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.190-local-keyed** | run memory | completed | memory | MB | 4.9 |  |  | +82.35% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.190-local-keyed** | repeated clear memory | completed | memory | MB | 1.9 |  |  | +50.73% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.190-local-keyed** | total byte weight | completed | size | kB | 31.6 |  |  | +602.22% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.190-local-keyed** | create rows | completed | duration | ms | 96.8 | 32.7 | 62.7 | +37.11% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.190-local-keyed** | replace all rows | completed | duration | ms | 105.6 | 41.4 | 63 | +38.4% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.190-local-keyed** | partial update | completed | duration | ms | 71 | 23.2 | 43.5 | +68.65% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.190-local-keyed** | select row | completed | duration | ms | 18.8 | 7.8 | 8.4 | +95.83% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.190-local-keyed** | swap rows | completed | duration | ms | 87.1 | 23.3 | 57.9 | +47.88% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.190-local-keyed** | remove row | completed | duration | ms | 47.2 | 5.4 | 38.2 | +17.12% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.190-local-keyed** | create many rows | completed | duration | ms | 1050 | 290.8 | 750.5 | +30.42% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.190-local-keyed** | append rows to large table | completed | duration | ms | 113.4 | 34.5 | 76.2 | +35.81% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.190-local-keyed** | clear rows | completed | duration | ms | 42.7 | 37.9 | 3.6 | +47.24% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.190-local-keyed** | ready memory | completed | memory | MB | 1.4 |  |  | +26.99% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.190-local-keyed** | run memory | completed | memory | MB | 4.9 |  |  | +79.3% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.190-local-keyed** | repeated clear memory | completed | memory | MB | 2.4 |  |  | +93.1% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.190-local-keyed** | total byte weight | completed | size | kB | 29.9 |  |  | +564.44% |  |
| js-framework-benchmark | **mreact-v0.0.190-local-keyed** | create rows | completed | duration | ms | 73.2 | 8.4 | 63.6 | +3.68% |  |
| js-framework-benchmark | **mreact-v0.0.190-local-keyed** | replace all rows | completed | duration | ms | 78.2 | 14.3 | 62.6 | +2.49% |  |
| js-framework-benchmark | **mreact-v0.0.190-local-keyed** | partial update | completed | duration | ms | 42.1 | 2 | 37 | best |  |
| js-framework-benchmark | **mreact-v0.0.190-local-keyed** | select row | completed | duration | ms | 9.6 | 1.1 | 7.2 | best |  |
| js-framework-benchmark | **mreact-v0.0.190-local-keyed** | swap rows | completed | duration | ms | 59.5 | 2.1 | 53.8 | +1.02% |  |
| js-framework-benchmark | **mreact-v0.0.190-local-keyed** | remove row | completed | duration | ms | 44.5 | 1 | 40.7 | +10.42% |  |
| js-framework-benchmark | **mreact-v0.0.190-local-keyed** | create many rows | completed | duration | ms | 805.1 | 72.4 | 723.3 | best |  |
| js-framework-benchmark | **mreact-v0.0.190-local-keyed** | append rows to large table | completed | duration | ms | 83.5 | 8.4 | 73.3 | best |  |
| js-framework-benchmark | **mreact-v0.0.190-local-keyed** | clear rows | completed | duration | ms | 32.5 | 27.5 | 3.4 | +12.07% |  |
| js-framework-benchmark | **mreact-v0.0.190-local-keyed** | ready memory | completed | memory | MB | 1.1 |  |  | +2.37% |  |
| js-framework-benchmark | **mreact-v0.0.190-local-keyed** | run memory | completed | memory | MB | 2.8 |  |  | +4.04% |  |
| js-framework-benchmark | **mreact-v0.0.190-local-keyed** | repeated clear memory | completed | memory | MB | 1.3 |  |  | +2.77% |  |
| js-framework-benchmark | **mreact-v0.0.190-local-keyed** | total byte weight | completed | size | kB | 8.8 |  |  | +95.56% |  |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | create rows | completed | duration | ms | 87.6 | 22.5 | 64 | +24.08% |  |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | replace all rows | completed | duration | ms | 100.7 | 35 | 64.7 | +31.98% |  |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | partial update | completed | duration | ms | 63.1 | 11.8 | 47.8 | +49.88% |  |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | select row | completed | duration | ms | 17.8 | 6.9 | 9.1 | +85.42% |  |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | swap rows | completed | duration | ms | 384.1 | 55.6 | 319.7 | +552.12% |  |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | remove row | completed | duration | ms | 46.6 | 2.7 | 40.7 | +15.63% |  |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | create many rows | completed | duration | ms | 1275.4 | 481.6 | 790.9 | +58.42% |  |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | append rows to large table | completed | duration | ms | 99.4 | 22.9 | 74.8 | +19.04% |  |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | clear rows | completed | duration | ms | 58.9 | 53.9 | 3 | +103.1% |  |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | ready memory | completed | memory | MB | 1.7 |  |  | +54.71% |  |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | run memory | completed | memory | MB | 4.9 |  |  | +81.21% |  |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | repeated clear memory | completed | memory | MB | 2.5 |  |  | +94.89% |  |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | total byte weight | completed | size | kB | 51.4 |  |  | +1042.22% |  |
| js-framework-benchmark | solid-v1.9.14-keyed | create rows | completed | duration | ms | 70.6 | 7.6 | 62.1 | best |  |
| js-framework-benchmark | solid-v1.9.14-keyed | replace all rows | completed | duration | ms | 76.3 | 14.9 | 60.3 | 0% |  |
| js-framework-benchmark | solid-v1.9.14-keyed | partial update | completed | duration | ms | 51.4 | 3.2 | 43.5 | +22.09% |  |
| js-framework-benchmark | solid-v1.9.14-keyed | select row | completed | duration | ms | 11.3 | 1.9 | 7.7 | +17.71% |  |
| js-framework-benchmark | solid-v1.9.14-keyed | swap rows | completed | duration | ms | 66.5 | 2.4 | 59.3 | +12.9% |  |
| js-framework-benchmark | solid-v1.9.14-keyed | remove row | completed | duration | ms | 40.5 | 0.9 | 37.3 | +0.5% |  |
| js-framework-benchmark | solid-v1.9.14-keyed | create many rows | completed | duration | ms | 807.7 | 74.7 | 724.2 | +0.32% |  |
| js-framework-benchmark | solid-v1.9.14-keyed | append rows to large table | completed | duration | ms | 85 | 9.1 | 74.5 | +1.8% |  |
| js-framework-benchmark | solid-v1.9.14-keyed | clear rows | completed | duration | ms | 34.7 | 30.2 | 3.2 | +19.66% |  |
| js-framework-benchmark | solid-v1.9.14-keyed | ready memory | completed | memory | MB | 1.1 |  |  | +1.83% |  |
| js-framework-benchmark | solid-v1.9.14-keyed | run memory | completed | memory | MB | 3.2 |  |  | +16.39% |  |
| js-framework-benchmark | solid-v1.9.14-keyed | repeated clear memory | completed | memory | MB | 1.3 |  |  | best |  |
| js-framework-benchmark | solid-v1.9.14-keyed | total byte weight | completed | size | kB | 4.5 |  |  | best |  |
| js-framework-benchmark | svelte-v5.56.4-keyed | create rows | completed | duration | ms | 74 | 10.5 | 62.5 | +4.82% |  |
| js-framework-benchmark | svelte-v5.56.4-keyed | replace all rows | completed | duration | ms | 84.7 | 18.9 | 63.6 | +11.01% |  |
| js-framework-benchmark | svelte-v5.56.4-keyed | partial update | completed | duration | ms | 49.8 | 4.4 | 42.2 | +18.29% |  |
| js-framework-benchmark | svelte-v5.56.4-keyed | select row | completed | duration | ms | 17.2 | 6.3 | 9.2 | +79.17% |  |
| js-framework-benchmark | svelte-v5.56.4-keyed | swap rows | completed | duration | ms | 66.6 | 4.5 | 58.2 | +13.07% |  |
| js-framework-benchmark | svelte-v5.56.4-keyed | remove row | completed | duration | ms | 42 | 1.6 | 37.6 | +4.22% |  |
| js-framework-benchmark | svelte-v5.56.4-keyed | create many rows | completed | duration | ms | 833.1 | 98.6 | 723.7 | +3.48% |  |
| js-framework-benchmark | svelte-v5.56.4-keyed | append rows to large table | completed | duration | ms | 90.9 | 11 | 78.3 | +8.86% |  |
| js-framework-benchmark | svelte-v5.56.4-keyed | clear rows | completed | duration | ms | 32.5 | 28.2 | 3.5 | +12.07% |  |
| js-framework-benchmark | svelte-v5.56.4-keyed | ready memory | completed | memory | MB | 1.2 |  |  | +12.34% |  |
| js-framework-benchmark | svelte-v5.56.4-keyed | run memory | completed | memory | MB | 3.5 |  |  | +29.82% |  |
| js-framework-benchmark | svelte-v5.56.4-keyed | repeated clear memory | completed | memory | MB | 1.5 |  |  | +21.17% |  |
| js-framework-benchmark | svelte-v5.56.4-keyed | total byte weight | completed | size | kB | 14.3 |  |  | +217.78% |  |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | create rows | completed | duration | ms | 85.5 | 20.7 | 63.7 | +21.1% |  |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | replace all rows | completed | duration | ms | 94.8 | 27.2 | 66.1 | +24.25% |  |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | partial update | completed | duration | ms | 62.1 | 7.2 | 49.2 | +47.51% |  |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | select row | completed | duration | ms | 12.7 | 2.9 | 8.5 | +32.29% |  |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | swap rows | completed | duration | ms | 65.3 | 3.4 | 56.8 | +10.87% |  |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | remove row | completed | duration | ms | 49.2 | 5.8 | 40.8 | +22.08% |  |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | create many rows | completed | duration | ms | 937.1 | 168.2 | 758.4 | +16.4% |  |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | append rows to large table | completed | duration | ms | 97.4 | 18 | 78 | +16.65% |  |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | clear rows | completed | duration | ms | 45.8 | 40.7 | 2.9 | +57.93% |  |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | ready memory | completed | memory | MB | 1.3 |  |  | +26.02% |  |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | run memory | completed | memory | MB | 4.4 |  |  | +63.33% |  |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | repeated clear memory | completed | memory | MB | 1.7 |  |  | +37.31% |  |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | total byte weight | completed | size | kB | 23.9 |  |  | +431.11% |  |
