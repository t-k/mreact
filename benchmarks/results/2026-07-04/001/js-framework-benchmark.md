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

Raw JSON files are stored in `benchmarks/results/2026-07-04/001/js-framework-benchmark-results`.
Chrome trace files are stored in `benchmarks/results/2026-07-04/001/js-framework-benchmark-traces`.

## Rankings

Lower values are better for all js-framework-benchmark metrics reported here.

### create rows

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | **mreact-v0.0.184-local-keyed** | create rows | 70.6 | 6.5 | 62.9 | best | ms |
| 2 | solid-v1.9.14-keyed | create rows | 70.6 | 7.5 | 62 | 0% | ms |
| 3 | marko-v6.2.2-keyed | create rows | 71.7 | 7.6 | 62.9 | +1.56% | ms |
| 4 | svelte-v5.56.4-keyed | create rows | 74.1 | 10.4 | 62.1 | +4.96% | ms |
| 5 | vue-v3.6.0-beta.17-keyed | create rows | 86.6 | 21.2 | 64.3 | +22.66% | ms |
| 6 | react-hooks-v19.2.7-keyed | create rows | 86.9 | 22.5 | 63.2 | +23.09% | ms |
| 7 | **mreact-react-compat-v0.0.184-local-keyed** | create rows | 88 | 22.9 | 64 | +24.65% | ms |
| 8 | **mreact-react-compat-vdom-v0.0.184-local-keyed** | create rows | 97.7 | 33.1 | 63.3 | +38.39% | ms |
| 9 | angular-cf-v22.0.0-keyed | create rows | 102.5 | 19.7 | 64.9 | +45.18% | ms |

### replace all rows

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | solid-v1.9.14-keyed | replace all rows | 77 | 14.6 | 61.4 | best | ms |
| 2 | marko-v6.2.2-keyed | replace all rows | 79.5 | 14.9 | 63.4 | +3.25% | ms |
| 3 | **mreact-v0.0.184-local-keyed** | replace all rows | 80.6 | 16.2 | 64.4 | +4.68% | ms |
| 4 | svelte-v5.56.4-keyed | replace all rows | 83 | 18.3 | 62.6 | +7.79% | ms |
| 5 | **mreact-react-compat-v0.0.184-local-keyed** | replace all rows | 87.8 | 25 | 62 | +14.03% | ms |
| 6 | vue-v3.6.0-beta.17-keyed | replace all rows | 93.4 | 27.9 | 64.6 | +21.3% | ms |
| 7 | react-hooks-v19.2.7-keyed | replace all rows | 102.5 | 35.1 | 66.3 | +33.12% | ms |
| 8 | **mreact-react-compat-vdom-v0.0.184-local-keyed** | replace all rows | 104.9 | 39.5 | 63.8 | +36.23% | ms |
| 9 | angular-cf-v22.0.0-keyed | replace all rows | 120.6 | 34 | 69.8 | +56.62% | ms |

### partial update

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | angular-cf-v22.0.0-keyed | partial update | 39.2 | 3 | 35 | best | ms |
| 2 | **mreact-v0.0.184-local-keyed** | partial update | 41.8 | 1.9 | 36.7 | +6.63% | ms |
| 3 | marko-v6.2.2-keyed | partial update | 43.4 | 3.8 | 36.5 | +10.71% | ms |
| 4 | solid-v1.9.14-keyed | partial update | 44.5 | 3.1 | 37.6 | +13.52% | ms |
| 5 | **mreact-react-compat-v0.0.184-local-keyed** | partial update | 50.1 | 8.7 | 38.4 | +27.81% | ms |
| 6 | vue-v3.6.0-beta.17-keyed | partial update | 50.3 | 6.6 | 38.9 | +28.32% | ms |
| 7 | svelte-v5.56.4-keyed | partial update | 51.4 | 4.2 | 43.7 | +31.12% | ms |
| 8 | react-hooks-v19.2.7-keyed | partial update | 53.8 | 10.5 | 40.2 | +37.24% | ms |
| 9 | **mreact-react-compat-vdom-v0.0.184-local-keyed** | partial update | 63.2 | 22 | 36.7 | +61.22% | ms |

