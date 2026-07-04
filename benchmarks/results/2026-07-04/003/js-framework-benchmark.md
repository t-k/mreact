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

Raw JSON files are stored in `benchmarks/results/2026-07-04/003/js-framework-benchmark-results`.
Chrome trace files are stored in `benchmarks/results/2026-07-04/003/js-framework-benchmark-traces`.

## Rankings

Lower values are better for all js-framework-benchmark metrics reported here.

### create rows

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | **mreact-v0.0.185-local-keyed** | create rows | 72.5 | 6.4 | 64.9 | best | ms |
| 2 | solid-v1.9.14-keyed | create rows | 73.1 | 7.9 | 64 | +0.83% | ms |
| 3 | marko-v6.2.2-keyed | create rows | 75 | 7.6 | 66.1 | +3.45% | ms |
| 4 | svelte-v5.56.4-keyed | create rows | 77.4 | 10.9 | 65.7 | +6.76% | ms |
| 5 | vue-v3.6.0-beta.17-keyed | create rows | 89.9 | 22.4 | 66.1 | +24% | ms |
| 6 | **mreact-react-compat-v0.0.185-local-keyed** | create rows | 90.7 | 24.8 | 64.7 | +25.1% | ms |
| 7 | react-hooks-v19.2.7-keyed | create rows | 92 | 23.5 | 67.2 | +26.9% | ms |
| 8 | angular-cf-v22.0.0-keyed | create rows | 104.1 | 21 | 66.1 | +43.59% | ms |
| 9 | **mreact-react-compat-vdom-v0.0.185-local-keyed** | create rows | 105.2 | 36.5 | 65.4 | +45.1% | ms |

### replace all rows

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | solid-v1.9.14-keyed | replace all rows | 79.7 | 15.8 | 62.9 | best | ms |
| 2 | **mreact-v0.0.185-local-keyed** | replace all rows | 81.6 | 14.5 | 65.4 | +2.38% | ms |
| 3 | marko-v6.2.2-keyed | replace all rows | 82.6 | 15.9 | 65.6 | +3.64% | ms |
| 4 | svelte-v5.56.4-keyed | replace all rows | 82.7 | 18.9 | 62.2 | +3.76% | ms |
| 5 | **mreact-react-compat-v0.0.185-local-keyed** | replace all rows | 92.4 | 26.8 | 64.4 | +15.93% | ms |
| 6 | vue-v3.6.0-beta.17-keyed | replace all rows | 97.5 | 28.3 | 67.8 | +22.33% | ms |
| 7 | react-hooks-v19.2.7-keyed | replace all rows | 104.8 | 36.4 | 66.3 | +31.49% | ms |
| 8 | **mreact-react-compat-vdom-v0.0.185-local-keyed** | replace all rows | 108.2 | 41.9 | 66 | +35.76% | ms |
| 9 | angular-cf-v22.0.0-keyed | replace all rows | 119.1 | 33.6 | 69.6 | +49.44% | ms |

### partial update

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | angular-cf-v22.0.0-keyed | partial update | 44.9 | 3.5 | 39.3 | best | ms |
| 2 | solid-v1.9.14-keyed | partial update | 50 | 3.4 | 40.9 | +11.36% | ms |
| 3 | **mreact-v0.0.185-local-keyed** | partial update | 50.1 | 2.2 | 43.6 | +11.58% | ms |
| 4 | svelte-v5.56.4-keyed | partial update | 51.1 | 4.2 | 43.3 | +13.81% | ms |
| 5 | marko-v6.2.2-keyed | partial update | 51.3 | 4.4 | 41.8 | +14.25% | ms |
| 6 | **mreact-react-compat-v0.0.185-local-keyed** | partial update | 54.9 | 9.9 | 40.1 | +22.27% | ms |
| 7 | vue-v3.6.0-beta.17-keyed | partial update | 55.2 | 7 | 44.2 | +22.94% | ms |
| 8 | react-hooks-v19.2.7-keyed | partial update | 57.7 | 11.9 | 42.2 | +28.51% | ms |
| 9 | **mreact-react-compat-vdom-v0.0.185-local-keyed** | partial update | 70.7 | 25.3 | 41.6 | +57.46% | ms |

