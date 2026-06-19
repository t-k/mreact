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

Raw JSON files are stored in `benchmarks/results/2026-06-19/003/js-framework-benchmark-results`.
Chrome trace files are stored in `benchmarks/results/2026-06-19/003/js-framework-benchmark-traces`.

## Rankings

Lower values are better for all js-framework-benchmark metrics reported here.

### create rows

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | **mreact-v0.0.176-local-keyed** | create rows | 68.4 | 6.2 | 60.9 | best | ms |
| 2 | marko-v6.1.11-keyed | create rows | 68.5 | 8.8 | 58.7 | +0.15% | ms |
| 3 | solid-v1.9.13-keyed | create rows | 70.1 | 7.6 | 61.6 | +2.49% | ms |
| 4 | svelte-v5.56.3-keyed | create rows | 71.5 | 10.2 | 60.3 | +4.53% | ms |
| 5 | vue-v3.6.0-beta.16-keyed | create rows | 83.3 | 21.6 | 60.9 | +21.78% | ms |
| 6 | **mreact-react-compat-v0.0.176-local-keyed** | create rows | 86.6 | 25 | 60.2 | +26.61% | ms |
| 7 | react-hooks-v19.2.7-keyed | create rows | 86.8 | 23.6 | 62.7 | +26.9% | ms |
| 8 | **mreact-react-compat-vdom-v0.0.176-local-keyed** | create rows | 98.3 | 34.6 | 61.1 | +43.71% | ms |
| 9 | angular-cf-v22.0.0-keyed | create rows | 101.8 | 20.4 | 64.3 | +48.83% | ms |

### replace all rows

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | solid-v1.9.13-keyed | replace all rows | 78.9 | 15.2 | 62.7 | best | ms |
| 2 | **mreact-v0.0.176-local-keyed** | replace all rows | 82.5 | 14.4 | 66.7 | +4.56% | ms |
| 3 | marko-v6.1.11-keyed | replace all rows | 83 | 15.5 | 66.1 | +5.2% | ms |
| 4 | svelte-v5.56.3-keyed | replace all rows | 83.4 | 18.6 | 63.1 | +5.7% | ms |
| 5 | vue-v3.6.0-beta.16-keyed | replace all rows | 94.7 | 26.9 | 66.1 | +20.03% | ms |
| 6 | **mreact-react-compat-v0.0.176-local-keyed** | replace all rows | 97.8 | 29.2 | 67.5 | +23.95% | ms |
| 7 | react-hooks-v19.2.7-keyed | replace all rows | 103.1 | 35.3 | 66.6 | +30.67% | ms |
| 8 | **mreact-react-compat-vdom-v0.0.176-local-keyed** | replace all rows | 108.8 | 43.1 | 64.3 | +37.9% | ms |
| 9 | angular-cf-v22.0.0-keyed | replace all rows | 114.4 | 32.2 | 67.1 | +44.99% | ms |

### partial update

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | solid-v1.9.13-keyed | partial update | 41.5 | 2.8 | 36.1 | best | ms |
| 2 | angular-cf-v22.0.0-keyed | partial update | 41.6 | 3.4 | 36.7 | +0.24% | ms |
| 3 | svelte-v5.56.3-keyed | partial update | 44 | 4 | 37.2 | +6.02% | ms |
| 4 | **mreact-v0.0.176-local-keyed** | partial update | 46.5 | 2 | 40.7 | +12.05% | ms |
| 5 | vue-v3.6.0-beta.16-keyed | partial update | 48.2 | 6.4 | 38.2 | +16.14% | ms |
| 6 | marko-v6.1.11-keyed | partial update | 49.5 | 5.7 | 39.2 | +19.28% | ms |
| 7 | react-hooks-v19.2.7-keyed | partial update | 50.6 | 10.8 | 35.6 | +21.93% | ms |
| 8 | **mreact-react-compat-v0.0.176-local-keyed** | partial update | 51.8 | 8.5 | 39.6 | +24.82% | ms |
| 9 | **mreact-react-compat-vdom-v0.0.176-local-keyed** | partial update | 70 | 24.1 | 42.1 | +68.67% | ms |

