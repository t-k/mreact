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

## Unsupported Primitive Adapters

- qwik: krausest/js-framework-benchmark keyed/qwik currently fails the official isKeyed check and is categorized as non-keyed.
- qwik-v2: krausest/js-framework-benchmark does not currently provide a matching Qwik v2 keyed fixture.
- solid-v2: krausest/js-framework-benchmark does not currently provide a matching Solid v2 keyed fixture.

Raw JSON files are stored in `benchmarks/results/2026-06-19/001/js-framework-benchmark-results`.
Chrome trace files are stored in `benchmarks/results/2026-06-19/001/js-framework-benchmark-traces`.

## Rankings

Lower values are better for all js-framework-benchmark metrics reported here.

### create rows

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | **mreact-v0.0.174-local-keyed** | create rows | 70.8 | 6.6 | 63 | best | ms |
| 2 | solid-v1.9.13-keyed | create rows | 72.1 | 7.7 | 63.1 | +1.84% | ms |
| 3 | marko-v6.1.11-keyed | create rows | 73.9 | 9.2 | 63.6 | +4.38% | ms |
| 4 | svelte-v5.56.3-keyed | create rows | 74.3 | 10.6 | 62.7 | +4.94% | ms |
| 5 | vue-v3.6.0-beta.16-keyed | create rows | 86.6 | 21 | 64.2 | +22.32% | ms |
| 6 | react-hooks-v19.2.7-keyed | create rows | 88.5 | 23.2 | 64.4 | +25% | ms |
| 7 | **mreact-react-compat-v0.0.174-local-keyed** | create rows | 89.6 | 23.8 | 64.5 | +26.55% | ms |
| 8 | **mreact-react-compat-vdom-v0.0.174-local-keyed** | create rows | 99 | 33.5 | 63.4 | +39.83% | ms |
| 9 | angular-cf-v22.0.0-keyed | create rows | 101.9 | 19.3 | 64.7 | +43.93% | ms |

### replace all rows

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | solid-v1.9.13-keyed | replace all rows | 77.6 | 15.2 | 61.4 | best | ms |
| 2 | **mreact-v0.0.174-local-keyed** | replace all rows | 80.4 | 14.1 | 64.2 | +3.61% | ms |
| 3 | marko-v6.1.11-keyed | replace all rows | 81.1 | 15.6 | 64.3 | +4.51% | ms |
| 4 | svelte-v5.56.3-keyed | replace all rows | 84.5 | 19.2 | 64.2 | +8.89% | ms |
| 5 | **mreact-react-compat-v0.0.174-local-keyed** | replace all rows | 92.5 | 28.1 | 63.3 | +19.2% | ms |
| 6 | vue-v3.6.0-beta.16-keyed | replace all rows | 96.4 | 27.4 | 67 | +24.23% | ms |
| 7 | react-hooks-v19.2.7-keyed | replace all rows | 100.8 | 34.8 | 64.5 | +29.9% | ms |
| 8 | **mreact-react-compat-vdom-v0.0.174-local-keyed** | replace all rows | 105.7 | 40.3 | 64 | +36.21% | ms |
| 9 | angular-cf-v22.0.0-keyed | replace all rows | 115.4 | 33 | 66.9 | +48.71% | ms |

### partial update

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | angular-cf-v22.0.0-keyed | partial update | 40.3 | 3.2 | 35.7 | best | ms |
| 2 | **mreact-v0.0.174-local-keyed** | partial update | 42.5 | 2.1 | 37 | +5.46% | ms |
| 3 | solid-v1.9.13-keyed | partial update | 42.7 | 2.9 | 36.5 | +5.96% | ms |
| 4 | svelte-v5.56.3-keyed | partial update | 46.7 | 4.1 | 38.8 | +15.88% | ms |
| 5 | marko-v6.1.11-keyed | partial update | 47.4 | 5.4 | 38.5 | +17.62% | ms |
| 6 | react-hooks-v19.2.7-keyed | partial update | 51.5 | 10.4 | 37.7 | +27.79% | ms |
| 7 | vue-v3.6.0-beta.16-keyed | partial update | 51.7 | 6.7 | 42 | +28.29% | ms |
| 8 | **mreact-react-compat-v0.0.174-local-keyed** | partial update | 53.1 | 12.7 | 37.8 | +31.76% | ms |
| 9 | **mreact-react-compat-vdom-v0.0.174-local-keyed** | partial update | 63.8 | 21.3 | 38 | +58.31% | ms |

