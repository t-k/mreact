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

Raw JSON files are stored in `benchmarks/results/2026-07-05/001/js-framework-benchmark-results`.
Chrome trace files are stored in `benchmarks/results/2026-07-05/001/js-framework-benchmark-traces`.

## Rankings

Lower values are better for all js-framework-benchmark metrics reported here.

### create rows

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | marko-v6.2.2-keyed | create rows | 75 | 8 | 65.3 | best | ms |
| 2 | solid-v1.9.14-keyed | create rows | 75 | 8 | 65.7 | 0% | ms |
| 3 | **mreact-v0.0.186-local-keyed** | create rows | 76.2 | 8.2 | 66.7 | +1.6% | ms |
| 4 | svelte-v5.56.4-keyed | create rows | 79.6 | 11.4 | 66.8 | +6.13% | ms |
| 5 | vue-v3.6.0-beta.17-keyed | create rows | 91.4 | 21.9 | 68.6 | +21.87% | ms |
| 6 | **mreact-react-compat-v0.0.186-local-keyed** | create rows | 93.3 | 23.6 | 68 | +24.4% | ms |
| 7 | react-hooks-v19.2.7-keyed | create rows | 94.5 | 24.1 | 69.3 | +26% | ms |
| 8 | angular-cf-v22.0.0-keyed | create rows | 104.6 | 20.1 | 66.7 | +39.47% | ms |
| 9 | **mreact-react-compat-vdom-v0.0.186-local-keyed** | create rows | 104.7 | 35.3 | 67.3 | +39.6% | ms |

### replace all rows

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | solid-v1.9.14-keyed | replace all rows | 81.2 | 15.9 | 64.1 | best | ms |
| 2 | **mreact-v0.0.186-local-keyed** | replace all rows | 82.6 | 14.9 | 66 | +1.72% | ms |
| 3 | marko-v6.2.2-keyed | replace all rows | 82.7 | 15.3 | 66.4 | +1.85% | ms |
| 4 | svelte-v5.56.4-keyed | replace all rows | 89.3 | 20.7 | 66.6 | +9.98% | ms |
| 5 | **mreact-react-compat-v0.0.186-local-keyed** | replace all rows | 92.7 | 25.6 | 66 | +14.16% | ms |
| 6 | vue-v3.6.0-beta.17-keyed | replace all rows | 99.4 | 28 | 70 | +22.41% | ms |
| 7 | react-hooks-v19.2.7-keyed | replace all rows | 107.4 | 36.3 | 69.6 | +32.27% | ms |
| 8 | **mreact-react-compat-vdom-v0.0.186-local-keyed** | replace all rows | 115.5 | 43.9 | 70.1 | +42.24% | ms |
| 9 | angular-cf-v22.0.0-keyed | replace all rows | 124.5 | 34.4 | 73.5 | +53.33% | ms |

### partial update

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | angular-cf-v22.0.0-keyed | partial update | 46.2 | 3.6 | 41.8 | best | ms |
| 2 | **mreact-v0.0.186-local-keyed** | partial update | 48.5 | 2.2 | 43 | +4.98% | ms |
| 3 | svelte-v5.56.4-keyed | partial update | 52.9 | 4.5 | 44.4 | +14.5% | ms |
| 4 | marko-v6.2.2-keyed | partial update | 53.5 | 4.4 | 44.7 | +15.8% | ms |
| 5 | solid-v1.9.14-keyed | partial update | 54.2 | 3.4 | 46.4 | +17.32% | ms |
| 6 | vue-v3.6.0-beta.17-keyed | partial update | 57.4 | 7.2 | 46.2 | +24.24% | ms |
| 7 | **mreact-react-compat-v0.0.186-local-keyed** | partial update | 58.2 | 9.8 | 45.3 | +25.97% | ms |
| 8 | react-hooks-v19.2.7-keyed | partial update | 61.9 | 11.5 | 46.2 | +33.98% | ms |
| 9 | **mreact-react-compat-vdom-v0.0.186-local-keyed** | partial update | 72.6 | 24.2 | 44.9 | +57.14% | ms |

