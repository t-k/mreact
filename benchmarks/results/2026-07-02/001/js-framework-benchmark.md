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

Raw JSON files are stored in `benchmarks/results/2026-07-02/001/js-framework-benchmark-results`.
Chrome trace files are stored in `benchmarks/results/2026-07-02/001/js-framework-benchmark-traces`.

## Rankings

Lower values are better for all js-framework-benchmark metrics reported here.

### create rows

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | **mreact-v0.0.182-local-keyed** | create rows | 66.1 | 6.1 | 58.8 | best | ms |
| 2 | solid-v1.9.14-keyed | create rows | 67 | 7.2 | 58.6 | +1.36% | ms |
| 3 | marko-v6.1.24-keyed | create rows | 67.5 | 7.2 | 59 | +2.12% | ms |
| 4 | svelte-v5.56.4-keyed | create rows | 70.8 | 10.2 | 58.9 | +7.11% | ms |
| 5 | react-hooks-v19.2.7-keyed | create rows | 83.3 | 22.5 | 59.9 | +26.02% | ms |
| 6 | vue-v3.6.0-beta.17-keyed | create rows | 83.9 | 21.5 | 61 | +26.93% | ms |
| 7 | **mreact-react-compat-v0.0.182-local-keyed** | create rows | 87.5 | 26.7 | 61.5 | +32.38% | ms |
| 8 | **mreact-react-compat-vdom-v0.0.182-local-keyed** | create rows | 95.1 | 33.4 | 60.2 | +43.87% | ms |
| 9 | angular-cf-v22.0.0-keyed | create rows | 98.5 | 20 | 61.7 | +49.02% | ms |

### replace all rows

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | solid-v1.9.14-keyed | replace all rows | 75.8 | 14.8 | 59.9 | best | ms |
| 2 | marko-v6.1.24-keyed | replace all rows | 78.8 | 14.9 | 62.8 | +3.96% | ms |
| 3 | svelte-v5.56.4-keyed | replace all rows | 80.1 | 18.4 | 60.2 | +5.67% | ms |
| 4 | **mreact-v0.0.182-local-keyed** | replace all rows | 80.6 | 14.2 | 64 | +6.33% | ms |
| 5 | vue-v3.6.0-beta.17-keyed | replace all rows | 91.6 | 27 | 62.6 | +20.84% | ms |
| 6 | **mreact-react-compat-v0.0.182-local-keyed** | replace all rows | 94.7 | 27.2 | 65.5 | +24.93% | ms |
| 7 | react-hooks-v19.2.7-keyed | replace all rows | 104.2 | 35.9 | 67.3 | +37.47% | ms |
| 8 | **mreact-react-compat-vdom-v0.0.182-local-keyed** | replace all rows | 108.7 | 43.4 | 64.7 | +43.4% | ms |
| 9 | angular-cf-v22.0.0-keyed | replace all rows | 111.5 | 32.1 | 65.3 | +47.1% | ms |

### partial update

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | angular-cf-v22.0.0-keyed | partial update | 39.2 | 3.1 | 34.1 | best | ms |
| 2 | solid-v1.9.14-keyed | partial update | 40.3 | 2.7 | 33.9 | +2.81% | ms |
| 3 | **mreact-v0.0.182-local-keyed** | partial update | 42.2 | 2 | 37.1 | +7.65% | ms |
| 4 | svelte-v5.56.4-keyed | partial update | 44.8 | 4.1 | 37.6 | +14.29% | ms |
| 5 | marko-v6.1.24-keyed | partial update | 44.9 | 5.6 | 36.6 | +14.54% | ms |
| 6 | **mreact-react-compat-v0.0.182-local-keyed** | partial update | 46.7 | 7.8 | 35 | +19.13% | ms |
| 7 | vue-v3.6.0-beta.17-keyed | partial update | 48.5 | 6.5 | 38.3 | +23.72% | ms |
| 8 | react-hooks-v19.2.7-keyed | partial update | 49.5 | 10.8 | 35.9 | +26.28% | ms |
| 9 | **mreact-react-compat-vdom-v0.0.182-local-keyed** | partial update | 65.4 | 22.6 | 39.4 | +66.84% | ms |