### select row

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | **mreact-v0.0.174-local-keyed** | select row | 9.4 | 1 | 7 | best | ms |
| 2 | vue-v3.6.0-beta.16-keyed | select row | 10.2 | 2.6 | 6.1 | +8.51% | ms |
| 3 | solid-v1.9.13-keyed | select row | 10.6 | 2.1 | 7.1 | +12.77% | ms |
| 4 | angular-cf-v22.0.0-keyed | select row | 13.6 | 3.7 | 8 | +44.68% | ms |
| 5 | marko-v6.1.11-keyed | select row | 14.1 | 5.4 | 7.1 | +50% | ms |
| 6 | svelte-v5.56.3-keyed | select row | 14.6 | 6.9 | 6.7 | +55.32% | ms |
| 7 | **mreact-react-compat-v0.0.174-local-keyed** | select row | 14.7 | 6.2 | 7 | +56.38% | ms |
| 8 | react-hooks-v19.2.7-keyed | select row | 15 | 6.2 | 7.2 | +59.57% | ms |
| 9 | **mreact-react-compat-vdom-v0.0.174-local-keyed** | select row | 15.9 | 7 | 7.4 | +69.15% | ms |

### swap rows

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | angular-cf-v22.0.0-keyed | swap rows | 48.4 | 2.8 | 44 | best | ms |
| 2 | **mreact-v0.0.174-local-keyed** | swap rows | 49.4 | 2.1 | 44 | +2.07% | ms |
| 3 | marko-v6.1.11-keyed | swap rows | 51.7 | 4.1 | 43.2 | +6.82% | ms |
| 4 | solid-v1.9.13-keyed | swap rows | 54.9 | 2.2 | 47.9 | +13.43% | ms |
| 5 | vue-v3.6.0-beta.16-keyed | swap rows | 58 | 3.1 | 49.9 | +19.83% | ms |
| 6 | svelte-v5.56.3-keyed | swap rows | 58.6 | 4.1 | 50.7 | +21.07% | ms |
| 7 | **mreact-react-compat-v0.0.174-local-keyed** | swap rows | 59.9 | 10.9 | 44.9 | +23.76% | ms |
| 8 | **mreact-react-compat-vdom-v0.0.174-local-keyed** | swap rows | 73.6 | 20 | 49.1 | +52.07% | ms |
| 9 | react-hooks-v19.2.7-keyed | swap rows | 352.9 | 52.2 | 290.4 | +629.13% | ms |

### remove row

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | angular-cf-v22.0.0-keyed | remove row | 33 | 1.7 | 31 | best | ms |
| 2 | svelte-v5.56.3-keyed | remove row | 36.6 | 1.6 | 33.5 | +10.91% | ms |
| 3 | **mreact-v0.0.174-local-keyed** | remove row | 37.9 | 1 | 34.9 | +14.85% | ms |
| 4 | react-hooks-v19.2.7-keyed | remove row | 39.5 | 2.7 | 34.5 | +19.7% | ms |
| 5 | **mreact-react-compat-v0.0.174-local-keyed** | remove row | 39.7 | 4.3 | 33.3 | +20.3% | ms |
| 6 | marko-v6.1.11-keyed | remove row | 39.9 | 3.4 | 34.4 | +20.91% | ms |
| 7 | vue-v3.6.0-beta.16-keyed | remove row | 42.9 | 5.5 | 34.9 | +30% | ms |
| 8 | **mreact-react-compat-vdom-v0.0.174-local-keyed** | remove row | 43.4 | 5.4 | 35.2 | +31.52% | ms |
| 9 | solid-v1.9.13-keyed | remove row | 43.5 | 1 | 39.9 | +31.82% | ms |

