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

Raw JSON files are stored in `benchmarks/results/2026-06-18/003/js-framework-benchmark-results`.
Chrome trace files are stored in `benchmarks/results/2026-06-18/003/js-framework-benchmark-traces`.

## Rankings

Lower values are better for all js-framework-benchmark metrics reported here.

### create rows

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | **mreact-v0.0.173-local-keyed** | create rows | 70.7 | 6.5 | 63.2 | best | ms |
| 2 | solid-v1.9.13-keyed | create rows | 72 | 7.7 | 63.1 | +1.84% | ms |
| 3 | marko-v6.1.11-keyed | create rows | 73.3 | 9 | 63.2 | +3.68% | ms |
| 4 | svelte-v5.56.3-keyed | create rows | 75.2 | 10.9 | 63.3 | +6.36% | ms |
| 5 | vue-v3.6.0-beta.16-keyed | create rows | 87.4 | 21.1 | 64.8 | +23.62% | ms |
| 6 | **mreact-react-compat-v0.0.173-local-keyed** | create rows | 90.2 | 24.2 | 64.9 | +27.58% | ms |
| 7 | react-hooks-v19.2.7-keyed | create rows | 93.1 | 23.4 | 68.6 | +31.68% | ms |
| 8 | **mreact-react-compat-vdom-v0.0.173-local-keyed** | create rows | 99.1 | 33.7 | 64 | +40.17% | ms |
| 9 | angular-cf-v22.0.0-keyed | create rows | 102.5 | 19.8 | 65 | +44.98% | ms |

### replace all rows

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | solid-v1.9.13-keyed | replace all rows | 76.9 | 15 | 60.6 | best | ms |
| 2 | **mreact-v0.0.173-local-keyed** | replace all rows | 77.1 | 13.2 | 62.7 | +0.26% | ms |
| 3 | marko-v6.1.11-keyed | replace all rows | 79.5 | 15.1 | 63.3 | +3.38% | ms |
| 4 | svelte-v5.56.3-keyed | replace all rows | 82 | 18.2 | 62.7 | +6.63% | ms |
| 5 | **mreact-react-compat-v0.0.173-local-keyed** | replace all rows | 92.3 | 28 | 63.1 | +20.03% | ms |
| 6 | vue-v3.6.0-beta.16-keyed | replace all rows | 92.8 | 26.2 | 65.2 | +20.68% | ms |
| 7 | react-hooks-v19.2.7-keyed | replace all rows | 102.7 | 35.3 | 65.5 | +33.55% | ms |
| 8 | **mreact-react-compat-vdom-v0.0.173-local-keyed** | replace all rows | 109.1 | 43.9 | 64.8 | +41.87% | ms |
| 9 | angular-cf-v22.0.0-keyed | replace all rows | 116.2 | 33 | 67.7 | +51.11% | ms |

### partial update

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | angular-cf-v22.0.0-keyed | partial update | 41.3 | 2.8 | 36.9 | best | ms |
| 2 | **mreact-v0.0.173-local-keyed** | partial update | 41.9 | 2.1 | 37.1 | +1.45% | ms |
| 3 | solid-v1.9.13-keyed | partial update | 43.2 | 2.9 | 37 | +4.6% | ms |
| 4 | svelte-v5.56.3-keyed | partial update | 44.8 | 3.8 | 37.1 | +8.47% | ms |
| 5 | marko-v6.1.11-keyed | partial update | 45 | 5.2 | 36.9 | +8.96% | ms |
| 6 | vue-v3.6.0-beta.16-keyed | partial update | 48.5 | 6.4 | 38.1 | +17.43% | ms |
| 7 | react-hooks-v19.2.7-keyed | partial update | 49.8 | 9.9 | 36.8 | +20.58% | ms |
| 8 | **mreact-react-compat-v0.0.173-local-keyed** | partial update | 53.7 | 12.3 | 37.3 | +30.02% | ms |
| 9 | **mreact-react-compat-vdom-v0.0.173-local-keyed** | partial update | 62.5 | 20.5 | 37.2 | +51.33% | ms |

