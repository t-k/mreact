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

Raw JSON files are stored in `benchmarks/results/2026-06-18/002/js-framework-benchmark-results`.
Chrome trace files are stored in `benchmarks/results/2026-06-18/002/js-framework-benchmark-traces`.

## Rankings

Lower values are better for all js-framework-benchmark metrics reported here.

### create rows

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | solid-v1.9.13-keyed | create rows | 66.3 | 7.4 | 57.7 | best | ms |
| 2 | **mreact-v0.0.172-local-keyed** | create rows | 67.4 | 6.2 | 59.6 | +1.66% | ms |
| 3 | svelte-v5.56.3-keyed | create rows | 69 | 10.4 | 57.3 | +4.07% | ms |
| 4 | marko-v6.1.9-keyed | create rows | 69.4 | 8.6 | 59.1 | +4.68% | ms |
| 5 | vue-v3.6.0-beta.16-keyed | create rows | 81.7 | 19.7 | 60.2 | +23.23% | ms |
| 6 | react-hooks-v19.2.7-keyed | create rows | 83.1 | 21.9 | 59.6 | +25.34% | ms |
| 7 | **mreact-react-compat-v0.0.172-local-keyed** | create rows | 85.3 | 23.7 | 60.4 | +28.66% | ms |
| 8 | **mreact-react-compat-vdom-v0.0.172-local-keyed** | create rows | 93.2 | 32.1 | 59.7 | +40.57% | ms |
| 9 | angular-cf-v22.0.0-keyed | create rows | 96.4 | 18.4 | 60.3 | +45.4% | ms |

### replace all rows

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | solid-v1.9.13-keyed | replace all rows | 73.2 | 13.5 | 58.4 | best | ms |
| 2 | **mreact-v0.0.172-local-keyed** | replace all rows | 73.9 | 12.3 | 60.2 | +0.96% | ms |
| 3 | marko-v6.1.9-keyed | replace all rows | 76.6 | 14.2 | 61.1 | +4.64% | ms |
| 4 | svelte-v5.56.3-keyed | replace all rows | 79.6 | 17.4 | 59.4 | +8.74% | ms |
| 5 | vue-v3.6.0-beta.16-keyed | replace all rows | 87 | 23.9 | 62.3 | +18.85% | ms |
| 6 | **mreact-react-compat-v0.0.172-local-keyed** | replace all rows | 88.9 | 26.5 | 61.4 | +21.45% | ms |
| 7 | react-hooks-v19.2.7-keyed | replace all rows | 93 | 31.4 | 60.9 | +27.05% | ms |
| 8 | **mreact-react-compat-vdom-v0.0.172-local-keyed** | replace all rows | 97.7 | 38 | 58.8 | +33.47% | ms |
| 9 | angular-cf-v22.0.0-keyed | replace all rows | 107.4 | 27.6 | 63.7 | +46.72% | ms |

### partial update

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | **mreact-v0.0.172-local-keyed** | partial update | 40 | 1.7 | 33.5 | best | ms |
| 2 | solid-v1.9.13-keyed | partial update | 41.2 | 2.6 | 34.1 | +3% | ms |
| 3 | angular-cf-v22.0.0-keyed | partial update | 42.8 | 3.6 | 37.4 | +7% | ms |
| 4 | vue-v3.6.0-beta.16-keyed | partial update | 44.9 | 6.4 | 34.7 | +12.25% | ms |
| 5 | svelte-v5.56.3-keyed | partial update | 45.9 | 3.9 | 36.4 | +14.75% | ms |
| 6 | marko-v6.1.9-keyed | partial update | 46.5 | 5.6 | 36.3 | +16.25% | ms |
| 7 | **mreact-react-compat-v0.0.172-local-keyed** | partial update | 48.6 | 10.9 | 32.5 | +21.5% | ms |
| 8 | react-hooks-v19.2.7-keyed | partial update | 50.7 | 10 | 35.1 | +26.75% | ms |
| 9 | **mreact-react-compat-vdom-v0.0.172-local-keyed** | partial update | 60.3 | 20.4 | 35.1 | +50.75% | ms |