### create many rows

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | **mreact-v0.0.174-local-keyed** | create many rows | 792.3 | 71.6 | 710.3 | best | ms |
| 2 | marko-v6.1.11-keyed | create many rows | 800.8 | 84.7 | 704.7 | +1.07% | ms |
| 3 | solid-v1.9.13-keyed | create many rows | 806.1 | 74 | 720.9 | +1.74% | ms |
| 4 | svelte-v5.56.3-keyed | create many rows | 832.3 | 100.3 | 722.9 | +5.05% | ms |
| 5 | vue-v3.6.0-beta.16-keyed | create many rows | 921.4 | 169.5 | 742.9 | +16.29% | ms |
| 6 | **mreact-react-compat-v0.0.174-local-keyed** | create many rows | 974.5 | 221.6 | 741.2 | +23% | ms |
| 7 | angular-cf-v22.0.0-keyed | create many rows | 1032.6 | 203.4 | 748.9 | +30.33% | ms |
| 8 | **mreact-react-compat-vdom-v0.0.174-local-keyed** | create many rows | 1034 | 294.3 | 736.6 | +30.51% | ms |
| 9 | react-hooks-v19.2.7-keyed | create many rows | 1189.5 | 413 | 766.1 | +50.13% | ms |

### append rows to large table

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | **mreact-v0.0.174-local-keyed** | append rows to large table | 82.9 | 8.2 | 73 | best | ms |
| 2 | solid-v1.9.13-keyed | append rows to large table | 84.9 | 8.5 | 74.6 | +2.41% | ms |
| 3 | marko-v6.1.11-keyed | append rows to large table | 85 | 11.2 | 72 | +2.53% | ms |
| 4 | svelte-v5.56.3-keyed | append rows to large table | 85.5 | 10.7 | 72.9 | +3.14% | ms |
| 5 | vue-v3.6.0-beta.16-keyed | append rows to large table | 93.5 | 17.8 | 73.8 | +12.79% | ms |
| 6 | **mreact-react-compat-v0.0.174-local-keyed** | append rows to large table | 98.6 | 24.4 | 72.5 | +18.94% | ms |
| 7 | react-hooks-v19.2.7-keyed | append rows to large table | 98.6 | 23.6 | 73.3 | +18.94% | ms |
| 8 | angular-cf-v22.0.0-keyed | append rows to large table | 104.2 | 16.7 | 72.6 | +25.69% | ms |
| 9 | **mreact-react-compat-vdom-v0.0.174-local-keyed** | append rows to large table | 113.6 | 37.7 | 74.1 | +37.03% | ms |

### clear rows

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | marko-v6.1.11-keyed | clear rows | 29.3 | 24.8 | 2.9 | best | ms |
| 2 | **mreact-v0.0.174-local-keyed** | clear rows | 30.8 | 26.2 | 3 | +5.12% | ms |
| 3 | svelte-v5.56.3-keyed | clear rows | 33.6 | 29.1 | 3.4 | +14.68% | ms |
| 4 | solid-v1.9.13-keyed | clear rows | 36.5 | 32.2 | 3.4 | +24.57% | ms |
| 5 | **mreact-react-compat-vdom-v0.0.174-local-keyed** | clear rows | 43.3 | 38.6 | 3 | +47.78% | ms |
| 6 | vue-v3.6.0-beta.16-keyed | clear rows | 46.4 | 41.9 | 3.1 | +58.36% | ms |
| 7 | **mreact-react-compat-v0.0.174-local-keyed** | clear rows | 47.4 | 42.8 | 3.3 | +61.77% | ms |
| 8 | react-hooks-v19.2.7-keyed | clear rows | 56.9 | 52.1 | 3.1 | +94.2% | ms |
| 9 | angular-cf-v22.0.0-keyed | clear rows | 61.9 | 57.7 | 3.9 | +111.26% | ms |