### select row

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | **mreact-v0.0.176-local-keyed** | select row | 9.6 | 1.1 | 7.5 | best | ms |
| 2 | solid-v1.9.13-keyed | select row | 10.7 | 2.2 | 7.2 | +11.46% | ms |
| 3 | vue-v3.6.0-beta.16-keyed | select row | 11.6 | 2.6 | 7.5 | +20.83% | ms |
| 4 | angular-cf-v22.0.0-keyed | select row | 12.7 | 4.3 | 7 | +32.29% | ms |
| 5 | marko-v6.1.11-keyed | select row | 16.1 | 6.7 | 7.7 | +67.71% | ms |
| 6 | svelte-v5.56.3-keyed | select row | 16.1 | 7.1 | 7.2 | +67.71% | ms |
| 7 | **mreact-react-compat-v0.0.176-local-keyed** | select row | 16.7 | 6.9 | 7.6 | +73.96% | ms |
| 8 | react-hooks-v19.2.7-keyed | select row | 16.7 | 6.9 | 7.6 | +73.96% | ms |
| 9 | **mreact-react-compat-vdom-v0.0.176-local-keyed** | select row | 17.8 | 8.4 | 7.8 | +85.42% | ms |

### swap rows

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | solid-v1.9.13-keyed | swap rows | 49.4 | 2.2 | 43.4 | best | ms |
| 2 | vue-v3.6.0-beta.16-keyed | swap rows | 50 | 3.2 | 43.5 | +1.21% | ms |
| 3 | svelte-v5.56.3-keyed | swap rows | 52.1 | 3.9 | 44.3 | +5.47% | ms |
| 4 | **mreact-v0.0.176-local-keyed** | swap rows | 54.3 | 2.2 | 47.6 | +9.92% | ms |
| 5 | angular-cf-v22.0.0-keyed | swap rows | 56.3 | 3.4 | 49.9 | +13.97% | ms |
| 6 | marko-v6.1.11-keyed | swap rows | 57.9 | 4.9 | 47.5 | +17.21% | ms |
| 7 | **mreact-react-compat-v0.0.176-local-keyed** | swap rows | 65.6 | 11.7 | 48.8 | +32.79% | ms |
| 8 | **mreact-react-compat-vdom-v0.0.176-local-keyed** | swap rows | 68.7 | 20.8 | 44.4 | +39.07% | ms |
| 9 | react-hooks-v19.2.7-keyed | swap rows | 337.9 | 55.2 | 278.5 | +584.01% | ms |

### remove row

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | angular-cf-v22.0.0-keyed | remove row | 33 | 1.5 | 30.3 | best | ms |
| 2 | solid-v1.9.13-keyed | remove row | 34.3 | 0.7 | 31.7 | +3.94% | ms |
| 3 | svelte-v5.56.3-keyed | remove row | 34.3 | 1.7 | 30.9 | +3.94% | ms |
| 4 | **mreact-v0.0.176-local-keyed** | remove row | 36.5 | 0.8 | 33.3 | +10.61% | ms |
| 5 | **mreact-react-compat-v0.0.176-local-keyed** | remove row | 37.9 | 2.8 | 33.2 | +14.85% | ms |
| 6 | marko-v6.1.11-keyed | remove row | 38.3 | 3.6 | 32.5 | +16.06% | ms |
| 7 | vue-v3.6.0-beta.16-keyed | remove row | 40.9 | 5.7 | 32.7 | +23.94% | ms |
| 8 | react-hooks-v19.2.7-keyed | remove row | 41.7 | 2.8 | 36.2 | +26.36% | ms |
| 9 | **mreact-react-compat-vdom-v0.0.176-local-keyed** | remove row | 47.8 | 6.2 | 39 | +44.85% | ms |