### select row

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | **mreact-v0.0.172-local-keyed** | select row | 9.2 | 0.8 | 6.7 | best | ms |
| 2 | solid-v1.9.13-keyed | select row | 10.8 | 2.1 | 6.9 | +17.39% | ms |
| 3 | vue-v3.6.0-beta.16-keyed | select row | 11.1 | 2.5 | 6.8 | +20.65% | ms |
| 4 | marko-v6.1.9-keyed | select row | 13 | 4.5 | 6.8 | +41.3% | ms |
| 5 | angular-cf-v22.0.0-keyed | select row | 13.9 | 4.1 | 8.2 | +51.09% | ms |
| 6 | react-hooks-v19.2.7-keyed | select row | 14.9 | 5.8 | 7.3 | +61.96% | ms |
| 7 | svelte-v5.56.3-keyed | select row | 15.3 | 6.4 | 7.1 | +66.3% | ms |
| 8 | **mreact-react-compat-v0.0.172-local-keyed** | select row | 15.4 | 6.2 | 7.3 | +67.39% | ms |
| 9 | **mreact-react-compat-vdom-v0.0.172-local-keyed** | select row | 16.4 | 6.9 | 7.3 | +78.26% | ms |

### swap rows

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | marko-v6.1.9-keyed | swap rows | 47.3 | 4.6 | 37.6 | best | ms |
| 2 | angular-cf-v22.0.0-keyed | swap rows | 47.4 | 3.1 | 41.8 | +0.21% | ms |
| 3 | vue-v3.6.0-beta.16-keyed | swap rows | 48.3 | 3.2 | 40 | +2.11% | ms |
| 4 | **mreact-v0.0.172-local-keyed** | swap rows | 49 | 1.6 | 42.3 | +3.59% | ms |
| 5 | svelte-v5.56.3-keyed | swap rows | 50 | 4.1 | 41.6 | +5.71% | ms |
| 6 | solid-v1.9.13-keyed | swap rows | 51.6 | 2.1 | 43.4 | +9.09% | ms |
| 7 | **mreact-react-compat-v0.0.172-local-keyed** | swap rows | 59.6 | 10.8 | 43.8 | +26% | ms |
| 8 | **mreact-react-compat-vdom-v0.0.172-local-keyed** | swap rows | 64.2 | 17.9 | 40.6 | +35.73% | ms |
| 9 | react-hooks-v19.2.7-keyed | swap rows | 308.9 | 43.4 | 260.2 | +553.07% | ms |

### remove row

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | angular-cf-v22.0.0-keyed | remove row | 35 | 1.9 | 32 | best | ms |
| 2 | react-hooks-v19.2.7-keyed | remove row | 35 | 2.7 | 30.5 | 0% | ms |
| 3 | solid-v1.9.13-keyed | remove row | 35 | 0.7 | 31.2 | 0% | ms |
| 4 | **mreact-v0.0.172-local-keyed** | remove row | 35.2 | 1.3 | 31.3 | +0.57% | ms |
| 5 | svelte-v5.56.3-keyed | remove row | 35.8 | 1.6 | 32.3 | +2.29% | ms |
| 6 | marko-v6.1.9-keyed | remove row | 37.1 | 2.2 | 32.1 | +6% | ms |
| 7 | vue-v3.6.0-beta.16-keyed | remove row | 41.2 | 5.1 | 33.9 | +17.71% | ms |
| 8 | **mreact-react-compat-vdom-v0.0.172-local-keyed** | remove row | 41.4 | 4.9 | 33.4 | +18.29% | ms |
| 9 | **mreact-react-compat-v0.0.172-local-keyed** | remove row | 43.1 | 4.3 | 36.1 | +23.14% | ms |