### select row

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | **mreact-v0.0.173-local-keyed** | select row | 8.7 | 1 | 6.2 | best | ms |
| 2 | solid-v1.9.13-keyed | select row | 9.6 | 1.8 | 6.5 | +10.34% | ms |
| 3 | vue-v3.6.0-beta.16-keyed | select row | 10.1 | 2.4 | 6.5 | +16.09% | ms |
| 4 | angular-cf-v22.0.0-keyed | select row | 12.4 | 3.9 | 7.1 | +42.53% | ms |
| 5 | marko-v6.1.11-keyed | select row | 13.4 | 5.6 | 6.4 | +54.02% | ms |
| 6 | react-hooks-v19.2.7-keyed | select row | 14 | 6 | 6.6 | +60.92% | ms |
| 7 | svelte-v5.56.3-keyed | select row | 14 | 6.3 | 6.6 | +60.92% | ms |
| 8 | **mreact-react-compat-v0.0.173-local-keyed** | select row | 14.2 | 6.3 | 6.5 | +63.22% | ms |
| 9 | **mreact-react-compat-vdom-v0.0.173-local-keyed** | select row | 15.1 | 7.2 | 6.3 | +73.56% | ms |

### swap rows

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | **mreact-v0.0.173-local-keyed** | swap rows | 49.7 | 2 | 44.1 | best | ms |
| 2 | angular-cf-v22.0.0-keyed | swap rows | 50.8 | 2.8 | 45.4 | +2.21% | ms |
| 3 | solid-v1.9.13-keyed | swap rows | 51.3 | 2.1 | 45.9 | +3.22% | ms |
| 4 | svelte-v5.56.3-keyed | swap rows | 52 | 3.8 | 44.9 | +4.63% | ms |
| 5 | marko-v6.1.11-keyed | swap rows | 52.8 | 4.5 | 44.7 | +6.24% | ms |
| 6 | vue-v3.6.0-beta.16-keyed | swap rows | 53.7 | 2.9 | 46.2 | +8.05% | ms |
| 7 | **mreact-react-compat-v0.0.173-local-keyed** | swap rows | 60.8 | 11.1 | 45.9 | +22.33% | ms |
| 8 | **mreact-react-compat-vdom-v0.0.173-local-keyed** | swap rows | 69.2 | 19 | 46 | +39.24% | ms |
| 9 | react-hooks-v19.2.7-keyed | swap rows | 336.4 | 49.9 | 281 | +576.86% | ms |

### remove row

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | angular-cf-v22.0.0-keyed | remove row | 33.1 | 1.4 | 31.1 | best | ms |
| 2 | **mreact-v0.0.173-local-keyed** | remove row | 36.6 | 1.6 | 33.1 | +10.57% | ms |
| 3 | svelte-v5.56.3-keyed | remove row | 37.2 | 1.6 | 33.9 | +12.39% | ms |
| 4 | react-hooks-v19.2.7-keyed | remove row | 38.5 | 2.4 | 33.6 | +16.31% | ms |
| 5 | solid-v1.9.13-keyed | remove row | 39.2 | 0.7 | 36.2 | +18.43% | ms |
| 6 | marko-v6.1.11-keyed | remove row | 40 | 3.4 | 34.3 | +20.85% | ms |
| 7 | **mreact-react-compat-v0.0.173-local-keyed** | remove row | 40.3 | 4.4 | 34.2 | +21.75% | ms |
| 8 | **mreact-react-compat-vdom-v0.0.173-local-keyed** | remove row | 41.5 | 5.3 | 33.9 | +25.38% | ms |
| 9 | vue-v3.6.0-beta.16-keyed | remove row | 42.1 | 5.5 | 34.1 | +27.19% | ms |

