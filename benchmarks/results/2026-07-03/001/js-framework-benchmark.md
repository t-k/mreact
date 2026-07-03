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

Raw JSON files are stored in `benchmarks/results/2026-07-03/001/js-framework-benchmark-results`.
Chrome trace files are stored in `benchmarks/results/2026-07-03/001/js-framework-benchmark-traces`.

## Rankings

Lower values are better for all js-framework-benchmark metrics reported here.

### create rows

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | **mreact-v0.0.183-local-keyed** | create rows | 66.4 | 6.2 | 58.7 | best | ms |
| 2 | marko-v6.2.2-keyed | create rows | 66.9 | 7.2 | 58.5 | +0.75% | ms |
| 3 | solid-v1.9.14-keyed | create rows | 67.3 | 7.3 | 58.8 | +1.36% | ms |
| 4 | svelte-v5.56.4-keyed | create rows | 69.6 | 10.6 | 58 | +4.82% | ms |
| 5 | vue-v3.6.0-beta.17-keyed | create rows | 80.3 | 19.8 | 59.3 | +20.93% | ms |
| 6 | react-hooks-v19.2.7-keyed | create rows | 84 | 21.6 | 61.1 | +26.51% | ms |
| 7 | **mreact-react-compat-v0.0.183-local-keyed** | create rows | 84.7 | 23.5 | 59.8 | +27.56% | ms |
| 8 | angular-cf-v22.0.0-keyed | create rows | 95.7 | 18.6 | 60.1 | +44.13% | ms |
| 9 | **mreact-react-compat-vdom-v0.0.183-local-keyed** | create rows | 96.4 | 35.9 | 59 | +45.18% | ms |

### replace all rows

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | solid-v1.9.14-keyed | replace all rows | 74.2 | 13.4 | 59.5 | best | ms |
| 2 | marko-v6.2.2-keyed | replace all rows | 74.5 | 13.9 | 59.5 | +0.4% | ms |
| 3 | **mreact-v0.0.183-local-keyed** | replace all rows | 75.4 | 15.5 | 59.4 | +1.62% | ms |
| 4 | svelte-v5.56.4-keyed | replace all rows | 77.7 | 16.3 | 59.7 | +4.72% | ms |
| 5 | **mreact-react-compat-v0.0.183-local-keyed** | replace all rows | 85.1 | 24.1 | 59.7 | +14.69% | ms |
| 6 | vue-v3.6.0-beta.17-keyed | replace all rows | 85.4 | 22.6 | 60.7 | +15.09% | ms |
| 7 | react-hooks-v19.2.7-keyed | replace all rows | 93.9 | 31 | 61.4 | +26.55% | ms |
| 8 | **mreact-react-compat-vdom-v0.0.183-local-keyed** | replace all rows | 97.6 | 36.3 | 59.9 | +31.54% | ms |
| 9 | angular-cf-v22.0.0-keyed | replace all rows | 104.9 | 26.9 | 62.9 | +41.37% | ms |

### partial update

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | angular-cf-v22.0.0-keyed | partial update | 38.2 | 3 | 34.2 | best | ms |
| 2 | **mreact-v0.0.183-local-keyed** | partial update | 40 | 1.6 | 34 | +4.71% | ms |
| 3 | marko-v6.2.2-keyed | partial update | 41 | 3.8 | 32.5 | +7.33% | ms |
| 4 | svelte-v5.56.4-keyed | partial update | 42.3 | 3.9 | 34.5 | +10.73% | ms |
| 5 | solid-v1.9.14-keyed | partial update | 42.6 | 2.7 | 34.8 | +11.52% | ms |
| 6 | **mreact-react-compat-v0.0.183-local-keyed** | partial update | 47.8 | 7.9 | 34.5 | +25.13% | ms |
| 7 | react-hooks-v19.2.7-keyed | partial update | 48.5 | 10.7 | 33.8 | +26.96% | ms |
| 8 | vue-v3.6.0-beta.17-keyed | partial update | 49.1 | 6.4 | 37.3 | +28.53% | ms |
| 9 | **mreact-react-compat-vdom-v0.0.183-local-keyed** | partial update | 60 | 19.5 | 36.2 | +57.07% | ms |