### create many rows

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | marko-v6.1.9-keyed | create many rows | 725.9 | 83.3 | 631.5 | best | ms |
| 2 | solid-v1.9.13-keyed | create many rows | 725.9 | 72.1 | 643 | 0% | ms |
| 3 | **mreact-v0.0.172-local-keyed** | create many rows | 737.6 | 74.7 | 652.6 | +1.61% | ms |
| 4 | svelte-v5.56.3-keyed | create many rows | 754.6 | 97.9 | 645.7 | +3.95% | ms |
| 5 | vue-v3.6.0-beta.16-keyed | create many rows | 838.9 | 157.7 | 667.7 | +15.57% | ms |
| 6 | **mreact-react-compat-v0.0.172-local-keyed** | create many rows | 875.3 | 208.7 | 657.8 | +20.58% | ms |
| 7 | **mreact-react-compat-vdom-v0.0.172-local-keyed** | create many rows | 914.3 | 277.6 | 624.6 | +25.95% | ms |
| 8 | angular-cf-v22.0.0-keyed | create many rows | 930.7 | 194.8 | 657.3 | +28.21% | ms |
| 9 | react-hooks-v19.2.7-keyed | create many rows | 1104.6 | 426.6 | 660.4 | +52.17% | ms |

### append rows to large table

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | solid-v1.9.13-keyed | append rows to large table | 79.9 | 8.6 | 69.3 | best | ms |
| 2 | **mreact-v0.0.172-local-keyed** | append rows to large table | 80.1 | 8.6 | 69.2 | +0.25% | ms |
| 3 | marko-v6.1.9-keyed | append rows to large table | 80.3 | 10.3 | 68.6 | +0.5% | ms |
| 4 | svelte-v5.56.3-keyed | append rows to large table | 83.4 | 10.9 | 69.7 | +4.38% | ms |
| 5 | vue-v3.6.0-beta.16-keyed | append rows to large table | 88.5 | 16.5 | 69.4 | +10.76% | ms |
| 6 | **mreact-react-compat-v0.0.172-local-keyed** | append rows to large table | 92.1 | 23.6 | 66.9 | +15.27% | ms |
| 7 | react-hooks-v19.2.7-keyed | append rows to large table | 93.8 | 22.7 | 68.9 | +17.4% | ms |
| 8 | angular-cf-v22.0.0-keyed | append rows to large table | 102.4 | 16.5 | 70.2 | +28.16% | ms |
| 9 | **mreact-react-compat-vdom-v0.0.172-local-keyed** | append rows to large table | 108.4 | 38 | 69.3 | +35.67% | ms |

### clear rows

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | marko-v6.1.9-keyed | clear rows | 26.7 | 21.6 | 3.3 | best | ms |
| 2 | **mreact-v0.0.172-local-keyed** | clear rows | 27.5 | 22.8 | 3.4 | +3% | ms |
| 3 | svelte-v5.56.3-keyed | clear rows | 29.1 | 24.8 | 3.2 | +8.99% | ms |
| 4 | solid-v1.9.13-keyed | clear rows | 31 | 25.8 | 3.1 | +16.1% | ms |
| 5 | vue-v3.6.0-beta.16-keyed | clear rows | 33.8 | 29.5 | 3.2 | +26.59% | ms |
| 6 | **mreact-react-compat-vdom-v0.0.172-local-keyed** | clear rows | 34.6 | 30.3 | 3.2 | +29.59% | ms |
| 7 | **mreact-react-compat-v0.0.172-local-keyed** | clear rows | 39.2 | 33.9 | 3.3 | +46.82% | ms |
| 8 | react-hooks-v19.2.7-keyed | clear rows | 43.6 | 39.2 | 3.3 | +63.3% | ms |
| 9 | angular-cf-v22.0.0-keyed | clear rows | 50.5 | 45.3 | 3.3 | +89.14% | ms |

### ready memory

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | solid-v1.9.13-keyed | ready memory | 1 |  |  | best | MB |
| 2 | marko-v6.1.9-keyed | ready memory | 1.1 |  |  | +6.46% | MB |
| 3 | **mreact-v0.0.172-local-keyed** | ready memory | 1.1 |  |  | +7.58% | MB |
| 4 | svelte-v5.56.3-keyed | ready memory | 1.2 |  |  | +18.71% | MB |
| 5 | vue-v3.6.0-beta.16-keyed | ready memory | 1.3 |  |  | +27.77% | MB |
| 6 | **mreact-react-compat-vdom-v0.0.172-local-keyed** | ready memory | 1.4 |  |  | +32.07% | MB |
| 7 | **mreact-react-compat-v0.0.172-local-keyed** | ready memory | 1.4 |  |  | +35.56% | MB |
| 8 | react-hooks-v19.2.7-keyed | ready memory | 1.7 |  |  | +63.01% | MB |
| 9 | angular-cf-v22.0.0-keyed | ready memory | 2 |  |  | +97.1% | MB |

