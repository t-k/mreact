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

Raw JSON files are stored in `benchmarks/results/2026-07-04/002/js-framework-benchmark-results`.
Chrome trace files are stored in `benchmarks/results/2026-07-04/002/js-framework-benchmark-traces`.

## Rankings

Lower values are better for all js-framework-benchmark metrics reported here.

### create rows

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | **mreact-v0.0.185-local-keyed** | create rows | 74.8 | 6.6 | 66.9 | best | ms |
| 2 | marko-v6.2.2-keyed | create rows | 75.2 | 7.8 | 66 | +0.53% | ms |
| 3 | solid-v1.9.14-keyed | create rows | 77.2 | 8 | 68 | +3.21% | ms |
| 4 | svelte-v5.56.4-keyed | create rows | 82.1 | 11.1 | 69.5 | +9.76% | ms |
| 5 | **mreact-react-compat-v0.0.185-local-keyed** | create rows | 91.5 | 23.2 | 67.2 | +22.33% | ms |
| 6 | vue-v3.6.0-beta.17-keyed | create rows | 94.5 | 22.2 | 70.9 | +26.34% | ms |
| 7 | react-hooks-v19.2.7-keyed | create rows | 95.2 | 23.8 | 69.9 | +27.27% | ms |
| 8 | **mreact-react-compat-vdom-v0.0.185-local-keyed** | create rows | 104.2 | 34.9 | 67.8 | +39.3% | ms |
| 9 | angular-cf-v22.0.0-keyed | create rows | 106.7 | 20.2 | 68.5 | +42.65% | ms |

### replace all rows

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | solid-v1.9.14-keyed | replace all rows | 81.2 | 15.5 | 64.3 | best | ms |
| 2 | marko-v6.2.2-keyed | replace all rows | 82.6 | 15.6 | 66.1 | +1.72% | ms |
| 3 | **mreact-v0.0.185-local-keyed** | replace all rows | 83.4 | 14.4 | 67.1 | +2.71% | ms |
| 4 | svelte-v5.56.4-keyed | replace all rows | 84.8 | 18.6 | 64.7 | +4.43% | ms |
| 5 | **mreact-react-compat-v0.0.185-local-keyed** | replace all rows | 93.5 | 26.1 | 66.1 | +15.15% | ms |
| 6 | vue-v3.6.0-beta.17-keyed | replace all rows | 97.4 | 27.2 | 67.8 | +19.95% | ms |
| 7 | react-hooks-v19.2.7-keyed | replace all rows | 105.7 | 36.2 | 67.9 | +30.17% | ms |
| 8 | **mreact-react-compat-vdom-v0.0.185-local-keyed** | replace all rows | 110 | 42.5 | 65.9 | +35.47% | ms |
| 9 | angular-cf-v22.0.0-keyed | replace all rows | 122.9 | 33.8 | 72.8 | +51.35% | ms |

### partial update

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | angular-cf-v22.0.0-keyed | partial update | 40.8 | 3.3 | 36.4 | best | ms |
| 2 | solid-v1.9.14-keyed | partial update | 42.6 | 3.1 | 36.3 | +4.41% | ms |
| 3 | **mreact-v0.0.185-local-keyed** | partial update | 43.2 | 2.2 | 38.6 | +5.88% | ms |
| 4 | marko-v6.2.2-keyed | partial update | 45.9 | 4.2 | 38 | +12.5% | ms |
| 5 | svelte-v5.56.4-keyed | partial update | 48 | 4 | 40.8 | +17.65% | ms |
| 6 | react-hooks-v19.2.7-keyed | partial update | 51.5 | 9.9 | 38.1 | +26.23% | ms |
| 7 | vue-v3.6.0-beta.17-keyed | partial update | 54.5 | 6.8 | 43.5 | +33.58% | ms |
| 8 | **mreact-react-compat-v0.0.185-local-keyed** | partial update | 63 | 10.4 | 47.6 | +54.41% | ms |
| 9 | **mreact-react-compat-vdom-v0.0.185-local-keyed** | partial update | 63.6 | 23.1 | 38.7 | +55.88% | ms |

