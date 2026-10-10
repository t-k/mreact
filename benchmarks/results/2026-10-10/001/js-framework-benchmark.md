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

Raw JSON files are stored in `benchmarks/results/2026-10-10/001/js-framework-benchmark-results`.
Chrome trace files are stored in `benchmarks/results/2026-10-10/001/js-framework-benchmark-traces`.

## Rankings

Lower values are better for all js-framework-benchmark metrics reported here.

### create rows

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | marko-v6.4.5-keyed | create rows | 42.7 | 4.5 | 37.5 | best |  | ms |
| 2 | **mreact-v0.0.231-local-keyed** | create rows | 43.5 | 3.8 | 39.4 | +1.87% |  | ms |
| 3 | solid-v1.9.17-keyed | create rows | 43.7 | 4.3 | 38.8 | +2.34% |  | ms |
| 4 | svelte-v5.57.2-keyed | create rows | 44.8 | 5.6 | 38.3 | +4.92% |  | ms |
| 5 | vue-v3.5.43-keyed | create rows | 49.1 | 10.4 | 38 | +14.99% |  | ms |
| 6 | react-hooks-v19.3.0-keyed | create rows | 53 | 11.2 | 41.1 | +24.12% |  | ms |
| 7 | **mreact-react-compat-v0.0.231-local-keyed** | create rows | 54.6 | 11.6 | 41.8 | +27.87% |  | ms |
| 8 | **mreact-react-compat-vdom-v0.0.231-local-keyed** | create rows | 62.3 | 19.7 | 41.6 | +45.9% |  | ms |
| 9 | angular-cf-v22.2.0-keyed | create rows | 66.3 | 10.1 | 39.2 | +55.27% |  | ms |

### replace all rows

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | **mreact-v0.0.231-local-keyed** | replace all rows | 47 | 6.9 | 39.1 | best |  | ms |
| 2 | marko-v6.4.5-keyed | replace all rows | 49.2 | 9.1 | 39.3 | +4.68% |  | ms |
| 3 | solid-v1.9.17-keyed | replace all rows | 52.6 | 10.3 | 41.9 | +11.91% |  | ms |
| 4 | svelte-v5.57.2-keyed | replace all rows | 54 | 12.3 | 41 | +14.89% |  | ms |
| 5 | **mreact-react-compat-v0.0.231-local-keyed** | replace all rows | 57 | 16.4 | 39.4 | +21.28% |  | ms |
| 6 | vue-v3.5.43-keyed | replace all rows | 60.3 | 16.7 | 42.1 | +28.3% |  | ms |
| 7 | react-hooks-v19.3.0-keyed | replace all rows | 60.4 | 19.9 | 39.4 | +28.51% |  | ms |
| 8 | **mreact-react-compat-vdom-v0.0.231-local-keyed** | replace all rows | 67.8 | 26.8 | 40.4 | +44.26% |  | ms |
| 9 | angular-cf-v22.2.0-keyed | replace all rows | 77.5 | 20.4 | 41.3 | +64.89% |  | ms |

### partial update

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | svelte-v5.57.2-keyed | partial update | 32.4 | 3.3 | 26.7 | best |  | ms |
| 2 | vue-v3.5.43-keyed | partial update | 34.4 | 4.1 | 28 | +6.17% |  | ms |
| 3 | **mreact-v0.0.231-local-keyed** | partial update | 36 | 2.7 | 32.1 | +11.11% |  | ms |
| 4 | solid-v1.9.17-keyed | partial update | 36.9 | 2.6 | 31.8 | +13.89% |  | ms |
| 5 | marko-v6.4.5-keyed | partial update | 40.4 | 2.6 | 35.2 | +24.69% |  | ms |
| 6 | angular-cf-v22.2.0-keyed | partial update | 41 | 2.4 | 32.8 | +26.54% |  | ms |
| 7 | **mreact-react-compat-v0.0.231-local-keyed** | partial update | 41.3 | 5.5 | 32.6 | +27.47% |  | ms |
| 8 | react-hooks-v19.3.0-keyed | partial update | 43.3 | 8.1 | 32.7 | +33.64% |  | ms |
| 9 | **mreact-react-compat-vdom-v0.0.231-local-keyed** | partial update | 53.5 | 16.3 | 33.3 | +65.12% |  | ms |