### select row

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | **mreact-v0.0.185-local-keyed** | select row | 9 | 1 | 6.5 | best | ms |
| 2 | marko-v6.2.2-keyed | select row | 9.9 | 1.4 | 7.2 | +10% | ms |
| 3 | solid-v1.9.14-keyed | select row | 11 | 2.2 | 7.1 | +22.22% | ms |
| 4 | vue-v3.6.0-beta.17-keyed | select row | 11.3 | 2.6 | 7.2 | +25.56% | ms |
| 5 | angular-cf-v22.0.0-keyed | select row | 13.8 | 4.5 | 8.1 | +53.33% | ms |
| 6 | react-hooks-v19.2.7-keyed | select row | 15.1 | 6.6 | 7.1 | +67.78% | ms |
| 7 | svelte-v5.56.4-keyed | select row | 15.4 | 6.9 | 7 | +71.11% | ms |
| 8 | **mreact-react-compat-v0.0.185-local-keyed** | select row | 16.2 | 7.1 | 7.5 | +80% | ms |
| 9 | **mreact-react-compat-vdom-v0.0.185-local-keyed** | select row | 17.5 | 7.9 | 7.6 | +94.44% | ms |

### swap rows

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | marko-v6.2.2-keyed | swap rows | 52.8 | 2.5 | 45.8 | best | ms |
| 2 | **mreact-v0.0.185-local-keyed** | swap rows | 52.8 | 2.1 | 46.5 | 0% | ms |
| 3 | vue-v3.6.0-beta.17-keyed | swap rows | 54 | 3.2 | 46.2 | +2.27% | ms |
| 4 | angular-cf-v22.0.0-keyed | swap rows | 56 | 3.1 | 50.4 | +6.06% | ms |
| 5 | solid-v1.9.14-keyed | swap rows | 56.3 | 2.2 | 48.9 | +6.63% | ms |
| 6 | svelte-v5.56.4-keyed | swap rows | 59 | 4.3 | 49 | +11.74% | ms |
| 7 | **mreact-react-compat-v0.0.185-local-keyed** | swap rows | 66 | 11.3 | 49.5 | +25% | ms |
| 8 | **mreact-react-compat-vdom-v0.0.185-local-keyed** | swap rows | 70.8 | 19.5 | 46.7 | +34.09% | ms |
| 9 | react-hooks-v19.2.7-keyed | swap rows | 360 | 53.2 | 301.8 | +581.82% | ms |

### remove row

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | angular-cf-v22.0.0-keyed | remove row | 36 | 1.8 | 33.4 | best | ms |
| 2 | **mreact-v0.0.185-local-keyed** | remove row | 38.1 | 1 | 34.9 | +5.83% | ms |
| 3 | marko-v6.2.2-keyed | remove row | 38.8 | 1.2 | 35.1 | +7.78% | ms |
| 4 | svelte-v5.56.4-keyed | remove row | 39.4 | 1.7 | 35.3 | +9.44% | ms |
| 5 | solid-v1.9.14-keyed | remove row | 40.4 | 0.9 | 37.3 | +12.22% | ms |
| 6 | react-hooks-v19.2.7-keyed | remove row | 40.6 | 2.9 | 34.9 | +12.78% | ms |
| 7 | **mreact-react-compat-v0.0.185-local-keyed** | remove row | 42 | 3.5 | 36.1 | +16.67% | ms |
| 8 | vue-v3.6.0-beta.17-keyed | remove row | 45.6 | 5.7 | 36.9 | +26.67% | ms |
| 9 | **mreact-react-compat-vdom-v0.0.185-local-keyed** | remove row | 46.1 | 6 | 37.8 | +28.06% | ms |