### select row

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | **mreact-v0.0.186-local-keyed** | select row | 9.6 | 0.9 | 7.1 | best | ms |
| 2 | marko-v6.2.2-keyed | select row | 10.7 | 1.4 | 7.9 | +11.46% | ms |
| 3 | solid-v1.9.14-keyed | select row | 10.7 | 2 | 7.3 | +11.46% | ms |
| 4 | vue-v3.6.0-beta.17-keyed | select row | 11.7 | 2.5 | 7.5 | +21.88% | ms |
| 5 | angular-cf-v22.0.0-keyed | select row | 14.9 | 4.3 | 8.8 | +55.21% | ms |
| 6 | **mreact-react-compat-v0.0.186-local-keyed** | select row | 15.8 | 6.3 | 7.2 | +64.58% | ms |
| 7 | **mreact-react-compat-vdom-v0.0.186-local-keyed** | select row | 15.8 | 7.3 | 7.2 | +64.58% | ms |
| 8 | react-hooks-v19.2.7-keyed | select row | 15.9 | 6.2 | 7.1 | +65.63% | ms |
| 9 | svelte-v5.56.4-keyed | select row | 15.9 | 6.9 | 7.4 | +65.63% | ms |

### swap rows

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | solid-v1.9.14-keyed | swap rows | 52.1 | 2.2 | 45.7 | best | ms |
| 2 | svelte-v5.56.4-keyed | swap rows | 53.2 | 3.9 | 45.5 | +2.11% | ms |
| 3 | vue-v3.6.0-beta.17-keyed | swap rows | 53.7 | 3 | 46.7 | +3.07% | ms |
| 4 | angular-cf-v22.0.0-keyed | swap rows | 59.7 | 3.2 | 54.1 | +14.59% | ms |
| 5 | marko-v6.2.2-keyed | swap rows | 59.9 | 3 | 52.5 | +14.97% | ms |
| 6 | **mreact-v0.0.186-local-keyed** | swap rows | 64 | 2.3 | 57.6 | +22.84% | ms |
| 7 | **mreact-react-compat-v0.0.186-local-keyed** | swap rows | 67.1 | 11.5 | 52.6 | +28.79% | ms |
| 8 | **mreact-react-compat-vdom-v0.0.186-local-keyed** | swap rows | 77.6 | 20 | 52.4 | +48.94% | ms |
| 9 | react-hooks-v19.2.7-keyed | swap rows | 347.5 | 54.1 | 288 | +566.99% | ms |

### remove row

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | angular-cf-v22.0.0-keyed | remove row | 35 | 1.8 | 32.4 | best | ms |
| 2 | **mreact-v0.0.186-local-keyed** | remove row | 37.1 | 1 | 33.9 | +6% | ms |
| 3 | solid-v1.9.14-keyed | remove row | 37.1 | 0.9 | 33.9 | +6% | ms |
| 4 | marko-v6.2.2-keyed | remove row | 37.7 | 1.1 | 34.6 | +7.71% | ms |
| 5 | svelte-v5.56.4-keyed | remove row | 38.1 | 1.6 | 34.6 | +8.86% | ms |
| 6 | react-hooks-v19.2.7-keyed | remove row | 39.7 | 2.7 | 34.4 | +13.43% | ms |
| 7 | **mreact-react-compat-v0.0.186-local-keyed** | remove row | 40.2 | 2.8 | 34.8 | +14.86% | ms |
| 8 | **mreact-react-compat-vdom-v0.0.186-local-keyed** | remove row | 43.5 | 5.6 | 35.1 | +24.29% | ms |
| 9 | vue-v3.6.0-beta.17-keyed | remove row | 43.7 | 5.8 | 35.8 | +24.86% | ms |