### run memory

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | marko-v6.1.9-keyed | run memory | 2.8 |  |  | best | MB |
| 2 | **mreact-v0.0.172-local-keyed** | run memory | 2.9 |  |  | +3.14% | MB |
| 3 | solid-v1.9.13-keyed | run memory | 3.1 |  |  | +9.55% | MB |
| 4 | svelte-v5.56.3-keyed | run memory | 3.5 |  |  | +23.77% | MB |
| 5 | vue-v3.6.0-beta.16-keyed | run memory | 4.4 |  |  | +56.3% | MB |
| 6 | **mreact-react-compat-v0.0.172-local-keyed** | run memory | 4.7 |  |  | +66.33% | MB |
| 7 | **mreact-react-compat-vdom-v0.0.172-local-keyed** | run memory | 4.9 |  |  | +72.36% | MB |
| 8 | react-hooks-v19.2.7-keyed | run memory | 4.9 |  |  | +72.89% | MB |
| 9 | angular-cf-v22.0.0-keyed | run memory | 5.1 |  |  | +78.72% | MB |

### repeated clear memory

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | solid-v1.9.13-keyed | repeated clear memory | 1.2 |  |  | best | MB |
| 2 | **mreact-v0.0.172-local-keyed** | repeated clear memory | 1.4 |  |  | +16.55% | MB |
| 3 | marko-v6.1.9-keyed | repeated clear memory | 1.4 |  |  | +16.69% | MB |
| 4 | svelte-v5.56.3-keyed | repeated clear memory | 1.5 |  |  | +30.84% | MB |
| 5 | vue-v3.6.0-beta.16-keyed | repeated clear memory | 1.7 |  |  | +46.68% | MB |
| 6 | **mreact-react-compat-v0.0.172-local-keyed** | repeated clear memory | 1.9 |  |  | +64.81% | MB |
| 7 | react-hooks-v19.2.7-keyed | repeated clear memory | 2.4 |  |  | +109.73% | MB |
| 8 | **mreact-react-compat-vdom-v0.0.172-local-keyed** | repeated clear memory | 2.5 |  |  | +110.52% | MB |
| 9 | angular-cf-v22.0.0-keyed | repeated clear memory | 2.6 |  |  | +121.56% | MB |

### total byte weight

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | solid-v1.9.13-keyed | total byte weight | 4.5 |  |  | best | kB |
| 2 | marko-v6.1.9-keyed | total byte weight | 4.8 |  |  | +6.67% | kB |
| 3 | **mreact-v0.0.172-local-keyed** | total byte weight | 8.5 |  |  | +88.89% | kB |
| 4 | svelte-v5.56.3-keyed | total byte weight | 14.3 |  |  | +217.78% | kB |
| 5 | vue-v3.6.0-beta.16-keyed | total byte weight | 23.9 |  |  | +431.11% | kB |
| 6 | **mreact-react-compat-vdom-v0.0.172-local-keyed** | total byte weight | 31.9 |  |  | +608.89% | kB |
| 7 | **mreact-react-compat-v0.0.172-local-keyed** | total byte weight | 33.9 |  |  | +653.33% | kB |
| 8 | angular-cf-v22.0.0-keyed | total byte weight | 44.5 |  |  | +888.89% | kB |
| 9 | react-hooks-v19.2.7-keyed | total byte weight | 51.4 |  |  | +1042.22% | kB |

## Results