### create many rows

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | **mreact-v0.0.185-local-keyed** | create many rows | 772.8 | 72.2 | 691 | best | ms |
| 2 | marko-v6.2.2-keyed | create many rows | 779.5 | 81.6 | 687.1 | +0.87% | ms |
| 3 | solid-v1.9.14-keyed | create many rows | 789.8 | 75.6 | 705.1 | +2.2% | ms |
| 4 | svelte-v5.56.4-keyed | create many rows | 807 | 98 | 700.4 | +4.43% | ms |
| 5 | vue-v3.6.0-beta.17-keyed | create many rows | 911.1 | 178.3 | 723.6 | +17.9% | ms |
| 6 | **mreact-react-compat-v0.0.185-local-keyed** | create many rows | 940 | 210.4 | 719.5 | +21.64% | ms |
| 7 | **mreact-react-compat-vdom-v0.0.185-local-keyed** | create many rows | 1014.2 | 303.2 | 707.6 | +31.24% | ms |
| 8 | angular-cf-v22.0.0-keyed | create many rows | 1018.3 | 213.5 | 728.2 | +31.77% | ms |
| 9 | react-hooks-v19.2.7-keyed | create many rows | 1205.8 | 437.2 | 749.7 | +56.03% | ms |

### append rows to large table

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | marko-v6.2.2-keyed | append rows to large table | 82.7 | 8.9 | 71.7 | best | ms |
| 2 | **mreact-v0.0.185-local-keyed** | append rows to large table | 83.9 | 8 | 73.4 | +1.45% | ms |
| 3 | solid-v1.9.14-keyed | append rows to large table | 84.1 | 9.4 | 73.1 | +1.69% | ms |
| 4 | svelte-v5.56.4-keyed | append rows to large table | 86.3 | 10.9 | 73 | +4.35% | ms |
| 5 | vue-v3.6.0-beta.17-keyed | append rows to large table | 95.6 | 18.4 | 74.7 | +15.6% | ms |
| 6 | **mreact-react-compat-v0.0.185-local-keyed** | append rows to large table | 101.1 | 23.9 | 74.6 | +22.25% | ms |
| 7 | react-hooks-v19.2.7-keyed | append rows to large table | 102 | 23.8 | 76 | +23.34% | ms |
| 8 | angular-cf-v22.0.0-keyed | append rows to large table | 109.2 | 18 | 75.4 | +32.04% | ms |
| 9 | **mreact-react-compat-vdom-v0.0.185-local-keyed** | append rows to large table | 114.5 | 36.9 | 75.2 | +38.45% | ms |

### clear rows

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | **mreact-v0.0.185-local-keyed** | clear rows | 31.3 | 26.5 | 3.1 | best | ms |
| 2 | marko-v6.2.2-keyed | clear rows | 32.3 | 27.2 | 3.5 | +3.19% | ms |
| 3 | svelte-v5.56.4-keyed | clear rows | 37 | 31.8 | 3.4 | +18.21% | ms |
| 4 | solid-v1.9.14-keyed | clear rows | 38.2 | 32.8 | 3.4 | +22.04% | ms |
| 5 | **mreact-react-compat-vdom-v0.0.185-local-keyed** | clear rows | 44.3 | 39.4 | 3.2 | +41.53% | ms |
| 6 | vue-v3.6.0-beta.17-keyed | clear rows | 48.2 | 43.9 | 3.1 | +53.99% | ms |
| 7 | **mreact-react-compat-v0.0.185-local-keyed** | clear rows | 51.6 | 46.4 | 3.6 | +64.86% | ms |
| 8 | react-hooks-v19.2.7-keyed | clear rows | 60.8 | 56.4 | 3.5 | +94.25% | ms |
| 9 | angular-cf-v22.0.0-keyed | clear rows | 66.4 | 61.4 | 3.6 | +112.14% | ms |