### create many rows

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | marko-v6.2.2-keyed | create many rows | 800.3 | 82.4 | 707.6 | best | ms |
| 2 | **mreact-v0.0.186-local-keyed** | create many rows | 803.6 | 72.4 | 721.1 | +0.41% | ms |
| 3 | solid-v1.9.14-keyed | create many rows | 825.7 | 75.8 | 739.6 | +3.17% | ms |
| 4 | svelte-v5.56.4-keyed | create many rows | 838.5 | 101.2 | 728.8 | +4.77% | ms |
| 5 | vue-v3.6.0-beta.17-keyed | create many rows | 943.1 | 175 | 756.4 | +17.84% | ms |
| 6 | **mreact-react-compat-v0.0.186-local-keyed** | create many rows | 947.9 | 192.9 | 746.2 | +18.44% | ms |
| 7 | angular-cf-v22.0.0-keyed | create many rows | 1056 | 204.3 | 762.3 | +31.95% | ms |
| 8 | **mreact-react-compat-vdom-v0.0.186-local-keyed** | create many rows | 1057.6 | 299.8 | 751.1 | +32.15% | ms |
| 9 | react-hooks-v19.2.7-keyed | create many rows | 1212.6 | 421.3 | 785.4 | +51.52% | ms |

### append rows to large table

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | marko-v6.2.2-keyed | append rows to large table | 85.3 | 9.6 | 73.9 | best | ms |
| 2 | solid-v1.9.14-keyed | append rows to large table | 86.6 | 9.3 | 75.7 | +1.52% | ms |
| 3 | **mreact-v0.0.186-local-keyed** | append rows to large table | 86.8 | 8.4 | 76.5 | +1.76% | ms |
| 4 | svelte-v5.56.4-keyed | append rows to large table | 88.4 | 11.2 | 75.6 | +3.63% | ms |
| 5 | vue-v3.6.0-beta.17-keyed | append rows to large table | 96.4 | 17.6 | 77.5 | +13.01% | ms |
| 6 | **mreact-react-compat-v0.0.186-local-keyed** | append rows to large table | 102.1 | 22.2 | 77.6 | +19.7% | ms |
| 7 | react-hooks-v19.2.7-keyed | append rows to large table | 103.3 | 24.3 | 77.9 | +21.1% | ms |
| 8 | angular-cf-v22.0.0-keyed | append rows to large table | 113.7 | 18.2 | 79.4 | +33.29% | ms |
| 9 | **mreact-react-compat-vdom-v0.0.186-local-keyed** | append rows to large table | 115.7 | 35.9 | 77.6 | +35.64% | ms |

### clear rows

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | marko-v6.2.2-keyed | clear rows | 31.5 | 26.6 | 3.4 | best | ms |
| 2 | **mreact-v0.0.186-local-keyed** | clear rows | 32.7 | 28.2 | 3.5 | +3.81% | ms |
| 3 | svelte-v5.56.4-keyed | clear rows | 39 | 33.1 | 3.7 | +23.81% | ms |
| 4 | solid-v1.9.14-keyed | clear rows | 40.6 | 35 | 3.5 | +28.89% | ms |
| 5 | **mreact-react-compat-vdom-v0.0.186-local-keyed** | clear rows | 45.8 | 40.4 | 3.4 | +45.4% | ms |
| 6 | vue-v3.6.0-beta.17-keyed | clear rows | 50.9 | 45.5 | 3.4 | +61.59% | ms |
| 7 | **mreact-react-compat-v0.0.186-local-keyed** | clear rows | 54.2 | 48.8 | 3.6 | +72.06% | ms |
| 8 | react-hooks-v19.2.7-keyed | clear rows | 62.6 | 57.2 | 3.7 | +98.73% | ms |
| 9 | angular-cf-v22.0.0-keyed | clear rows | 65.4 | 60.9 | 4.1 | +107.62% | ms |