### create many rows

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | **mreact-v0.0.176-local-keyed** | create many rows | 770 | 70 | 688.3 | best | ms |
| 2 | marko-v6.1.11-keyed | create many rows | 775.7 | 82.4 | 684.6 | +0.74% | ms |
| 3 | solid-v1.9.13-keyed | create many rows | 789.8 | 74.6 | 706.1 | +2.57% | ms |
| 4 | svelte-v5.56.3-keyed | create many rows | 818.1 | 98.6 | 708.2 | +6.25% | ms |
| 5 | vue-v3.6.0-beta.16-keyed | create many rows | 915.5 | 172.1 | 731.2 | +18.9% | ms |
| 6 | **mreact-react-compat-v0.0.176-local-keyed** | create many rows | 934.1 | 252.8 | 672.5 | +21.31% | ms |
| 7 | **mreact-react-compat-vdom-v0.0.176-local-keyed** | create many rows | 1007.5 | 299.1 | 701.7 | +30.84% | ms |
| 8 | angular-cf-v22.0.0-keyed | create many rows | 1018.6 | 210 | 730.4 | +32.29% | ms |
| 9 | react-hooks-v19.2.7-keyed | create many rows | 1175.5 | 416.6 | 747 | +52.66% | ms |

### append rows to large table

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | **mreact-v0.0.176-local-keyed** | append rows to large table | 82.8 | 8 | 73 | best | ms |
| 2 | marko-v6.1.11-keyed | append rows to large table | 85.5 | 10.6 | 72.5 | +3.26% | ms |
| 3 | solid-v1.9.13-keyed | append rows to large table | 88 | 9.2 | 76.4 | +6.28% | ms |
| 4 | svelte-v5.56.3-keyed | append rows to large table | 88 | 11.1 | 74.7 | +6.28% | ms |
| 5 | vue-v3.6.0-beta.16-keyed | append rows to large table | 97.3 | 18.2 | 76.6 | +17.51% | ms |
| 6 | **mreact-react-compat-v0.0.176-local-keyed** | append rows to large table | 100.3 | 26.3 | 73.7 | +21.14% | ms |
| 7 | react-hooks-v19.2.7-keyed | append rows to large table | 102.3 | 24.1 | 76.4 | +23.55% | ms |
| 8 | angular-cf-v22.0.0-keyed | append rows to large table | 111.3 | 18 | 77.6 | +34.42% | ms |
| 9 | **mreact-react-compat-vdom-v0.0.176-local-keyed** | append rows to large table | 114.5 | 36 | 76.5 | +38.29% | ms |

### clear rows

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | **mreact-v0.0.176-local-keyed** | clear rows | 29.5 | 25 | 3.4 | best | ms |
| 2 | marko-v6.1.11-keyed | clear rows | 29.8 | 25.4 | 3.2 | +1.02% | ms |
| 3 | svelte-v5.56.3-keyed | clear rows | 36.1 | 31.3 | 3.5 | +22.37% | ms |
| 4 | solid-v1.9.13-keyed | clear rows | 37.6 | 32.8 | 3.3 | +27.46% | ms |
| 5 | **mreact-react-compat-vdom-v0.0.176-local-keyed** | clear rows | 42.6 | 37.5 | 3.5 | +44.41% | ms |
| 6 | vue-v3.6.0-beta.16-keyed | clear rows | 48.9 | 43.7 | 3.1 | +65.76% | ms |
| 7 | **mreact-react-compat-v0.0.176-local-keyed** | clear rows | 51.2 | 46.5 | 3.7 | +73.56% | ms |
| 8 | react-hooks-v19.2.7-keyed | clear rows | 59.6 | 54.8 | 3.3 | +102.03% | ms |
| 9 | angular-cf-v22.0.0-keyed | clear rows | 63.5 | 59.2 | 3.8 | +115.25% | ms |