### select row

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | marko-v6.2.2-keyed | select row | 9 | 1.1 | 6.4 | best | ms |
| 2 | solid-v1.9.14-keyed | select row | 9.3 | 1.7 | 6.1 | +3.33% | ms |
| 3 | **mreact-v0.0.184-local-keyed** | select row | 9.4 | 1.1 | 6.8 | +4.44% | ms |
| 4 | vue-v3.6.0-beta.17-keyed | select row | 10 | 2.4 | 6.6 | +11.11% | ms |
| 5 | react-hooks-v19.2.7-keyed | select row | 13.4 | 6 | 6.3 | +48.89% | ms |
| 6 | angular-cf-v22.0.0-keyed | select row | 13.5 | 4.2 | 7.8 | +50% | ms |
| 7 | **mreact-react-compat-v0.0.184-local-keyed** | select row | 14.1 | 6.1 | 6.4 | +56.67% | ms |
| 8 | **mreact-react-compat-vdom-v0.0.184-local-keyed** | select row | 14.7 | 6.9 | 6.5 | +63.33% | ms |
| 9 | svelte-v5.56.4-keyed | select row | 15 | 6.8 | 7 | +66.67% | ms |

### swap rows

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | angular-cf-v22.0.0-keyed | swap rows | 49.9 | 2.7 | 44.7 | best | ms |
| 2 | solid-v1.9.14-keyed | swap rows | 50.5 | 2.1 | 44.7 | +1.2% | ms |
| 3 | vue-v3.6.0-beta.17-keyed | swap rows | 51.3 | 2.9 | 45 | +2.81% | ms |
| 4 | svelte-v5.56.4-keyed | swap rows | 51.8 | 3.7 | 44.1 | +3.81% | ms |
| 5 | marko-v6.2.2-keyed | swap rows | 55.6 | 2.7 | 49.2 | +11.42% | ms |
| 6 | **mreact-v0.0.184-local-keyed** | swap rows | 61.8 | 2.1 | 55.3 | +23.85% | ms |
| 7 | **mreact-react-compat-vdom-v0.0.184-local-keyed** | swap rows | 70.8 | 18.7 | 48.1 | +41.88% | ms |
| 8 | **mreact-react-compat-v0.0.184-local-keyed** | swap rows | 72.1 | 11.8 | 55.1 | +44.49% | ms |
| 9 | react-hooks-v19.2.7-keyed | swap rows | 339.2 | 52.3 | 279.5 | +579.76% | ms |

### remove row

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | angular-cf-v22.0.0-keyed | remove row | 34.4 | 1.7 | 32 | best | ms |
| 2 | **mreact-v0.0.184-local-keyed** | remove row | 35.1 | 1 | 32.3 | +2.03% | ms |
| 3 | marko-v6.2.2-keyed | remove row | 35.4 | 1.1 | 32.2 | +2.91% | ms |
| 4 | solid-v1.9.14-keyed | remove row | 35.7 | 0.9 | 32.8 | +3.78% | ms |
| 5 | svelte-v5.56.4-keyed | remove row | 37.7 | 1.6 | 34.6 | +9.59% | ms |
| 6 | **mreact-react-compat-v0.0.184-local-keyed** | remove row | 37.9 | 3.4 | 32.7 | +10.17% | ms |
| 7 | react-hooks-v19.2.7-keyed | remove row | 38.3 | 2.7 | 33.3 | +11.34% | ms |
| 8 | **mreact-react-compat-vdom-v0.0.184-local-keyed** | remove row | 41 | 5 | 33.2 | +19.19% | ms |
| 9 | vue-v3.6.0-beta.17-keyed | remove row | 41.6 | 5.4 | 34.1 | +20.93% | ms |