### create many rows

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | **mreact-v0.0.173-local-keyed** | create many rows | 791.7 | 74 | 709.2 | best | ms |
| 2 | marko-v6.1.11-keyed | create many rows | 794.8 | 84 | 702.9 | +0.39% | ms |
| 3 | solid-v1.9.13-keyed | create many rows | 799.3 | 74.8 | 716.9 | +0.96% | ms |
| 4 | svelte-v5.56.3-keyed | create many rows | 820.1 | 96.7 | 714 | +3.59% | ms |
| 5 | vue-v3.6.0-beta.16-keyed | create many rows | 922.3 | 170.1 | 741.3 | +16.5% | ms |
| 6 | **mreact-react-compat-v0.0.173-local-keyed** | create many rows | 961.5 | 216.5 | 736.1 | +21.45% | ms |
| 7 | **mreact-react-compat-vdom-v0.0.173-local-keyed** | create many rows | 1023.9 | 293 | 725 | +29.33% | ms |
| 8 | angular-cf-v22.0.0-keyed | create many rows | 1034.7 | 203.8 | 745.5 | +30.69% | ms |
| 9 | react-hooks-v19.2.7-keyed | create many rows | 1191.7 | 416.8 | 762.1 | +50.52% | ms |

### append rows to large table

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | solid-v1.9.13-keyed | append rows to large table | 84.3 | 8.4 | 74.3 | best | ms |
| 2 | **mreact-v0.0.173-local-keyed** | append rows to large table | 84.4 | 9 | 73.7 | +0.12% | ms |
| 3 | marko-v6.1.11-keyed | append rows to large table | 84.5 | 11.1 | 71.6 | +0.24% | ms |
| 4 | svelte-v5.56.3-keyed | append rows to large table | 85 | 10.8 | 72.5 | +0.83% | ms |
| 5 | vue-v3.6.0-beta.16-keyed | append rows to large table | 92 | 17.7 | 72.6 | +9.13% | ms |
| 6 | react-hooks-v19.2.7-keyed | append rows to large table | 98 | 23.2 | 72.6 | +16.25% | ms |
| 7 | **mreact-react-compat-v0.0.173-local-keyed** | append rows to large table | 98.9 | 25 | 72.3 | +17.32% | ms |
| 8 | angular-cf-v22.0.0-keyed | append rows to large table | 105.2 | 16.8 | 73 | +24.79% | ms |
| 9 | **mreact-react-compat-vdom-v0.0.173-local-keyed** | append rows to large table | 113 | 37.8 | 73.1 | +34.05% | ms |

### clear rows

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | marko-v6.1.11-keyed | clear rows | 28.8 | 25 | 3.2 | best | ms |
| 2 | **mreact-v0.0.173-local-keyed** | clear rows | 31.5 | 26.8 | 3.7 | +9.38% | ms |
| 3 | svelte-v5.56.3-keyed | clear rows | 34.3 | 29.7 | 3.5 | +19.1% | ms |
| 4 | solid-v1.9.13-keyed | clear rows | 37 | 32.6 | 3.4 | +28.47% | ms |
| 5 | **mreact-react-compat-vdom-v0.0.173-local-keyed** | clear rows | 43 | 38.1 | 3.7 | +49.31% | ms |
| 6 | vue-v3.6.0-beta.16-keyed | clear rows | 46 | 40.9 | 3.8 | +59.72% | ms |
| 7 | **mreact-react-compat-v0.0.173-local-keyed** | clear rows | 48.1 | 43.5 | 3.5 | +67.01% | ms |
| 8 | react-hooks-v19.2.7-keyed | clear rows | 57.8 | 53.2 | 3.2 | +100.69% | ms |
| 9 | angular-cf-v22.0.0-keyed | clear rows | 63.6 | 58.5 | 4.1 | +120.83% | ms |

### ready memory

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | solid-v1.9.13-keyed | ready memory | 1 |  |  | best | MB |
| 2 | marko-v6.1.11-keyed | ready memory | 1 |  |  | +2.88% | MB |
| 3 | **mreact-v0.0.173-local-keyed** | ready memory | 1.1 |  |  | +6.54% | MB |
| 4 | svelte-v5.56.3-keyed | ready memory | 1.2 |  |  | +16.82% | MB |
| 5 | vue-v3.6.0-beta.16-keyed | ready memory | 1.3 |  |  | +31.08% | MB |
| 6 | **mreact-react-compat-v0.0.173-local-keyed** | ready memory | 1.3 |  |  | +32.3% | MB |
| 7 | **mreact-react-compat-vdom-v0.0.173-local-keyed** | ready memory | 1.4 |  |  | +34.71% | MB |
| 8 | react-hooks-v19.2.7-keyed | ready memory | 1.6 |  |  | +57.24% | MB |
| 9 | angular-cf-v22.0.0-keyed | ready memory | 2.1 |  |  | +102.63% | MB |