### ready memory

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | marko-v6.1.11-keyed | ready memory | 1 |  |  | best | MB |
| 2 | solid-v1.9.13-keyed | ready memory | 1 |  |  | +1.05% | MB |
| 3 | **mreact-v0.0.176-local-keyed** | ready memory | 1.1 |  |  | +8.03% | MB |
| 4 | svelte-v5.56.3-keyed | ready memory | 1.2 |  |  | +17.12% | MB |
| 5 | vue-v3.6.0-beta.16-keyed | ready memory | 1.3 |  |  | +28.86% | MB |
| 6 | **mreact-react-compat-vdom-v0.0.176-local-keyed** | ready memory | 1.4 |  |  | +34.59% | MB |
| 7 | **mreact-react-compat-v0.0.176-local-keyed** | ready memory | 1.4 |  |  | +35.67% | MB |
| 8 | react-hooks-v19.2.7-keyed | ready memory | 1.6 |  |  | +58.86% | MB |
| 9 | angular-cf-v22.0.0-keyed | ready memory | 2 |  |  | +96.73% | MB |

### run memory

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | marko-v6.1.11-keyed | run memory | 2.8 |  |  | best | MB |
| 2 | **mreact-v0.0.176-local-keyed** | run memory | 2.9 |  |  | +2.83% | MB |
| 3 | solid-v1.9.13-keyed | run memory | 3.1 |  |  | +10.93% | MB |
| 4 | svelte-v5.56.3-keyed | run memory | 3.5 |  |  | +24.95% | MB |
| 5 | vue-v3.6.0-beta.16-keyed | run memory | 4.4 |  |  | +55.97% | MB |
| 6 | **mreact-react-compat-vdom-v0.0.176-local-keyed** | run memory | 4.9 |  |  | +73.1% | MB |
| 7 | react-hooks-v19.2.7-keyed | run memory | 4.9 |  |  | +74.62% | MB |
| 8 | angular-cf-v22.0.0-keyed | run memory | 5 |  |  | +79.92% | MB |
| 9 | **mreact-react-compat-v0.0.176-local-keyed** | run memory | 5.4 |  |  | +91.48% | MB |

### repeated clear memory

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | solid-v1.9.13-keyed | repeated clear memory | 1.2 |  |  | best | MB |
| 2 | **mreact-v0.0.176-local-keyed** | repeated clear memory | 1.4 |  |  | +11.62% | MB |
| 3 | marko-v6.1.11-keyed | repeated clear memory | 1.4 |  |  | +13.53% | MB |
| 4 | svelte-v5.56.3-keyed | repeated clear memory | 1.5 |  |  | +23.83% | MB |
| 5 | vue-v3.6.0-beta.16-keyed | repeated clear memory | 1.7 |  |  | +36.87% | MB |
| 6 | **mreact-react-compat-v0.0.176-local-keyed** | repeated clear memory | 1.9 |  |  | +52% | MB |
| 7 | react-hooks-v19.2.7-keyed | repeated clear memory | 2.5 |  |  | +97.18% | MB |
| 8 | **mreact-react-compat-vdom-v0.0.176-local-keyed** | repeated clear memory | 2.5 |  |  | +100.41% | MB |
| 9 | angular-cf-v22.0.0-keyed | repeated clear memory | 2.6 |  |  | +105.46% | MB |

### total byte weight

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | solid-v1.9.13-keyed | total byte weight | 4.5 |  |  | best | kB |
| 2 | marko-v6.1.11-keyed | total byte weight | 4.8 |  |  | +6.67% | kB |
| 3 | **mreact-v0.0.176-local-keyed** | total byte weight | 9.6 |  |  | +113.33% | kB |
| 4 | svelte-v5.56.3-keyed | total byte weight | 14.3 |  |  | +217.78% | kB |
| 5 | vue-v3.6.0-beta.16-keyed | total byte weight | 23.9 |  |  | +431.11% | kB |
| 6 | **mreact-react-compat-vdom-v0.0.176-local-keyed** | total byte weight | 32.8 |  |  | +628.89% | kB |
| 7 | **mreact-react-compat-v0.0.176-local-keyed** | total byte weight | 34.8 |  |  | +673.33% | kB |
| 8 | angular-cf-v22.0.0-keyed | total byte weight | 44.5 |  |  | +888.89% | kB |
| 9 | react-hooks-v19.2.7-keyed | total byte weight | 51.4 |  |  | +1042.22% | kB |

## Results