### ready memory

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | solid-v1.9.14-keyed | ready memory | 1 |  |  | best | MB |
| 2 | marko-v6.2.2-keyed | ready memory | 1.1 |  |  | +6.61% | MB |
| 3 | **mreact-v0.0.186-local-keyed** | ready memory | 1.1 |  |  | +9.32% | MB |
| 4 | svelte-v5.56.4-keyed | ready memory | 1.2 |  |  | +17.77% | MB |
| 5 | vue-v3.6.0-beta.17-keyed | ready memory | 1.3 |  |  | +29.11% | MB |
| 6 | **mreact-react-compat-vdom-v0.0.186-local-keyed** | ready memory | 1.3 |  |  | +30.15% | MB |
| 7 | **mreact-react-compat-v0.0.186-local-keyed** | ready memory | 1.4 |  |  | +33.68% | MB |
| 8 | react-hooks-v19.2.7-keyed | ready memory | 1.7 |  |  | +62.83% | MB |
| 9 | angular-cf-v22.0.0-keyed | ready memory | 2.1 |  |  | +102.43% | MB |

### run memory

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | marko-v6.2.2-keyed | run memory | 2.9 |  |  | best | MB |
| 2 | **mreact-v0.0.186-local-keyed** | run memory | 2.9 |  |  | +0.81% | MB |
| 3 | solid-v1.9.14-keyed | run memory | 3.1 |  |  | +8.44% | MB |
| 4 | svelte-v5.56.4-keyed | run memory | 3.4 |  |  | +19.44% | MB |
| 5 | vue-v3.6.0-beta.17-keyed | run memory | 4.4 |  |  | +51.61% | MB |
| 6 | **mreact-react-compat-vdom-v0.0.186-local-keyed** | run memory | 4.9 |  |  | +68.8% | MB |
| 7 | react-hooks-v19.2.7-keyed | run memory | 4.9 |  |  | +70.07% | MB |
| 8 | angular-cf-v22.0.0-keyed | run memory | 5 |  |  | +73.5% | MB |
| 9 | **mreact-react-compat-v0.0.186-local-keyed** | run memory | 5 |  |  | +75.33% | MB |

### repeated clear memory

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | solid-v1.9.14-keyed | repeated clear memory | 1.2 |  |  | best | MB |
| 2 | **mreact-v0.0.186-local-keyed** | repeated clear memory | 1.3 |  |  | +7.08% | MB |
| 3 | marko-v6.2.2-keyed | repeated clear memory | 1.3 |  |  | +7.85% | MB |
| 4 | svelte-v5.56.4-keyed | repeated clear memory | 1.5 |  |  | +23.56% | MB |
| 5 | vue-v3.6.0-beta.17-keyed | repeated clear memory | 1.7 |  |  | +37.64% | MB |
| 6 | **mreact-react-compat-v0.0.186-local-keyed** | repeated clear memory | 1.9 |  |  | +54.81% | MB |
| 7 | **mreact-react-compat-vdom-v0.0.186-local-keyed** | repeated clear memory | 2.4 |  |  | +92.82% | MB |
| 8 | react-hooks-v19.2.7-keyed | repeated clear memory | 2.5 |  |  | +98.26% | MB |
| 9 | angular-cf-v22.0.0-keyed | repeated clear memory | 2.6 |  |  | +106.64% | MB |

### total byte weight

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | solid-v1.9.14-keyed | total byte weight | 4.5 |  |  | best | kB |
| 2 | marko-v6.2.2-keyed | total byte weight | 5 |  |  | +11.11% | kB |
| 3 | **mreact-v0.0.186-local-keyed** | total byte weight | 10.1 |  |  | +124.44% | kB |
| 4 | svelte-v5.56.4-keyed | total byte weight | 14.3 |  |  | +217.78% | kB |
| 5 | vue-v3.6.0-beta.17-keyed | total byte weight | 23.9 |  |  | +431.11% | kB |
| 6 | **mreact-react-compat-vdom-v0.0.186-local-keyed** | total byte weight | 28.8 |  |  | +540% | kB |
| 7 | **mreact-react-compat-v0.0.186-local-keyed** | total byte weight | 30.7 |  |  | +582.22% | kB |
| 8 | angular-cf-v22.0.0-keyed | total byte weight | 44.5 |  |  | +888.89% | kB |
| 9 | react-hooks-v19.2.7-keyed | total byte weight | 51.4 |  |  | +1042.22% | kB |