### ready memory

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | solid-v1.9.14-keyed | ready memory | 1 |  |  | best | MB |
| 2 | marko-v6.2.2-keyed | ready memory | 1.1 |  |  | +6.89% | MB |
| 3 | **mreact-v0.0.185-local-keyed** | ready memory | 1.1 |  |  | +7.04% | MB |
| 4 | svelte-v5.56.4-keyed | ready memory | 1.2 |  |  | +15.93% | MB |
| 5 | **mreact-react-compat-vdom-v0.0.185-local-keyed** | ready memory | 1.3 |  |  | +27.56% | MB |
| 6 | vue-v3.6.0-beta.17-keyed | ready memory | 1.3 |  |  | +28.91% | MB |
| 7 | **mreact-react-compat-v0.0.185-local-keyed** | ready memory | 1.4 |  |  | +30.98% | MB |
| 8 | react-hooks-v19.2.7-keyed | ready memory | 1.6 |  |  | +55.82% | MB |
| 9 | angular-cf-v22.0.0-keyed | ready memory | 2 |  |  | +95.12% | MB |

### run memory

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | marko-v6.2.2-keyed | run memory | 2.9 |  |  | best | MB |
| 2 | **mreact-v0.0.185-local-keyed** | run memory | 2.9 |  |  | +0.49% | MB |
| 3 | solid-v1.9.14-keyed | run memory | 3.1 |  |  | +8.4% | MB |
| 4 | svelte-v5.56.4-keyed | run memory | 3.5 |  |  | +21.67% | MB |
| 5 | vue-v3.6.0-beta.17-keyed | run memory | 4.4 |  |  | +53.83% | MB |
| 6 | **mreact-react-compat-vdom-v0.0.185-local-keyed** | run memory | 4.9 |  |  | +69.52% | MB |
| 7 | react-hooks-v19.2.7-keyed | run memory | 4.9 |  |  | +69.94% | MB |
| 8 | angular-cf-v22.0.0-keyed | run memory | 5 |  |  | +73.34% | MB |
| 9 | **mreact-react-compat-v0.0.185-local-keyed** | run memory | 5 |  |  | +74.61% | MB |

### repeated clear memory

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | solid-v1.9.14-keyed | repeated clear memory | 1.2 |  |  | best | MB |
| 2 | **mreact-v0.0.185-local-keyed** | repeated clear memory | 1.3 |  |  | +3.89% | MB |
| 3 | marko-v6.2.2-keyed | repeated clear memory | 1.4 |  |  | +12.73% | MB |
| 4 | svelte-v5.56.4-keyed | repeated clear memory | 1.5 |  |  | +24.6% | MB |
| 5 | vue-v3.6.0-beta.17-keyed | repeated clear memory | 1.7 |  |  | +38.47% | MB |
| 6 | **mreact-react-compat-v0.0.185-local-keyed** | repeated clear memory | 1.9 |  |  | +54.69% | MB |
| 7 | **mreact-react-compat-vdom-v0.0.185-local-keyed** | repeated clear memory | 2.4 |  |  | +93.19% | MB |
| 8 | react-hooks-v19.2.7-keyed | repeated clear memory | 2.5 |  |  | +97.8% | MB |
| 9 | angular-cf-v22.0.0-keyed | repeated clear memory | 2.7 |  |  | +115.31% | MB |

### total byte weight

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | solid-v1.9.14-keyed | total byte weight | 4.5 |  |  | best | kB |
| 2 | marko-v6.2.2-keyed | total byte weight | 5 |  |  | +11.11% | kB |
| 3 | **mreact-v0.0.185-local-keyed** | total byte weight | 10 |  |  | +122.22% | kB |
| 4 | svelte-v5.56.4-keyed | total byte weight | 14.3 |  |  | +217.78% | kB |
| 5 | vue-v3.6.0-beta.17-keyed | total byte weight | 23.9 |  |  | +431.11% | kB |
| 6 | **mreact-react-compat-vdom-v0.0.185-local-keyed** | total byte weight | 28.8 |  |  | +540% | kB |
| 7 | **mreact-react-compat-v0.0.185-local-keyed** | total byte weight | 30.7 |  |  | +582.22% | kB |
| 8 | angular-cf-v22.0.0-keyed | total byte weight | 44.5 |  |  | +888.89% | kB |
| 9 | react-hooks-v19.2.7-keyed | total byte weight | 51.4 |  |  | +1042.22% | kB |