### select row

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | **mreact-v0.0.231-local-keyed** | select row | 5.5 | 0.8 | 4.1 | best |  | ms |
| 2 | marko-v6.4.5-keyed | select row | 6.3 | 0.8 | 4.3 | +14.55% |  | ms |
| 3 | solid-v1.9.17-keyed | select row | 6.9 | 1.4 | 4.8 | +25.45% |  | ms |
| 4 | angular-cf-v22.2.0-keyed | select row | 7.6 | 2.5 | 4.5 | +38.18% |  | ms |
| 5 | **mreact-react-compat-v0.0.231-local-keyed** | select row | 7.9 | 2.9 | 4.3 | +43.64% |  | ms |
| 6 | vue-v3.5.43-keyed | select row | 8.1 | 2 | 5.2 | +47.27% |  | ms |
| 7 | react-hooks-v19.3.0-keyed | select row | 8.6 | 3.7 | 4.1 | +56.36% |  | ms |
| 8 | **mreact-react-compat-vdom-v0.0.231-local-keyed** | select row | 9.9 | 5 | 4.3 | +80% |  | ms |
| 9 | svelte-v5.57.2-keyed | select row | 11.1 | 4 | 5.6 | +101.82% |  | ms |

### swap rows

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | solid-v1.9.17-keyed | swap rows | 32.9 | 1.3 | 29.5 | best |  | ms |
| 2 | **mreact-v0.0.231-local-keyed** | swap rows | 34.6 | 1.6 | 31.2 | +5.17% |  | ms |
| 3 | svelte-v5.57.2-keyed | swap rows | 35.4 | 2.8 | 30.9 | +7.6% |  | ms |
| 4 | vue-v3.5.43-keyed | swap rows | 37.7 | 2.1 | 33.6 | +14.59% |  | ms |
| 5 | marko-v6.4.5-keyed | swap rows | 40.3 | 2.2 | 34.7 | +22.49% |  | ms |
| 6 | **mreact-react-compat-v0.0.231-local-keyed** | swap rows | 40.5 | 3.1 | 34.7 | +23.1% |  | ms |
| 7 | angular-cf-v22.2.0-keyed | swap rows | 44.1 | 2.2 | 36.6 | +34.04% |  | ms |
| 8 | **mreact-react-compat-vdom-v0.0.231-local-keyed** | swap rows | 47.1 | 12.8 | 31.9 | +43.16% |  | ms |
| 9 | react-hooks-v19.3.0-keyed | swap rows | 197.7 | 31.2 | 162.8 | +500.91% |  | ms |

### remove row

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | solid-v1.9.17-keyed | remove row | 23.4 | 0.5 | 21.2 | best |  | ms |
| 2 | marko-v6.4.5-keyed | remove row | 25.7 | 1.1 | 23.1 | +9.83% |  | ms |
| 3 | svelte-v5.57.2-keyed | remove row | 26 | 1.1 | 23.1 | +11.11% |  | ms |
| 4 | react-hooks-v19.3.0-keyed | remove row | 27.5 | 2.1 | 24 | +17.52% |  | ms |
| 5 | vue-v3.5.43-keyed | remove row | 28 | 3.3 | 23.4 | +19.66% |  | ms |
| 6 | **mreact-react-compat-v0.0.231-local-keyed** | remove row | 29.4 | 1.6 | 26.2 | +25.64% |  | ms |
| 7 | **mreact-v0.0.231-local-keyed** | remove row | 29.5 | 1 | 26.5 | +26.07% |  | ms |
| 8 | angular-cf-v22.2.0-keyed | remove row | 31.6 | 1.3 | 22 | +35.04% |  | ms |
| 9 | **mreact-react-compat-vdom-v0.0.231-local-keyed** | remove row | 32.7 | 4.5 | 26 | +39.74% |  | ms |