### select row

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | marko-v6.1.24-keyed | select row | 8.6 | 1.3 | 6 | best | ms |
| 2 | **mreact-v0.0.182-local-keyed** | select row | 9.4 | 1.1 | 6.6 | +9.3% | ms |
| 3 | vue-v3.6.0-beta.17-keyed | select row | 9.6 | 2.4 | 6 | +11.63% | ms |
| 4 | solid-v1.9.14-keyed | select row | 10.9 | 2.2 | 7 | +26.74% | ms |
| 5 | angular-cf-v22.0.0-keyed | select row | 12.2 | 4.3 | 6.8 | +41.86% | ms |
| 6 | svelte-v5.56.4-keyed | select row | 14.2 | 7 | 6.3 | +65.12% | ms |
| 7 | **mreact-react-compat-v0.0.182-local-keyed** | select row | 14.9 | 7 | 6.8 | +73.26% | ms |
| 8 | react-hooks-v19.2.7-keyed | select row | 14.9 | 6.4 | 6.8 | +73.26% | ms |
| 9 | **mreact-react-compat-vdom-v0.0.182-local-keyed** | select row | 18.4 | 8.2 | 7.9 | +113.95% | ms |

### swap rows

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | angular-cf-v22.0.0-keyed | swap rows | 45.7 | 3.3 | 41.7 | best | ms |
| 2 | **mreact-v0.0.182-local-keyed** | swap rows | 45.7 | 2 | 40.3 | 0% | ms |
| 3 | vue-v3.6.0-beta.17-keyed | swap rows | 46.4 | 3 | 39.5 | +1.53% | ms |
| 4 | svelte-v5.56.4-keyed | swap rows | 47.6 | 3.6 | 40.9 | +4.16% | ms |
| 5 | marko-v6.1.24-keyed | swap rows | 48.7 | 4.1 | 40.9 | +6.56% | ms |
| 6 | solid-v1.9.14-keyed | swap rows | 49.1 | 2 | 42.6 | +7.44% | ms |
| 7 | **mreact-react-compat-v0.0.182-local-keyed** | swap rows | 64.7 | 11.5 | 48.8 | +41.58% | ms |
| 8 | **mreact-react-compat-vdom-v0.0.182-local-keyed** | swap rows | 76.4 | 21.1 | 50.6 | +67.18% | ms |
| 9 | react-hooks-v19.2.7-keyed | swap rows | 333.8 | 52.2 | 278.3 | +630.42% | ms |

### remove row

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | angular-cf-v22.0.0-keyed | remove row | 33.7 | 1.6 | 31.4 | best | ms |
| 2 | **mreact-v0.0.182-local-keyed** | remove row | 34.7 | 1 | 32 | +2.97% | ms |
| 3 | svelte-v5.56.4-keyed | remove row | 37.3 | 1.6 | 33.5 | +10.68% | ms |
| 4 | marko-v6.1.24-keyed | remove row | 37.4 | 3.4 | 32 | +10.98% | ms |
| 5 | **mreact-react-compat-v0.0.182-local-keyed** | remove row | 39 | 2.8 | 34.2 | +15.73% | ms |
| 6 | solid-v1.9.14-keyed | remove row | 42.1 | 0.9 | 38.9 | +24.93% | ms |
| 7 | **mreact-react-compat-vdom-v0.0.182-local-keyed** | remove row | 43 | 5.6 | 34.1 | +27.6% | ms |
| 8 | react-hooks-v19.2.7-keyed | remove row | 44.4 | 3 | 38.6 | +31.75% | ms |
| 9 | vue-v3.6.0-beta.17-keyed | remove row | 45 | 5.5 | 37 | +33.53% | ms |