### create many rows

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | marko-v6.2.2-keyed | create many rows | 792.3 | 82.5 | 701.4 | best | ms |
| 2 | **mreact-v0.0.184-local-keyed** | create many rows | 793.9 | 71.4 | 712.1 | +0.2% | ms |
| 3 | solid-v1.9.14-keyed | create many rows | 815 | 76 | 729.7 | +2.87% | ms |
| 4 | svelte-v5.56.4-keyed | create many rows | 835.3 | 100.3 | 725.7 | +5.43% | ms |
| 5 | vue-v3.6.0-beta.17-keyed | create many rows | 934 | 176.9 | 747.9 | +17.88% | ms |
| 6 | **mreact-react-compat-v0.0.184-local-keyed** | create many rows | 944.9 | 189.3 | 745.4 | +19.26% | ms |
| 7 | angular-cf-v22.0.0-keyed | create many rows | 1035.6 | 200.8 | 745.3 | +30.71% | ms |
| 8 | **mreact-react-compat-vdom-v0.0.184-local-keyed** | create many rows | 1041.2 | 301.7 | 740.4 | +31.41% | ms |
| 9 | react-hooks-v19.2.7-keyed | create many rows | 1220.8 | 432.4 | 776.5 | +54.08% | ms |

### append rows to large table

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | solid-v1.9.14-keyed | append rows to large table | 83.6 | 8.6 | 73 | best | ms |
| 2 | marko-v6.2.2-keyed | append rows to large table | 85 | 9.2 | 73.9 | +1.67% | ms |
| 3 | svelte-v5.56.4-keyed | append rows to large table | 85.7 | 11 | 73.5 | +2.51% | ms |
| 4 | **mreact-v0.0.184-local-keyed** | append rows to large table | 87.8 | 8.2 | 77.7 | +5.02% | ms |
| 5 | vue-v3.6.0-beta.17-keyed | append rows to large table | 91.7 | 17.5 | 73 | +9.69% | ms |
| 6 | react-hooks-v19.2.7-keyed | append rows to large table | 97.9 | 23.5 | 72.5 | +17.11% | ms |
| 7 | angular-cf-v22.0.0-keyed | append rows to large table | 104.7 | 16.9 | 72.9 | +25.24% | ms |
| 8 | **mreact-react-compat-v0.0.184-local-keyed** | append rows to large table | 106.6 | 23.2 | 81.3 | +27.51% | ms |
| 9 | **mreact-react-compat-vdom-v0.0.184-local-keyed** | append rows to large table | 109.2 | 34.1 | 73.1 | +30.62% | ms |

### clear rows

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | marko-v6.2.2-keyed | clear rows | 30.5 | 25.5 | 3.3 | best | ms |
| 2 | **mreact-v0.0.184-local-keyed** | clear rows | 32.3 | 27.2 | 3.8 | +5.9% | ms |
| 3 | svelte-v5.56.4-keyed | clear rows | 33.9 | 29.5 | 3.5 | +11.15% | ms |
| 4 | solid-v1.9.14-keyed | clear rows | 36.9 | 32.5 | 3.2 | +20.98% | ms |
| 5 | **mreact-react-compat-vdom-v0.0.184-local-keyed** | clear rows | 44 | 39.7 | 3.2 | +44.26% | ms |
| 6 | vue-v3.6.0-beta.17-keyed | clear rows | 44.5 | 40.4 | 3 | +45.9% | ms |
| 7 | **mreact-react-compat-v0.0.184-local-keyed** | clear rows | 55.1 | 49.6 | 3.5 | +80.66% | ms |
| 8 | react-hooks-v19.2.7-keyed | clear rows | 58 | 53.1 | 3.2 | +90.16% | ms |
| 9 | angular-cf-v22.0.0-keyed | clear rows | 63.7 | 58.8 | 3.5 | +108.85% | ms |