### ready memory

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | marko-v6.1.11-keyed | ready memory | 1 |  |  | best | MB |
| 2 | solid-v1.9.13-keyed | ready memory | 1 |  |  | +1.53% | MB |
| 3 | **mreact-v0.0.174-local-keyed** | ready memory | 1.1 |  |  | +8.5% | MB |
| 4 | svelte-v5.56.3-keyed | ready memory | 1.2 |  |  | +20.53% | MB |
| 5 | **mreact-react-compat-v0.0.174-local-keyed** | ready memory | 1.4 |  |  | +33.36% | MB |
| 6 | vue-v3.6.0-beta.16-keyed | ready memory | 1.4 |  |  | +33.42% | MB |
| 7 | **mreact-react-compat-vdom-v0.0.174-local-keyed** | ready memory | 1.4 |  |  | +34.81% | MB |
| 8 | react-hooks-v19.2.7-keyed | ready memory | 1.6 |  |  | +60.59% | MB |
| 9 | angular-cf-v22.0.0-keyed | ready memory | 2 |  |  | +99.54% | MB |

### run memory

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | marko-v6.1.11-keyed | run memory | 2.8 |  |  | best | MB |
| 2 | **mreact-v0.0.174-local-keyed** | run memory | 2.9 |  |  | +2.64% | MB |
| 3 | solid-v1.9.13-keyed | run memory | 3.1 |  |  | +10.67% | MB |
| 4 | svelte-v5.56.3-keyed | run memory | 3.5 |  |  | +24.21% | MB |
| 5 | vue-v3.6.0-beta.16-keyed | run memory | 4.4 |  |  | +57.03% | MB |
| 6 | **mreact-react-compat-v0.0.174-local-keyed** | run memory | 4.7 |  |  | +66.89% | MB |
| 7 | react-hooks-v19.2.7-keyed | run memory | 4.9 |  |  | +73.55% | MB |
| 8 | **mreact-react-compat-vdom-v0.0.174-local-keyed** | run memory | 4.9 |  |  | +73.74% | MB |
| 9 | angular-cf-v22.0.0-keyed | run memory | 5 |  |  | +76.78% | MB |

### repeated clear memory

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | solid-v1.9.13-keyed | repeated clear memory | 1.2 |  |  | best | MB |
| 2 | marko-v6.1.11-keyed | repeated clear memory | 1.4 |  |  | +11.65% | MB |
| 3 | **mreact-v0.0.174-local-keyed** | repeated clear memory | 1.4 |  |  | +13.96% | MB |
| 4 | svelte-v5.56.3-keyed | repeated clear memory | 1.5 |  |  | +27.35% | MB |
| 5 | vue-v3.6.0-beta.16-keyed | repeated clear memory | 1.6 |  |  | +35.12% | MB |
| 6 | **mreact-react-compat-v0.0.174-local-keyed** | repeated clear memory | 2 |  |  | +64.79% | MB |
| 7 | **mreact-react-compat-vdom-v0.0.174-local-keyed** | repeated clear memory | 2.4 |  |  | +100.94% | MB |
| 8 | react-hooks-v19.2.7-keyed | repeated clear memory | 2.5 |  |  | +102.37% | MB |
| 9 | angular-cf-v22.0.0-keyed | repeated clear memory | 2.6 |  |  | +112.52% | MB |

### total byte weight

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | solid-v1.9.13-keyed | total byte weight | 4.5 |  |  | best | kB |
| 2 | marko-v6.1.11-keyed | total byte weight | 4.8 |  |  | +6.67% | kB |
| 3 | **mreact-v0.0.174-local-keyed** | total byte weight | 9.6 |  |  | +113.33% | kB |
| 4 | svelte-v5.56.3-keyed | total byte weight | 14.3 |  |  | +217.78% | kB |
| 5 | vue-v3.6.0-beta.16-keyed | total byte weight | 23.9 |  |  | +431.11% | kB |
| 6 | **mreact-react-compat-vdom-v0.0.174-local-keyed** | total byte weight | 31.9 |  |  | +608.89% | kB |
| 7 | **mreact-react-compat-v0.0.174-local-keyed** | total byte weight | 33.9 |  |  | +653.33% | kB |
| 8 | angular-cf-v22.0.0-keyed | total byte weight | 44.5 |  |  | +888.89% | kB |
| 9 | react-hooks-v19.2.7-keyed | total byte weight | 51.4 |  |  | +1042.22% | kB |