### create many rows

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | marko-v6.1.24-keyed | create many rows | 757.1 | 81.4 | 667.5 | best | ms |
| 2 | **mreact-v0.0.182-local-keyed** | create many rows | 775.2 | 71.7 | 695.4 | +2.39% | ms |
| 3 | solid-v1.9.14-keyed | create many rows | 783.4 | 75.8 | 700.2 | +3.47% | ms |
| 4 | svelte-v5.56.4-keyed | create many rows | 783.8 | 95 | 680.4 | +3.53% | ms |
| 5 | vue-v3.6.0-beta.17-keyed | create many rows | 889.7 | 172.8 | 712.5 | +17.51% | ms |
| 6 | **mreact-react-compat-v0.0.182-local-keyed** | create many rows | 943.7 | 260.5 | 670.2 | +24.65% | ms |
| 7 | angular-cf-v22.0.0-keyed | create many rows | 989.8 | 208.1 | 709.1 | +30.74% | ms |
| 8 | **mreact-react-compat-vdom-v0.0.182-local-keyed** | create many rows | 1003 | 304.4 | 690 | +32.48% | ms |
| 9 | react-hooks-v19.2.7-keyed | create many rows | 1181.3 | 419.7 | 731.1 | +56.03% | ms |

### append rows to large table

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | **mreact-v0.0.182-local-keyed** | append rows to large table | 83.9 | 7.8 | 73.5 | best | ms |
| 2 | marko-v6.1.24-keyed | append rows to large table | 84.8 | 11.7 | 71.2 | +1.07% | ms |
| 3 | solid-v1.9.14-keyed | append rows to large table | 86.7 | 9.3 | 75 | +3.34% | ms |
| 4 | svelte-v5.56.4-keyed | append rows to large table | 87.2 | 11.3 | 73.6 | +3.93% | ms |
| 5 | vue-v3.6.0-beta.17-keyed | append rows to large table | 95.1 | 18.1 | 75 | +13.35% | ms |
| 6 | react-hooks-v19.2.7-keyed | append rows to large table | 97.9 | 23.6 | 71.8 | +16.69% | ms |
| 7 | **mreact-react-compat-v0.0.182-local-keyed** | append rows to large table | 98.9 | 24.2 | 72.1 | +17.88% | ms |
| 8 | angular-cf-v22.0.0-keyed | append rows to large table | 110 | 18.2 | 76.1 | +31.11% | ms |
| 9 | **mreact-react-compat-vdom-v0.0.182-local-keyed** | append rows to large table | 118 | 36.3 | 76.3 | +40.64% | ms |

### clear rows

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | marko-v6.1.24-keyed | clear rows | 28.3 | 23.6 | 2.7 | best | ms |
| 2 | **mreact-v0.0.182-local-keyed** | clear rows | 30.7 | 26.2 | 3.1 | +8.48% | ms |
| 3 | svelte-v5.56.4-keyed | clear rows | 31.5 | 27.5 | 3.4 | +11.31% | ms |
| 4 | solid-v1.9.14-keyed | clear rows | 38.2 | 34.2 | 2.9 | +34.98% | ms |
| 5 | vue-v3.6.0-beta.17-keyed | clear rows | 42.7 | 38.7 | 2.9 | +50.88% | ms |
| 6 | **mreact-react-compat-vdom-v0.0.182-local-keyed** | clear rows | 44.9 | 39.3 | 3.8 | +58.66% | ms |
| 7 | **mreact-react-compat-v0.0.182-local-keyed** | clear rows | 52.5 | 47.3 | 3.1 | +85.51% | ms |
| 8 | react-hooks-v19.2.7-keyed | clear rows | 59.8 | 55 | 3.8 | +111.31% | ms |
| 9 | angular-cf-v22.0.0-keyed | clear rows | 62.8 | 58 | 3.6 | +121.91% | ms |