### select row

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | **mreact-v0.0.185-local-keyed** | select row | 8.8 | 0.9 | 6.6 | best | ms |
| 2 | marko-v6.2.2-keyed | select row | 8.9 | 1.3 | 6.5 | +1.14% | ms |
| 3 | solid-v1.9.14-keyed | select row | 9.5 | 1.9 | 6.5 | +7.95% | ms |
| 4 | vue-v3.6.0-beta.17-keyed | select row | 10.2 | 2.5 | 6.4 | +15.91% | ms |
| 5 | **mreact-react-compat-v0.0.185-local-keyed** | select row | 13.7 | 6.4 | 6.3 | +55.68% | ms |
| 6 | react-hooks-v19.2.7-keyed | select row | 13.9 | 5.8 | 6.8 | +57.95% | ms |
| 7 | svelte-v5.56.4-keyed | select row | 14.3 | 6.6 | 6.2 | +62.5% | ms |
| 8 | angular-cf-v22.0.0-keyed | select row | 14.6 | 4.4 | 8.3 | +65.91% | ms |
| 9 | **mreact-react-compat-vdom-v0.0.185-local-keyed** | select row | 14.8 | 6.8 | 6.7 | +68.18% | ms |

### swap rows

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | angular-cf-v22.0.0-keyed | swap rows | 48.5 | 2.8 | 44.9 | best | ms |
| 2 | **mreact-v0.0.185-local-keyed** | swap rows | 49.4 | 1.9 | 44.1 | +1.86% | ms |
| 3 | marko-v6.2.2-keyed | swap rows | 49.5 | 2.4 | 43.4 | +2.06% | ms |
| 4 | solid-v1.9.14-keyed | swap rows | 51 | 2.2 | 45.1 | +5.15% | ms |
| 5 | vue-v3.6.0-beta.17-keyed | swap rows | 51.6 | 2.8 | 45.2 | +6.39% | ms |
| 6 | svelte-v5.56.4-keyed | swap rows | 52.4 | 4 | 44.8 | +8.04% | ms |
| 7 | **mreact-react-compat-v0.0.185-local-keyed** | swap rows | 59.4 | 10 | 45.2 | +22.47% | ms |
| 8 | **mreact-react-compat-vdom-v0.0.185-local-keyed** | swap rows | 68.8 | 18.4 | 46.6 | +41.86% | ms |
| 9 | react-hooks-v19.2.7-keyed | swap rows | 333.4 | 52 | 277.5 | +587.42% | ms |

### remove row

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | angular-cf-v22.0.0-keyed | remove row | 32.7 | 1.6 | 30.2 | best | ms |
| 2 | marko-v6.2.2-keyed | remove row | 34.4 | 1.1 | 31.2 | +5.2% | ms |
| 3 | **mreact-v0.0.185-local-keyed** | remove row | 34.7 | 1 | 31.9 | +6.12% | ms |
| 4 | solid-v1.9.14-keyed | remove row | 36.5 | 0.7 | 34.2 | +11.62% | ms |
| 5 | svelte-v5.56.4-keyed | remove row | 37.1 | 1.6 | 33.7 | +13.46% | ms |
| 6 | react-hooks-v19.2.7-keyed | remove row | 37.7 | 2.7 | 32.5 | +15.29% | ms |
| 7 | **mreact-react-compat-v0.0.185-local-keyed** | remove row | 38.8 | 3.2 | 33.5 | +18.65% | ms |
| 8 | **mreact-react-compat-vdom-v0.0.185-local-keyed** | remove row | 40.8 | 5 | 33.5 | +24.77% | ms |
| 9 | vue-v3.6.0-beta.17-keyed | remove row | 41.1 | 5.3 | 33.5 | +25.69% | ms |

### create many rows

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | marko-v6.2.2-keyed | create many rows | 792.1 | 81.7 | 701.1 | best | ms |
| 2 | **mreact-v0.0.185-local-keyed** | create many rows | 792.1 | 71.1 | 710.7 | 0% | ms |
| 3 | solid-v1.9.14-keyed | create many rows | 793.6 | 74.2 | 710.4 | +0.19% | ms |
| 4 | svelte-v5.56.4-keyed | create many rows | 817.3 | 96 | 711.2 | +3.18% | ms |
| 5 | vue-v3.6.0-beta.17-keyed | create many rows | 926 | 170.9 | 746.7 | +16.9% | ms |
| 6 | **mreact-react-compat-v0.0.185-local-keyed** | create many rows | 943.4 | 192.1 | 738.4 | +19.1% | ms |
| 7 | **mreact-react-compat-vdom-v0.0.185-local-keyed** | create many rows | 1025.9 | 287.1 | 733.5 | +29.52% | ms |
| 8 | angular-cf-v22.0.0-keyed | create many rows | 1033 | 200 | 748.8 | +30.41% | ms |
| 9 | react-hooks-v19.2.7-keyed | create many rows | 1237.7 | 452.4 | 765.6 | +56.26% | ms |