### select row

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | **mreact-v0.0.183-local-keyed** | select row | 9.4 | 1 | 6.6 | best | ms |
| 2 | marko-v6.2.2-keyed | select row | 10.1 | 1.1 | 7 | +7.45% | ms |
| 3 | solid-v1.9.14-keyed | select row | 10.8 | 1.9 | 7 | +14.89% | ms |
| 4 | vue-v3.6.0-beta.17-keyed | select row | 11.3 | 2.6 | 6.7 | +20.21% | ms |
| 5 | angular-cf-v22.0.0-keyed | select row | 14.6 | 4.3 | 8.3 | +55.32% | ms |
| 6 | react-hooks-v19.2.7-keyed | select row | 15.6 | 6 | 7.3 | +65.96% | ms |
| 7 | svelte-v5.56.4-keyed | select row | 15.7 | 6.6 | 7 | +67.02% | ms |
| 8 | **mreact-react-compat-v0.0.183-local-keyed** | select row | 16 | 6.5 | 7.4 | +70.21% | ms |
| 9 | **mreact-react-compat-vdom-v0.0.183-local-keyed** | select row | 16.8 | 7.1 | 7.3 | +78.72% | ms |

### swap rows

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | marko-v6.2.2-keyed | swap rows | 47.1 | 2.9 | 39.5 | best | ms |
| 2 | **mreact-v0.0.183-local-keyed** | swap rows | 47.3 | 1.8 | 41.4 | +0.42% | ms |
| 3 | svelte-v5.56.4-keyed | swap rows | 47.4 | 3.8 | 39.5 | +0.64% | ms |
| 4 | solid-v1.9.14-keyed | swap rows | 47.6 | 1.9 | 40.2 | +1.06% | ms |
| 5 | angular-cf-v22.0.0-keyed | swap rows | 48.1 | 2.9 | 42 | +2.12% | ms |
| 6 | vue-v3.6.0-beta.17-keyed | swap rows | 48.4 | 3.2 | 40.8 | +2.76% | ms |
| 7 | **mreact-react-compat-v0.0.183-local-keyed** | swap rows | 54.8 | 9.7 | 40 | +16.35% | ms |
| 8 | **mreact-react-compat-vdom-v0.0.183-local-keyed** | swap rows | 64 | 17.4 | 41 | +35.88% | ms |
| 9 | react-hooks-v19.2.7-keyed | swap rows | 309 | 41.5 | 259.5 | +556.05% | ms |

### remove row

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | angular-cf-v22.0.0-keyed | remove row | 32.5 | 1.8 | 30 | best | ms |
| 2 | solid-v1.9.14-keyed | remove row | 35.4 | 0.9 | 32.1 | +8.92% | ms |
| 3 | **mreact-v0.0.183-local-keyed** | remove row | 35.7 | 0.9 | 32.5 | +9.85% | ms |
| 4 | marko-v6.2.2-keyed | remove row | 36.4 | 1.1 | 32.6 | +12% | ms |
| 5 | svelte-v5.56.4-keyed | remove row | 36.5 | 1.6 | 32 | +12.31% | ms |
| 6 | react-hooks-v19.2.7-keyed | remove row | 37.7 | 2.6 | 32.3 | +16% | ms |
| 7 | **mreact-react-compat-v0.0.183-local-keyed** | remove row | 37.9 | 3.1 | 32.3 | +16.62% | ms |
| 8 | vue-v3.6.0-beta.17-keyed | remove row | 39.5 | 4.8 | 32.5 | +21.54% | ms |
| 9 | **mreact-react-compat-vdom-v0.0.183-local-keyed** | remove row | 40 | 4.7 | 32.7 | +23.08% | ms |