### run memory

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | marko-v6.1.11-keyed | run memory | 2.9 |  |  | best | MB |
| 2 | **mreact-v0.0.173-local-keyed** | run memory | 2.9 |  |  | +1.21% | MB |
| 3 | solid-v1.9.13-keyed | run memory | 3.1 |  |  | +7.3% | MB |
| 4 | svelte-v5.56.3-keyed | run memory | 3.5 |  |  | +21.67% | MB |
| 5 | vue-v3.6.0-beta.16-keyed | run memory | 4.4 |  |  | +53.78% | MB |
| 6 | **mreact-react-compat-v0.0.173-local-keyed** | run memory | 4.7 |  |  | +63.5% | MB |
| 7 | react-hooks-v19.2.7-keyed | run memory | 4.9 |  |  | +68.82% | MB |
| 8 | **mreact-react-compat-vdom-v0.0.173-local-keyed** | run memory | 4.9 |  |  | +70.32% | MB |
| 9 | angular-cf-v22.0.0-keyed | run memory | 5.1 |  |  | +75.69% | MB |

### repeated clear memory

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | solid-v1.9.13-keyed | repeated clear memory | 1.2 |  |  | best | MB |
| 2 | **mreact-v0.0.173-local-keyed** | repeated clear memory | 1.4 |  |  | +9.79% | MB |
| 3 | marko-v6.1.11-keyed | repeated clear memory | 1.4 |  |  | +10.45% | MB |
| 4 | svelte-v5.56.3-keyed | repeated clear memory | 1.5 |  |  | +23.77% | MB |
| 5 | vue-v3.6.0-beta.16-keyed | repeated clear memory | 1.7 |  |  | +38.18% | MB |
| 6 | **mreact-react-compat-v0.0.173-local-keyed** | repeated clear memory | 1.9 |  |  | +52.3% | MB |
| 7 | react-hooks-v19.2.7-keyed | repeated clear memory | 2.4 |  |  | +95.62% | MB |
| 8 | **mreact-react-compat-vdom-v0.0.173-local-keyed** | repeated clear memory | 2.5 |  |  | +99.09% | MB |
| 9 | angular-cf-v22.0.0-keyed | repeated clear memory | 2.6 |  |  | +108.02% | MB |

### total byte weight

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | solid-v1.9.13-keyed | total byte weight | 4.5 |  |  | best | kB |
| 2 | marko-v6.1.11-keyed | total byte weight | 4.8 |  |  | +6.67% | kB |
| 3 | **mreact-v0.0.173-local-keyed** | total byte weight | 8.5 |  |  | +88.89% | kB |
| 4 | svelte-v5.56.3-keyed | total byte weight | 14.3 |  |  | +217.78% | kB |
| 5 | vue-v3.6.0-beta.16-keyed | total byte weight | 23.9 |  |  | +431.11% | kB |
| 6 | **mreact-react-compat-vdom-v0.0.173-local-keyed** | total byte weight | 31.9 |  |  | +608.89% | kB |
| 7 | **mreact-react-compat-v0.0.173-local-keyed** | total byte weight | 33.9 |  |  | +653.33% | kB |
| 8 | angular-cf-v22.0.0-keyed | total byte weight | 44.5 |  |  | +888.89% | kB |
| 9 | react-hooks-v19.2.7-keyed | total byte weight | 51.4 |  |  | +1042.22% | kB |

## Results