| suite | framework | case | status | metric | unit | value | script | paint | diff vs 1st |
| --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | create rows | completed | duration | ms | 101.8 | 20.4 | 64.3 | +48.83% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | replace all rows | completed | duration | ms | 114.4 | 32.2 | 67.1 | +44.99% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | partial update | completed | duration | ms | 41.6 | 3.4 | 36.7 | +0.24% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | select row | completed | duration | ms | 12.7 | 4.3 | 7 | +32.29% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | swap rows | completed | duration | ms | 56.3 | 3.4 | 49.9 | +13.97% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | remove row | completed | duration | ms | 33 | 1.5 | 30.3 | best |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | create many rows | completed | duration | ms | 1018.6 | 210 | 730.4 | +32.29% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | append rows to large table | completed | duration | ms | 111.3 | 18 | 77.6 | +34.42% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | clear rows | completed | duration | ms | 63.5 | 59.2 | 3.8 | +115.25% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | ready memory | completed | memory | MB | 2 |  |  | +96.73% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | run memory | completed | memory | MB | 5 |  |  | +79.92% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | repeated clear memory | completed | memory | MB | 2.6 |  |  | +105.46% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | total byte weight | completed | size | kB | 44.5 |  |  | +888.89% |
| js-framework-benchmark | marko-v6.1.11-keyed | create rows | completed | duration | ms | 68.5 | 8.8 | 58.7 | +0.15% |
| js-framework-benchmark | marko-v6.1.11-keyed | replace all rows | completed | duration | ms | 83 | 15.5 | 66.1 | +5.2% |
| js-framework-benchmark | marko-v6.1.11-keyed | partial update | completed | duration | ms | 49.5 | 5.7 | 39.2 | +19.28% |
| js-framework-benchmark | marko-v6.1.11-keyed | select row | completed | duration | ms | 16.1 | 6.7 | 7.7 | +67.71% |
| js-framework-benchmark | marko-v6.1.11-keyed | swap rows | completed | duration | ms | 57.9 | 4.9 | 47.5 | +17.21% |
| js-framework-benchmark | marko-v6.1.11-keyed | remove row | completed | duration | ms | 38.3 | 3.6 | 32.5 | +16.06% |
| js-framework-benchmark | marko-v6.1.11-keyed | create many rows | completed | duration | ms | 775.7 | 82.4 | 684.6 | +0.74% |
| js-framework-benchmark | marko-v6.1.11-keyed | append rows to large table | completed | duration | ms | 85.5 | 10.6 | 72.5 | +3.26% |
| js-framework-benchmark | marko-v6.1.11-keyed | clear rows | completed | duration | ms | 29.8 | 25.4 | 3.2 | +1.02% |
| js-framework-benchmark | marko-v6.1.11-keyed | ready memory | completed | memory | MB | 1 |  |  | best |
| js-framework-benchmark | marko-v6.1.11-keyed | run memory | completed | memory | MB | 2.8 |  |  | best |
| js-framework-benchmark | marko-v6.1.11-keyed | repeated clear memory | completed | memory | MB | 1.4 |  |  | +13.53% |
| js-framework-benchmark | marko-v6.1.11-keyed | total byte weight | completed | size | kB | 4.8 |  |  | +6.67% |
| js-framework-benchmark | **mreact-react-compat-v0.0.176-local-keyed** | create rows | completed | duration | ms | 86.6 | 25 | 60.2 | +26.61% |
| js-framework-benchmark | **mreact-react-compat-v0.0.176-local-keyed** | replace all rows | completed | duration | ms | 97.8 | 29.2 | 67.5 | +23.95% |
| js-framework-benchmark | **mreact-react-compat-v0.0.176-local-keyed** | partial update | completed | duration | ms | 51.8 | 8.5 | 39.6 | +24.82% |
| js-framework-benchmark | **mreact-react-compat-v0.0.176-local-keyed** | select row | completed | duration | ms | 16.7 | 6.9 | 7.6 | +73.96% |
| js-framework-benchmark | **mreact-react-compat-v0.0.176-local-keyed** | swap rows | completed | duration | ms | 65.6 | 11.7 | 48.8 | +32.79% |
| js-framework-benchmark | **mreact-react-compat-v0.0.176-local-keyed** | remove row | completed | duration | ms | 37.9 | 2.8 | 33.2 | +14.85% |
| js-framework-benchmark | **mreact-react-compat-v0.0.176-local-keyed** | create many rows | completed | duration | ms | 934.1 | 252.8 | 672.5 | +21.31% |
| js-framework-benchmark | **mreact-react-compat-v0.0.176-local-keyed** | append rows to large table | completed | duration | ms | 100.3 | 26.3 | 73.7 | +21.14% |
| js-framework-benchmark | **mreact-react-compat-v0.0.176-local-keyed** | clear rows | completed | duration | ms | 51.2 | 46.5 | 3.7 | +73.56% |
| js-framework-benchmark | **mreact-react-compat-v0.0.176-local-keyed** | ready memory | completed | memory | MB | 1.4 |  |  | +35.67% |
| js-framework-benchmark | **mreact-react-compat-v0.0.176-local-keyed** | run memory | completed | memory | MB | 5.4 |  |  | +91.48% |
| js-framework-benchmark | **mreact-react-compat-v0.0.176-local-keyed** | repeated clear memory | completed | memory | MB | 1.9 |  |  | +52% |
| js-framework-benchmark | **mreact-react-compat-v0.0.176-local-keyed** | total byte weight | completed | size | kB | 34.8 |  |  | +673.33% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.176-local-keyed** | create rows | completed | duration | ms | 98.3 | 34.6 | 61.1 | +43.71% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.176-local-keyed** | replace all rows | completed | duration | ms | 108.8 | 43.1 | 64.3 | +37.9% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.176-local-keyed** | partial update | completed | duration | ms | 70 | 24.1 | 42.1 | +68.67% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.176-local-keyed** | select row | completed | duration | ms | 17.8 | 8.4 | 7.8 | +85.42% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.176-local-keyed** | swap rows | completed | duration | ms | 68.7 | 20.8 | 44.4 | +39.07% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.176-local-keyed** | remove row | completed | duration | ms | 47.8 | 6.2 | 39 | +44.85% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.176-local-keyed** | create many rows | completed | duration | ms | 1007.5 | 299.1 | 701.7 | +30.84% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.176-local-keyed** | append rows to large table | completed | duration | ms | 114.5 | 36 | 76.5 | +38.29% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.176-local-keyed** | clear rows | completed | duration | ms | 42.6 | 37.5 | 3.5 | +44.41% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.176-local-keyed** | ready memory | completed | memory | MB | 1.4 |  |  | +34.59% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.176-local-keyed** | run memory | completed | memory | MB | 4.9 |  |  | +73.1% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.176-local-keyed** | repeated clear memory | completed | memory | MB | 2.5 |  |  | +100.41% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.176-local-keyed** | total byte weight | completed | size | kB | 32.8 |  |  | +628.89% |
| js-framework-benchmark | **mreact-v0.0.176-local-keyed** | create rows | completed | duration | ms | 68.4 | 6.2 | 60.9 | best |
| js-framework-benchmark | **mreact-v0.0.176-local-keyed** | replace all rows | completed | duration | ms | 82.5 | 14.4 | 66.7 | +4.56% |
| js-framework-benchmark | **mreact-v0.0.176-local-keyed** | partial update | completed | duration | ms | 46.5 | 2 | 40.7 | +12.05% |
| js-framework-benchmark | **mreact-v0.0.176-local-keyed** | select row | completed | duration | ms | 9.6 | 1.1 | 7.5 | best |
| js-framework-benchmark | **mreact-v0.0.176-local-keyed** | swap rows | completed | duration | ms | 54.3 | 2.2 | 47.6 | +9.92% |
| js-framework-benchmark | **mreact-v0.0.176-local-keyed** | remove row | completed | duration | ms | 36.5 | 0.8 | 33.3 | +10.61% |
| js-framework-benchmark | **mreact-v0.0.176-local-keyed** | create many rows | completed | duration | ms | 770 | 70 | 688.3 | best |
| js-framework-benchmark | **mreact-v0.0.176-local-keyed** | append rows to large table | completed | duration | ms | 82.8 | 8 | 73 | best |
| js-framework-benchmark | **mreact-v0.0.176-local-keyed** | clear rows | completed | duration | ms | 29.5 | 25 | 3.4 | best |
| js-framework-benchmark | **mreact-v0.0.176-local-keyed** | ready memory | completed | memory | MB | 1.1 |  |  | +8.03% |
| js-framework-benchmark | **mreact-v0.0.176-local-keyed** | run memory | completed | memory | MB | 2.9 |  |  | +2.83% |
| js-framework-benchmark | **mreact-v0.0.176-local-keyed** | repeated clear memory | completed | memory | MB | 1.4 |  |  | +11.62% |
| js-framework-benchmark | **mreact-v0.0.176-local-keyed** | total byte weight | completed | size | kB | 9.6 |  |  | +113.33% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | create rows | completed | duration | ms | 86.8 | 23.6 | 62.7 | +26.9% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | replace all rows | completed | duration | ms | 103.1 | 35.3 | 66.6 | +30.67% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | partial update | completed | duration | ms | 50.6 | 10.8 | 35.6 | +21.93% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | select row | completed | duration | ms | 16.7 | 6.9 | 7.6 | +73.96% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | swap rows | completed | duration | ms | 337.9 | 55.2 | 278.5 | +584.01% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | remove row | completed | duration | ms | 41.7 | 2.8 | 36.2 | +26.36% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | create many rows | completed | duration | ms | 1175.5 | 416.6 | 747 | +52.66% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | append rows to large table | completed | duration | ms | 102.3 | 24.1 | 76.4 | +23.55% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | clear rows | completed | duration | ms | 59.6 | 54.8 | 3.3 | +102.03% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | ready memory | completed | memory | MB | 1.6 |  |  | +58.86% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | run memory | completed | memory | MB | 4.9 |  |  | +74.62% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | repeated clear memory | completed | memory | MB | 2.5 |  |  | +97.18% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | total byte weight | completed | size | kB | 51.4 |  |  | +1042.22% |
| js-framework-benchmark | solid-v1.9.13-keyed | create rows | completed | duration | ms | 70.1 | 7.6 | 61.6 | +2.49% |
| js-framework-benchmark | solid-v1.9.13-keyed | replace all rows | completed | duration | ms | 78.9 | 15.2 | 62.7 | best |
| js-framework-benchmark | solid-v1.9.13-keyed | partial update | completed | duration | ms | 41.5 | 2.8 | 36.1 | best |
| js-framework-benchmark | solid-v1.9.13-keyed | select row | completed | duration | ms | 10.7 | 2.2 | 7.2 | +11.46% |
| js-framework-benchmark | solid-v1.9.13-keyed | swap rows | completed | duration | ms | 49.4 | 2.2 | 43.4 | best |
| js-framework-benchmark | solid-v1.9.13-keyed | remove row | completed | duration | ms | 34.3 | 0.7 | 31.7 | +3.94% |
| js-framework-benchmark | solid-v1.9.13-keyed | create many rows | completed | duration | ms | 789.8 | 74.6 | 706.1 | +2.57% |
| js-framework-benchmark | solid-v1.9.13-keyed | append rows to large table | completed | duration | ms | 88 | 9.2 | 76.4 | +6.28% |
| js-framework-benchmark | solid-v1.9.13-keyed | clear rows | completed | duration | ms | 37.6 | 32.8 | 3.3 | +27.46% |
| js-framework-benchmark | solid-v1.9.13-keyed | ready memory | completed | memory | MB | 1 |  |  | +1.05% |
| js-framework-benchmark | solid-v1.9.13-keyed | run memory | completed | memory | MB | 3.1 |  |  | +10.93% |
| js-framework-benchmark | solid-v1.9.13-keyed | repeated clear memory | completed | memory | MB | 1.2 |  |  | best |
| js-framework-benchmark | solid-v1.9.13-keyed | total byte weight | completed | size | kB | 4.5 |  |  | best |
| js-framework-benchmark | svelte-v5.56.3-keyed | create rows | completed | duration | ms | 71.5 | 10.2 | 60.3 | +4.53% |
| js-framework-benchmark | svelte-v5.56.3-keyed | replace all rows | completed | duration | ms | 83.4 | 18.6 | 63.1 | +5.7% |
| js-framework-benchmark | svelte-v5.56.3-keyed | partial update | completed | duration | ms | 44 | 4 | 37.2 | +6.02% |
| js-framework-benchmark | svelte-v5.56.3-keyed | select row | completed | duration | ms | 16.1 | 7.1 | 7.2 | +67.71% |
| js-framework-benchmark | svelte-v5.56.3-keyed | swap rows | completed | duration | ms | 52.1 | 3.9 | 44.3 | +5.47% |
| js-framework-benchmark | svelte-v5.56.3-keyed | remove row | completed | duration | ms | 34.3 | 1.7 | 30.9 | +3.94% |
| js-framework-benchmark | svelte-v5.56.3-keyed | create many rows | completed | duration | ms | 818.1 | 98.6 | 708.2 | +6.25% |
| js-framework-benchmark | svelte-v5.56.3-keyed | append rows to large table | completed | duration | ms | 88 | 11.1 | 74.7 | +6.28% |
| js-framework-benchmark | svelte-v5.56.3-keyed | clear rows | completed | duration | ms | 36.1 | 31.3 | 3.5 | +22.37% |
| js-framework-benchmark | svelte-v5.56.3-keyed | ready memory | completed | memory | MB | 1.2 |  |  | +17.12% |
| js-framework-benchmark | svelte-v5.56.3-keyed | run memory | completed | memory | MB | 3.5 |  |  | +24.95% |
| js-framework-benchmark | svelte-v5.56.3-keyed | repeated clear memory | completed | memory | MB | 1.5 |  |  | +23.83% |
| js-framework-benchmark | svelte-v5.56.3-keyed | total byte weight | completed | size | kB | 14.3 |  |  | +217.78% |
| js-framework-benchmark | vue-v3.6.0-beta.16-keyed | create rows | completed | duration | ms | 83.3 | 21.6 | 60.9 | +21.78% |
| js-framework-benchmark | vue-v3.6.0-beta.16-keyed | replace all rows | completed | duration | ms | 94.7 | 26.9 | 66.1 | +20.03% |
| js-framework-benchmark | vue-v3.6.0-beta.16-keyed | partial update | completed | duration | ms | 48.2 | 6.4 | 38.2 | +16.14% |
| js-framework-benchmark | vue-v3.6.0-beta.16-keyed | select row | completed | duration | ms | 11.6 | 2.6 | 7.5 | +20.83% |
| js-framework-benchmark | vue-v3.6.0-beta.16-keyed | swap rows | completed | duration | ms | 50 | 3.2 | 43.5 | +1.21% |
| js-framework-benchmark | vue-v3.6.0-beta.16-keyed | remove row | completed | duration | ms | 40.9 | 5.7 | 32.7 | +23.94% |
| js-framework-benchmark | vue-v3.6.0-beta.16-keyed | create many rows | completed | duration | ms | 915.5 | 172.1 | 731.2 | +18.9% |
| js-framework-benchmark | vue-v3.6.0-beta.16-keyed | append rows to large table | completed | duration | ms | 97.3 | 18.2 | 76.6 | +17.51% |
| js-framework-benchmark | vue-v3.6.0-beta.16-keyed | clear rows | completed | duration | ms | 48.9 | 43.7 | 3.1 | +65.76% |
| js-framework-benchmark | vue-v3.6.0-beta.16-keyed | ready memory | completed | memory | MB | 1.3 |  |  | +28.86% |
| js-framework-benchmark | vue-v3.6.0-beta.16-keyed | run memory | completed | memory | MB | 4.4 |  |  | +55.97% |
| js-framework-benchmark | vue-v3.6.0-beta.16-keyed | repeated clear memory | completed | memory | MB | 1.7 |  |  | +36.87% |
| js-framework-benchmark | vue-v3.6.0-beta.16-keyed | total byte weight | completed | size | kB | 23.9 |  |  | +431.11% |