### ready memory

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | solid-v1.9.14-keyed | ready memory | 1 |  |  | best | MB |
| 2 | marko-v6.1.24-keyed | ready memory | 1.1 |  |  | +1.49% | MB |
| 3 | **mreact-v0.0.182-local-keyed** | ready memory | 1.1 |  |  | +2.26% | MB |
| 4 | svelte-v5.56.4-keyed | ready memory | 1.2 |  |  | +15.93% | MB |
| 5 | vue-v3.6.0-beta.17-keyed | ready memory | 1.4 |  |  | +30.14% | MB |
| 6 | **mreact-react-compat-v0.0.182-local-keyed** | ready memory | 1.4 |  |  | +30.86% | MB |
| 7 | **mreact-react-compat-vdom-v0.0.182-local-keyed** | ready memory | 1.4 |  |  | +33.29% | MB |
| 8 | react-hooks-v19.2.7-keyed | ready memory | 1.6 |  |  | +58.34% | MB |
| 9 | angular-cf-v22.0.0-keyed | ready memory | 2.1 |  |  | +100.84% | MB |

### run memory

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | marko-v6.1.24-keyed | run memory | 2.8 |  |  | best | MB |
| 2 | **mreact-v0.0.182-local-keyed** | run memory | 2.9 |  |  | +1.83% | MB |
| 3 | solid-v1.9.14-keyed | run memory | 3 |  |  | +7.15% | MB |
| 4 | svelte-v5.56.4-keyed | run memory | 3.4 |  |  | +21.11% | MB |
| 5 | vue-v3.6.0-beta.17-keyed | run memory | 4.4 |  |  | +55.65% | MB |
| 6 | react-hooks-v19.2.7-keyed | run memory | 4.8 |  |  | +70.67% | MB |
| 7 | **mreact-react-compat-vdom-v0.0.182-local-keyed** | run memory | 4.9 |  |  | +73.03% | MB |
| 8 | angular-cf-v22.0.0-keyed | run memory | 5 |  |  | +76.26% | MB |
| 9 | **mreact-react-compat-v0.0.182-local-keyed** | run memory | 5.3 |  |  | +88.83% | MB |

### repeated clear memory

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | solid-v1.9.14-keyed | repeated clear memory | 1.2 |  |  | best | MB |
| 2 | **mreact-v0.0.182-local-keyed** | repeated clear memory | 1.3 |  |  | +8.1% | MB |
| 3 | marko-v6.1.24-keyed | repeated clear memory | 1.4 |  |  | +18.02% | MB |
| 4 | svelte-v5.56.4-keyed | repeated clear memory | 1.5 |  |  | +26.86% | MB |
| 5 | vue-v3.6.0-beta.17-keyed | repeated clear memory | 1.7 |  |  | +38.78% | MB |
| 6 | **mreact-react-compat-v0.0.182-local-keyed** | repeated clear memory | 2 |  |  | +63.84% | MB |
| 7 | react-hooks-v19.2.7-keyed | repeated clear memory | 2.5 |  |  | +106.29% | MB |
| 8 | **mreact-react-compat-vdom-v0.0.182-local-keyed** | repeated clear memory | 2.5 |  |  | +108.58% | MB |
| 9 | angular-cf-v22.0.0-keyed | repeated clear memory | 2.6 |  |  | +115.71% | MB |

### total byte weight

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | solid-v1.9.14-keyed | total byte weight | 4.5 |  |  | best | kB |
| 2 | marko-v6.1.24-keyed | total byte weight | 5 |  |  | +11.11% | kB |
| 3 | **mreact-v0.0.182-local-keyed** | total byte weight | 9.9 |  |  | +120% | kB |
| 4 | svelte-v5.56.4-keyed | total byte weight | 14.3 |  |  | +217.78% | kB |
| 5 | vue-v3.6.0-beta.17-keyed | total byte weight | 23.9 |  |  | +431.11% | kB |
| 6 | **mreact-react-compat-vdom-v0.0.182-local-keyed** | total byte weight | 33 |  |  | +633.33% | kB |
| 7 | **mreact-react-compat-v0.0.182-local-keyed** | total byte weight | 35 |  |  | +677.78% | kB |
| 8 | angular-cf-v22.0.0-keyed | total byte weight | 44.5 |  |  | +888.89% | kB |
| 9 | react-hooks-v19.2.7-keyed | total byte weight | 51.4 |  |  | +1042.22% | kB |