### create many rows

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | **mreact-v0.0.183-local-keyed** | create many rows | 719.6 | 74.4 | 636.3 | best | ms |
| 2 | marko-v6.2.2-keyed | create many rows | 725 | 80.5 | 634.9 | +0.75% | ms |
| 3 | solid-v1.9.14-keyed | create many rows | 727.4 | 71 | 646.7 | +1.08% | ms |
| 4 | svelte-v5.56.4-keyed | create many rows | 740.5 | 92.7 | 639.3 | +2.9% | ms |
| 5 | vue-v3.6.0-beta.17-keyed | create many rows | 824.1 | 153.7 | 659.2 | +14.52% | ms |
| 6 | **mreact-react-compat-v0.0.183-local-keyed** | create many rows | 859.3 | 235 | 614 | +19.41% | ms |
| 7 | **mreact-react-compat-vdom-v0.0.183-local-keyed** | create many rows | 919.4 | 276 | 632.5 | +27.77% | ms |
| 8 | angular-cf-v22.0.0-keyed | create many rows | 929.6 | 191.3 | 659.1 | +29.18% | ms |
| 9 | react-hooks-v19.2.7-keyed | create many rows | 1109.3 | 427.1 | 667.2 | +54.16% | ms |

### append rows to large table

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | **mreact-v0.0.183-local-keyed** | append rows to large table | 76.8 | 7.7 | 67.2 | best | ms |
| 2 | marko-v6.2.2-keyed | append rows to large table | 78.7 | 9 | 67.9 | +2.47% | ms |
| 3 | solid-v1.9.14-keyed | append rows to large table | 79.6 | 8.8 | 69.4 | +3.65% | ms |
| 4 | svelte-v5.56.4-keyed | append rows to large table | 80.5 | 10.6 | 68.6 | +4.82% | ms |
| 5 | vue-v3.6.0-beta.17-keyed | append rows to large table | 85.6 | 16.5 | 67.4 | +11.46% | ms |
| 6 | **mreact-react-compat-v0.0.183-local-keyed** | append rows to large table | 91.6 | 24.1 | 65.8 | +19.27% | ms |
| 7 | react-hooks-v19.2.7-keyed | append rows to large table | 92.4 | 22.4 | 67.9 | +20.31% | ms |
| 8 | angular-cf-v22.0.0-keyed | append rows to large table | 98.2 | 16.1 | 67.7 | +27.86% | ms |
| 9 | **mreact-react-compat-vdom-v0.0.183-local-keyed** | append rows to large table | 100.5 | 31.9 | 66.6 | +30.86% | ms |

### clear rows

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | marko-v6.2.2-keyed | clear rows | 25.1 | 20.4 | 3.1 | best | ms |
| 2 | **mreact-v0.0.183-local-keyed** | clear rows | 25.7 | 21.3 | 3.3 | +2.39% | ms |
| 3 | svelte-v5.56.4-keyed | clear rows | 28.9 | 23.8 | 3.8 | +15.14% | ms |
| 4 | solid-v1.9.14-keyed | clear rows | 29.8 | 25.1 | 3.1 | +18.73% | ms |
| 5 | **mreact-react-compat-vdom-v0.0.183-local-keyed** | clear rows | 34.1 | 29.6 | 3.3 | +35.86% | ms |
| 6 | vue-v3.6.0-beta.17-keyed | clear rows | 34.8 | 30.6 | 3 | +38.65% | ms |
| 7 | **mreact-react-compat-v0.0.183-local-keyed** | clear rows | 39.1 | 34.5 | 2.9 | +55.78% | ms |
| 8 | react-hooks-v19.2.7-keyed | clear rows | 45.4 | 40.9 | 3.4 | +80.88% | ms |
| 9 | angular-cf-v22.0.0-keyed | clear rows | 49.3 | 44.6 | 3.5 | +96.41% | ms |