### ready memory

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | solid-v1.9.14-keyed | ready memory | 1 |  |  | best | MB |
| 2 | marko-v6.2.2-keyed | ready memory | 1 |  |  | +1.83% | MB |
| 3 | **mreact-v0.0.184-local-keyed** | ready memory | 1.1 |  |  | +7.47% | MB |
| 4 | svelte-v5.56.4-keyed | ready memory | 1.2 |  |  | +18.09% | MB |
| 5 | **mreact-react-compat-vdom-v0.0.184-local-keyed** | ready memory | 1.3 |  |  | +29.56% | MB |
| 6 | vue-v3.6.0-beta.17-keyed | ready memory | 1.3 |  |  | +32.28% | MB |
| 7 | **mreact-react-compat-v0.0.184-local-keyed** | ready memory | 1.4 |  |  | +32.8% | MB |
| 8 | react-hooks-v19.2.7-keyed | ready memory | 1.7 |  |  | +62.56% | MB |
| 9 | angular-cf-v22.0.0-keyed | ready memory | 2 |  |  | +97.18% | MB |

### run memory

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | marko-v6.2.2-keyed | run memory | 2.8 |  |  | best | MB |
| 2 | **mreact-v0.0.184-local-keyed** | run memory | 2.9 |  |  | +1.73% | MB |
| 3 | solid-v1.9.14-keyed | run memory | 3.1 |  |  | +9.6% | MB |
| 4 | svelte-v5.56.4-keyed | run memory | 3.4 |  |  | +20.84% | MB |
| 5 | vue-v3.6.0-beta.17-keyed | run memory | 4.4 |  |  | +55.51% | MB |
| 6 | **mreact-react-compat-vdom-v0.0.184-local-keyed** | run memory | 4.9 |  |  | +71.44% | MB |
| 7 | react-hooks-v19.2.7-keyed | run memory | 4.9 |  |  | +71.55% | MB |
| 8 | **mreact-react-compat-v0.0.184-local-keyed** | run memory | 5 |  |  | +74.49% | MB |
| 9 | angular-cf-v22.0.0-keyed | run memory | 5 |  |  | +74.56% | MB |

### repeated clear memory

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | solid-v1.9.14-keyed | repeated clear memory | 1.2 |  |  | best | MB |
| 2 | marko-v6.2.2-keyed | repeated clear memory | 1.4 |  |  | +16.59% | MB |
| 3 | **mreact-v0.0.184-local-keyed** | repeated clear memory | 1.4 |  |  | +17.79% | MB |
| 4 | svelte-v5.56.4-keyed | repeated clear memory | 1.6 |  |  | +34.54% | MB |
| 5 | vue-v3.6.0-beta.17-keyed | repeated clear memory | 1.7 |  |  | +46.12% | MB |
| 6 | **mreact-react-compat-v0.0.184-local-keyed** | repeated clear memory | 1.8 |  |  | +58.7% | MB |
| 7 | react-hooks-v19.2.7-keyed | repeated clear memory | 2.4 |  |  | +109.19% | MB |
| 8 | **mreact-react-compat-vdom-v0.0.184-local-keyed** | repeated clear memory | 2.5 |  |  | +111.75% | MB |
| 9 | angular-cf-v22.0.0-keyed | repeated clear memory | 2.6 |  |  | +121.2% | MB |

### total byte weight

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | solid-v1.9.14-keyed | total byte weight | 4.5 |  |  | best | kB |
| 2 | marko-v6.2.2-keyed | total byte weight | 5 |  |  | +11.11% | kB |
| 3 | **mreact-v0.0.184-local-keyed** | total byte weight | 10 |  |  | +122.22% | kB |
| 4 | svelte-v5.56.4-keyed | total byte weight | 14.3 |  |  | +217.78% | kB |
| 5 | vue-v3.6.0-beta.17-keyed | total byte weight | 23.9 |  |  | +431.11% | kB |
| 6 | **mreact-react-compat-vdom-v0.0.184-local-keyed** | total byte weight | 28.8 |  |  | +540% | kB |
| 7 | **mreact-react-compat-v0.0.184-local-keyed** | total byte weight | 30.7 |  |  | +582.22% | kB |
| 8 | angular-cf-v22.0.0-keyed | total byte weight | 44.5 |  |  | +888.89% | kB |
| 9 | react-hooks-v19.2.7-keyed | total byte weight | 51.4 |  |  | +1042.22% | kB |