### append rows to large table

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | **mreact-v0.0.185-local-keyed** | append rows to large table | 81.8 | 8 | 72.5 | best | ms |
| 2 | marko-v6.2.2-keyed | append rows to large table | 83.9 | 9.4 | 73 | +2.57% | ms |
| 3 | solid-v1.9.14-keyed | append rows to large table | 84.4 | 8.5 | 74.3 | +3.18% | ms |
| 4 | svelte-v5.56.4-keyed | append rows to large table | 88.8 | 12.3 | 74.7 | +8.56% | ms |
| 5 | **mreact-react-compat-v0.0.185-local-keyed** | append rows to large table | 95.4 | 20.5 | 72.4 | +16.63% | ms |
| 6 | react-hooks-v19.2.7-keyed | append rows to large table | 97 | 22.9 | 72.4 | +18.58% | ms |
| 7 | vue-v3.6.0-beta.17-keyed | append rows to large table | 97.6 | 17.9 | 78 | +19.32% | ms |
| 8 | angular-cf-v22.0.0-keyed | append rows to large table | 104.5 | 16.7 | 72.7 | +27.75% | ms |
| 9 | **mreact-react-compat-vdom-v0.0.185-local-keyed** | append rows to large table | 109.1 | 34.8 | 72.1 | +33.37% | ms |

### clear rows

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | marko-v6.2.2-keyed | clear rows | 29.2 | 25.1 | 3.1 | best | ms |
| 2 | **mreact-v0.0.185-local-keyed** | clear rows | 30.7 | 26 | 3.2 | +5.14% | ms |
| 3 | svelte-v5.56.4-keyed | clear rows | 36.1 | 31.1 | 3.4 | +23.63% | ms |
| 4 | solid-v1.9.14-keyed | clear rows | 40.9 | 35.6 | 3.6 | +40.07% | ms |
| 5 | **mreact-react-compat-vdom-v0.0.185-local-keyed** | clear rows | 42.4 | 37.8 | 3.4 | +45.21% | ms |
| 6 | vue-v3.6.0-beta.17-keyed | clear rows | 49.2 | 44.3 | 3.7 | +68.49% | ms |
| 7 | **mreact-react-compat-v0.0.185-local-keyed** | clear rows | 55.3 | 49.9 | 3.9 | +89.38% | ms |
| 8 | react-hooks-v19.2.7-keyed | clear rows | 62.9 | 57.5 | 3.9 | +115.41% | ms |
| 9 | angular-cf-v22.0.0-keyed | clear rows | 66.1 | 61.2 | 4.1 | +126.37% | ms |

### ready memory

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | solid-v1.9.14-keyed | ready memory | 1 |  |  | best | MB |
| 2 | marko-v6.2.2-keyed | ready memory | 1.1 |  |  | +4.67% | MB |
| 3 | **mreact-v0.0.185-local-keyed** | ready memory | 1.1 |  |  | +5.56% | MB |
| 4 | svelte-v5.56.4-keyed | ready memory | 1.2 |  |  | +14.29% | MB |
| 5 | **mreact-react-compat-vdom-v0.0.185-local-keyed** | ready memory | 1.3 |  |  | +27.01% | MB |
| 6 | vue-v3.6.0-beta.17-keyed | ready memory | 1.3 |  |  | +28.35% | MB |
| 7 | **mreact-react-compat-v0.0.185-local-keyed** | ready memory | 1.4 |  |  | +31.42% | MB |
| 8 | react-hooks-v19.2.7-keyed | ready memory | 1.6 |  |  | +55.13% | MB |
| 9 | angular-cf-v22.0.0-keyed | ready memory | 2.1 |  |  | +98.43% | MB |