| suite | framework | case | status | metric | unit | value | script | paint | diff vs 1st |
| --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | create rows | completed | duration | ms | 102.5 | 19.8 | 65 | +44.98% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | replace all rows | completed | duration | ms | 116.2 | 33 | 67.7 | +51.11% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | partial update | completed | duration | ms | 41.3 | 2.8 | 36.9 | best |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | select row | completed | duration | ms | 12.4 | 3.9 | 7.1 | +42.53% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | swap rows | completed | duration | ms | 50.8 | 2.8 | 45.4 | +2.21% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | remove row | completed | duration | ms | 33.1 | 1.4 | 31.1 | best |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | create many rows | completed | duration | ms | 1034.7 | 203.8 | 745.5 | +30.69% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | append rows to large table | completed | duration | ms | 105.2 | 16.8 | 73 | +24.79% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | clear rows | completed | duration | ms | 63.6 | 58.5 | 4.1 | +120.83% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | ready memory | completed | memory | MB | 2.1 |  |  | +102.63% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | run memory | completed | memory | MB | 5.1 |  |  | +75.69% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | repeated clear memory | completed | memory | MB | 2.6 |  |  | +108.02% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | total byte weight | completed | size | kB | 44.5 |  |  | +888.89% |
| js-framework-benchmark | marko-v6.1.11-keyed | create rows | completed | duration | ms | 73.3 | 9 | 63.2 | +3.68% |
| js-framework-benchmark | marko-v6.1.11-keyed | replace all rows | completed | duration | ms | 79.5 | 15.1 | 63.3 | +3.38% |
| js-framework-benchmark | marko-v6.1.11-keyed | partial update | completed | duration | ms | 45 | 5.2 | 36.9 | +8.96% |
| js-framework-benchmark | marko-v6.1.11-keyed | select row | completed | duration | ms | 13.4 | 5.6 | 6.4 | +54.02% |
| js-framework-benchmark | marko-v6.1.11-keyed | swap rows | completed | duration | ms | 52.8 | 4.5 | 44.7 | +6.24% |
| js-framework-benchmark | marko-v6.1.11-keyed | remove row | completed | duration | ms | 40 | 3.4 | 34.3 | +20.85% |
| js-framework-benchmark | marko-v6.1.11-keyed | create many rows | completed | duration | ms | 794.8 | 84 | 702.9 | +0.39% |
| js-framework-benchmark | marko-v6.1.11-keyed | append rows to large table | completed | duration | ms | 84.5 | 11.1 | 71.6 | +0.24% |
| js-framework-benchmark | marko-v6.1.11-keyed | clear rows | completed | duration | ms | 28.8 | 25 | 3.2 | best |
| js-framework-benchmark | marko-v6.1.11-keyed | ready memory | completed | memory | MB | 1 |  |  | +2.88% |
| js-framework-benchmark | marko-v6.1.11-keyed | run memory | completed | memory | MB | 2.9 |  |  | best |
| js-framework-benchmark | marko-v6.1.11-keyed | repeated clear memory | completed | memory | MB | 1.4 |  |  | +10.45% |
| js-framework-benchmark | marko-v6.1.11-keyed | total byte weight | completed | size | kB | 4.8 |  |  | +6.67% |
| js-framework-benchmark | **mreact-react-compat-v0.0.173-local-keyed** | create rows | completed | duration | ms | 90.2 | 24.2 | 64.9 | +27.58% |
| js-framework-benchmark | **mreact-react-compat-v0.0.173-local-keyed** | replace all rows | completed | duration | ms | 92.3 | 28 | 63.1 | +20.03% |
| js-framework-benchmark | **mreact-react-compat-v0.0.173-local-keyed** | partial update | completed | duration | ms | 53.7 | 12.3 | 37.3 | +30.02% |
| js-framework-benchmark | **mreact-react-compat-v0.0.173-local-keyed** | select row | completed | duration | ms | 14.2 | 6.3 | 6.5 | +63.22% |
| js-framework-benchmark | **mreact-react-compat-v0.0.173-local-keyed** | swap rows | completed | duration | ms | 60.8 | 11.1 | 45.9 | +22.33% |
| js-framework-benchmark | **mreact-react-compat-v0.0.173-local-keyed** | remove row | completed | duration | ms | 40.3 | 4.4 | 34.2 | +21.75% |
| js-framework-benchmark | **mreact-react-compat-v0.0.173-local-keyed** | create many rows | completed | duration | ms | 961.5 | 216.5 | 736.1 | +21.45% |
| js-framework-benchmark | **mreact-react-compat-v0.0.173-local-keyed** | append rows to large table | completed | duration | ms | 98.9 | 25 | 72.3 | +17.32% |
| js-framework-benchmark | **mreact-react-compat-v0.0.173-local-keyed** | clear rows | completed | duration | ms | 48.1 | 43.5 | 3.5 | +67.01% |
| js-framework-benchmark | **mreact-react-compat-v0.0.173-local-keyed** | ready memory | completed | memory | MB | 1.3 |  |  | +32.3% |
| js-framework-benchmark | **mreact-react-compat-v0.0.173-local-keyed** | run memory | completed | memory | MB | 4.7 |  |  | +63.5% |
| js-framework-benchmark | **mreact-react-compat-v0.0.173-local-keyed** | repeated clear memory | completed | memory | MB | 1.9 |  |  | +52.3% |
| js-framework-benchmark | **mreact-react-compat-v0.0.173-local-keyed** | total byte weight | completed | size | kB | 33.9 |  |  | +653.33% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.173-local-keyed** | create rows | completed | duration | ms | 99.1 | 33.7 | 64 | +40.17% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.173-local-keyed** | replace all rows | completed | duration | ms | 109.1 | 43.9 | 64.8 | +41.87% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.173-local-keyed** | partial update | completed | duration | ms | 62.5 | 20.5 | 37.2 | +51.33% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.173-local-keyed** | select row | completed | duration | ms | 15.1 | 7.2 | 6.3 | +73.56% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.173-local-keyed** | swap rows | completed | duration | ms | 69.2 | 19 | 46 | +39.24% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.173-local-keyed** | remove row | completed | duration | ms | 41.5 | 5.3 | 33.9 | +25.38% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.173-local-keyed** | create many rows | completed | duration | ms | 1023.9 | 293 | 725 | +29.33% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.173-local-keyed** | append rows to large table | completed | duration | ms | 113 | 37.8 | 73.1 | +34.05% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.173-local-keyed** | clear rows | completed | duration | ms | 43 | 38.1 | 3.7 | +49.31% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.173-local-keyed** | ready memory | completed | memory | MB | 1.4 |  |  | +34.71% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.173-local-keyed** | run memory | completed | memory | MB | 4.9 |  |  | +70.32% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.173-local-keyed** | repeated clear memory | completed | memory | MB | 2.5 |  |  | +99.09% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.173-local-keyed** | total byte weight | completed | size | kB | 31.9 |  |  | +608.89% |
| js-framework-benchmark | **mreact-v0.0.173-local-keyed** | create rows | completed | duration | ms | 70.7 | 6.5 | 63.2 | best |
| js-framework-benchmark | **mreact-v0.0.173-local-keyed** | replace all rows | completed | duration | ms | 77.1 | 13.2 | 62.7 | +0.26% |
| js-framework-benchmark | **mreact-v0.0.173-local-keyed** | partial update | completed | duration | ms | 41.9 | 2.1 | 37.1 | +1.45% |
| js-framework-benchmark | **mreact-v0.0.173-local-keyed** | select row | completed | duration | ms | 8.7 | 1 | 6.2 | best |
| js-framework-benchmark | **mreact-v0.0.173-local-keyed** | swap rows | completed | duration | ms | 49.7 | 2 | 44.1 | best |
| js-framework-benchmark | **mreact-v0.0.173-local-keyed** | remove row | completed | duration | ms | 36.6 | 1.6 | 33.1 | +10.57% |
| js-framework-benchmark | **mreact-v0.0.173-local-keyed** | create many rows | completed | duration | ms | 791.7 | 74 | 709.2 | best |
| js-framework-benchmark | **mreact-v0.0.173-local-keyed** | append rows to large table | completed | duration | ms | 84.4 | 9 | 73.7 | +0.12% |
| js-framework-benchmark | **mreact-v0.0.173-local-keyed** | clear rows | completed | duration | ms | 31.5 | 26.8 | 3.7 | +9.38% |
| js-framework-benchmark | **mreact-v0.0.173-local-keyed** | ready memory | completed | memory | MB | 1.1 |  |  | +6.54% |
| js-framework-benchmark | **mreact-v0.0.173-local-keyed** | run memory | completed | memory | MB | 2.9 |  |  | +1.21% |
| js-framework-benchmark | **mreact-v0.0.173-local-keyed** | repeated clear memory | completed | memory | MB | 1.4 |  |  | +9.79% |
| js-framework-benchmark | **mreact-v0.0.173-local-keyed** | total byte weight | completed | size | kB | 8.5 |  |  | +88.89% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | create rows | completed | duration | ms | 93.1 | 23.4 | 68.6 | +31.68% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | replace all rows | completed | duration | ms | 102.7 | 35.3 | 65.5 | +33.55% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | partial update | completed | duration | ms | 49.8 | 9.9 | 36.8 | +20.58% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | select row | completed | duration | ms | 14 | 6 | 6.6 | +60.92% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | swap rows | completed | duration | ms | 336.4 | 49.9 | 281 | +576.86% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | remove row | completed | duration | ms | 38.5 | 2.4 | 33.6 | +16.31% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | create many rows | completed | duration | ms | 1191.7 | 416.8 | 762.1 | +50.52% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | append rows to large table | completed | duration | ms | 98 | 23.2 | 72.6 | +16.25% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | clear rows | completed | duration | ms | 57.8 | 53.2 | 3.2 | +100.69% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | ready memory | completed | memory | MB | 1.6 |  |  | +57.24% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | run memory | completed | memory | MB | 4.9 |  |  | +68.82% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | repeated clear memory | completed | memory | MB | 2.4 |  |  | +95.62% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | total byte weight | completed | size | kB | 51.4 |  |  | +1042.22% |
| js-framework-benchmark | solid-v1.9.13-keyed | create rows | completed | duration | ms | 72 | 7.7 | 63.1 | +1.84% |
| js-framework-benchmark | solid-v1.9.13-keyed | replace all rows | completed | duration | ms | 76.9 | 15 | 60.6 | best |
| js-framework-benchmark | solid-v1.9.13-keyed | partial update | completed | duration | ms | 43.2 | 2.9 | 37 | +4.6% |
| js-framework-benchmark | solid-v1.9.13-keyed | select row | completed | duration | ms | 9.6 | 1.8 | 6.5 | +10.34% |
| js-framework-benchmark | solid-v1.9.13-keyed | swap rows | completed | duration | ms | 51.3 | 2.1 | 45.9 | +3.22% |
| js-framework-benchmark | solid-v1.9.13-keyed | remove row | completed | duration | ms | 39.2 | 0.7 | 36.2 | +18.43% |
| js-framework-benchmark | solid-v1.9.13-keyed | create many rows | completed | duration | ms | 799.3 | 74.8 | 716.9 | +0.96% |
| js-framework-benchmark | solid-v1.9.13-keyed | append rows to large table | completed | duration | ms | 84.3 | 8.4 | 74.3 | best |
| js-framework-benchmark | solid-v1.9.13-keyed | clear rows | completed | duration | ms | 37 | 32.6 | 3.4 | +28.47% |
| js-framework-benchmark | solid-v1.9.13-keyed | ready memory | completed | memory | MB | 1 |  |  | best |
| js-framework-benchmark | solid-v1.9.13-keyed | run memory | completed | memory | MB | 3.1 |  |  | +7.3% |
| js-framework-benchmark | solid-v1.9.13-keyed | repeated clear memory | completed | memory | MB | 1.2 |  |  | best |
| js-framework-benchmark | solid-v1.9.13-keyed | total byte weight | completed | size | kB | 4.5 |  |  | best |
| js-framework-benchmark | svelte-v5.56.3-keyed | create rows | completed | duration | ms | 75.2 | 10.9 | 63.3 | +6.36% |
| js-framework-benchmark | svelte-v5.56.3-keyed | replace all rows | completed | duration | ms | 82 | 18.2 | 62.7 | +6.63% |
| js-framework-benchmark | svelte-v5.56.3-keyed | partial update | completed | duration | ms | 44.8 | 3.8 | 37.1 | +8.47% |
| js-framework-benchmark | svelte-v5.56.3-keyed | select row | completed | duration | ms | 14 | 6.3 | 6.6 | +60.92% |
| js-framework-benchmark | svelte-v5.56.3-keyed | swap rows | completed | duration | ms | 52 | 3.8 | 44.9 | +4.63% |
| js-framework-benchmark | svelte-v5.56.3-keyed | remove row | completed | duration | ms | 37.2 | 1.6 | 33.9 | +12.39% |
| js-framework-benchmark | svelte-v5.56.3-keyed | create many rows | completed | duration | ms | 820.1 | 96.7 | 714 | +3.59% |
| js-framework-benchmark | svelte-v5.56.3-keyed | append rows to large table | completed | duration | ms | 85 | 10.8 | 72.5 | +0.83% |
| js-framework-benchmark | svelte-v5.56.3-keyed | clear rows | completed | duration | ms | 34.3 | 29.7 | 3.5 | +19.1% |
| js-framework-benchmark | svelte-v5.56.3-keyed | ready memory | completed | memory | MB | 1.2 |  |  | +16.82% |
| js-framework-benchmark | svelte-v5.56.3-keyed | run memory | completed | memory | MB | 3.5 |  |  | +21.67% |
| js-framework-benchmark | svelte-v5.56.3-keyed | repeated clear memory | completed | memory | MB | 1.5 |  |  | +23.77% |
| js-framework-benchmark | svelte-v5.56.3-keyed | total byte weight | completed | size | kB | 14.3 |  |  | +217.78% |
| js-framework-benchmark | vue-v3.6.0-beta.16-keyed | create rows | completed | duration | ms | 87.4 | 21.1 | 64.8 | +23.62% |
| js-framework-benchmark | vue-v3.6.0-beta.16-keyed | replace all rows | completed | duration | ms | 92.8 | 26.2 | 65.2 | +20.68% |
| js-framework-benchmark | vue-v3.6.0-beta.16-keyed | partial update | completed | duration | ms | 48.5 | 6.4 | 38.1 | +17.43% |
| js-framework-benchmark | vue-v3.6.0-beta.16-keyed | select row | completed | duration | ms | 10.1 | 2.4 | 6.5 | +16.09% |
| js-framework-benchmark | vue-v3.6.0-beta.16-keyed | swap rows | completed | duration | ms | 53.7 | 2.9 | 46.2 | +8.05% |
| js-framework-benchmark | vue-v3.6.0-beta.16-keyed | remove row | completed | duration | ms | 42.1 | 5.5 | 34.1 | +27.19% |
| js-framework-benchmark | vue-v3.6.0-beta.16-keyed | create many rows | completed | duration | ms | 922.3 | 170.1 | 741.3 | +16.5% |
| js-framework-benchmark | vue-v3.6.0-beta.16-keyed | append rows to large table | completed | duration | ms | 92 | 17.7 | 72.6 | +9.13% |
| js-framework-benchmark | vue-v3.6.0-beta.16-keyed | clear rows | completed | duration | ms | 46 | 40.9 | 3.8 | +59.72% |
| js-framework-benchmark | vue-v3.6.0-beta.16-keyed | ready memory | completed | memory | MB | 1.3 |  |  | +31.08% |
| js-framework-benchmark | vue-v3.6.0-beta.16-keyed | run memory | completed | memory | MB | 4.4 |  |  | +53.78% |
| js-framework-benchmark | vue-v3.6.0-beta.16-keyed | repeated clear memory | completed | memory | MB | 1.7 |  |  | +38.18% |
| js-framework-benchmark | vue-v3.6.0-beta.16-keyed | total byte weight | completed | size | kB | 23.9 |  |  | +431.11% |