## Results

| suite | framework | case | status | metric | unit | value | script | paint | diff vs 1st |
| --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | create rows | completed | duration | ms | 102.5 | 19.7 | 64.9 | +45.18% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | replace all rows | completed | duration | ms | 120.6 | 34 | 69.8 | +56.62% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | partial update | completed | duration | ms | 39.2 | 3 | 35 | best |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | select row | completed | duration | ms | 13.5 | 4.2 | 7.8 | +50% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | swap rows | completed | duration | ms | 49.9 | 2.7 | 44.7 | best |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | remove row | completed | duration | ms | 34.4 | 1.7 | 32 | best |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | create many rows | completed | duration | ms | 1035.6 | 200.8 | 745.3 | +30.71% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | append rows to large table | completed | duration | ms | 104.7 | 16.9 | 72.9 | +25.24% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | clear rows | completed | duration | ms | 63.7 | 58.8 | 3.5 | +108.85% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | ready memory | completed | memory | MB | 2 |  |  | +97.18% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | run memory | completed | memory | MB | 5 |  |  | +74.56% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | repeated clear memory | completed | memory | MB | 2.6 |  |  | +121.2% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | total byte weight | completed | size | kB | 44.5 |  |  | +888.89% |
| js-framework-benchmark | marko-v6.2.2-keyed | create rows | completed | duration | ms | 71.7 | 7.6 | 62.9 | +1.56% |
| js-framework-benchmark | marko-v6.2.2-keyed | replace all rows | completed | duration | ms | 79.5 | 14.9 | 63.4 | +3.25% |
| js-framework-benchmark | marko-v6.2.2-keyed | partial update | completed | duration | ms | 43.4 | 3.8 | 36.5 | +10.71% |
| js-framework-benchmark | marko-v6.2.2-keyed | select row | completed | duration | ms | 9 | 1.1 | 6.4 | best |
| js-framework-benchmark | marko-v6.2.2-keyed | swap rows | completed | duration | ms | 55.6 | 2.7 | 49.2 | +11.42% |
| js-framework-benchmark | marko-v6.2.2-keyed | remove row | completed | duration | ms | 35.4 | 1.1 | 32.2 | +2.91% |
| js-framework-benchmark | marko-v6.2.2-keyed | create many rows | completed | duration | ms | 792.3 | 82.5 | 701.4 | best |
| js-framework-benchmark | marko-v6.2.2-keyed | append rows to large table | completed | duration | ms | 85 | 9.2 | 73.9 | +1.67% |
| js-framework-benchmark | marko-v6.2.2-keyed | clear rows | completed | duration | ms | 30.5 | 25.5 | 3.3 | best |
| js-framework-benchmark | marko-v6.2.2-keyed | ready memory | completed | memory | MB | 1 |  |  | +1.83% |
| js-framework-benchmark | marko-v6.2.2-keyed | run memory | completed | memory | MB | 2.8 |  |  | best |
| js-framework-benchmark | marko-v6.2.2-keyed | repeated clear memory | completed | memory | MB | 1.4 |  |  | +16.59% |
| js-framework-benchmark | marko-v6.2.2-keyed | total byte weight | completed | size | kB | 5 |  |  | +11.11% |
| js-framework-benchmark | **mreact-react-compat-v0.0.184-local-keyed** | create rows | completed | duration | ms | 88 | 22.9 | 64 | +24.65% |
| js-framework-benchmark | **mreact-react-compat-v0.0.184-local-keyed** | replace all rows | completed | duration | ms | 87.8 | 25 | 62 | +14.03% |
| js-framework-benchmark | **mreact-react-compat-v0.0.184-local-keyed** | partial update | completed | duration | ms | 50.1 | 8.7 | 38.4 | +27.81% |
| js-framework-benchmark | **mreact-react-compat-v0.0.184-local-keyed** | select row | completed | duration | ms | 14.1 | 6.1 | 6.4 | +56.67% |
| js-framework-benchmark | **mreact-react-compat-v0.0.184-local-keyed** | swap rows | completed | duration | ms | 72.1 | 11.8 | 55.1 | +44.49% |
| js-framework-benchmark | **mreact-react-compat-v0.0.184-local-keyed** | remove row | completed | duration | ms | 37.9 | 3.4 | 32.7 | +10.17% |
| js-framework-benchmark | **mreact-react-compat-v0.0.184-local-keyed** | create many rows | completed | duration | ms | 944.9 | 189.3 | 745.4 | +19.26% |
| js-framework-benchmark | **mreact-react-compat-v0.0.184-local-keyed** | append rows to large table | completed | duration | ms | 106.6 | 23.2 | 81.3 | +27.51% |
| js-framework-benchmark | **mreact-react-compat-v0.0.184-local-keyed** | clear rows | completed | duration | ms | 55.1 | 49.6 | 3.5 | +80.66% |
| js-framework-benchmark | **mreact-react-compat-v0.0.184-local-keyed** | ready memory | completed | memory | MB | 1.4 |  |  | +32.8% |
| js-framework-benchmark | **mreact-react-compat-v0.0.184-local-keyed** | run memory | completed | memory | MB | 5 |  |  | +74.49% |
| js-framework-benchmark | **mreact-react-compat-v0.0.184-local-keyed** | repeated clear memory | completed | memory | MB | 1.8 |  |  | +58.7% |
| js-framework-benchmark | **mreact-react-compat-v0.0.184-local-keyed** | total byte weight | completed | size | kB | 30.7 |  |  | +582.22% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.184-local-keyed** | create rows | completed | duration | ms | 97.7 | 33.1 | 63.3 | +38.39% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.184-local-keyed** | replace all rows | completed | duration | ms | 104.9 | 39.5 | 63.8 | +36.23% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.184-local-keyed** | partial update | completed | duration | ms | 63.2 | 22 | 36.7 | +61.22% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.184-local-keyed** | select row | completed | duration | ms | 14.7 | 6.9 | 6.5 | +63.33% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.184-local-keyed** | swap rows | completed | duration | ms | 70.8 | 18.7 | 48.1 | +41.88% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.184-local-keyed** | remove row | completed | duration | ms | 41 | 5 | 33.2 | +19.19% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.184-local-keyed** | create many rows | completed | duration | ms | 1041.2 | 301.7 | 740.4 | +31.41% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.184-local-keyed** | append rows to large table | completed | duration | ms | 109.2 | 34.1 | 73.1 | +30.62% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.184-local-keyed** | clear rows | completed | duration | ms | 44 | 39.7 | 3.2 | +44.26% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.184-local-keyed** | ready memory | completed | memory | MB | 1.3 |  |  | +29.56% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.184-local-keyed** | run memory | completed | memory | MB | 4.9 |  |  | +71.44% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.184-local-keyed** | repeated clear memory | completed | memory | MB | 2.5 |  |  | +111.75% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.184-local-keyed** | total byte weight | completed | size | kB | 28.8 |  |  | +540% |
| js-framework-benchmark | **mreact-v0.0.184-local-keyed** | create rows | completed | duration | ms | 70.6 | 6.5 | 62.9 | best |
| js-framework-benchmark | **mreact-v0.0.184-local-keyed** | replace all rows | completed | duration | ms | 80.6 | 16.2 | 64.4 | +4.68% |
| js-framework-benchmark | **mreact-v0.0.184-local-keyed** | partial update | completed | duration | ms | 41.8 | 1.9 | 36.7 | +6.63% |
| js-framework-benchmark | **mreact-v0.0.184-local-keyed** | select row | completed | duration | ms | 9.4 | 1.1 | 6.8 | +4.44% |
| js-framework-benchmark | **mreact-v0.0.184-local-keyed** | swap rows | completed | duration | ms | 61.8 | 2.1 | 55.3 | +23.85% |
| js-framework-benchmark | **mreact-v0.0.184-local-keyed** | remove row | completed | duration | ms | 35.1 | 1 | 32.3 | +2.03% |
| js-framework-benchmark | **mreact-v0.0.184-local-keyed** | create many rows | completed | duration | ms | 793.9 | 71.4 | 712.1 | +0.2% |
| js-framework-benchmark | **mreact-v0.0.184-local-keyed** | append rows to large table | completed | duration | ms | 87.8 | 8.2 | 77.7 | +5.02% |
| js-framework-benchmark | **mreact-v0.0.184-local-keyed** | clear rows | completed | duration | ms | 32.3 | 27.2 | 3.8 | +5.9% |
| js-framework-benchmark | **mreact-v0.0.184-local-keyed** | ready memory | completed | memory | MB | 1.1 |  |  | +7.47% |
| js-framework-benchmark | **mreact-v0.0.184-local-keyed** | run memory | completed | memory | MB | 2.9 |  |  | +1.73% |
| js-framework-benchmark | **mreact-v0.0.184-local-keyed** | repeated clear memory | completed | memory | MB | 1.4 |  |  | +17.79% |
| js-framework-benchmark | **mreact-v0.0.184-local-keyed** | total byte weight | completed | size | kB | 10 |  |  | +122.22% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | create rows | completed | duration | ms | 86.9 | 22.5 | 63.2 | +23.09% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | replace all rows | completed | duration | ms | 102.5 | 35.1 | 66.3 | +33.12% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | partial update | completed | duration | ms | 53.8 | 10.5 | 40.2 | +37.24% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | select row | completed | duration | ms | 13.4 | 6 | 6.3 | +48.89% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | swap rows | completed | duration | ms | 339.2 | 52.3 | 279.5 | +579.76% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | remove row | completed | duration | ms | 38.3 | 2.7 | 33.3 | +11.34% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | create many rows | completed | duration | ms | 1220.8 | 432.4 | 776.5 | +54.08% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | append rows to large table | completed | duration | ms | 97.9 | 23.5 | 72.5 | +17.11% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | clear rows | completed | duration | ms | 58 | 53.1 | 3.2 | +90.16% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | ready memory | completed | memory | MB | 1.7 |  |  | +62.56% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | run memory | completed | memory | MB | 4.9 |  |  | +71.55% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | repeated clear memory | completed | memory | MB | 2.4 |  |  | +109.19% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | total byte weight | completed | size | kB | 51.4 |  |  | +1042.22% |
| js-framework-benchmark | solid-v1.9.14-keyed | create rows | completed | duration | ms | 70.6 | 7.5 | 62 | 0% |
| js-framework-benchmark | solid-v1.9.14-keyed | replace all rows | completed | duration | ms | 77 | 14.6 | 61.4 | best |
| js-framework-benchmark | solid-v1.9.14-keyed | partial update | completed | duration | ms | 44.5 | 3.1 | 37.6 | +13.52% |
| js-framework-benchmark | solid-v1.9.14-keyed | select row | completed | duration | ms | 9.3 | 1.7 | 6.1 | +3.33% |
| js-framework-benchmark | solid-v1.9.14-keyed | swap rows | completed | duration | ms | 50.5 | 2.1 | 44.7 | +1.2% |
| js-framework-benchmark | solid-v1.9.14-keyed | remove row | completed | duration | ms | 35.7 | 0.9 | 32.8 | +3.78% |
| js-framework-benchmark | solid-v1.9.14-keyed | create many rows | completed | duration | ms | 815 | 76 | 729.7 | +2.87% |
| js-framework-benchmark | solid-v1.9.14-keyed | append rows to large table | completed | duration | ms | 83.6 | 8.6 | 73 | best |
| js-framework-benchmark | solid-v1.9.14-keyed | clear rows | completed | duration | ms | 36.9 | 32.5 | 3.2 | +20.98% |
| js-framework-benchmark | solid-v1.9.14-keyed | ready memory | completed | memory | MB | 1 |  |  | best |
| js-framework-benchmark | solid-v1.9.14-keyed | run memory | completed | memory | MB | 3.1 |  |  | +9.6% |
| js-framework-benchmark | solid-v1.9.14-keyed | repeated clear memory | completed | memory | MB | 1.2 |  |  | best |
| js-framework-benchmark | solid-v1.9.14-keyed | total byte weight | completed | size | kB | 4.5 |  |  | best |
| js-framework-benchmark | svelte-v5.56.4-keyed | create rows | completed | duration | ms | 74.1 | 10.4 | 62.1 | +4.96% |
| js-framework-benchmark | svelte-v5.56.4-keyed | replace all rows | completed | duration | ms | 83 | 18.3 | 62.6 | +7.79% |
| js-framework-benchmark | svelte-v5.56.4-keyed | partial update | completed | duration | ms | 51.4 | 4.2 | 43.7 | +31.12% |
| js-framework-benchmark | svelte-v5.56.4-keyed | select row | completed | duration | ms | 15 | 6.8 | 7 | +66.67% |
| js-framework-benchmark | svelte-v5.56.4-keyed | swap rows | completed | duration | ms | 51.8 | 3.7 | 44.1 | +3.81% |
| js-framework-benchmark | svelte-v5.56.4-keyed | remove row | completed | duration | ms | 37.7 | 1.6 | 34.6 | +9.59% |
| js-framework-benchmark | svelte-v5.56.4-keyed | create many rows | completed | duration | ms | 835.3 | 100.3 | 725.7 | +5.43% |
| js-framework-benchmark | svelte-v5.56.4-keyed | append rows to large table | completed | duration | ms | 85.7 | 11 | 73.5 | +2.51% |
| js-framework-benchmark | svelte-v5.56.4-keyed | clear rows | completed | duration | ms | 33.9 | 29.5 | 3.5 | +11.15% |
| js-framework-benchmark | svelte-v5.56.4-keyed | ready memory | completed | memory | MB | 1.2 |  |  | +18.09% |
| js-framework-benchmark | svelte-v5.56.4-keyed | run memory | completed | memory | MB | 3.4 |  |  | +20.84% |
| js-framework-benchmark | svelte-v5.56.4-keyed | repeated clear memory | completed | memory | MB | 1.6 |  |  | +34.54% |
| js-framework-benchmark | svelte-v5.56.4-keyed | total byte weight | completed | size | kB | 14.3 |  |  | +217.78% |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | create rows | completed | duration | ms | 86.6 | 21.2 | 64.3 | +22.66% |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | replace all rows | completed | duration | ms | 93.4 | 27.9 | 64.6 | +21.3% |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | partial update | completed | duration | ms | 50.3 | 6.6 | 38.9 | +28.32% |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | select row | completed | duration | ms | 10 | 2.4 | 6.6 | +11.11% |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | swap rows | completed | duration | ms | 51.3 | 2.9 | 45 | +2.81% |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | remove row | completed | duration | ms | 41.6 | 5.4 | 34.1 | +20.93% |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | create many rows | completed | duration | ms | 934 | 176.9 | 747.9 | +17.88% |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | append rows to large table | completed | duration | ms | 91.7 | 17.5 | 73 | +9.69% |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | clear rows | completed | duration | ms | 44.5 | 40.4 | 3 | +45.9% |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | ready memory | completed | memory | MB | 1.3 |  |  | +32.28% |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | run memory | completed | memory | MB | 4.4 |  |  | +55.51% |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | repeated clear memory | completed | memory | MB | 1.7 |  |  | +46.12% |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | total byte weight | completed | size | kB | 23.9 |  |  | +431.11% |