### create many rows

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | **mreact-v0.0.231-local-keyed** | create many rows | 525.9 | 38.2 | 481.9 | best |  | ms |
| 2 | marko-v6.4.5-keyed | create many rows | 533.1 | 47.6 | 479.3 | +1.37% |  | ms |
| 3 | solid-v1.9.17-keyed | create many rows | 561.9 | 43.9 | 513.1 | +6.85% |  | ms |
| 4 | svelte-v5.57.2-keyed | create many rows | 567.4 | 55 | 504.9 | +7.89% |  | ms |
| 5 | **mreact-react-compat-v0.0.231-local-keyed** | create many rows | 592.6 | 91.9 | 495.1 | +12.68% |  | ms |
| 6 | vue-v3.5.43-keyed | create many rows | 618.5 | 97.1 | 515.2 | +17.61% |  | ms |
| 7 | **mreact-react-compat-vdom-v0.0.231-local-keyed** | create many rows | 675.4 | 169.2 | 488.4 | +28.43% |  | ms |
| 8 | angular-cf-v22.2.0-keyed | create many rows | 696.9 | 115.4 | 506.4 | +32.52% |  | ms |
| 9 | react-hooks-v19.3.0-keyed | create many rows | 842.6 | 281.5 | 541.6 | +60.22% |  | ms |

### append rows to large table

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | **mreact-v0.0.231-local-keyed** | append rows to large table | 59.3 | 4.6 | 53.4 | best |  | ms |
| 2 | marko-v6.4.5-keyed | append rows to large table | 61.6 | 5.7 | 54.5 | +3.88% |  | ms |
| 3 | solid-v1.9.17-keyed | append rows to large table | 64.6 | 5.4 | 57.7 | +8.94% |  | ms |
| 4 | svelte-v5.57.2-keyed | append rows to large table | 66.3 | 7.3 | 57.4 | +11.8% |  | ms |
| 5 | **mreact-react-compat-v0.0.231-local-keyed** | append rows to large table | 70.6 | 11.4 | 57.8 | +19.06% |  | ms |
| 6 | vue-v3.5.43-keyed | append rows to large table | 75.3 | 10.8 | 62.7 | +26.98% |  | ms |
| 7 | react-hooks-v19.3.0-keyed | append rows to large table | 78 | 12.9 | 63 | +31.53% |  | ms |
| 8 | **mreact-react-compat-vdom-v0.0.231-local-keyed** | append rows to large table | 80.7 | 25.3 | 55.3 | +36.09% |  | ms |
| 9 | angular-cf-v22.2.0-keyed | append rows to large table | 89.7 | 11.9 | 60.8 | +51.26% |  | ms |

### clear rows

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | **mreact-v0.0.231-local-keyed** | clear rows | 24 | 19.2 | 2.8 | best |  | ms |
| 2 | marko-v6.4.5-keyed | clear rows | 24.3 | 19.7 | 3.5 | +1.25% |  | ms |
| 3 | solid-v1.9.17-keyed | clear rows | 25.8 | 21 | 3.2 | +7.5% |  | ms |
| 4 | svelte-v5.57.2-keyed | clear rows | 26.6 | 22 | 3.7 | +10.83% |  | ms |
| 5 | **mreact-react-compat-vdom-v0.0.231-local-keyed** | clear rows | 32.8 | 28.4 | 3.5 | +36.67% |  | ms |
| 6 | **mreact-react-compat-v0.0.231-local-keyed** | clear rows | 33.2 | 28.9 | 3.2 | +38.33% |  | ms |
| 7 | vue-v3.5.43-keyed | clear rows | 35.3 | 30.6 | 3 | +47.08% |  | ms |
| 8 | react-hooks-v19.3.0-keyed | clear rows | 42 | 37.5 | 3.1 | +75% |  | ms |
| 9 | angular-cf-v22.2.0-keyed | clear rows | 53.1 | 48.7 | 3.4 | +121.25% |  | ms |

### ready memory

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | marko-v6.4.5-keyed | ready memory | 1 |  |  | best |  | MB |
| 2 | solid-v1.9.17-keyed | ready memory | 1 |  |  | +3.51% |  | MB |
| 3 | svelte-v5.57.2-keyed | ready memory | 1.1 |  |  | +8.38% |  | MB |
| 4 | **mreact-v0.0.231-local-keyed** | ready memory | 1.1 |  |  | +8.96% |  | MB |
| 5 | vue-v3.5.43-keyed | ready memory | 1.3 |  |  | +28.12% |  | MB |
| 6 | **mreact-react-compat-vdom-v0.0.231-local-keyed** | ready memory | 1.3 |  |  | +33% |  | MB |
| 7 | **mreact-react-compat-v0.0.231-local-keyed** | ready memory | 1.5 |  |  | +52.02% |  | MB |
| 8 | react-hooks-v19.3.0-keyed | ready memory | 1.7 |  |  | +66.41% |  | MB |
| 9 | angular-cf-v22.2.0-keyed | ready memory | 2.1 |  |  | +110.29% |  | MB |