## Results

| suite | framework | case | status | metric | unit | value | script | paint | diff vs 1st |
| --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | create rows | completed | duration | ms | 98.5 | 20 | 61.7 | +49.02% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | replace all rows | completed | duration | ms | 111.5 | 32.1 | 65.3 | +47.1% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | partial update | completed | duration | ms | 39.2 | 3.1 | 34.1 | best |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | select row | completed | duration | ms | 12.2 | 4.3 | 6.8 | +41.86% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | swap rows | completed | duration | ms | 45.7 | 3.3 | 41.7 | best |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | remove row | completed | duration | ms | 33.7 | 1.6 | 31.4 | best |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | create many rows | completed | duration | ms | 989.8 | 208.1 | 709.1 | +30.74% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | append rows to large table | completed | duration | ms | 110 | 18.2 | 76.1 | +31.11% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | clear rows | completed | duration | ms | 62.8 | 58 | 3.6 | +121.91% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | ready memory | completed | memory | MB | 2.1 |  |  | +100.84% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | run memory | completed | memory | MB | 5 |  |  | +76.26% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | repeated clear memory | completed | memory | MB | 2.6 |  |  | +115.71% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | total byte weight | completed | size | kB | 44.5 |  |  | +888.89% |
| js-framework-benchmark | marko-v6.1.24-keyed | create rows | completed | duration | ms | 67.5 | 7.2 | 59 | +2.12% |
| js-framework-benchmark | marko-v6.1.24-keyed | replace all rows | completed | duration | ms | 78.8 | 14.9 | 62.8 | +3.96% |
| js-framework-benchmark | marko-v6.1.24-keyed | partial update | completed | duration | ms | 44.9 | 5.6 | 36.6 | +14.54% |
| js-framework-benchmark | marko-v6.1.24-keyed | select row | completed | duration | ms | 8.6 | 1.3 | 6 | best |
| js-framework-benchmark | marko-v6.1.24-keyed | swap rows | completed | duration | ms | 48.7 | 4.1 | 40.9 | +6.56% |
| js-framework-benchmark | marko-v6.1.24-keyed | remove row | completed | duration | ms | 37.4 | 3.4 | 32 | +10.98% |
| js-framework-benchmark | marko-v6.1.24-keyed | create many rows | completed | duration | ms | 757.1 | 81.4 | 667.5 | best |
| js-framework-benchmark | marko-v6.1.24-keyed | append rows to large table | completed | duration | ms | 84.8 | 11.7 | 71.2 | +1.07% |
| js-framework-benchmark | marko-v6.1.24-keyed | clear rows | completed | duration | ms | 28.3 | 23.6 | 2.7 | best |
| js-framework-benchmark | marko-v6.1.24-keyed | ready memory | completed | memory | MB | 1.1 |  |  | +1.49% |
| js-framework-benchmark | marko-v6.1.24-keyed | run memory | completed | memory | MB | 2.8 |  |  | best |
| js-framework-benchmark | marko-v6.1.24-keyed | repeated clear memory | completed | memory | MB | 1.4 |  |  | +18.02% |
| js-framework-benchmark | marko-v6.1.24-keyed | total byte weight | completed | size | kB | 5 |  |  | +11.11% |
| js-framework-benchmark | **mreact-react-compat-v0.0.182-local-keyed** | create rows | completed | duration | ms | 87.5 | 26.7 | 61.5 | +32.38% |
| js-framework-benchmark | **mreact-react-compat-v0.0.182-local-keyed** | replace all rows | completed | duration | ms | 94.7 | 27.2 | 65.5 | +24.93% |
| js-framework-benchmark | **mreact-react-compat-v0.0.182-local-keyed** | partial update | completed | duration | ms | 46.7 | 7.8 | 35 | +19.13% |
| js-framework-benchmark | **mreact-react-compat-v0.0.182-local-keyed** | select row | completed | duration | ms | 14.9 | 7 | 6.8 | +73.26% |
| js-framework-benchmark | **mreact-react-compat-v0.0.182-local-keyed** | swap rows | completed | duration | ms | 64.7 | 11.5 | 48.8 | +41.58% |
| js-framework-benchmark | **mreact-react-compat-v0.0.182-local-keyed** | remove row | completed | duration | ms | 39 | 2.8 | 34.2 | +15.73% |
| js-framework-benchmark | **mreact-react-compat-v0.0.182-local-keyed** | create many rows | completed | duration | ms | 943.7 | 260.5 | 670.2 | +24.65% |
| js-framework-benchmark | **mreact-react-compat-v0.0.182-local-keyed** | append rows to large table | completed | duration | ms | 98.9 | 24.2 | 72.1 | +17.88% |
| js-framework-benchmark | **mreact-react-compat-v0.0.182-local-keyed** | clear rows | completed | duration | ms | 52.5 | 47.3 | 3.1 | +85.51% |
| js-framework-benchmark | **mreact-react-compat-v0.0.182-local-keyed** | ready memory | completed | memory | MB | 1.4 |  |  | +30.86% |
| js-framework-benchmark | **mreact-react-compat-v0.0.182-local-keyed** | run memory | completed | memory | MB | 5.3 |  |  | +88.83% |
| js-framework-benchmark | **mreact-react-compat-v0.0.182-local-keyed** | repeated clear memory | completed | memory | MB | 2 |  |  | +63.84% |
| js-framework-benchmark | **mreact-react-compat-v0.0.182-local-keyed** | total byte weight | completed | size | kB | 35 |  |  | +677.78% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.182-local-keyed** | create rows | completed | duration | ms | 95.1 | 33.4 | 60.2 | +43.87% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.182-local-keyed** | replace all rows | completed | duration | ms | 108.7 | 43.4 | 64.7 | +43.4% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.182-local-keyed** | partial update | completed | duration | ms | 65.4 | 22.6 | 39.4 | +66.84% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.182-local-keyed** | select row | completed | duration | ms | 18.4 | 8.2 | 7.9 | +113.95% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.182-local-keyed** | swap rows | completed | duration | ms | 76.4 | 21.1 | 50.6 | +67.18% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.182-local-keyed** | remove row | completed | duration | ms | 43 | 5.6 | 34.1 | +27.6% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.182-local-keyed** | create many rows | completed | duration | ms | 1003 | 304.4 | 690 | +32.48% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.182-local-keyed** | append rows to large table | completed | duration | ms | 118 | 36.3 | 76.3 | +40.64% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.182-local-keyed** | clear rows | completed | duration | ms | 44.9 | 39.3 | 3.8 | +58.66% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.182-local-keyed** | ready memory | completed | memory | MB | 1.4 |  |  | +33.29% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.182-local-keyed** | run memory | completed | memory | MB | 4.9 |  |  | +73.03% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.182-local-keyed** | repeated clear memory | completed | memory | MB | 2.5 |  |  | +108.58% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.182-local-keyed** | total byte weight | completed | size | kB | 33 |  |  | +633.33% |
| js-framework-benchmark | **mreact-v0.0.182-local-keyed** | create rows | completed | duration | ms | 66.1 | 6.1 | 58.8 | best |
| js-framework-benchmark | **mreact-v0.0.182-local-keyed** | replace all rows | completed | duration | ms | 80.6 | 14.2 | 64 | +6.33% |
| js-framework-benchmark | **mreact-v0.0.182-local-keyed** | partial update | completed | duration | ms | 42.2 | 2 | 37.1 | +7.65% |
| js-framework-benchmark | **mreact-v0.0.182-local-keyed** | select row | completed | duration | ms | 9.4 | 1.1 | 6.6 | +9.3% |
| js-framework-benchmark | **mreact-v0.0.182-local-keyed** | swap rows | completed | duration | ms | 45.7 | 2 | 40.3 | 0% |
| js-framework-benchmark | **mreact-v0.0.182-local-keyed** | remove row | completed | duration | ms | 34.7 | 1 | 32 | +2.97% |
| js-framework-benchmark | **mreact-v0.0.182-local-keyed** | create many rows | completed | duration | ms | 775.2 | 71.7 | 695.4 | +2.39% |
| js-framework-benchmark | **mreact-v0.0.182-local-keyed** | append rows to large table | completed | duration | ms | 83.9 | 7.8 | 73.5 | best |
| js-framework-benchmark | **mreact-v0.0.182-local-keyed** | clear rows | completed | duration | ms | 30.7 | 26.2 | 3.1 | +8.48% |
| js-framework-benchmark | **mreact-v0.0.182-local-keyed** | ready memory | completed | memory | MB | 1.1 |  |  | +2.26% |
| js-framework-benchmark | **mreact-v0.0.182-local-keyed** | run memory | completed | memory | MB | 2.9 |  |  | +1.83% |
| js-framework-benchmark | **mreact-v0.0.182-local-keyed** | repeated clear memory | completed | memory | MB | 1.3 |  |  | +8.1% |
| js-framework-benchmark | **mreact-v0.0.182-local-keyed** | total byte weight | completed | size | kB | 9.9 |  |  | +120% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | create rows | completed | duration | ms | 83.3 | 22.5 | 59.9 | +26.02% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | replace all rows | completed | duration | ms | 104.2 | 35.9 | 67.3 | +37.47% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | partial update | completed | duration | ms | 49.5 | 10.8 | 35.9 | +26.28% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | select row | completed | duration | ms | 14.9 | 6.4 | 6.8 | +73.26% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | swap rows | completed | duration | ms | 333.8 | 52.2 | 278.3 | +630.42% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | remove row | completed | duration | ms | 44.4 | 3 | 38.6 | +31.75% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | create many rows | completed | duration | ms | 1181.3 | 419.7 | 731.1 | +56.03% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | append rows to large table | completed | duration | ms | 97.9 | 23.6 | 71.8 | +16.69% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | clear rows | completed | duration | ms | 59.8 | 55 | 3.8 | +111.31% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | ready memory | completed | memory | MB | 1.6 |  |  | +58.34% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | run memory | completed | memory | MB | 4.8 |  |  | +70.67% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | repeated clear memory | completed | memory | MB | 2.5 |  |  | +106.29% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | total byte weight | completed | size | kB | 51.4 |  |  | +1042.22% |
| js-framework-benchmark | solid-v1.9.14-keyed | create rows | completed | duration | ms | 67 | 7.2 | 58.6 | +1.36% |
| js-framework-benchmark | solid-v1.9.14-keyed | replace all rows | completed | duration | ms | 75.8 | 14.8 | 59.9 | best |
| js-framework-benchmark | solid-v1.9.14-keyed | partial update | completed | duration | ms | 40.3 | 2.7 | 33.9 | +2.81% |
| js-framework-benchmark | solid-v1.9.14-keyed | select row | completed | duration | ms | 10.9 | 2.2 | 7 | +26.74% |
| js-framework-benchmark | solid-v1.9.14-keyed | swap rows | completed | duration | ms | 49.1 | 2 | 42.6 | +7.44% |
| js-framework-benchmark | solid-v1.9.14-keyed | remove row | completed | duration | ms | 42.1 | 0.9 | 38.9 | +24.93% |
| js-framework-benchmark | solid-v1.9.14-keyed | create many rows | completed | duration | ms | 783.4 | 75.8 | 700.2 | +3.47% |
| js-framework-benchmark | solid-v1.9.14-keyed | append rows to large table | completed | duration | ms | 86.7 | 9.3 | 75 | +3.34% |
| js-framework-benchmark | solid-v1.9.14-keyed | clear rows | completed | duration | ms | 38.2 | 34.2 | 2.9 | +34.98% |
| js-framework-benchmark | solid-v1.9.14-keyed | ready memory | completed | memory | MB | 1 |  |  | best |
| js-framework-benchmark | solid-v1.9.14-keyed | run memory | completed | memory | MB | 3 |  |  | +7.15% |
| js-framework-benchmark | solid-v1.9.14-keyed | repeated clear memory | completed | memory | MB | 1.2 |  |  | best |
| js-framework-benchmark | solid-v1.9.14-keyed | total byte weight | completed | size | kB | 4.5 |  |  | best |
| js-framework-benchmark | svelte-v5.56.4-keyed | create rows | completed | duration | ms | 70.8 | 10.2 | 58.9 | +7.11% |
| js-framework-benchmark | svelte-v5.56.4-keyed | replace all rows | completed | duration | ms | 80.1 | 18.4 | 60.2 | +5.67% |
| js-framework-benchmark | svelte-v5.56.4-keyed | partial update | completed | duration | ms | 44.8 | 4.1 | 37.6 | +14.29% |
| js-framework-benchmark | svelte-v5.56.4-keyed | select row | completed | duration | ms | 14.2 | 7 | 6.3 | +65.12% |
| js-framework-benchmark | svelte-v5.56.4-keyed | swap rows | completed | duration | ms | 47.6 | 3.6 | 40.9 | +4.16% |
| js-framework-benchmark | svelte-v5.56.4-keyed | remove row | completed | duration | ms | 37.3 | 1.6 | 33.5 | +10.68% |
| js-framework-benchmark | svelte-v5.56.4-keyed | create many rows | completed | duration | ms | 783.8 | 95 | 680.4 | +3.53% |
| js-framework-benchmark | svelte-v5.56.4-keyed | append rows to large table | completed | duration | ms | 87.2 | 11.3 | 73.6 | +3.93% |
| js-framework-benchmark | svelte-v5.56.4-keyed | clear rows | completed | duration | ms | 31.5 | 27.5 | 3.4 | +11.31% |
| js-framework-benchmark | svelte-v5.56.4-keyed | ready memory | completed | memory | MB | 1.2 |  |  | +15.93% |
| js-framework-benchmark | svelte-v5.56.4-keyed | run memory | completed | memory | MB | 3.4 |  |  | +21.11% |
| js-framework-benchmark | svelte-v5.56.4-keyed | repeated clear memory | completed | memory | MB | 1.5 |  |  | +26.86% |
| js-framework-benchmark | svelte-v5.56.4-keyed | total byte weight | completed | size | kB | 14.3 |  |  | +217.78% |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | create rows | completed | duration | ms | 83.9 | 21.5 | 61 | +26.93% |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | replace all rows | completed | duration | ms | 91.6 | 27 | 62.6 | +20.84% |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | partial update | completed | duration | ms | 48.5 | 6.5 | 38.3 | +23.72% |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | select row | completed | duration | ms | 9.6 | 2.4 | 6 | +11.63% |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | swap rows | completed | duration | ms | 46.4 | 3 | 39.5 | +1.53% |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | remove row | completed | duration | ms | 45 | 5.5 | 37 | +33.53% |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | create many rows | completed | duration | ms | 889.7 | 172.8 | 712.5 | +17.51% |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | append rows to large table | completed | duration | ms | 95.1 | 18.1 | 75 | +13.35% |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | clear rows | completed | duration | ms | 42.7 | 38.7 | 2.9 | +50.88% |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | ready memory | completed | memory | MB | 1.4 |  |  | +30.14% |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | run memory | completed | memory | MB | 4.4 |  |  | +55.65% |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | repeated clear memory | completed | memory | MB | 1.7 |  |  | +38.78% |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | total byte weight | completed | size | kB | 23.9 |  |  | +431.11% |