## Results

| suite | framework | case | status | metric | unit | value | script | paint | diff vs 1st |
| --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | create rows | completed | duration | ms | 104.1 | 21 | 66.1 | +43.59% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | replace all rows | completed | duration | ms | 119.1 | 33.6 | 69.6 | +49.44% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | partial update | completed | duration | ms | 44.9 | 3.5 | 39.3 | best |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | select row | completed | duration | ms | 13.8 | 4.5 | 8.1 | +53.33% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | swap rows | completed | duration | ms | 56 | 3.1 | 50.4 | +6.06% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | remove row | completed | duration | ms | 36 | 1.8 | 33.4 | best |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | create many rows | completed | duration | ms | 1018.3 | 213.5 | 728.2 | +31.77% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | append rows to large table | completed | duration | ms | 109.2 | 18 | 75.4 | +32.04% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | clear rows | completed | duration | ms | 66.4 | 61.4 | 3.6 | +112.14% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | ready memory | completed | memory | MB | 2 |  |  | +95.12% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | run memory | completed | memory | MB | 5 |  |  | +73.34% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | repeated clear memory | completed | memory | MB | 2.7 |  |  | +115.31% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | total byte weight | completed | size | kB | 44.5 |  |  | +888.89% |
| js-framework-benchmark | marko-v6.2.2-keyed | create rows | completed | duration | ms | 75 | 7.6 | 66.1 | +3.45% |
| js-framework-benchmark | marko-v6.2.2-keyed | replace all rows | completed | duration | ms | 82.6 | 15.9 | 65.6 | +3.64% |
| js-framework-benchmark | marko-v6.2.2-keyed | partial update | completed | duration | ms | 51.3 | 4.4 | 41.8 | +14.25% |
| js-framework-benchmark | marko-v6.2.2-keyed | select row | completed | duration | ms | 9.9 | 1.4 | 7.2 | +10% |
| js-framework-benchmark | marko-v6.2.2-keyed | swap rows | completed | duration | ms | 52.8 | 2.5 | 45.8 | best |
| js-framework-benchmark | marko-v6.2.2-keyed | remove row | completed | duration | ms | 38.8 | 1.2 | 35.1 | +7.78% |
| js-framework-benchmark | marko-v6.2.2-keyed | create many rows | completed | duration | ms | 779.5 | 81.6 | 687.1 | +0.87% |
| js-framework-benchmark | marko-v6.2.2-keyed | append rows to large table | completed | duration | ms | 82.7 | 8.9 | 71.7 | best |
| js-framework-benchmark | marko-v6.2.2-keyed | clear rows | completed | duration | ms | 32.3 | 27.2 | 3.5 | +3.19% |
| js-framework-benchmark | marko-v6.2.2-keyed | ready memory | completed | memory | MB | 1.1 |  |  | +6.89% |
| js-framework-benchmark | marko-v6.2.2-keyed | run memory | completed | memory | MB | 2.9 |  |  | best |
| js-framework-benchmark | marko-v6.2.2-keyed | repeated clear memory | completed | memory | MB | 1.4 |  |  | +12.73% |
| js-framework-benchmark | marko-v6.2.2-keyed | total byte weight | completed | size | kB | 5 |  |  | +11.11% |
| js-framework-benchmark | **mreact-react-compat-v0.0.185-local-keyed** | create rows | completed | duration | ms | 90.7 | 24.8 | 64.7 | +25.1% |
| js-framework-benchmark | **mreact-react-compat-v0.0.185-local-keyed** | replace all rows | completed | duration | ms | 92.4 | 26.8 | 64.4 | +15.93% |
| js-framework-benchmark | **mreact-react-compat-v0.0.185-local-keyed** | partial update | completed | duration | ms | 54.9 | 9.9 | 40.1 | +22.27% |
| js-framework-benchmark | **mreact-react-compat-v0.0.185-local-keyed** | select row | completed | duration | ms | 16.2 | 7.1 | 7.5 | +80% |
| js-framework-benchmark | **mreact-react-compat-v0.0.185-local-keyed** | swap rows | completed | duration | ms | 66 | 11.3 | 49.5 | +25% |
| js-framework-benchmark | **mreact-react-compat-v0.0.185-local-keyed** | remove row | completed | duration | ms | 42 | 3.5 | 36.1 | +16.67% |
| js-framework-benchmark | **mreact-react-compat-v0.0.185-local-keyed** | create many rows | completed | duration | ms | 940 | 210.4 | 719.5 | +21.64% |
| js-framework-benchmark | **mreact-react-compat-v0.0.185-local-keyed** | append rows to large table | completed | duration | ms | 101.1 | 23.9 | 74.6 | +22.25% |
| js-framework-benchmark | **mreact-react-compat-v0.0.185-local-keyed** | clear rows | completed | duration | ms | 51.6 | 46.4 | 3.6 | +64.86% |
| js-framework-benchmark | **mreact-react-compat-v0.0.185-local-keyed** | ready memory | completed | memory | MB | 1.4 |  |  | +30.98% |
| js-framework-benchmark | **mreact-react-compat-v0.0.185-local-keyed** | run memory | completed | memory | MB | 5 |  |  | +74.61% |
| js-framework-benchmark | **mreact-react-compat-v0.0.185-local-keyed** | repeated clear memory | completed | memory | MB | 1.9 |  |  | +54.69% |
| js-framework-benchmark | **mreact-react-compat-v0.0.185-local-keyed** | total byte weight | completed | size | kB | 30.7 |  |  | +582.22% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.185-local-keyed** | create rows | completed | duration | ms | 105.2 | 36.5 | 65.4 | +45.1% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.185-local-keyed** | replace all rows | completed | duration | ms | 108.2 | 41.9 | 66 | +35.76% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.185-local-keyed** | partial update | completed | duration | ms | 70.7 | 25.3 | 41.6 | +57.46% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.185-local-keyed** | select row | completed | duration | ms | 17.5 | 7.9 | 7.6 | +94.44% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.185-local-keyed** | swap rows | completed | duration | ms | 70.8 | 19.5 | 46.7 | +34.09% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.185-local-keyed** | remove row | completed | duration | ms | 46.1 | 6 | 37.8 | +28.06% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.185-local-keyed** | create many rows | completed | duration | ms | 1014.2 | 303.2 | 707.6 | +31.24% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.185-local-keyed** | append rows to large table | completed | duration | ms | 114.5 | 36.9 | 75.2 | +38.45% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.185-local-keyed** | clear rows | completed | duration | ms | 44.3 | 39.4 | 3.2 | +41.53% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.185-local-keyed** | ready memory | completed | memory | MB | 1.3 |  |  | +27.56% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.185-local-keyed** | run memory | completed | memory | MB | 4.9 |  |  | +69.52% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.185-local-keyed** | repeated clear memory | completed | memory | MB | 2.4 |  |  | +93.19% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.185-local-keyed** | total byte weight | completed | size | kB | 28.8 |  |  | +540% |
| js-framework-benchmark | **mreact-v0.0.185-local-keyed** | create rows | completed | duration | ms | 72.5 | 6.4 | 64.9 | best |
| js-framework-benchmark | **mreact-v0.0.185-local-keyed** | replace all rows | completed | duration | ms | 81.6 | 14.5 | 65.4 | +2.38% |
| js-framework-benchmark | **mreact-v0.0.185-local-keyed** | partial update | completed | duration | ms | 50.1 | 2.2 | 43.6 | +11.58% |
| js-framework-benchmark | **mreact-v0.0.185-local-keyed** | select row | completed | duration | ms | 9 | 1 | 6.5 | best |
| js-framework-benchmark | **mreact-v0.0.185-local-keyed** | swap rows | completed | duration | ms | 52.8 | 2.1 | 46.5 | 0% |
| js-framework-benchmark | **mreact-v0.0.185-local-keyed** | remove row | completed | duration | ms | 38.1 | 1 | 34.9 | +5.83% |
| js-framework-benchmark | **mreact-v0.0.185-local-keyed** | create many rows | completed | duration | ms | 772.8 | 72.2 | 691 | best |
| js-framework-benchmark | **mreact-v0.0.185-local-keyed** | append rows to large table | completed | duration | ms | 83.9 | 8 | 73.4 | +1.45% |
| js-framework-benchmark | **mreact-v0.0.185-local-keyed** | clear rows | completed | duration | ms | 31.3 | 26.5 | 3.1 | best |
| js-framework-benchmark | **mreact-v0.0.185-local-keyed** | ready memory | completed | memory | MB | 1.1 |  |  | +7.04% |
| js-framework-benchmark | **mreact-v0.0.185-local-keyed** | run memory | completed | memory | MB | 2.9 |  |  | +0.49% |
| js-framework-benchmark | **mreact-v0.0.185-local-keyed** | repeated clear memory | completed | memory | MB | 1.3 |  |  | +3.89% |
| js-framework-benchmark | **mreact-v0.0.185-local-keyed** | total byte weight | completed | size | kB | 10 |  |  | +122.22% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | create rows | completed | duration | ms | 92 | 23.5 | 67.2 | +26.9% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | replace all rows | completed | duration | ms | 104.8 | 36.4 | 66.3 | +31.49% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | partial update | completed | duration | ms | 57.7 | 11.9 | 42.2 | +28.51% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | select row | completed | duration | ms | 15.1 | 6.6 | 7.1 | +67.78% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | swap rows | completed | duration | ms | 360 | 53.2 | 301.8 | +581.82% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | remove row | completed | duration | ms | 40.6 | 2.9 | 34.9 | +12.78% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | create many rows | completed | duration | ms | 1205.8 | 437.2 | 749.7 | +56.03% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | append rows to large table | completed | duration | ms | 102 | 23.8 | 76 | +23.34% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | clear rows | completed | duration | ms | 60.8 | 56.4 | 3.5 | +94.25% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | ready memory | completed | memory | MB | 1.6 |  |  | +55.82% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | run memory | completed | memory | MB | 4.9 |  |  | +69.94% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | repeated clear memory | completed | memory | MB | 2.5 |  |  | +97.8% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | total byte weight | completed | size | kB | 51.4 |  |  | +1042.22% |
| js-framework-benchmark | solid-v1.9.14-keyed | create rows | completed | duration | ms | 73.1 | 7.9 | 64 | +0.83% |
| js-framework-benchmark | solid-v1.9.14-keyed | replace all rows | completed | duration | ms | 79.7 | 15.8 | 62.9 | best |
| js-framework-benchmark | solid-v1.9.14-keyed | partial update | completed | duration | ms | 50 | 3.4 | 40.9 | +11.36% |
| js-framework-benchmark | solid-v1.9.14-keyed | select row | completed | duration | ms | 11 | 2.2 | 7.1 | +22.22% |
| js-framework-benchmark | solid-v1.9.14-keyed | swap rows | completed | duration | ms | 56.3 | 2.2 | 48.9 | +6.63% |
| js-framework-benchmark | solid-v1.9.14-keyed | remove row | completed | duration | ms | 40.4 | 0.9 | 37.3 | +12.22% |
| js-framework-benchmark | solid-v1.9.14-keyed | create many rows | completed | duration | ms | 789.8 | 75.6 | 705.1 | +2.2% |
| js-framework-benchmark | solid-v1.9.14-keyed | append rows to large table | completed | duration | ms | 84.1 | 9.4 | 73.1 | +1.69% |
| js-framework-benchmark | solid-v1.9.14-keyed | clear rows | completed | duration | ms | 38.2 | 32.8 | 3.4 | +22.04% |
| js-framework-benchmark | solid-v1.9.14-keyed | ready memory | completed | memory | MB | 1 |  |  | best |
| js-framework-benchmark | solid-v1.9.14-keyed | run memory | completed | memory | MB | 3.1 |  |  | +8.4% |
| js-framework-benchmark | solid-v1.9.14-keyed | repeated clear memory | completed | memory | MB | 1.2 |  |  | best |
| js-framework-benchmark | solid-v1.9.14-keyed | total byte weight | completed | size | kB | 4.5 |  |  | best |
| js-framework-benchmark | svelte-v5.56.4-keyed | create rows | completed | duration | ms | 77.4 | 10.9 | 65.7 | +6.76% |
| js-framework-benchmark | svelte-v5.56.4-keyed | replace all rows | completed | duration | ms | 82.7 | 18.9 | 62.2 | +3.76% |
| js-framework-benchmark | svelte-v5.56.4-keyed | partial update | completed | duration | ms | 51.1 | 4.2 | 43.3 | +13.81% |
| js-framework-benchmark | svelte-v5.56.4-keyed | select row | completed | duration | ms | 15.4 | 6.9 | 7 | +71.11% |
| js-framework-benchmark | svelte-v5.56.4-keyed | swap rows | completed | duration | ms | 59 | 4.3 | 49 | +11.74% |
| js-framework-benchmark | svelte-v5.56.4-keyed | remove row | completed | duration | ms | 39.4 | 1.7 | 35.3 | +9.44% |
| js-framework-benchmark | svelte-v5.56.4-keyed | create many rows | completed | duration | ms | 807 | 98 | 700.4 | +4.43% |
| js-framework-benchmark | svelte-v5.56.4-keyed | append rows to large table | completed | duration | ms | 86.3 | 10.9 | 73 | +4.35% |
| js-framework-benchmark | svelte-v5.56.4-keyed | clear rows | completed | duration | ms | 37 | 31.8 | 3.4 | +18.21% |
| js-framework-benchmark | svelte-v5.56.4-keyed | ready memory | completed | memory | MB | 1.2 |  |  | +15.93% |
| js-framework-benchmark | svelte-v5.56.4-keyed | run memory | completed | memory | MB | 3.5 |  |  | +21.67% |
| js-framework-benchmark | svelte-v5.56.4-keyed | repeated clear memory | completed | memory | MB | 1.5 |  |  | +24.6% |
| js-framework-benchmark | svelte-v5.56.4-keyed | total byte weight | completed | size | kB | 14.3 |  |  | +217.78% |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | create rows | completed | duration | ms | 89.9 | 22.4 | 66.1 | +24% |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | replace all rows | completed | duration | ms | 97.5 | 28.3 | 67.8 | +22.33% |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | partial update | completed | duration | ms | 55.2 | 7 | 44.2 | +22.94% |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | select row | completed | duration | ms | 11.3 | 2.6 | 7.2 | +25.56% |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | swap rows | completed | duration | ms | 54 | 3.2 | 46.2 | +2.27% |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | remove row | completed | duration | ms | 45.6 | 5.7 | 36.9 | +26.67% |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | create many rows | completed | duration | ms | 911.1 | 178.3 | 723.6 | +17.9% |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | append rows to large table | completed | duration | ms | 95.6 | 18.4 | 74.7 | +15.6% |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | clear rows | completed | duration | ms | 48.2 | 43.9 | 3.1 | +53.99% |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | ready memory | completed | memory | MB | 1.3 |  |  | +28.91% |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | run memory | completed | memory | MB | 4.4 |  |  | +53.83% |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | repeated clear memory | completed | memory | MB | 1.7 |  |  | +38.47% |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | total byte weight | completed | size | kB | 23.9 |  |  | +431.11% |