### ready memory

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | solid-v1.9.14-keyed | ready memory | 1 |  |  | best | MB |
| 2 | marko-v6.2.2-keyed | ready memory | 1.1 |  |  | +4.07% | MB |
| 3 | **mreact-v0.0.183-local-keyed** | ready memory | 1.1 |  |  | +8.86% | MB |
| 4 | svelte-v5.56.4-keyed | ready memory | 1.2 |  |  | +17.87% | MB |
| 5 | vue-v3.6.0-beta.17-keyed | ready memory | 1.3 |  |  | +29.96% | MB |
| 6 | **mreact-react-compat-vdom-v0.0.183-local-keyed** | ready memory | 1.4 |  |  | +35.56% | MB |
| 7 | **mreact-react-compat-v0.0.183-local-keyed** | ready memory | 1.4 |  |  | +36.2% | MB |
| 8 | react-hooks-v19.2.7-keyed | ready memory | 1.6 |  |  | +58.4% | MB |
| 9 | angular-cf-v22.0.0-keyed | ready memory | 2.1 |  |  | +101.48% | MB |

### run memory

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | **mreact-v0.0.183-local-keyed** | run memory | 2.8 |  |  | best | MB |
| 2 | marko-v6.2.2-keyed | run memory | 2.8 |  |  | +0.84% | MB |
| 3 | solid-v1.9.14-keyed | run memory | 3.1 |  |  | +10.52% | MB |
| 4 | svelte-v5.56.4-keyed | run memory | 3.5 |  |  | +24.14% | MB |
| 5 | vue-v3.6.0-beta.17-keyed | run memory | 4.5 |  |  | +58.08% | MB |
| 6 | react-hooks-v19.2.7-keyed | run memory | 4.9 |  |  | +73.6% | MB |
| 7 | **mreact-react-compat-vdom-v0.0.183-local-keyed** | run memory | 4.9 |  |  | +74.48% | MB |
| 8 | angular-cf-v22.0.0-keyed | run memory | 5.1 |  |  | +79.42% | MB |
| 9 | **mreact-react-compat-v0.0.183-local-keyed** | run memory | 5.3 |  |  | +88.6% | MB |

### repeated clear memory

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | solid-v1.9.14-keyed | repeated clear memory | 1.2 |  |  | best | MB |
| 2 | marko-v6.2.2-keyed | repeated clear memory | 1.3 |  |  | +7.91% | MB |
| 3 | **mreact-v0.0.183-local-keyed** | repeated clear memory | 1.4 |  |  | +10.73% | MB |
| 4 | svelte-v5.56.4-keyed | repeated clear memory | 1.5 |  |  | +24.47% | MB |
| 5 | vue-v3.6.0-beta.17-keyed | repeated clear memory | 1.7 |  |  | +38.57% | MB |
| 6 | **mreact-react-compat-v0.0.183-local-keyed** | repeated clear memory | 2 |  |  | +58.59% | MB |
| 7 | react-hooks-v19.2.7-keyed | repeated clear memory | 2.5 |  |  | +99.12% | MB |
| 8 | **mreact-react-compat-vdom-v0.0.183-local-keyed** | repeated clear memory | 2.5 |  |  | +105.73% | MB |
| 9 | angular-cf-v22.0.0-keyed | repeated clear memory | 2.6 |  |  | +112.83% | MB |

### total byte weight

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | solid-v1.9.14-keyed | total byte weight | 4.5 |  |  | best | kB |
| 2 | marko-v6.2.2-keyed | total byte weight | 5 |  |  | +11.11% | kB |
| 3 | **mreact-v0.0.183-local-keyed** | total byte weight | 9.9 |  |  | +120% | kB |
| 4 | svelte-v5.56.4-keyed | total byte weight | 14.3 |  |  | +217.78% | kB |
| 5 | vue-v3.6.0-beta.17-keyed | total byte weight | 23.9 |  |  | +431.11% | kB |
| 6 | **mreact-react-compat-vdom-v0.0.183-local-keyed** | total byte weight | 33 |  |  | +633.33% | kB |
| 7 | **mreact-react-compat-v0.0.183-local-keyed** | total byte weight | 35 |  |  | +677.78% | kB |
| 8 | angular-cf-v22.0.0-keyed | total byte weight | 44.5 |  |  | +888.89% | kB |
| 9 | react-hooks-v19.2.7-keyed | total byte weight | 51.4 |  |  | +1042.22% | kB |