## Results

| suite | framework | case | status | metric | unit | value | script | paint | diff vs 1st |
| --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | create rows | completed | duration | ms | 104.6 | 20.1 | 66.7 | +39.47% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | replace all rows | completed | duration | ms | 124.5 | 34.4 | 73.5 | +53.33% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | partial update | completed | duration | ms | 46.2 | 3.6 | 41.8 | best |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | select row | completed | duration | ms | 14.9 | 4.3 | 8.8 | +55.21% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | swap rows | completed | duration | ms | 59.7 | 3.2 | 54.1 | +14.59% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | remove row | completed | duration | ms | 35 | 1.8 | 32.4 | best |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | create many rows | completed | duration | ms | 1056 | 204.3 | 762.3 | +31.95% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | append rows to large table | completed | duration | ms | 113.7 | 18.2 | 79.4 | +33.29% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | clear rows | completed | duration | ms | 65.4 | 60.9 | 4.1 | +107.62% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | ready memory | completed | memory | MB | 2.1 |  |  | +102.43% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | run memory | completed | memory | MB | 5 |  |  | +73.5% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | repeated clear memory | completed | memory | MB | 2.6 |  |  | +106.64% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | total byte weight | completed | size | kB | 44.5 |  |  | +888.89% |
| js-framework-benchmark | marko-v6.2.2-keyed | create rows | completed | duration | ms | 75 | 8 | 65.3 | best |
| js-framework-benchmark | marko-v6.2.2-keyed | replace all rows | completed | duration | ms | 82.7 | 15.3 | 66.4 | +1.85% |
| js-framework-benchmark | marko-v6.2.2-keyed | partial update | completed | duration | ms | 53.5 | 4.4 | 44.7 | +15.8% |
| js-framework-benchmark | marko-v6.2.2-keyed | select row | completed | duration | ms | 10.7 | 1.4 | 7.9 | +11.46% |
| js-framework-benchmark | marko-v6.2.2-keyed | swap rows | completed | duration | ms | 59.9 | 3 | 52.5 | +14.97% |
| js-framework-benchmark | marko-v6.2.2-keyed | remove row | completed | duration | ms | 37.7 | 1.1 | 34.6 | +7.71% |
| js-framework-benchmark | marko-v6.2.2-keyed | create many rows | completed | duration | ms | 800.3 | 82.4 | 707.6 | best |
| js-framework-benchmark | marko-v6.2.2-keyed | append rows to large table | completed | duration | ms | 85.3 | 9.6 | 73.9 | best |
| js-framework-benchmark | marko-v6.2.2-keyed | clear rows | completed | duration | ms | 31.5 | 26.6 | 3.4 | best |
| js-framework-benchmark | marko-v6.2.2-keyed | ready memory | completed | memory | MB | 1.1 |  |  | +6.61% |
| js-framework-benchmark | marko-v6.2.2-keyed | run memory | completed | memory | MB | 2.9 |  |  | best |
| js-framework-benchmark | marko-v6.2.2-keyed | repeated clear memory | completed | memory | MB | 1.3 |  |  | +7.85% |
| js-framework-benchmark | marko-v6.2.2-keyed | total byte weight | completed | size | kB | 5 |  |  | +11.11% |
| js-framework-benchmark | **mreact-react-compat-v0.0.186-local-keyed** | create rows | completed | duration | ms | 93.3 | 23.6 | 68 | +24.4% |
| js-framework-benchmark | **mreact-react-compat-v0.0.186-local-keyed** | replace all rows | completed | duration | ms | 92.7 | 25.6 | 66 | +14.16% |
| js-framework-benchmark | **mreact-react-compat-v0.0.186-local-keyed** | partial update | completed | duration | ms | 58.2 | 9.8 | 45.3 | +25.97% |
| js-framework-benchmark | **mreact-react-compat-v0.0.186-local-keyed** | select row | completed | duration | ms | 15.8 | 6.3 | 7.2 | +64.58% |
| js-framework-benchmark | **mreact-react-compat-v0.0.186-local-keyed** | swap rows | completed | duration | ms | 67.1 | 11.5 | 52.6 | +28.79% |
| js-framework-benchmark | **mreact-react-compat-v0.0.186-local-keyed** | remove row | completed | duration | ms | 40.2 | 2.8 | 34.8 | +14.86% |
| js-framework-benchmark | **mreact-react-compat-v0.0.186-local-keyed** | create many rows | completed | duration | ms | 947.9 | 192.9 | 746.2 | +18.44% |
| js-framework-benchmark | **mreact-react-compat-v0.0.186-local-keyed** | append rows to large table | completed | duration | ms | 102.1 | 22.2 | 77.6 | +19.7% |
| js-framework-benchmark | **mreact-react-compat-v0.0.186-local-keyed** | clear rows | completed | duration | ms | 54.2 | 48.8 | 3.6 | +72.06% |
| js-framework-benchmark | **mreact-react-compat-v0.0.186-local-keyed** | ready memory | completed | memory | MB | 1.4 |  |  | +33.68% |
| js-framework-benchmark | **mreact-react-compat-v0.0.186-local-keyed** | run memory | completed | memory | MB | 5 |  |  | +75.33% |
| js-framework-benchmark | **mreact-react-compat-v0.0.186-local-keyed** | repeated clear memory | completed | memory | MB | 1.9 |  |  | +54.81% |
| js-framework-benchmark | **mreact-react-compat-v0.0.186-local-keyed** | total byte weight | completed | size | kB | 30.7 |  |  | +582.22% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.186-local-keyed** | create rows | completed | duration | ms | 104.7 | 35.3 | 67.3 | +39.6% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.186-local-keyed** | replace all rows | completed | duration | ms | 115.5 | 43.9 | 70.1 | +42.24% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.186-local-keyed** | partial update | completed | duration | ms | 72.6 | 24.2 | 44.9 | +57.14% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.186-local-keyed** | select row | completed | duration | ms | 15.8 | 7.3 | 7.2 | +64.58% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.186-local-keyed** | swap rows | completed | duration | ms | 77.6 | 20 | 52.4 | +48.94% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.186-local-keyed** | remove row | completed | duration | ms | 43.5 | 5.6 | 35.1 | +24.29% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.186-local-keyed** | create many rows | completed | duration | ms | 1057.6 | 299.8 | 751.1 | +32.15% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.186-local-keyed** | append rows to large table | completed | duration | ms | 115.7 | 35.9 | 77.6 | +35.64% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.186-local-keyed** | clear rows | completed | duration | ms | 45.8 | 40.4 | 3.4 | +45.4% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.186-local-keyed** | ready memory | completed | memory | MB | 1.3 |  |  | +30.15% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.186-local-keyed** | run memory | completed | memory | MB | 4.9 |  |  | +68.8% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.186-local-keyed** | repeated clear memory | completed | memory | MB | 2.4 |  |  | +92.82% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.186-local-keyed** | total byte weight | completed | size | kB | 28.8 |  |  | +540% |
| js-framework-benchmark | **mreact-v0.0.186-local-keyed** | create rows | completed | duration | ms | 76.2 | 8.2 | 66.7 | +1.6% |
| js-framework-benchmark | **mreact-v0.0.186-local-keyed** | replace all rows | completed | duration | ms | 82.6 | 14.9 | 66 | +1.72% |
| js-framework-benchmark | **mreact-v0.0.186-local-keyed** | partial update | completed | duration | ms | 48.5 | 2.2 | 43 | +4.98% |
| js-framework-benchmark | **mreact-v0.0.186-local-keyed** | select row | completed | duration | ms | 9.6 | 0.9 | 7.1 | best |
| js-framework-benchmark | **mreact-v0.0.186-local-keyed** | swap rows | completed | duration | ms | 64 | 2.3 | 57.6 | +22.84% |
| js-framework-benchmark | **mreact-v0.0.186-local-keyed** | remove row | completed | duration | ms | 37.1 | 1 | 33.9 | +6% |
| js-framework-benchmark | **mreact-v0.0.186-local-keyed** | create many rows | completed | duration | ms | 803.6 | 72.4 | 721.1 | +0.41% |
| js-framework-benchmark | **mreact-v0.0.186-local-keyed** | append rows to large table | completed | duration | ms | 86.8 | 8.4 | 76.5 | +1.76% |
| js-framework-benchmark | **mreact-v0.0.186-local-keyed** | clear rows | completed | duration | ms | 32.7 | 28.2 | 3.5 | +3.81% |
| js-framework-benchmark | **mreact-v0.0.186-local-keyed** | ready memory | completed | memory | MB | 1.1 |  |  | +9.32% |
| js-framework-benchmark | **mreact-v0.0.186-local-keyed** | run memory | completed | memory | MB | 2.9 |  |  | +0.81% |
| js-framework-benchmark | **mreact-v0.0.186-local-keyed** | repeated clear memory | completed | memory | MB | 1.3 |  |  | +7.08% |
| js-framework-benchmark | **mreact-v0.0.186-local-keyed** | total byte weight | completed | size | kB | 10.1 |  |  | +124.44% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | create rows | completed | duration | ms | 94.5 | 24.1 | 69.3 | +26% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | replace all rows | completed | duration | ms | 107.4 | 36.3 | 69.6 | +32.27% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | partial update | completed | duration | ms | 61.9 | 11.5 | 46.2 | +33.98% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | select row | completed | duration | ms | 15.9 | 6.2 | 7.1 | +65.63% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | swap rows | completed | duration | ms | 347.5 | 54.1 | 288 | +566.99% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | remove row | completed | duration | ms | 39.7 | 2.7 | 34.4 | +13.43% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | create many rows | completed | duration | ms | 1212.6 | 421.3 | 785.4 | +51.52% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | append rows to large table | completed | duration | ms | 103.3 | 24.3 | 77.9 | +21.1% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | clear rows | completed | duration | ms | 62.6 | 57.2 | 3.7 | +98.73% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | ready memory | completed | memory | MB | 1.7 |  |  | +62.83% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | run memory | completed | memory | MB | 4.9 |  |  | +70.07% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | repeated clear memory | completed | memory | MB | 2.5 |  |  | +98.26% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | total byte weight | completed | size | kB | 51.4 |  |  | +1042.22% |
| js-framework-benchmark | solid-v1.9.14-keyed | create rows | completed | duration | ms | 75 | 8 | 65.7 | 0% |
| js-framework-benchmark | solid-v1.9.14-keyed | replace all rows | completed | duration | ms | 81.2 | 15.9 | 64.1 | best |
| js-framework-benchmark | solid-v1.9.14-keyed | partial update | completed | duration | ms | 54.2 | 3.4 | 46.4 | +17.32% |
| js-framework-benchmark | solid-v1.9.14-keyed | select row | completed | duration | ms | 10.7 | 2 | 7.3 | +11.46% |
| js-framework-benchmark | solid-v1.9.14-keyed | swap rows | completed | duration | ms | 52.1 | 2.2 | 45.7 | best |
| js-framework-benchmark | solid-v1.9.14-keyed | remove row | completed | duration | ms | 37.1 | 0.9 | 33.9 | +6% |
| js-framework-benchmark | solid-v1.9.14-keyed | create many rows | completed | duration | ms | 825.7 | 75.8 | 739.6 | +3.17% |
| js-framework-benchmark | solid-v1.9.14-keyed | append rows to large table | completed | duration | ms | 86.6 | 9.3 | 75.7 | +1.52% |
| js-framework-benchmark | solid-v1.9.14-keyed | clear rows | completed | duration | ms | 40.6 | 35 | 3.5 | +28.89% |
| js-framework-benchmark | solid-v1.9.14-keyed | ready memory | completed | memory | MB | 1 |  |  | best |
| js-framework-benchmark | solid-v1.9.14-keyed | run memory | completed | memory | MB | 3.1 |  |  | +8.44% |
| js-framework-benchmark | solid-v1.9.14-keyed | repeated clear memory | completed | memory | MB | 1.2 |  |  | best |
| js-framework-benchmark | solid-v1.9.14-keyed | total byte weight | completed | size | kB | 4.5 |  |  | best |
| js-framework-benchmark | svelte-v5.56.4-keyed | create rows | completed | duration | ms | 79.6 | 11.4 | 66.8 | +6.13% |
| js-framework-benchmark | svelte-v5.56.4-keyed | replace all rows | completed | duration | ms | 89.3 | 20.7 | 66.6 | +9.98% |
| js-framework-benchmark | svelte-v5.56.4-keyed | partial update | completed | duration | ms | 52.9 | 4.5 | 44.4 | +14.5% |
| js-framework-benchmark | svelte-v5.56.4-keyed | select row | completed | duration | ms | 15.9 | 6.9 | 7.4 | +65.63% |
| js-framework-benchmark | svelte-v5.56.4-keyed | swap rows | completed | duration | ms | 53.2 | 3.9 | 45.5 | +2.11% |
| js-framework-benchmark | svelte-v5.56.4-keyed | remove row | completed | duration | ms | 38.1 | 1.6 | 34.6 | +8.86% |
| js-framework-benchmark | svelte-v5.56.4-keyed | create many rows | completed | duration | ms | 838.5 | 101.2 | 728.8 | +4.77% |
| js-framework-benchmark | svelte-v5.56.4-keyed | append rows to large table | completed | duration | ms | 88.4 | 11.2 | 75.6 | +3.63% |
| js-framework-benchmark | svelte-v5.56.4-keyed | clear rows | completed | duration | ms | 39 | 33.1 | 3.7 | +23.81% |
| js-framework-benchmark | svelte-v5.56.4-keyed | ready memory | completed | memory | MB | 1.2 |  |  | +17.77% |
| js-framework-benchmark | svelte-v5.56.4-keyed | run memory | completed | memory | MB | 3.4 |  |  | +19.44% |
| js-framework-benchmark | svelte-v5.56.4-keyed | repeated clear memory | completed | memory | MB | 1.5 |  |  | +23.56% |
| js-framework-benchmark | svelte-v5.56.4-keyed | total byte weight | completed | size | kB | 14.3 |  |  | +217.78% |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | create rows | completed | duration | ms | 91.4 | 21.9 | 68.6 | +21.87% |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | replace all rows | completed | duration | ms | 99.4 | 28 | 70 | +22.41% |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | partial update | completed | duration | ms | 57.4 | 7.2 | 46.2 | +24.24% |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | select row | completed | duration | ms | 11.7 | 2.5 | 7.5 | +21.88% |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | swap rows | completed | duration | ms | 53.7 | 3 | 46.7 | +3.07% |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | remove row | completed | duration | ms | 43.7 | 5.8 | 35.8 | +24.86% |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | create many rows | completed | duration | ms | 943.1 | 175 | 756.4 | +17.84% |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | append rows to large table | completed | duration | ms | 96.4 | 17.6 | 77.5 | +13.01% |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | clear rows | completed | duration | ms | 50.9 | 45.5 | 3.4 | +61.59% |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | ready memory | completed | memory | MB | 1.3 |  |  | +29.11% |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | run memory | completed | memory | MB | 4.4 |  |  | +51.61% |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | repeated clear memory | completed | memory | MB | 1.7 |  |  | +37.64% |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | total byte weight | completed | size | kB | 23.9 |  |  | +431.11% |