### run memory

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | **mreact-v0.0.231-local-keyed** | run memory | 2.7 |  |  | best |  | MB |
| 2 | marko-v6.4.5-keyed | run memory | 2.7 |  |  | +0.64% |  | MB |
| 3 | solid-v1.9.17-keyed | run memory | 3.2 |  |  | +16.46% |  | MB |
| 4 | svelte-v5.57.2-keyed | run memory | 3.5 |  |  | +29.25% |  | MB |
| 5 | vue-v3.5.43-keyed | run memory | 4.4 |  |  | +62.31% |  | MB |
| 6 | **mreact-react-compat-v0.0.231-local-keyed** | run memory | 4.7 |  |  | +71.9% |  | MB |
| 7 | **mreact-react-compat-vdom-v0.0.231-local-keyed** | run memory | 4.9 |  |  | +81.19% |  | MB |
| 8 | react-hooks-v19.3.0-keyed | run memory | 5 |  |  | +83.78% |  | MB |
| 9 | angular-cf-v22.2.0-keyed | run memory | 5.1 |  |  | +88.65% |  | MB |

### repeated clear memory

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | solid-v1.9.17-keyed | repeated clear memory | 1.3 |  |  | best |  | MB |
| 2 | marko-v6.4.5-keyed | repeated clear memory | 1.4 |  |  | +9.83% |  | MB |
| 3 | **mreact-v0.0.231-local-keyed** | repeated clear memory | 1.4 |  |  | +10.08% |  | MB |
| 4 | svelte-v5.57.2-keyed | repeated clear memory | 1.5 |  |  | +20.34% |  | MB |
| 5 | vue-v3.5.43-keyed | repeated clear memory | 1.7 |  |  | +34.26% |  | MB |
| 6 | **mreact-react-compat-v0.0.231-local-keyed** | repeated clear memory | 1.9 |  |  | +48.16% |  | MB |
| 7 | react-hooks-v19.3.0-keyed | repeated clear memory | 2.5 |  |  | +103.23% |  | MB |
| 8 | **mreact-react-compat-vdom-v0.0.231-local-keyed** | repeated clear memory | 2.6 |  |  | +110.87% |  | MB |
| 9 | angular-cf-v22.2.0-keyed | repeated clear memory | 2.7 |  |  | +116.58% |  | MB |

### total byte weight

| rank | framework | case | value | script | paint | diff vs 1st | diff vs react-hooks | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | solid-v1.9.17-keyed | total byte weight | 4.5 |  |  | best |  | kB |
| 2 | marko-v6.4.5-keyed | total byte weight | 4.6 |  |  | +2.22% |  | kB |
| 3 | **mreact-v0.0.231-local-keyed** | total byte weight | 10.5 |  |  | +133.33% |  | kB |
| 4 | svelte-v5.57.2-keyed | total byte weight | 11.6 |  |  | +157.78% |  | kB |
| 5 | vue-v3.5.43-keyed | total byte weight | 23.7 |  |  | +426.67% |  | kB |
| 6 | **mreact-react-compat-vdom-v0.0.231-local-keyed** | total byte weight | 36.3 |  |  | +706.67% |  | kB |
| 7 | **mreact-react-compat-v0.0.231-local-keyed** | total byte weight | 43.8 |  |  | +873.33% |  | kB |
| 8 | angular-cf-v22.2.0-keyed | total byte weight | 45.5 |  |  | +911.11% |  | kB |
| 9 | react-hooks-v19.3.0-keyed | total byte weight | 58.7 |  |  | +1204.44% |  | kB |

## Results