## Results

| suite | framework | case | status | metric | unit | value | script | paint | diff vs 1st |
| --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | create rows | completed | duration | ms | 95.7 | 18.6 | 60.1 | +44.13% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | replace all rows | completed | duration | ms | 104.9 | 26.9 | 62.9 | +41.37% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | partial update | completed | duration | ms | 38.2 | 3 | 34.2 | best |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | select row | completed | duration | ms | 14.6 | 4.3 | 8.3 | +55.32% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | swap rows | completed | duration | ms | 48.1 | 2.9 | 42 | +2.12% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | remove row | completed | duration | ms | 32.5 | 1.8 | 30 | best |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | create many rows | completed | duration | ms | 929.6 | 191.3 | 659.1 | +29.18% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | append rows to large table | completed | duration | ms | 98.2 | 16.1 | 67.7 | +27.86% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | clear rows | completed | duration | ms | 49.3 | 44.6 | 3.5 | +96.41% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | ready memory | completed | memory | MB | 2.1 |  |  | +101.48% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | run memory | completed | memory | MB | 5.1 |  |  | +79.42% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | repeated clear memory | completed | memory | MB | 2.6 |  |  | +112.83% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | total byte weight | completed | size | kB | 44.5 |  |  | +888.89% |
| js-framework-benchmark | marko-v6.2.2-keyed | create rows | completed | duration | ms | 66.9 | 7.2 | 58.5 | +0.75% |
| js-framework-benchmark | marko-v6.2.2-keyed | replace all rows | completed | duration | ms | 74.5 | 13.9 | 59.5 | +0.4% |
| js-framework-benchmark | marko-v6.2.2-keyed | partial update | completed | duration | ms | 41 | 3.8 | 32.5 | +7.33% |
| js-framework-benchmark | marko-v6.2.2-keyed | select row | completed | duration | ms | 10.1 | 1.1 | 7 | +7.45% |
| js-framework-benchmark | marko-v6.2.2-keyed | swap rows | completed | duration | ms | 47.1 | 2.9 | 39.5 | best |
| js-framework-benchmark | marko-v6.2.2-keyed | remove row | completed | duration | ms | 36.4 | 1.1 | 32.6 | +12% |
| js-framework-benchmark | marko-v6.2.2-keyed | create many rows | completed | duration | ms | 725 | 80.5 | 634.9 | +0.75% |
| js-framework-benchmark | marko-v6.2.2-keyed | append rows to large table | completed | duration | ms | 78.7 | 9 | 67.9 | +2.47% |
| js-framework-benchmark | marko-v6.2.2-keyed | clear rows | completed | duration | ms | 25.1 | 20.4 | 3.1 | best |
| js-framework-benchmark | marko-v6.2.2-keyed | ready memory | completed | memory | MB | 1.1 |  |  | +4.07% |
| js-framework-benchmark | marko-v6.2.2-keyed | run memory | completed | memory | MB | 2.8 |  |  | +0.84% |
| js-framework-benchmark | marko-v6.2.2-keyed | repeated clear memory | completed | memory | MB | 1.3 |  |  | +7.91% |
| js-framework-benchmark | marko-v6.2.2-keyed | total byte weight | completed | size | kB | 5 |  |  | +11.11% |
| js-framework-benchmark | **mreact-react-compat-v0.0.183-local-keyed** | create rows | completed | duration | ms | 84.7 | 23.5 | 59.8 | +27.56% |
| js-framework-benchmark | **mreact-react-compat-v0.0.183-local-keyed** | replace all rows | completed | duration | ms | 85.1 | 24.1 | 59.7 | +14.69% |
| js-framework-benchmark | **mreact-react-compat-v0.0.183-local-keyed** | partial update | completed | duration | ms | 47.8 | 7.9 | 34.5 | +25.13% |
| js-framework-benchmark | **mreact-react-compat-v0.0.183-local-keyed** | select row | completed | duration | ms | 16 | 6.5 | 7.4 | +70.21% |
| js-framework-benchmark | **mreact-react-compat-v0.0.183-local-keyed** | swap rows | completed | duration | ms | 54.8 | 9.7 | 40 | +16.35% |
| js-framework-benchmark | **mreact-react-compat-v0.0.183-local-keyed** | remove row | completed | duration | ms | 37.9 | 3.1 | 32.3 | +16.62% |
| js-framework-benchmark | **mreact-react-compat-v0.0.183-local-keyed** | create many rows | completed | duration | ms | 859.3 | 235 | 614 | +19.41% |
| js-framework-benchmark | **mreact-react-compat-v0.0.183-local-keyed** | append rows to large table | completed | duration | ms | 91.6 | 24.1 | 65.8 | +19.27% |
| js-framework-benchmark | **mreact-react-compat-v0.0.183-local-keyed** | clear rows | completed | duration | ms | 39.1 | 34.5 | 2.9 | +55.78% |
| js-framework-benchmark | **mreact-react-compat-v0.0.183-local-keyed** | ready memory | completed | memory | MB | 1.4 |  |  | +36.2% |
| js-framework-benchmark | **mreact-react-compat-v0.0.183-local-keyed** | run memory | completed | memory | MB | 5.3 |  |  | +88.6% |
| js-framework-benchmark | **mreact-react-compat-v0.0.183-local-keyed** | repeated clear memory | completed | memory | MB | 2 |  |  | +58.59% |
| js-framework-benchmark | **mreact-react-compat-v0.0.183-local-keyed** | total byte weight | completed | size | kB | 35 |  |  | +677.78% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.183-local-keyed** | create rows | completed | duration | ms | 96.4 | 35.9 | 59 | +45.18% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.183-local-keyed** | replace all rows | completed | duration | ms | 97.6 | 36.3 | 59.9 | +31.54% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.183-local-keyed** | partial update | completed | duration | ms | 60 | 19.5 | 36.2 | +57.07% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.183-local-keyed** | select row | completed | duration | ms | 16.8 | 7.1 | 7.3 | +78.72% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.183-local-keyed** | swap rows | completed | duration | ms | 64 | 17.4 | 41 | +35.88% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.183-local-keyed** | remove row | completed | duration | ms | 40 | 4.7 | 32.7 | +23.08% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.183-local-keyed** | create many rows | completed | duration | ms | 919.4 | 276 | 632.5 | +27.77% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.183-local-keyed** | append rows to large table | completed | duration | ms | 100.5 | 31.9 | 66.6 | +30.86% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.183-local-keyed** | clear rows | completed | duration | ms | 34.1 | 29.6 | 3.3 | +35.86% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.183-local-keyed** | ready memory | completed | memory | MB | 1.4 |  |  | +35.56% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.183-local-keyed** | run memory | completed | memory | MB | 4.9 |  |  | +74.48% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.183-local-keyed** | repeated clear memory | completed | memory | MB | 2.5 |  |  | +105.73% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.183-local-keyed** | total byte weight | completed | size | kB | 33 |  |  | +633.33% |
| js-framework-benchmark | **mreact-v0.0.183-local-keyed** | create rows | completed | duration | ms | 66.4 | 6.2 | 58.7 | best |
| js-framework-benchmark | **mreact-v0.0.183-local-keyed** | replace all rows | completed | duration | ms | 75.4 | 15.5 | 59.4 | +1.62% |
| js-framework-benchmark | **mreact-v0.0.183-local-keyed** | partial update | completed | duration | ms | 40 | 1.6 | 34 | +4.71% |
| js-framework-benchmark | **mreact-v0.0.183-local-keyed** | select row | completed | duration | ms | 9.4 | 1 | 6.6 | best |
| js-framework-benchmark | **mreact-v0.0.183-local-keyed** | swap rows | completed | duration | ms | 47.3 | 1.8 | 41.4 | +0.42% |
| js-framework-benchmark | **mreact-v0.0.183-local-keyed** | remove row | completed | duration | ms | 35.7 | 0.9 | 32.5 | +9.85% |
| js-framework-benchmark | **mreact-v0.0.183-local-keyed** | create many rows | completed | duration | ms | 719.6 | 74.4 | 636.3 | best |
| js-framework-benchmark | **mreact-v0.0.183-local-keyed** | append rows to large table | completed | duration | ms | 76.8 | 7.7 | 67.2 | best |
| js-framework-benchmark | **mreact-v0.0.183-local-keyed** | clear rows | completed | duration | ms | 25.7 | 21.3 | 3.3 | +2.39% |
| js-framework-benchmark | **mreact-v0.0.183-local-keyed** | ready memory | completed | memory | MB | 1.1 |  |  | +8.86% |
| js-framework-benchmark | **mreact-v0.0.183-local-keyed** | run memory | completed | memory | MB | 2.8 |  |  | best |
| js-framework-benchmark | **mreact-v0.0.183-local-keyed** | repeated clear memory | completed | memory | MB | 1.4 |  |  | +10.73% |
| js-framework-benchmark | **mreact-v0.0.183-local-keyed** | total byte weight | completed | size | kB | 9.9 |  |  | +120% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | create rows | completed | duration | ms | 84 | 21.6 | 61.1 | +26.51% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | replace all rows | completed | duration | ms | 93.9 | 31 | 61.4 | +26.55% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | partial update | completed | duration | ms | 48.5 | 10.7 | 33.8 | +26.96% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | select row | completed | duration | ms | 15.6 | 6 | 7.3 | +65.96% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | swap rows | completed | duration | ms | 309 | 41.5 | 259.5 | +556.05% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | remove row | completed | duration | ms | 37.7 | 2.6 | 32.3 | +16% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | create many rows | completed | duration | ms | 1109.3 | 427.1 | 667.2 | +54.16% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | append rows to large table | completed | duration | ms | 92.4 | 22.4 | 67.9 | +20.31% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | clear rows | completed | duration | ms | 45.4 | 40.9 | 3.4 | +80.88% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | ready memory | completed | memory | MB | 1.6 |  |  | +58.4% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | run memory | completed | memory | MB | 4.9 |  |  | +73.6% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | repeated clear memory | completed | memory | MB | 2.5 |  |  | +99.12% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | total byte weight | completed | size | kB | 51.4 |  |  | +1042.22% |
| js-framework-benchmark | solid-v1.9.14-keyed | create rows | completed | duration | ms | 67.3 | 7.3 | 58.8 | +1.36% |
| js-framework-benchmark | solid-v1.9.14-keyed | replace all rows | completed | duration | ms | 74.2 | 13.4 | 59.5 | best |
| js-framework-benchmark | solid-v1.9.14-keyed | partial update | completed | duration | ms | 42.6 | 2.7 | 34.8 | +11.52% |
| js-framework-benchmark | solid-v1.9.14-keyed | select row | completed | duration | ms | 10.8 | 1.9 | 7 | +14.89% |
| js-framework-benchmark | solid-v1.9.14-keyed | swap rows | completed | duration | ms | 47.6 | 1.9 | 40.2 | +1.06% |
| js-framework-benchmark | solid-v1.9.14-keyed | remove row | completed | duration | ms | 35.4 | 0.9 | 32.1 | +8.92% |
| js-framework-benchmark | solid-v1.9.14-keyed | create many rows | completed | duration | ms | 727.4 | 71 | 646.7 | +1.08% |
| js-framework-benchmark | solid-v1.9.14-keyed | append rows to large table | completed | duration | ms | 79.6 | 8.8 | 69.4 | +3.65% |
| js-framework-benchmark | solid-v1.9.14-keyed | clear rows | completed | duration | ms | 29.8 | 25.1 | 3.1 | +18.73% |
| js-framework-benchmark | solid-v1.9.14-keyed | ready memory | completed | memory | MB | 1 |  |  | best |
| js-framework-benchmark | solid-v1.9.14-keyed | run memory | completed | memory | MB | 3.1 |  |  | +10.52% |
| js-framework-benchmark | solid-v1.9.14-keyed | repeated clear memory | completed | memory | MB | 1.2 |  |  | best |
| js-framework-benchmark | solid-v1.9.14-keyed | total byte weight | completed | size | kB | 4.5 |  |  | best |
| js-framework-benchmark | svelte-v5.56.4-keyed | create rows | completed | duration | ms | 69.6 | 10.6 | 58 | +4.82% |
| js-framework-benchmark | svelte-v5.56.4-keyed | replace all rows | completed | duration | ms | 77.7 | 16.3 | 59.7 | +4.72% |
| js-framework-benchmark | svelte-v5.56.4-keyed | partial update | completed | duration | ms | 42.3 | 3.9 | 34.5 | +10.73% |
| js-framework-benchmark | svelte-v5.56.4-keyed | select row | completed | duration | ms | 15.7 | 6.6 | 7 | +67.02% |
| js-framework-benchmark | svelte-v5.56.4-keyed | swap rows | completed | duration | ms | 47.4 | 3.8 | 39.5 | +0.64% |
| js-framework-benchmark | svelte-v5.56.4-keyed | remove row | completed | duration | ms | 36.5 | 1.6 | 32 | +12.31% |
| js-framework-benchmark | svelte-v5.56.4-keyed | create many rows | completed | duration | ms | 740.5 | 92.7 | 639.3 | +2.9% |
| js-framework-benchmark | svelte-v5.56.4-keyed | append rows to large table | completed | duration | ms | 80.5 | 10.6 | 68.6 | +4.82% |
| js-framework-benchmark | svelte-v5.56.4-keyed | clear rows | completed | duration | ms | 28.9 | 23.8 | 3.8 | +15.14% |
| js-framework-benchmark | svelte-v5.56.4-keyed | ready memory | completed | memory | MB | 1.2 |  |  | +17.87% |
| js-framework-benchmark | svelte-v5.56.4-keyed | run memory | completed | memory | MB | 3.5 |  |  | +24.14% |
| js-framework-benchmark | svelte-v5.56.4-keyed | repeated clear memory | completed | memory | MB | 1.5 |  |  | +24.47% |
| js-framework-benchmark | svelte-v5.56.4-keyed | total byte weight | completed | size | kB | 14.3 |  |  | +217.78% |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | create rows | completed | duration | ms | 80.3 | 19.8 | 59.3 | +20.93% |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | replace all rows | completed | duration | ms | 85.4 | 22.6 | 60.7 | +15.09% |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | partial update | completed | duration | ms | 49.1 | 6.4 | 37.3 | +28.53% |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | select row | completed | duration | ms | 11.3 | 2.6 | 6.7 | +20.21% |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | swap rows | completed | duration | ms | 48.4 | 3.2 | 40.8 | +2.76% |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | remove row | completed | duration | ms | 39.5 | 4.8 | 32.5 | +21.54% |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | create many rows | completed | duration | ms | 824.1 | 153.7 | 659.2 | +14.52% |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | append rows to large table | completed | duration | ms | 85.6 | 16.5 | 67.4 | +11.46% |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | clear rows | completed | duration | ms | 34.8 | 30.6 | 3 | +38.65% |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | ready memory | completed | memory | MB | 1.3 |  |  | +29.96% |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | run memory | completed | memory | MB | 4.5 |  |  | +58.08% |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | repeated clear memory | completed | memory | MB | 1.7 |  |  | +38.57% |
| js-framework-benchmark | vue-v3.6.0-beta.17-keyed | total byte weight | completed | size | kB | 23.9 |  |  | +431.11% |