| suite | framework | case | status | metric | unit | value | script | paint | diff vs 1st |
| --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | create rows | completed | duration | ms | 96.4 | 18.4 | 60.3 | +45.4% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | replace all rows | completed | duration | ms | 107.4 | 27.6 | 63.7 | +46.72% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | partial update | completed | duration | ms | 42.8 | 3.6 | 37.4 | +7% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | select row | completed | duration | ms | 13.9 | 4.1 | 8.2 | +51.09% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | swap rows | completed | duration | ms | 47.4 | 3.1 | 41.8 | +0.21% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | remove row | completed | duration | ms | 35 | 1.9 | 32 | best |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | create many rows | completed | duration | ms | 930.7 | 194.8 | 657.3 | +28.21% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | append rows to large table | completed | duration | ms | 102.4 | 16.5 | 70.2 | +28.16% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | clear rows | completed | duration | ms | 50.5 | 45.3 | 3.3 | +89.14% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | ready memory | completed | memory | MB | 2 |  |  | +97.1% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | run memory | completed | memory | MB | 5.1 |  |  | +78.72% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | repeated clear memory | completed | memory | MB | 2.6 |  |  | +121.56% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | total byte weight | completed | size | kB | 44.5 |  |  | +888.89% |
| js-framework-benchmark | marko-v6.1.9-keyed | create rows | completed | duration | ms | 69.4 | 8.6 | 59.1 | +4.68% |
| js-framework-benchmark | marko-v6.1.9-keyed | replace all rows | completed | duration | ms | 76.6 | 14.2 | 61.1 | +4.64% |
| js-framework-benchmark | marko-v6.1.9-keyed | partial update | completed | duration | ms | 46.5 | 5.6 | 36.3 | +16.25% |
| js-framework-benchmark | marko-v6.1.9-keyed | select row | completed | duration | ms | 13 | 4.5 | 6.8 | +41.3% |
| js-framework-benchmark | marko-v6.1.9-keyed | swap rows | completed | duration | ms | 47.3 | 4.6 | 37.6 | best |
| js-framework-benchmark | marko-v6.1.9-keyed | remove row | completed | duration | ms | 37.1 | 2.2 | 32.1 | +6% |
| js-framework-benchmark | marko-v6.1.9-keyed | create many rows | completed | duration | ms | 725.9 | 83.3 | 631.5 | best |
| js-framework-benchmark | marko-v6.1.9-keyed | append rows to large table | completed | duration | ms | 80.3 | 10.3 | 68.6 | +0.5% |
| js-framework-benchmark | marko-v6.1.9-keyed | clear rows | completed | duration | ms | 26.7 | 21.6 | 3.3 | best |
| js-framework-benchmark | marko-v6.1.9-keyed | ready memory | completed | memory | MB | 1.1 |  |  | +6.46% |
| js-framework-benchmark | marko-v6.1.9-keyed | run memory | completed | memory | MB | 2.8 |  |  | best |
| js-framework-benchmark | marko-v6.1.9-keyed | repeated clear memory | completed | memory | MB | 1.4 |  |  | +16.69% |
| js-framework-benchmark | marko-v6.1.9-keyed | total byte weight | completed | size | kB | 4.8 |  |  | +6.67% |
| js-framework-benchmark | **mreact-react-compat-v0.0.172-local-keyed** | create rows | completed | duration | ms | 85.3 | 23.7 | 60.4 | +28.66% |
| js-framework-benchmark | **mreact-react-compat-v0.0.172-local-keyed** | replace all rows | completed | duration | ms | 88.9 | 26.5 | 61.4 | +21.45% |
| js-framework-benchmark | **mreact-react-compat-v0.0.172-local-keyed** | partial update | completed | duration | ms | 48.6 | 10.9 | 32.5 | +21.5% |
| js-framework-benchmark | **mreact-react-compat-v0.0.172-local-keyed** | select row | completed | duration | ms | 15.4 | 6.2 | 7.3 | +67.39% |
| js-framework-benchmark | **mreact-react-compat-v0.0.172-local-keyed** | swap rows | completed | duration | ms | 59.6 | 10.8 | 43.8 | +26% |
| js-framework-benchmark | **mreact-react-compat-v0.0.172-local-keyed** | remove row | completed | duration | ms | 43.1 | 4.3 | 36.1 | +23.14% |
| js-framework-benchmark | **mreact-react-compat-v0.0.172-local-keyed** | create many rows | completed | duration | ms | 875.3 | 208.7 | 657.8 | +20.58% |
| js-framework-benchmark | **mreact-react-compat-v0.0.172-local-keyed** | append rows to large table | completed | duration | ms | 92.1 | 23.6 | 66.9 | +15.27% |
| js-framework-benchmark | **mreact-react-compat-v0.0.172-local-keyed** | clear rows | completed | duration | ms | 39.2 | 33.9 | 3.3 | +46.82% |
| js-framework-benchmark | **mreact-react-compat-v0.0.172-local-keyed** | ready memory | completed | memory | MB | 1.4 |  |  | +35.56% |
| js-framework-benchmark | **mreact-react-compat-v0.0.172-local-keyed** | run memory | completed | memory | MB | 4.7 |  |  | +66.33% |
| js-framework-benchmark | **mreact-react-compat-v0.0.172-local-keyed** | repeated clear memory | completed | memory | MB | 1.9 |  |  | +64.81% |
| js-framework-benchmark | **mreact-react-compat-v0.0.172-local-keyed** | total byte weight | completed | size | kB | 33.9 |  |  | +653.33% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.172-local-keyed** | create rows | completed | duration | ms | 93.2 | 32.1 | 59.7 | +40.57% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.172-local-keyed** | replace all rows | completed | duration | ms | 97.7 | 38 | 58.8 | +33.47% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.172-local-keyed** | partial update | completed | duration | ms | 60.3 | 20.4 | 35.1 | +50.75% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.172-local-keyed** | select row | completed | duration | ms | 16.4 | 6.9 | 7.3 | +78.26% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.172-local-keyed** | swap rows | completed | duration | ms | 64.2 | 17.9 | 40.6 | +35.73% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.172-local-keyed** | remove row | completed | duration | ms | 41.4 | 4.9 | 33.4 | +18.29% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.172-local-keyed** | create many rows | completed | duration | ms | 914.3 | 277.6 | 624.6 | +25.95% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.172-local-keyed** | append rows to large table | completed | duration | ms | 108.4 | 38 | 69.3 | +35.67% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.172-local-keyed** | clear rows | completed | duration | ms | 34.6 | 30.3 | 3.2 | +29.59% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.172-local-keyed** | ready memory | completed | memory | MB | 1.4 |  |  | +32.07% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.172-local-keyed** | run memory | completed | memory | MB | 4.9 |  |  | +72.36% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.172-local-keyed** | repeated clear memory | completed | memory | MB | 2.5 |  |  | +110.52% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.172-local-keyed** | total byte weight | completed | size | kB | 31.9 |  |  | +608.89% |
| js-framework-benchmark | **mreact-v0.0.172-local-keyed** | create rows | completed | duration | ms | 67.4 | 6.2 | 59.6 | +1.66% |
| js-framework-benchmark | **mreact-v0.0.172-local-keyed** | replace all rows | completed | duration | ms | 73.9 | 12.3 | 60.2 | +0.96% |
| js-framework-benchmark | **mreact-v0.0.172-local-keyed** | partial update | completed | duration | ms | 40 | 1.7 | 33.5 | best |
| js-framework-benchmark | **mreact-v0.0.172-local-keyed** | select row | completed | duration | ms | 9.2 | 0.8 | 6.7 | best |
| js-framework-benchmark | **mreact-v0.0.172-local-keyed** | swap rows | completed | duration | ms | 49 | 1.6 | 42.3 | +3.59% |
| js-framework-benchmark | **mreact-v0.0.172-local-keyed** | remove row | completed | duration | ms | 35.2 | 1.3 | 31.3 | +0.57% |
| js-framework-benchmark | **mreact-v0.0.172-local-keyed** | create many rows | completed | duration | ms | 737.6 | 74.7 | 652.6 | +1.61% |
| js-framework-benchmark | **mreact-v0.0.172-local-keyed** | append rows to large table | completed | duration | ms | 80.1 | 8.6 | 69.2 | +0.25% |
| js-framework-benchmark | **mreact-v0.0.172-local-keyed** | clear rows | completed | duration | ms | 27.5 | 22.8 | 3.4 | +3% |
| js-framework-benchmark | **mreact-v0.0.172-local-keyed** | ready memory | completed | memory | MB | 1.1 |  |  | +7.58% |
| js-framework-benchmark | **mreact-v0.0.172-local-keyed** | run memory | completed | memory | MB | 2.9 |  |  | +3.14% |
| js-framework-benchmark | **mreact-v0.0.172-local-keyed** | repeated clear memory | completed | memory | MB | 1.4 |  |  | +16.55% |
| js-framework-benchmark | **mreact-v0.0.172-local-keyed** | total byte weight | completed | size | kB | 8.5 |  |  | +88.89% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | create rows | completed | duration | ms | 83.1 | 21.9 | 59.6 | +25.34% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | replace all rows | completed | duration | ms | 93 | 31.4 | 60.9 | +27.05% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | partial update | completed | duration | ms | 50.7 | 10 | 35.1 | +26.75% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | select row | completed | duration | ms | 14.9 | 5.8 | 7.3 | +61.96% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | swap rows | completed | duration | ms | 308.9 | 43.4 | 260.2 | +553.07% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | remove row | completed | duration | ms | 35 | 2.7 | 30.5 | 0% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | create many rows | completed | duration | ms | 1104.6 | 426.6 | 660.4 | +52.17% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | append rows to large table | completed | duration | ms | 93.8 | 22.7 | 68.9 | +17.4% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | clear rows | completed | duration | ms | 43.6 | 39.2 | 3.3 | +63.3% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | ready memory | completed | memory | MB | 1.7 |  |  | +63.01% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | run memory | completed | memory | MB | 4.9 |  |  | +72.89% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | repeated clear memory | completed | memory | MB | 2.4 |  |  | +109.73% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | total byte weight | completed | size | kB | 51.4 |  |  | +1042.22% |
| js-framework-benchmark | solid-v1.9.13-keyed | create rows | completed | duration | ms | 66.3 | 7.4 | 57.7 | best |
| js-framework-benchmark | solid-v1.9.13-keyed | replace all rows | completed | duration | ms | 73.2 | 13.5 | 58.4 | best |
| js-framework-benchmark | solid-v1.9.13-keyed | partial update | completed | duration | ms | 41.2 | 2.6 | 34.1 | +3% |
| js-framework-benchmark | solid-v1.9.13-keyed | select row | completed | duration | ms | 10.8 | 2.1 | 6.9 | +17.39% |
| js-framework-benchmark | solid-v1.9.13-keyed | swap rows | completed | duration | ms | 51.6 | 2.1 | 43.4 | +9.09% |
| js-framework-benchmark | solid-v1.9.13-keyed | remove row | completed | duration | ms | 35 | 0.7 | 31.2 | 0% |
| js-framework-benchmark | solid-v1.9.13-keyed | create many rows | completed | duration | ms | 725.9 | 72.1 | 643 | 0% |
| js-framework-benchmark | solid-v1.9.13-keyed | append rows to large table | completed | duration | ms | 79.9 | 8.6 | 69.3 | best |
| js-framework-benchmark | solid-v1.9.13-keyed | clear rows | completed | duration | ms | 31 | 25.8 | 3.1 | +16.1% |
| js-framework-benchmark | solid-v1.9.13-keyed | ready memory | completed | memory | MB | 1 |  |  | best |
| js-framework-benchmark | solid-v1.9.13-keyed | run memory | completed | memory | MB | 3.1 |  |  | +9.55% |
| js-framework-benchmark | solid-v1.9.13-keyed | repeated clear memory | completed | memory | MB | 1.2 |  |  | best |
| js-framework-benchmark | solid-v1.9.13-keyed | total byte weight | completed | size | kB | 4.5 |  |  | best |
| js-framework-benchmark | svelte-v5.56.3-keyed | create rows | completed | duration | ms | 69 | 10.4 | 57.3 | +4.07% |
| js-framework-benchmark | svelte-v5.56.3-keyed | replace all rows | completed | duration | ms | 79.6 | 17.4 | 59.4 | +8.74% |
| js-framework-benchmark | svelte-v5.56.3-keyed | partial update | completed | duration | ms | 45.9 | 3.9 | 36.4 | +14.75% |
| js-framework-benchmark | svelte-v5.56.3-keyed | select row | completed | duration | ms | 15.3 | 6.4 | 7.1 | +66.3% |
| js-framework-benchmark | svelte-v5.56.3-keyed | swap rows | completed | duration | ms | 50 | 4.1 | 41.6 | +5.71% |
| js-framework-benchmark | svelte-v5.56.3-keyed | remove row | completed | duration | ms | 35.8 | 1.6 | 32.3 | +2.29% |
| js-framework-benchmark | svelte-v5.56.3-keyed | create many rows | completed | duration | ms | 754.6 | 97.9 | 645.7 | +3.95% |
| js-framework-benchmark | svelte-v5.56.3-keyed | append rows to large table | completed | duration | ms | 83.4 | 10.9 | 69.7 | +4.38% |
| js-framework-benchmark | svelte-v5.56.3-keyed | clear rows | completed | duration | ms | 29.1 | 24.8 | 3.2 | +8.99% |
| js-framework-benchmark | svelte-v5.56.3-keyed | ready memory | completed | memory | MB | 1.2 |  |  | +18.71% |
| js-framework-benchmark | svelte-v5.56.3-keyed | run memory | completed | memory | MB | 3.5 |  |  | +23.77% |
| js-framework-benchmark | svelte-v5.56.3-keyed | repeated clear memory | completed | memory | MB | 1.5 |  |  | +30.84% |
| js-framework-benchmark | svelte-v5.56.3-keyed | total byte weight | completed | size | kB | 14.3 |  |  | +217.78% |
| js-framework-benchmark | vue-v3.6.0-beta.16-keyed | create rows | completed | duration | ms | 81.7 | 19.7 | 60.2 | +23.23% |
| js-framework-benchmark | vue-v3.6.0-beta.16-keyed | replace all rows | completed | duration | ms | 87 | 23.9 | 62.3 | +18.85% |
| js-framework-benchmark | vue-v3.6.0-beta.16-keyed | partial update | completed | duration | ms | 44.9 | 6.4 | 34.7 | +12.25% |
| js-framework-benchmark | vue-v3.6.0-beta.16-keyed | select row | completed | duration | ms | 11.1 | 2.5 | 6.8 | +20.65% |
| js-framework-benchmark | vue-v3.6.0-beta.16-keyed | swap rows | completed | duration | ms | 48.3 | 3.2 | 40 | +2.11% |
| js-framework-benchmark | vue-v3.6.0-beta.16-keyed | remove row | completed | duration | ms | 41.2 | 5.1 | 33.9 | +17.71% |
| js-framework-benchmark | vue-v3.6.0-beta.16-keyed | create many rows | completed | duration | ms | 838.9 | 157.7 | 667.7 | +15.57% |
| js-framework-benchmark | vue-v3.6.0-beta.16-keyed | append rows to large table | completed | duration | ms | 88.5 | 16.5 | 69.4 | +10.76% |
| js-framework-benchmark | vue-v3.6.0-beta.16-keyed | clear rows | completed | duration | ms | 33.8 | 29.5 | 3.2 | +26.59% |
| js-framework-benchmark | vue-v3.6.0-beta.16-keyed | ready memory | completed | memory | MB | 1.3 |  |  | +27.77% |
| js-framework-benchmark | vue-v3.6.0-beta.16-keyed | run memory | completed | memory | MB | 4.4 |  |  | +56.3% |
| js-framework-benchmark | vue-v3.6.0-beta.16-keyed | repeated clear memory | completed | memory | MB | 1.7 |  |  | +46.68% |
| js-framework-benchmark | vue-v3.6.0-beta.16-keyed | total byte weight | completed | size | kB | 23.9 |  |  | +431.11% |