## Results

| suite | framework | case | status | metric | unit | value | script | paint | diff vs 1st |
| --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | create rows | completed | duration | ms | 101.9 | 19.3 | 64.7 | +43.93% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | replace all rows | completed | duration | ms | 115.4 | 33 | 66.9 | +48.71% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | partial update | completed | duration | ms | 40.3 | 3.2 | 35.7 | best |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | select row | completed | duration | ms | 13.6 | 3.7 | 8 | +44.68% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | swap rows | completed | duration | ms | 48.4 | 2.8 | 44 | best |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | remove row | completed | duration | ms | 33 | 1.7 | 31 | best |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | create many rows | completed | duration | ms | 1032.6 | 203.4 | 748.9 | +30.33% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | append rows to large table | completed | duration | ms | 104.2 | 16.7 | 72.6 | +25.69% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | clear rows | completed | duration | ms | 61.9 | 57.7 | 3.9 | +111.26% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | ready memory | completed | memory | MB | 2 |  |  | +99.54% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | run memory | completed | memory | MB | 5 |  |  | +76.78% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | repeated clear memory | completed | memory | MB | 2.6 |  |  | +112.52% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | total byte weight | completed | size | kB | 44.5 |  |  | +888.89% |
| js-framework-benchmark | marko-v6.1.11-keyed | create rows | completed | duration | ms | 73.9 | 9.2 | 63.6 | +4.38% |
| js-framework-benchmark | marko-v6.1.11-keyed | replace all rows | completed | duration | ms | 81.1 | 15.6 | 64.3 | +4.51% |
| js-framework-benchmark | marko-v6.1.11-keyed | partial update | completed | duration | ms | 47.4 | 5.4 | 38.5 | +17.62% |
| js-framework-benchmark | marko-v6.1.11-keyed | select row | completed | duration | ms | 14.1 | 5.4 | 7.1 | +50% |
| js-framework-benchmark | marko-v6.1.11-keyed | swap rows | completed | duration | ms | 51.7 | 4.1 | 43.2 | +6.82% |
| js-framework-benchmark | marko-v6.1.11-keyed | remove row | completed | duration | ms | 39.9 | 3.4 | 34.4 | +20.91% |
| js-framework-benchmark | marko-v6.1.11-keyed | create many rows | completed | duration | ms | 800.8 | 84.7 | 704.7 | +1.07% |
| js-framework-benchmark | marko-v6.1.11-keyed | append rows to large table | completed | duration | ms | 85 | 11.2 | 72 | +2.53% |
| js-framework-benchmark | marko-v6.1.11-keyed | clear rows | completed | duration | ms | 29.3 | 24.8 | 2.9 | best |
| js-framework-benchmark | marko-v6.1.11-keyed | ready memory | completed | memory | MB | 1 |  |  | best |
| js-framework-benchmark | marko-v6.1.11-keyed | run memory | completed | memory | MB | 2.8 |  |  | best |
| js-framework-benchmark | marko-v6.1.11-keyed | repeated clear memory | completed | memory | MB | 1.4 |  |  | +11.65% |
| js-framework-benchmark | marko-v6.1.11-keyed | total byte weight | completed | size | kB | 4.8 |  |  | +6.67% |
| js-framework-benchmark | **mreact-react-compat-v0.0.174-local-keyed** | create rows | completed | duration | ms | 89.6 | 23.8 | 64.5 | +26.55% |
| js-framework-benchmark | **mreact-react-compat-v0.0.174-local-keyed** | replace all rows | completed | duration | ms | 92.5 | 28.1 | 63.3 | +19.2% |
| js-framework-benchmark | **mreact-react-compat-v0.0.174-local-keyed** | partial update | completed | duration | ms | 53.1 | 12.7 | 37.8 | +31.76% |
| js-framework-benchmark | **mreact-react-compat-v0.0.174-local-keyed** | select row | completed | duration | ms | 14.7 | 6.2 | 7 | +56.38% |
| js-framework-benchmark | **mreact-react-compat-v0.0.174-local-keyed** | swap rows | completed | duration | ms | 59.9 | 10.9 | 44.9 | +23.76% |
| js-framework-benchmark | **mreact-react-compat-v0.0.174-local-keyed** | remove row | completed | duration | ms | 39.7 | 4.3 | 33.3 | +20.3% |
| js-framework-benchmark | **mreact-react-compat-v0.0.174-local-keyed** | create many rows | completed | duration | ms | 974.5 | 221.6 | 741.2 | +23% |
| js-framework-benchmark | **mreact-react-compat-v0.0.174-local-keyed** | append rows to large table | completed | duration | ms | 98.6 | 24.4 | 72.5 | +18.94% |
| js-framework-benchmark | **mreact-react-compat-v0.0.174-local-keyed** | clear rows | completed | duration | ms | 47.4 | 42.8 | 3.3 | +61.77% |
| js-framework-benchmark | **mreact-react-compat-v0.0.174-local-keyed** | ready memory | completed | memory | MB | 1.4 |  |  | +33.36% |
| js-framework-benchmark | **mreact-react-compat-v0.0.174-local-keyed** | run memory | completed | memory | MB | 4.7 |  |  | +66.89% |
| js-framework-benchmark | **mreact-react-compat-v0.0.174-local-keyed** | repeated clear memory | completed | memory | MB | 2 |  |  | +64.79% |
| js-framework-benchmark | **mreact-react-compat-v0.0.174-local-keyed** | total byte weight | completed | size | kB | 33.9 |  |  | +653.33% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.174-local-keyed** | create rows | completed | duration | ms | 99 | 33.5 | 63.4 | +39.83% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.174-local-keyed** | replace all rows | completed | duration | ms | 105.7 | 40.3 | 64 | +36.21% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.174-local-keyed** | partial update | completed | duration | ms | 63.8 | 21.3 | 38 | +58.31% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.174-local-keyed** | select row | completed | duration | ms | 15.9 | 7 | 7.4 | +69.15% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.174-local-keyed** | swap rows | completed | duration | ms | 73.6 | 20 | 49.1 | +52.07% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.174-local-keyed** | remove row | completed | duration | ms | 43.4 | 5.4 | 35.2 | +31.52% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.174-local-keyed** | create many rows | completed | duration | ms | 1034 | 294.3 | 736.6 | +30.51% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.174-local-keyed** | append rows to large table | completed | duration | ms | 113.6 | 37.7 | 74.1 | +37.03% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.174-local-keyed** | clear rows | completed | duration | ms | 43.3 | 38.6 | 3 | +47.78% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.174-local-keyed** | ready memory | completed | memory | MB | 1.4 |  |  | +34.81% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.174-local-keyed** | run memory | completed | memory | MB | 4.9 |  |  | +73.74% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.174-local-keyed** | repeated clear memory | completed | memory | MB | 2.4 |  |  | +100.94% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.174-local-keyed** | total byte weight | completed | size | kB | 31.9 |  |  | +608.89% |
| js-framework-benchmark | **mreact-v0.0.174-local-keyed** | create rows | completed | duration | ms | 70.8 | 6.6 | 63 | best |
| js-framework-benchmark | **mreact-v0.0.174-local-keyed** | replace all rows | completed | duration | ms | 80.4 | 14.1 | 64.2 | +3.61% |
| js-framework-benchmark | **mreact-v0.0.174-local-keyed** | partial update | completed | duration | ms | 42.5 | 2.1 | 37 | +5.46% |
| js-framework-benchmark | **mreact-v0.0.174-local-keyed** | select row | completed | duration | ms | 9.4 | 1 | 7 | best |
| js-framework-benchmark | **mreact-v0.0.174-local-keyed** | swap rows | completed | duration | ms | 49.4 | 2.1 | 44 | +2.07% |
| js-framework-benchmark | **mreact-v0.0.174-local-keyed** | remove row | completed | duration | ms | 37.9 | 1 | 34.9 | +14.85% |
| js-framework-benchmark | **mreact-v0.0.174-local-keyed** | create many rows | completed | duration | ms | 792.3 | 71.6 | 710.3 | best |
| js-framework-benchmark | **mreact-v0.0.174-local-keyed** | append rows to large table | completed | duration | ms | 82.9 | 8.2 | 73 | best |
| js-framework-benchmark | **mreact-v0.0.174-local-keyed** | clear rows | completed | duration | ms | 30.8 | 26.2 | 3 | +5.12% |
| js-framework-benchmark | **mreact-v0.0.174-local-keyed** | ready memory | completed | memory | MB | 1.1 |  |  | +8.5% |
| js-framework-benchmark | **mreact-v0.0.174-local-keyed** | run memory | completed | memory | MB | 2.9 |  |  | +2.64% |
| js-framework-benchmark | **mreact-v0.0.174-local-keyed** | repeated clear memory | completed | memory | MB | 1.4 |  |  | +13.96% |
| js-framework-benchmark | **mreact-v0.0.174-local-keyed** | total byte weight | completed | size | kB | 9.6 |  |  | +113.33% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | create rows | completed | duration | ms | 88.5 | 23.2 | 64.4 | +25% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | replace all rows | completed | duration | ms | 100.8 | 34.8 | 64.5 | +29.9% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | partial update | completed | duration | ms | 51.5 | 10.4 | 37.7 | +27.79% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | select row | completed | duration | ms | 15 | 6.2 | 7.2 | +59.57% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | swap rows | completed | duration | ms | 352.9 | 52.2 | 290.4 | +629.13% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | remove row | completed | duration | ms | 39.5 | 2.7 | 34.5 | +19.7% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | create many rows | completed | duration | ms | 1189.5 | 413 | 766.1 | +50.13% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | append rows to large table | completed | duration | ms | 98.6 | 23.6 | 73.3 | +18.94% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | clear rows | completed | duration | ms | 56.9 | 52.1 | 3.1 | +94.2% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | ready memory | completed | memory | MB | 1.6 |  |  | +60.59% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | run memory | completed | memory | MB | 4.9 |  |  | +73.55% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | repeated clear memory | completed | memory | MB | 2.5 |  |  | +102.37% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | total byte weight | completed | size | kB | 51.4 |  |  | +1042.22% |
| js-framework-benchmark | solid-v1.9.13-keyed | create rows | completed | duration | ms | 72.1 | 7.7 | 63.1 | +1.84% |
| js-framework-benchmark | solid-v1.9.13-keyed | replace all rows | completed | duration | ms | 77.6 | 15.2 | 61.4 | best |
| js-framework-benchmark | solid-v1.9.13-keyed | partial update | completed | duration | ms | 42.7 | 2.9 | 36.5 | +5.96% |
| js-framework-benchmark | solid-v1.9.13-keyed | select row | completed | duration | ms | 10.6 | 2.1 | 7.1 | +12.77% |
| js-framework-benchmark | solid-v1.9.13-keyed | swap rows | completed | duration | ms | 54.9 | 2.2 | 47.9 | +13.43% |
| js-framework-benchmark | solid-v1.9.13-keyed | remove row | completed | duration | ms | 43.5 | 1 | 39.9 | +31.82% |
| js-framework-benchmark | solid-v1.9.13-keyed | create many rows | completed | duration | ms | 806.1 | 74 | 720.9 | +1.74% |
| js-framework-benchmark | solid-v1.9.13-keyed | append rows to large table | completed | duration | ms | 84.9 | 8.5 | 74.6 | +2.41% |
| js-framework-benchmark | solid-v1.9.13-keyed | clear rows | completed | duration | ms | 36.5 | 32.2 | 3.4 | +24.57% |
| js-framework-benchmark | solid-v1.9.13-keyed | ready memory | completed | memory | MB | 1 |  |  | +1.53% |
| js-framework-benchmark | solid-v1.9.13-keyed | run memory | completed | memory | MB | 3.1 |  |  | +10.67% |
| js-framework-benchmark | solid-v1.9.13-keyed | repeated clear memory | completed | memory | MB | 1.2 |  |  | best |
| js-framework-benchmark | solid-v1.9.13-keyed | total byte weight | completed | size | kB | 4.5 |  |  | best |
| js-framework-benchmark | svelte-v5.56.3-keyed | create rows | completed | duration | ms | 74.3 | 10.6 | 62.7 | +4.94% |
| js-framework-benchmark | svelte-v5.56.3-keyed | replace all rows | completed | duration | ms | 84.5 | 19.2 | 64.2 | +8.89% |
| js-framework-benchmark | svelte-v5.56.3-keyed | partial update | completed | duration | ms | 46.7 | 4.1 | 38.8 | +15.88% |
| js-framework-benchmark | svelte-v5.56.3-keyed | select row | completed | duration | ms | 14.6 | 6.9 | 6.7 | +55.32% |
| js-framework-benchmark | svelte-v5.56.3-keyed | swap rows | completed | duration | ms | 58.6 | 4.1 | 50.7 | +21.07% |
| js-framework-benchmark | svelte-v5.56.3-keyed | remove row | completed | duration | ms | 36.6 | 1.6 | 33.5 | +10.91% |
| js-framework-benchmark | svelte-v5.56.3-keyed | create many rows | completed | duration | ms | 832.3 | 100.3 | 722.9 | +5.05% |
| js-framework-benchmark | svelte-v5.56.3-keyed | append rows to large table | completed | duration | ms | 85.5 | 10.7 | 72.9 | +3.14% |
| js-framework-benchmark | svelte-v5.56.3-keyed | clear rows | completed | duration | ms | 33.6 | 29.1 | 3.4 | +14.68% |
| js-framework-benchmark | svelte-v5.56.3-keyed | ready memory | completed | memory | MB | 1.2 |  |  | +20.53% |
| js-framework-benchmark | svelte-v5.56.3-keyed | run memory | completed | memory | MB | 3.5 |  |  | +24.21% |
| js-framework-benchmark | svelte-v5.56.3-keyed | repeated clear memory | completed | memory | MB | 1.5 |  |  | +27.35% |
| js-framework-benchmark | svelte-v5.56.3-keyed | total byte weight | completed | size | kB | 14.3 |  |  | +217.78% |
| js-framework-benchmark | vue-v3.6.0-beta.16-keyed | create rows | completed | duration | ms | 86.6 | 21 | 64.2 | +22.32% |
| js-framework-benchmark | vue-v3.6.0-beta.16-keyed | replace all rows | completed | duration | ms | 96.4 | 27.4 | 67 | +24.23% |
| js-framework-benchmark | vue-v3.6.0-beta.16-keyed | partial update | completed | duration | ms | 51.7 | 6.7 | 42 | +28.29% |
| js-framework-benchmark | vue-v3.6.0-beta.16-keyed | select row | completed | duration | ms | 10.2 | 2.6 | 6.1 | +8.51% |
| js-framework-benchmark | vue-v3.6.0-beta.16-keyed | swap rows | completed | duration | ms | 58 | 3.1 | 49.9 | +19.83% |
| js-framework-benchmark | vue-v3.6.0-beta.16-keyed | remove row | completed | duration | ms | 42.9 | 5.5 | 34.9 | +30% |
| js-framework-benchmark | vue-v3.6.0-beta.16-keyed | create many rows | completed | duration | ms | 921.4 | 169.5 | 742.9 | +16.29% |
| js-framework-benchmark | vue-v3.6.0-beta.16-keyed | append rows to large table | completed | duration | ms | 93.5 | 17.8 | 73.8 | +12.79% |
| js-framework-benchmark | vue-v3.6.0-beta.16-keyed | clear rows | completed | duration | ms | 46.4 | 41.9 | 3.1 | +58.36% |
| js-framework-benchmark | vue-v3.6.0-beta.16-keyed | ready memory | completed | memory | MB | 1.4 |  |  | +33.42% |
| js-framework-benchmark | vue-v3.6.0-beta.16-keyed | run memory | completed | memory | MB | 4.4 |  |  | +57.03% |
| js-framework-benchmark | vue-v3.6.0-beta.16-keyed | repeated clear memory | completed | memory | MB | 1.6 |  |  | +35.12% |
| js-framework-benchmark | vue-v3.6.0-beta.16-keyed | total byte weight | completed | size | kB | 23.9 |  |  | +431.11% |