| suite | framework | case | status | metric | unit | value | script | paint | diff vs 1st | diff vs react-hooks |
| --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| js-framework-benchmark | angular-cf-v22.2.0-keyed | create rows | completed | duration | ms | 66.3 | 10.1 | 39.2 | +55.27% |  |
| js-framework-benchmark | angular-cf-v22.2.0-keyed | replace all rows | completed | duration | ms | 77.5 | 20.4 | 41.3 | +64.89% |  |
| js-framework-benchmark | angular-cf-v22.2.0-keyed | partial update | completed | duration | ms | 41 | 2.4 | 32.8 | +26.54% |  |
| js-framework-benchmark | angular-cf-v22.2.0-keyed | select row | completed | duration | ms | 7.6 | 2.5 | 4.5 | +38.18% |  |
| js-framework-benchmark | angular-cf-v22.2.0-keyed | swap rows | completed | duration | ms | 44.1 | 2.2 | 36.6 | +34.04% |  |
| js-framework-benchmark | angular-cf-v22.2.0-keyed | remove row | completed | duration | ms | 31.6 | 1.3 | 22 | +35.04% |  |
| js-framework-benchmark | angular-cf-v22.2.0-keyed | create many rows | completed | duration | ms | 696.9 | 115.4 | 506.4 | +32.52% |  |
| js-framework-benchmark | angular-cf-v22.2.0-keyed | append rows to large table | completed | duration | ms | 89.7 | 11.9 | 60.8 | +51.26% |  |
| js-framework-benchmark | angular-cf-v22.2.0-keyed | clear rows | completed | duration | ms | 53.1 | 48.7 | 3.4 | +121.25% |  |
| js-framework-benchmark | angular-cf-v22.2.0-keyed | ready memory | completed | memory | MB | 2.1 |  |  | +110.29% |  |
| js-framework-benchmark | angular-cf-v22.2.0-keyed | run memory | completed | memory | MB | 5.1 |  |  | +88.65% |  |
| js-framework-benchmark | angular-cf-v22.2.0-keyed | repeated clear memory | completed | memory | MB | 2.7 |  |  | +116.58% |  |
| js-framework-benchmark | angular-cf-v22.2.0-keyed | total byte weight | completed | size | kB | 45.5 |  |  | +911.11% |  |
| js-framework-benchmark | marko-v6.4.5-keyed | create rows | completed | duration | ms | 42.7 | 4.5 | 37.5 | best |  |
| js-framework-benchmark | marko-v6.4.5-keyed | replace all rows | completed | duration | ms | 49.2 | 9.1 | 39.3 | +4.68% |  |
| js-framework-benchmark | marko-v6.4.5-keyed | partial update | completed | duration | ms | 40.4 | 2.6 | 35.2 | +24.69% |  |
| js-framework-benchmark | marko-v6.4.5-keyed | select row | completed | duration | ms | 6.3 | 0.8 | 4.3 | +14.55% |  |
| js-framework-benchmark | marko-v6.4.5-keyed | swap rows | completed | duration | ms | 40.3 | 2.2 | 34.7 | +22.49% |  |
| js-framework-benchmark | marko-v6.4.5-keyed | remove row | completed | duration | ms | 25.7 | 1.1 | 23.1 | +9.83% |  |
| js-framework-benchmark | marko-v6.4.5-keyed | create many rows | completed | duration | ms | 533.1 | 47.6 | 479.3 | +1.37% |  |
| js-framework-benchmark | marko-v6.4.5-keyed | append rows to large table | completed | duration | ms | 61.6 | 5.7 | 54.5 | +3.88% |  |
| js-framework-benchmark | marko-v6.4.5-keyed | clear rows | completed | duration | ms | 24.3 | 19.7 | 3.5 | +1.25% |  |
| js-framework-benchmark | marko-v6.4.5-keyed | ready memory | completed | memory | MB | 1 |  |  | best |  |
| js-framework-benchmark | marko-v6.4.5-keyed | run memory | completed | memory | MB | 2.7 |  |  | +0.64% |  |
| js-framework-benchmark | marko-v6.4.5-keyed | repeated clear memory | completed | memory | MB | 1.4 |  |  | +9.83% |  |
| js-framework-benchmark | marko-v6.4.5-keyed | total byte weight | completed | size | kB | 4.6 |  |  | +2.22% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.231-local-keyed** | create rows | completed | duration | ms | 54.6 | 11.6 | 41.8 | +27.87% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.231-local-keyed** | replace all rows | completed | duration | ms | 57 | 16.4 | 39.4 | +21.28% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.231-local-keyed** | partial update | completed | duration | ms | 41.3 | 5.5 | 32.6 | +27.47% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.231-local-keyed** | select row | completed | duration | ms | 7.9 | 2.9 | 4.3 | +43.64% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.231-local-keyed** | swap rows | completed | duration | ms | 40.5 | 3.1 | 34.7 | +23.1% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.231-local-keyed** | remove row | completed | duration | ms | 29.4 | 1.6 | 26.2 | +25.64% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.231-local-keyed** | create many rows | completed | duration | ms | 592.6 | 91.9 | 495.1 | +12.68% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.231-local-keyed** | append rows to large table | completed | duration | ms | 70.6 | 11.4 | 57.8 | +19.06% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.231-local-keyed** | clear rows | completed | duration | ms | 33.2 | 28.9 | 3.2 | +38.33% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.231-local-keyed** | ready memory | completed | memory | MB | 1.5 |  |  | +52.02% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.231-local-keyed** | run memory | completed | memory | MB | 4.7 |  |  | +71.9% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.231-local-keyed** | repeated clear memory | completed | memory | MB | 1.9 |  |  | +48.16% |  |
| js-framework-benchmark | **mreact-react-compat-v0.0.231-local-keyed** | total byte weight | completed | size | kB | 43.8 |  |  | +873.33% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.231-local-keyed** | create rows | completed | duration | ms | 62.3 | 19.7 | 41.6 | +45.9% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.231-local-keyed** | replace all rows | completed | duration | ms | 67.8 | 26.8 | 40.4 | +44.26% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.231-local-keyed** | partial update | completed | duration | ms | 53.5 | 16.3 | 33.3 | +65.12% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.231-local-keyed** | select row | completed | duration | ms | 9.9 | 5 | 4.3 | +80% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.231-local-keyed** | swap rows | completed | duration | ms | 47.1 | 12.8 | 31.9 | +43.16% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.231-local-keyed** | remove row | completed | duration | ms | 32.7 | 4.5 | 26 | +39.74% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.231-local-keyed** | create many rows | completed | duration | ms | 675.4 | 169.2 | 488.4 | +28.43% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.231-local-keyed** | append rows to large table | completed | duration | ms | 80.7 | 25.3 | 55.3 | +36.09% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.231-local-keyed** | clear rows | completed | duration | ms | 32.8 | 28.4 | 3.5 | +36.67% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.231-local-keyed** | ready memory | completed | memory | MB | 1.3 |  |  | +33% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.231-local-keyed** | run memory | completed | memory | MB | 4.9 |  |  | +81.19% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.231-local-keyed** | repeated clear memory | completed | memory | MB | 2.6 |  |  | +110.87% |  |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.231-local-keyed** | total byte weight | completed | size | kB | 36.3 |  |  | +706.67% |  |
| js-framework-benchmark | **mreact-v0.0.231-local-keyed** | create rows | completed | duration | ms | 43.5 | 3.8 | 39.4 | +1.87% |  |
| js-framework-benchmark | **mreact-v0.0.231-local-keyed** | replace all rows | completed | duration | ms | 47 | 6.9 | 39.1 | best |  |
| js-framework-benchmark | **mreact-v0.0.231-local-keyed** | partial update | completed | duration | ms | 36 | 2.7 | 32.1 | +11.11% |  |
| js-framework-benchmark | **mreact-v0.0.231-local-keyed** | select row | completed | duration | ms | 5.5 | 0.8 | 4.1 | best |  |
| js-framework-benchmark | **mreact-v0.0.231-local-keyed** | swap rows | completed | duration | ms | 34.6 | 1.6 | 31.2 | +5.17% |  |
| js-framework-benchmark | **mreact-v0.0.231-local-keyed** | remove row | completed | duration | ms | 29.5 | 1 | 26.5 | +26.07% |  |
| js-framework-benchmark | **mreact-v0.0.231-local-keyed** | create many rows | completed | duration | ms | 525.9 | 38.2 | 481.9 | best |  |
| js-framework-benchmark | **mreact-v0.0.231-local-keyed** | append rows to large table | completed | duration | ms | 59.3 | 4.6 | 53.4 | best |  |
| js-framework-benchmark | **mreact-v0.0.231-local-keyed** | clear rows | completed | duration | ms | 24 | 19.2 | 2.8 | best |  |
| js-framework-benchmark | **mreact-v0.0.231-local-keyed** | ready memory | completed | memory | MB | 1.1 |  |  | +8.96% |  |
| js-framework-benchmark | **mreact-v0.0.231-local-keyed** | run memory | completed | memory | MB | 2.7 |  |  | best |  |
| js-framework-benchmark | **mreact-v0.0.231-local-keyed** | repeated clear memory | completed | memory | MB | 1.4 |  |  | +10.08% |  |
| js-framework-benchmark | **mreact-v0.0.231-local-keyed** | total byte weight | completed | size | kB | 10.5 |  |  | +133.33% |  |
| js-framework-benchmark | react-hooks-v19.3.0-keyed | create rows | completed | duration | ms | 53 | 11.2 | 41.1 | +24.12% |  |
| js-framework-benchmark | react-hooks-v19.3.0-keyed | replace all rows | completed | duration | ms | 60.4 | 19.9 | 39.4 | +28.51% |  |
| js-framework-benchmark | react-hooks-v19.3.0-keyed | partial update | completed | duration | ms | 43.3 | 8.1 | 32.7 | +33.64% |  |
| js-framework-benchmark | react-hooks-v19.3.0-keyed | select row | completed | duration | ms | 8.6 | 3.7 | 4.1 | +56.36% |  |
| js-framework-benchmark | react-hooks-v19.3.0-keyed | swap rows | completed | duration | ms | 197.7 | 31.2 | 162.8 | +500.91% |  |
| js-framework-benchmark | react-hooks-v19.3.0-keyed | remove row | completed | duration | ms | 27.5 | 2.1 | 24 | +17.52% |  |
| js-framework-benchmark | react-hooks-v19.3.0-keyed | create many rows | completed | duration | ms | 842.6 | 281.5 | 541.6 | +60.22% |  |
| js-framework-benchmark | react-hooks-v19.3.0-keyed | append rows to large table | completed | duration | ms | 78 | 12.9 | 63 | +31.53% |  |
| js-framework-benchmark | react-hooks-v19.3.0-keyed | clear rows | completed | duration | ms | 42 | 37.5 | 3.1 | +75% |  |
| js-framework-benchmark | react-hooks-v19.3.0-keyed | ready memory | completed | memory | MB | 1.7 |  |  | +66.41% |  |
| js-framework-benchmark | react-hooks-v19.3.0-keyed | run memory | completed | memory | MB | 5 |  |  | +83.78% |  |
| js-framework-benchmark | react-hooks-v19.3.0-keyed | repeated clear memory | completed | memory | MB | 2.5 |  |  | +103.23% |  |
| js-framework-benchmark | react-hooks-v19.3.0-keyed | total byte weight | completed | size | kB | 58.7 |  |  | +1204.44% |  |
| js-framework-benchmark | solid-v1.9.17-keyed | create rows | completed | duration | ms | 43.7 | 4.3 | 38.8 | +2.34% |  |
| js-framework-benchmark | solid-v1.9.17-keyed | replace all rows | completed | duration | ms | 52.6 | 10.3 | 41.9 | +11.91% |  |
| js-framework-benchmark | solid-v1.9.17-keyed | partial update | completed | duration | ms | 36.9 | 2.6 | 31.8 | +13.89% |  |
| js-framework-benchmark | solid-v1.9.17-keyed | select row | completed | duration | ms | 6.9 | 1.4 | 4.8 | +25.45% |  |
| js-framework-benchmark | solid-v1.9.17-keyed | swap rows | completed | duration | ms | 32.9 | 1.3 | 29.5 | best |  |
| js-framework-benchmark | solid-v1.9.17-keyed | remove row | completed | duration | ms | 23.4 | 0.5 | 21.2 | best |  |
| js-framework-benchmark | solid-v1.9.17-keyed | create many rows | completed | duration | ms | 561.9 | 43.9 | 513.1 | +6.85% |  |
| js-framework-benchmark | solid-v1.9.17-keyed | append rows to large table | completed | duration | ms | 64.6 | 5.4 | 57.7 | +8.94% |  |
| js-framework-benchmark | solid-v1.9.17-keyed | clear rows | completed | duration | ms | 25.8 | 21 | 3.2 | +7.5% |  |
| js-framework-benchmark | solid-v1.9.17-keyed | ready memory | completed | memory | MB | 1 |  |  | +3.51% |  |
| js-framework-benchmark | solid-v1.9.17-keyed | run memory | completed | memory | MB | 3.2 |  |  | +16.46% |  |
| js-framework-benchmark | solid-v1.9.17-keyed | repeated clear memory | completed | memory | MB | 1.3 |  |  | best |  |
| js-framework-benchmark | solid-v1.9.17-keyed | total byte weight | completed | size | kB | 4.5 |  |  | best |  |
| js-framework-benchmark | svelte-v5.57.2-keyed | create rows | completed | duration | ms | 44.8 | 5.6 | 38.3 | +4.92% |  |
| js-framework-benchmark | svelte-v5.57.2-keyed | replace all rows | completed | duration | ms | 54 | 12.3 | 41 | +14.89% |  |
| js-framework-benchmark | svelte-v5.57.2-keyed | partial update | completed | duration | ms | 32.4 | 3.3 | 26.7 | best |  |
| js-framework-benchmark | svelte-v5.57.2-keyed | select row | completed | duration | ms | 11.1 | 4 | 5.6 | +101.82% |  |
| js-framework-benchmark | svelte-v5.57.2-keyed | swap rows | completed | duration | ms | 35.4 | 2.8 | 30.9 | +7.6% |  |
| js-framework-benchmark | svelte-v5.57.2-keyed | remove row | completed | duration | ms | 26 | 1.1 | 23.1 | +11.11% |  |
| js-framework-benchmark | svelte-v5.57.2-keyed | create many rows | completed | duration | ms | 567.4 | 55 | 504.9 | +7.89% |  |
| js-framework-benchmark | svelte-v5.57.2-keyed | append rows to large table | completed | duration | ms | 66.3 | 7.3 | 57.4 | +11.8% |  |
| js-framework-benchmark | svelte-v5.57.2-keyed | clear rows | completed | duration | ms | 26.6 | 22 | 3.7 | +10.83% |  |
| js-framework-benchmark | svelte-v5.57.2-keyed | ready memory | completed | memory | MB | 1.1 |  |  | +8.38% |  |
| js-framework-benchmark | svelte-v5.57.2-keyed | run memory | completed | memory | MB | 3.5 |  |  | +29.25% |  |
| js-framework-benchmark | svelte-v5.57.2-keyed | repeated clear memory | completed | memory | MB | 1.5 |  |  | +20.34% |  |
| js-framework-benchmark | svelte-v5.57.2-keyed | total byte weight | completed | size | kB | 11.6 |  |  | +157.78% |  |
| js-framework-benchmark | vue-v3.5.43-keyed | create rows | completed | duration | ms | 49.1 | 10.4 | 38 | +14.99% |  |
| js-framework-benchmark | vue-v3.5.43-keyed | replace all rows | completed | duration | ms | 60.3 | 16.7 | 42.1 | +28.3% |  |
| js-framework-benchmark | vue-v3.5.43-keyed | partial update | completed | duration | ms | 34.4 | 4.1 | 28 | +6.17% |  |
| js-framework-benchmark | vue-v3.5.43-keyed | select row | completed | duration | ms | 8.1 | 2 | 5.2 | +47.27% |  |
| js-framework-benchmark | vue-v3.5.43-keyed | swap rows | completed | duration | ms | 37.7 | 2.1 | 33.6 | +14.59% |  |
| js-framework-benchmark | vue-v3.5.43-keyed | remove row | completed | duration | ms | 28 | 3.3 | 23.4 | +19.66% |  |
| js-framework-benchmark | vue-v3.5.43-keyed | create many rows | completed | duration | ms | 618.5 | 97.1 | 515.2 | +17.61% |  |
| js-framework-benchmark | vue-v3.5.43-keyed | append rows to large table | completed | duration | ms | 75.3 | 10.8 | 62.7 | +26.98% |  |
| js-framework-benchmark | vue-v3.5.43-keyed | clear rows | completed | duration | ms | 35.3 | 30.6 | 3 | +47.08% |  |
| js-framework-benchmark | vue-v3.5.43-keyed | ready memory | completed | memory | MB | 1.3 |  |  | +28.12% |  |
| js-framework-benchmark | vue-v3.5.43-keyed | run memory | completed | memory | MB | 4.4 |  |  | +62.31% |  |
| js-framework-benchmark | vue-v3.5.43-keyed | repeated clear memory | completed | memory | MB | 1.7 |  |  | +34.26% |  |
| js-framework-benchmark | vue-v3.5.43-keyed | total byte weight | completed | size | kB | 23.7 |  |  | +426.67% |  |