### run memory

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | marko-v6.2.2-keyed | run memory | 2.9 |  |  | best | MB |
| 2 | **mreact-v0.0.185-local-keyed** | run memory | 2.9 |  |  | +0.72% | MB |
| 3 | solid-v1.9.14-keyed | run memory | 3.1 |  |  | +9.42% | MB |
| 4 | svelte-v5.56.4-keyed | run memory | 3.5 |  |  | +23.45% | MB |
| 5 | vue-v3.6.0-beta.17-keyed | run memory | 4.4 |  |  | +54.79% | MB |
| 6 | **mreact-react-compat-vdom-v0.0.185-local-keyed** | run memory | 4.9 |  |  | +71.19% | MB |
| 7 | react-hooks-v19.2.7-keyed | run memory | 4.9 |  |  | +72.8% | MB |
| 8 | angular-cf-v22.0.0-keyed | run memory | 5 |  |  | +74.84% | MB |
| 9 | **mreact-react-compat-v0.0.185-local-keyed** | run memory | 5 |  |  | +76.12% | MB |

### repeated clear memory

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | solid-v1.9.14-keyed | repeated clear memory | 1.2 |  |  | best | MB |
| 2 | **mreact-v0.0.185-local-keyed** | repeated clear memory | 1.3 |  |  | +11.16% | MB |
| 3 | marko-v6.2.2-keyed | repeated clear memory | 1.4 |  |  | +14.12% | MB |
| 4 | svelte-v5.56.4-keyed | repeated clear memory | 1.5 |  |  | +25.84% | MB |
| 5 | vue-v3.6.0-beta.17-keyed | repeated clear memory | 1.7 |  |  | +41.43% | MB |
| 6 | **mreact-react-compat-v0.0.185-local-keyed** | repeated clear memory | 1.8 |  |  | +52.26% | MB |
| 7 | **mreact-react-compat-vdom-v0.0.185-local-keyed** | repeated clear memory | 2.4 |  |  | +100.55% | MB |
| 8 | react-hooks-v19.2.7-keyed | repeated clear memory | 2.5 |  |  | +105.37% | MB |
| 9 | angular-cf-v22.0.0-keyed | repeated clear memory | 2.6 |  |  | +116.81% | MB |

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
| js-framework-benchmark | angular-cf-v22.0.0-keyed | create rows | completed | duration | ms | 106.7 | 20.2 | 68.5 | +42.65% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | replace all rows | completed | duration | ms | 122.9 | 33.8 | 72.8 | +51.35% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | partial update | completed | duration | ms | 40.8 | 3.3 | 36.4 | best |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | select row | completed | duration | ms | 14.6 | 4.4 | 8.3 | +65.91% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | swap rows | completed | duration | ms | 48.5 | 2.8 | 44.9 | best |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | remove row | completed | duration | ms | 32.7 | 1.6 | 30.2 | best |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | create many rows | completed | duration | ms | 1033 | 200 | 748.8 | +30.41% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | append rows to large table | completed | duration | ms | 104.5 | 16.7 | 72.7 | +27.75% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | clear rows | completed | duration | ms | 66.1 | 61.2 | 4.1 | +126.37% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | ready memory | completed | memory | MB | 2.1 |  |  | +98.43% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | run memory | completed | memory | MB | 5 |  |  | +74.84% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | repeated clear memory | completed | memory | MB | 2.6 |  |  | +116.81% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | total byte weight | completed | size | kB | 44.5 |  |  | +888.89% |
| js-framework-benchmark | marko-v6.2.2-keyed | create rows | completed | duration | ms | 75.2 | 7.8 | 66 | +0.53% |
| js-framework-benchmark | marko-v6.2.2-keyed | replace all rows | completed | duration | ms | 82.6 | 15.6 | 66.1 | +1.72% |
| js-framework-benchmark | marko-v6.2.2-keyed | partial update | completed | duration | ms | 45.9 | 4.2 | 38 | +12.5% |
| js-framework-benchmark | marko-v6.2.2-keyed | select row | completed | duration | ms | 8.9 | 1.3 | 6.5 | +1.14% |
| js-framework-benchmark | marko-v6.2.2-keyed | swap rows | completed | duration | ms | 49.5 | 2.4 | 43.4 | +2.06% |
| js-framework-benchmark | marko-v6.2.2-keyed | remove row | completed | duration | ms | 34.4 | 1.1 | 31.2 | +5.2% |
| js-framework-benchmark | marko-v6.2.2-keyed | create many rows | completed | duration | ms | 792.1 | 81.7 | 701.1 | best |
| js-framework-benchmark | marko-v6.2.2-keyed | append rows to large table | completed | duration | ms | 83.9 | 9.4 | 73 | +2.57% |
| js-framework-benchmark | marko-v6.2.2-keyed | clear rows | completed | duration | ms | 29.2 | 25.1 | 3.1 | best |
| js-framework-benchmark | marko-v6.2.2-keyed | ready memory | completed | memory | MB | 1.1 |  |  | +4.67% |
| js-framework-benchmark | marko-v6.2.2-keyed | run memory | completed | memory | MB | 2.9 |  |  | best |
| js-framework-benchmark | marko-v6.2.2-keyed | repeated clear memory | completed | memory | MB | 1.4 |  |  | +14.12% |
| js-framework-benchmark | marko-v6.2.2-keyed | total byte weight | completed | size | kB | 5 |  |  | +11.11% |
| js-framework-benchmark | **mreact-react-compat-v0.0.185-local-keyed** | create rows | completed | duration | ms | 91.5 | 23.2 | 67.2 | +22.33% |
| js-framework-benchmark | **mreact-react-compat-v0.0.185-local-keyed** | replace all rows | completed | duration | ms | 93.5 | 26.1 | 66.1 | +15.15% |
| js-framework-benchmark | **mreact-react-compat-v0.0.185-local-keyed** | partial update | completed | duration | ms | 63 | 10.4 | 47.6 | +54.41% |
| js-framework-benchmark | **mreact-react-compat-v0.0.185-local-keyed** | select row | completed | duration | ms | 13.7 | 6.4 | 6.3 | +55.68% |
| js-framework-benchmark | **mreact-react-compat-v0.0.185-local-keyed** | swap rows | completed | duration | ms | 59.4 | 10 | 45.2 | +22.47% |
| js-framework-benchmark | **mreact-react-compat-v0.0.185-local-keyed** | remove row | completed | duration | ms | 38.8 | 3.2 | 33.5 | +18.65% |
| js-framework-benchmark | **mreact-react-compat-v0.0.185-local-keyed** | create many rows | completed | duration | ms | 943.4 | 192.1 | 738.4 | +19.1% |
| js-framework-benchmark | **mreact-react-compat-v0.0.185-local-keyed** | append rows to large table | completed | duration | ms | 95.4 | 20.5 | 72.4 | +16.63% |
| js-framework-benchmark | **mreact-react-compat-v0.0.185-local-keyed** | clear rows | completed | duration | ms | 55.3 | 49.9 | 3.9 | +89.38% |
| js-framework-benchmark | **mreact-react-compat-v0.0.185-local-keyed** | ready memory | completed | memory | MB | 1.4 |  |  | +31.42% |
| js-framework-benchmark | **mreact-react-compat-v0.0.185-local-keyed** | run memory | completed | memory | MB | 5 |  |  | +76.12% |
| js-framework-benchmark | **mreact-react-compat-v0.0.185-local-keyed** | repeated clear memory | completed | memory | MB | 1.8 |  |  | +52.26% |
| js-framework-benchmark | **mreact-react-compat-v0.0.185-local-keyed** | total byte weight | completed | size | kB | 30.7 |  |  | +582.22% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.185-local-keyed** | create rows | completed | duration | ms | 104.2 | 34.9 | 67.8 | +39.3% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.185-local-keyed** | replace all rows | completed | duration | ms | 110 | 42.5 | 65.9 | +35.47% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.185-local-keyed** | partial update | completed | duration | ms | 63.6 | 23.1 | 38.7 | +55.88% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.185-local-keyed** | select row | completed | duration | ms | 14.8 | 6.8 | 6.7 | +68.18% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.185-local-keyed** | swap rows | completed | duration | ms | 68.8 | 18.4 | 46.6 | +41.86% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.185-local-keyed** | remove row | completed | duration | ms | 40.8 | 5 | 33.5 | +24.77% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.185-local-keyed** | create many rows | completed | duration | ms | 1025.9 | 287.1 | 733.5 | +29.52% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.185-local-keyed** | append rows to large table | completed | duration | ms | 109.1 | 34.8 | 72.1 | +33.37% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.185-local-keyed** | clear rows | completed | duration | ms | 42.4 | 37.8 | 3.4 | +45.21% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.185-local-keyed** | ready memory | completed | memory | MB | 1.3 |  |  | +27.01% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.185-local-keyed** | run memory | completed | memory | MB | 4.9 |  |  | +71.19% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.185-local-keyed** | repeated clear memory | completed | memory | MB | 2.4 |  |  | +100.55% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.185-local-keyed** | total byte weight | completed | size | kB | 28.8 |  |  | +540% |
| js-framework-benchmark | **mreact-v0.0.185-local-keyed** | create rows | completed | duration | ms | 74.8 | 6.6 | 66.9 | best |
| js-framework-benchmark | **mreact-v0.0.185-local-keyed** | replace all rows | completed | duration | ms | 83.4 | 14.4 | 67.1 | +2.71% |
| js-framework-benchmark | **mreact-v0.0.185-local-keyed** | partial update | completed | duration | ms | 43.2 | 2.2 | 38.6 | +5.88% |
| js-framework-benchmark | **mreact-v0.0.185-local-keyed** | select row | completed | duration | ms | 8.8 | 0.9 | 6.6 | best |
| js-framework-benchmark | **mreact-v0.0.185-local-keyed** | swap rows | completed | duration | ms | 49.4 | 1.9 | 44.1 | +1.86% |
| js-framework-benchmark | **mreact-v0.0.185-local-keyed** | remove row | completed | duration | ms | 34.7 | 1 | 31.9 | +6.12% |
| js-framework-benchmark | **mreact-v0.0.185-local-keyed** | create many rows | completed | duration | ms | 792.1 | 71.1 | 710.7 | 0% |
| js-framework-benchmark | **mreact-v0.0.185-local-keyed** | append rows to large table | completed | duration | ms | 81.8 | 8 | 72.5 | best |
| js-framework-benchmark | **mreact-v0.0.185-local-keyed** | clear rows | completed | duration | ms | 30.7 | 26 | 3.2 | +5.14% |
| js-framework-benchmark | **mreact-v0.0.185-local-keyed** | ready memory | completed | memory | MB | 1.1 |  |  | +5.56% |
| js-framework-benchmark | **mreact-v0.0.185-local-keyed** | run memory | completed | memory | MB | 2.9 |  |  | +0.72% |
| js-framework-benchmark | **mreact-v0.0.185-local-keyed** | repeated clear memory | completed | memory | MB | 1.3 |  |  | +11.16% |
| js-framework-benchmark | **mreact-v0.0.185-local-keyed** | total byte weight | completed | size | kB | 10 |  |  | +122.22% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | create rows | completed | duration | ms | 95.2 | 23.8 | 69.9 | +27.27% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | replace all rows | completed | duration | ms | 105.7 | 36.2 | 67.9 | +30.17% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | partial update | completed | duration | ms | 51.5 | 9.9 | 38.1 | +26.23% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | select row | completed | duration | ms | 13.9 | 5.8 | 6.8 | +57.95% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | swap rows | completed | duration | ms | 333.4 | 52 | 277.5 | +587.42% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | remove row | completed | duration | ms | 37.7 | 2.7 | 32.5 | +15.29% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | create many rows | completed | duration | ms | 1237.7 | 452.4 | 765.6 | +56.26% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | append rows to large table | completed | duration | ms | 97 | 22.9 | 72.4 | +18.58% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | clear rows | completed | duration | ms | 62.9 | 57.5 | 3.9 | +115.41% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | ready memory | completed | memory | MB | 1.6 |  |  | +55.13% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | run memory | completed | memory | MB | 4.9 |  |  | +72.8% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | repeated clear memory | completed | memory | MB | 2.5 |  |  | +105.37% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | total byte weight | completed | size | kB | 51.4 |  |  | +1042.22% |
| js-framework-benchmark | solid-v1.9.14-keyed | create rows | completed | duration | ms | 77.2 | 8 | 68 | +3.21% |
| js-framework-benchmark | solid-v1.9.14-keyed | replace all rows | completed | duration | ms | 81.2 | 15.5 | 64.3 | best |
| js-framework-benchmark | solid-v1.9.14-keyed | partial update | completed | duration | ms | 42.6 | 3.1 | 36.3 | +4.41% |
| js-framework-benchmark | solid-v1.9.14-keyed | select row | completed | duration | ms | 9.5 | 1.9 | 6.5 | +7.95% |
| js-framework-benchmark | solid-v1.9.14-keyed | swap rows | completed | duration | ms | 51 | 2.2 | 45.1 | +5.15% |
| js-framework-benchmark | solid-v1.9.14-keyed | remove row | completed | duration | ms | 36.5 | 0.7 | 34.2 | +11.62% |
| js-framework-benchmark | solid-v1.9.14-keyed | create many rows | completed | duration | ms | 793.6 | 74.2 | 710.4 | +0.19% |
| js-framework-benchmark | solid-v1.9.14-keyed | append rows to large table | completed | duration | ms | 84.4 | 8.5 | 74.3 | +3.18% |
| js-framework-benchmark | solid-v1.9.14-keyed | clear rows | completed | duration | ms | 40.9 | 35.6 | 3.6 | +40.07% |
| js-framework-benchmark | solid-v1.9.14-keyed | ready memory | completed | memory | MB | 1 |  |  | best |
| js-framework-benchmark | solid-v1.9.14-keyed | run memory | completed | memory | MB | 3.1 |  |  | +9.42% |
| js-framework-benchmark | solid-v1.9.14-keyed | repeated clear memory | completed | memory | MB | 1.2 |  |  | best |
| js-framework-benchmark | solid-v1.9.14-keyed | total byte weight | completed | size | kB | 4.5 |  |  | best |
| js-framework-benchmark | svelte-v5.56.4-keyed | create rows | completed | duration | ms | 82.1 | 11.1 | 69.5 | +9.76% |
| js-framework-benchmark | svelte-v5.56.4-keyed | replace all rows | completed | duration | ms | 84.8 | 18.6 | 64.7 | +4.43% |
| js-framework-benchmark | svelte-v5.56.4-keyed | partial update | completed | duration | ms | 48 | 4 | 40.8 | +17.65% |
| js-framework-benchmark | svelte-v5.56.4-keyed | select row | completed | duration | ms | 14.3 | 6.6 | 6.2 | +62.5% |
| js-framework-benchmark | svelte-v5.56.4-keyed | swap rows | completed | duration | ms | 52.4 | 4 | 44.8 | +8.04% |
| js-framework-benchmark | svelte-v5.56.4-keyed | remove row | completed | duration | ms | 37.1 | 1.6 | 33.7 | +13.46% |
| js-framework-benchmark | svelte-v5.56.4-keyed | create many rows | completed | duration | ms | 817.3 | 96 | 711.2 | +3.18% |
| js-framework-benchmark | svelte-v5.56.4-keyed | append rows to large table | completed | duration | ms | 88.8 | 12.3 | 74.7 | +8.56% |
| js-framework-benchmark | svelte-v5.56.4-keyed | clear rows | completed | duration | ms | 36.1 | 31.1 | 3.4 | +23.63% |
| js-framework-benchmark | svelte-v5.56.4-keyed | ready memory | completed | memory | MB | 1.2 |  |  | +14.29% |
| js-framework-benchmark | svelte-v5.56.4-keyed | run memory | completed | memory | MB | 3.5 |  |  | +23.45% |
| js-framework-benchmark | svelte-v5.56.4-keyed | repeated clear memory | completed | memory | MB | 1.5 |  |  | +25.84% |
| js-framework-benchmark | svelte-v5.56.4-keyed | total byte weight | completed | size | kB | 14.3 |  |  | +217.78% |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | create rows | completed | duration | ms | 94.5 | 22.2 | 70.9 | +26.34% |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | replace all rows | completed | duration | ms | 97.4 | 27.2 | 67.8 | +19.95% |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | partial update | completed | duration | ms | 54.5 | 6.8 | 43.5 | +33.58% |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | select row | completed | duration | ms | 10.2 | 2.5 | 6.4 | +15.91% |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | swap rows | completed | duration | ms | 51.6 | 2.8 | 45.2 | +6.39% |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | remove row | completed | duration | ms | 41.1 | 5.3 | 33.5 | +25.69% |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | create many rows | completed | duration | ms | 926 | 170.9 | 746.7 | +16.9% |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | append rows to large table | completed | duration | ms | 97.6 | 17.9 | 78 | +19.32% |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | clear rows | completed | duration | ms | 49.2 | 44.3 | 3.7 | +68.49% |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | ready memory | completed | memory | MB | 1.3 |  |  | +28.35% |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | run memory | completed | memory | MB | 4.4 |  |  | +54.79% |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | repeated clear memory | completed | memory | MB | 1.7 |  |  | +41.43% |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | total byte weight | completed | size | kB | 23.9 |  |  | +431.11% |
