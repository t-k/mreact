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
| solid | keyed/solid |
| mreact | keyed/mreact |

## Unsupported Primitive Adapters

- qwik: krausest/js-framework-benchmark keyed/qwik currently fails the official isKeyed check and is categorized as non-keyed.
- qwik-v2: krausest/js-framework-benchmark does not currently provide a matching Qwik v2 keyed fixture.
- solid-v2: krausest/js-framework-benchmark does not currently provide a matching Solid v2 keyed fixture.

Raw JSON files are stored in `benchmarks/results/2026-06-17/001/js-framework-benchmark-results`.
Chrome trace files are stored in `benchmarks/results/2026-06-17/001/js-framework-benchmark-traces`.

## Rankings

Lower values are better for all js-framework-benchmark metrics reported here.

### create rows

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | **mreact-v0.0.170-local-keyed** | create rows | 71.1 | 6.5 | 63.5 | best | ms |
| 2 | solid-v1.9.13-keyed | create rows | 72.3 | 7.6 | 63.4 | +1.69% | ms |
| 3 | marko-v6.1.8-keyed | create rows | 75.2 | 9.2 | 64.8 | +5.77% | ms |
| 4 | svelte-v5.56.3-keyed | create rows | 75.3 | 10.9 | 63.8 | +5.91% | ms |
| 5 | vue-v3.6.0-beta.15-keyed | create rows | 88 | 21.2 | 65.5 | +23.77% | ms |
| 6 | react-hooks-v19.2.7-keyed | create rows | 89.1 | 23.1 | 64.6 | +25.32% | ms |
| 7 | angular-cf-v22.0.0-keyed | create rows | 102.4 | 17.9 | 66.5 | +44.02% | ms |
| 8 | **mreact-react-compat-v0.0.170-local-keyed** | create rows | 114.7 | 48.8 | 64.4 | +61.32% | ms |

### replace all rows

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | solid-v1.9.13-keyed | replace all rows | 77.3 | 15 | 61.1 | best | ms |
| 2 | **mreact-v0.0.170-local-keyed** | replace all rows | 78.5 | 13.4 | 64.1 | +1.55% | ms |
| 3 | marko-v6.1.8-keyed | replace all rows | 82.7 | 15.5 | 66.2 | +6.99% | ms |
| 4 | svelte-v5.56.3-keyed | replace all rows | 83.2 | 18.6 | 63.4 | +7.63% | ms |
| 5 | vue-v3.6.0-beta.15-keyed | replace all rows | 92.7 | 26.5 | 65.1 | +19.92% | ms |
| 6 | react-hooks-v19.2.7-keyed | replace all rows | 101.9 | 35.5 | 66 | +31.82% | ms |
| 7 | angular-cf-v22.0.0-keyed | replace all rows | 118.7 | 33.8 | 69 | +53.56% | ms |
| 8 | **mreact-react-compat-v0.0.170-local-keyed** | replace all rows | 128 | 59.7 | 65.7 | +65.59% | ms |

### partial update

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | angular-cf-v22.0.0-keyed | partial update | 41.9 | 3.3 | 37.5 | best | ms |
| 2 | **mreact-v0.0.170-local-keyed** | partial update | 43.1 | 2.2 | 37.6 | +2.86% | ms |
| 3 | solid-v1.9.13-keyed | partial update | 45 | 3 | 38.7 | +7.4% | ms |
| 4 | svelte-v5.56.3-keyed | partial update | 45.7 | 4 | 38.2 | +9.07% | ms |
| 5 | marko-v6.1.8-keyed | partial update | 47.8 | 5.9 | 37.9 | +14.08% | ms |
| 6 | vue-v3.6.0-beta.15-keyed | partial update | 50 | 6.7 | 40.2 | +19.33% | ms |
| 7 | react-hooks-v19.2.7-keyed | partial update | 53.7 | 10.4 | 39 | +28.16% | ms |
| 8 | **mreact-react-compat-v0.0.170-local-keyed** | partial update | 68 | 26.5 | 37.9 | +62.29% | ms |

### select row

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | **mreact-v0.0.170-local-keyed** | select row | 8.5 | 0.9 | 6.5 | best | ms |
| 2 | solid-v1.9.13-keyed | select row | 9.9 | 2.1 | 6.5 | +16.47% | ms |
| 3 | vue-v3.6.0-beta.15-keyed | select row | 10.3 | 2.4 | 6.6 | +21.18% | ms |
| 4 | marko-v6.1.8-keyed | select row | 11.8 | 4.2 | 6.3 | +38.82% | ms |
| 5 | angular-cf-v22.0.0-keyed | select row | 12 | 4.1 | 7 | +41.18% | ms |
| 6 | react-hooks-v19.2.7-keyed | select row | 14.7 | 6.2 | 6.9 | +72.94% | ms |
| 7 | svelte-v5.56.3-keyed | select row | 14.7 | 6.6 | 6.4 | +72.94% | ms |
| 8 | **mreact-react-compat-v0.0.170-local-keyed** | select row | 16.9 | 8.7 | 6.8 | +98.82% | ms |

### swap rows

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | **mreact-v0.0.170-local-keyed** | swap rows | 54.1 | 2 | 48.1 | best | ms |
| 2 | angular-cf-v22.0.0-keyed | swap rows | 55 | 2.9 | 49 | +1.66% | ms |
| 3 | svelte-v5.56.3-keyed | swap rows | 57.6 | 4.1 | 49.3 | +6.47% | ms |
| 4 | marko-v6.1.8-keyed | swap rows | 59 | 5.1 | 49.3 | +9.06% | ms |
| 5 | solid-v1.9.13-keyed | swap rows | 60 | 2.3 | 53.4 | +10.91% | ms |
| 6 | vue-v3.6.0-beta.15-keyed | swap rows | 63.3 | 3.3 | 55.6 | +17.01% | ms |
| 7 | **mreact-react-compat-v0.0.170-local-keyed** | swap rows | 78.8 | 21.7 | 52.2 | +45.66% | ms |
| 8 | react-hooks-v19.2.7-keyed | swap rows | 350.6 | 54 | 287.7 | +548.06% | ms |

### remove row

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | angular-cf-v22.0.0-keyed | remove row | 33.3 | 1.6 | 30.9 | best | ms |
| 2 | **mreact-v0.0.170-local-keyed** | remove row | 36.5 | 1.6 | 33 | +9.61% | ms |
| 3 | marko-v6.1.8-keyed | remove row | 39.1 | 2.2 | 34.6 | +17.42% | ms |
| 4 | solid-v1.9.13-keyed | remove row | 40.2 | 0.9 | 36.8 | +20.72% | ms |
| 5 | svelte-v5.56.3-keyed | remove row | 42.1 | 1.7 | 37.6 | +26.43% | ms |
| 6 | react-hooks-v19.2.7-keyed | remove row | 42.7 | 2.8 | 37.4 | +28.23% | ms |
| 7 | vue-v3.6.0-beta.15-keyed | remove row | 44.1 | 5.8 | 36 | +32.43% | ms |
| 8 | **mreact-react-compat-v0.0.170-local-keyed** | remove row | 45.9 | 9.1 | 35.2 | +37.84% | ms |

### create many rows

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | solid-v1.9.13-keyed | create many rows | 826.5 | 76.2 | 741.2 | best | ms |
| 2 | **mreact-v0.0.170-local-keyed** | create many rows | 830.3 | 75.5 | 744.2 | +0.46% | ms |
| 3 | marko-v6.1.8-keyed | create many rows | 832 | 86.9 | 736.3 | +0.67% | ms |
| 4 | svelte-v5.56.3-keyed | create many rows | 851.3 | 98.5 | 741.9 | +3% | ms |
| 5 | vue-v3.6.0-beta.15-keyed | create many rows | 951.7 | 173.9 | 766.9 | +15.15% | ms |
| 6 | angular-cf-v22.0.0-keyed | create many rows | 1061 | 205.2 | 767.4 | +28.37% | ms |
| 7 | **mreact-react-compat-v0.0.170-local-keyed** | create many rows | 1118.6 | 389.4 | 720.3 | +35.34% | ms |
| 8 | react-hooks-v19.2.7-keyed | create many rows | 1280.6 | 483.6 | 802.5 | +54.94% | ms |

### append rows to large table

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | **mreact-v0.0.170-local-keyed** | append rows to large table | 87.7 | 9.2 | 76 | best | ms |
| 2 | marko-v6.1.8-keyed | append rows to large table | 88.1 | 10.4 | 75.7 | +0.46% | ms |
| 3 | solid-v1.9.13-keyed | append rows to large table | 88.6 | 8.9 | 77.6 | +1.03% | ms |
| 4 | svelte-v5.56.3-keyed | append rows to large table | 90.5 | 11.6 | 76.1 | +3.19% | ms |
| 5 | vue-v3.6.0-beta.15-keyed | append rows to large table | 97.9 | 18.2 | 78 | +11.63% | ms |
| 6 | react-hooks-v19.2.7-keyed | append rows to large table | 106.5 | 24 | 81 | +21.44% | ms |
| 7 | angular-cf-v22.0.0-keyed | append rows to large table | 109.1 | 17.4 | 76 | +24.4% | ms |
| 8 | **mreact-react-compat-v0.0.170-local-keyed** | append rows to large table | 139.9 | 61 | 77.1 | +59.52% | ms |

### clear rows

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | marko-v6.1.8-keyed | clear rows | 30.8 | 25.8 | 3.4 | best | ms |
| 2 | **mreact-v0.0.170-local-keyed** | clear rows | 32.9 | 28.5 | 3.6 | +6.82% | ms |
| 3 | svelte-v5.56.3-keyed | clear rows | 33.9 | 29.4 | 3.3 | +10.06% | ms |
| 4 | solid-v1.9.13-keyed | clear rows | 36.1 | 31.4 | 3.3 | +17.21% | ms |
| 5 | vue-v3.6.0-beta.15-keyed | clear rows | 46.2 | 41.4 | 3.6 | +50% | ms |
| 6 | **mreact-react-compat-v0.0.170-local-keyed** | clear rows | 51.2 | 46.2 | 3.7 | +66.23% | ms |
| 7 | react-hooks-v19.2.7-keyed | clear rows | 59.2 | 54.9 | 3.7 | +92.21% | ms |
| 8 | angular-cf-v22.0.0-keyed | clear rows | 65.2 | 59.9 | 3.7 | +111.69% | ms |

### ready memory

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | solid-v1.9.13-keyed | ready memory | 1 |  |  | best | MB |
| 2 | **mreact-v0.0.170-local-keyed** | ready memory | 1.1 |  |  | +7.61% | MB |
| 3 | marko-v6.1.8-keyed | ready memory | 1.1 |  |  | +8.16% | MB |
| 4 | svelte-v5.56.3-keyed | ready memory | 1.2 |  |  | +20.13% | MB |
| 5 | vue-v3.6.0-beta.15-keyed | ready memory | 1.3 |  |  | +30.66% | MB |
| 6 | **mreact-react-compat-v0.0.170-local-keyed** | ready memory | 1.4 |  |  | +34.37% | MB |
| 7 | react-hooks-v19.2.7-keyed | ready memory | 1.6 |  |  | +60.59% | MB |
| 8 | angular-cf-v22.0.0-keyed | ready memory | 2 |  |  | +93.16% | MB |

### run memory

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | marko-v6.1.8-keyed | run memory | 2.8 |  |  | best | MB |
| 2 | **mreact-v0.0.170-local-keyed** | run memory | 2.9 |  |  | +2.39% | MB |
| 3 | solid-v1.9.13-keyed | run memory | 3.1 |  |  | +9.28% | MB |
| 4 | svelte-v5.56.3-keyed | run memory | 3.5 |  |  | +21.31% | MB |
| 5 | vue-v3.6.0-beta.15-keyed | run memory | 4.4 |  |  | +55.58% | MB |
| 6 | react-hooks-v19.2.7-keyed | run memory | 4.9 |  |  | +71.97% | MB |
| 7 | angular-cf-v22.0.0-keyed | run memory | 5 |  |  | +75.16% | MB |
| 8 | **mreact-react-compat-v0.0.170-local-keyed** | run memory | 5.4 |  |  | +88.31% | MB |

### repeated clear memory

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | solid-v1.9.13-keyed | repeated clear memory | 1.2 |  |  | best | MB |
| 2 | **mreact-v0.0.170-local-keyed** | repeated clear memory | 1.3 |  |  | +5.14% | MB |
| 3 | marko-v6.1.8-keyed | repeated clear memory | 1.3 |  |  | +7.12% | MB |
| 4 | svelte-v5.56.3-keyed | repeated clear memory | 1.6 |  |  | +27.71% | MB |
| 5 | vue-v3.6.0-beta.15-keyed | repeated clear memory | 1.6 |  |  | +32.28% | MB |
| 6 | react-hooks-v19.2.7-keyed | repeated clear memory | 2.5 |  |  | +98.12% | MB |
| 7 | **mreact-react-compat-v0.0.170-local-keyed** | repeated clear memory | 2.5 |  |  | +98.57% | MB |
| 8 | angular-cf-v22.0.0-keyed | repeated clear memory | 2.6 |  |  | +108.53% | MB |

### total byte weight

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | solid-v1.9.13-keyed | total byte weight | 4.5 |  |  | best | kB |
| 2 | marko-v6.1.8-keyed | total byte weight | 4.8 |  |  | +6.67% | kB |
| 3 | **mreact-v0.0.170-local-keyed** | total byte weight | 8.5 |  |  | +88.89% | kB |
| 4 | svelte-v5.56.3-keyed | total byte weight | 14.3 |  |  | +217.78% | kB |
| 5 | vue-v3.6.0-beta.15-keyed | total byte weight | 23.8 |  |  | +428.89% | kB |
| 6 | **mreact-react-compat-v0.0.170-local-keyed** | total byte weight | 29.5 |  |  | +555.56% | kB |
| 7 | angular-cf-v22.0.0-keyed | total byte weight | 44.5 |  |  | +888.89% | kB |
| 8 | react-hooks-v19.2.7-keyed | total byte weight | 51.4 |  |  | +1042.22% | kB |

## Results

| suite | framework | case | status | metric | unit | value | script | paint | diff vs 1st |
| --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | create rows | completed | duration | ms | 102.4 | 17.9 | 66.5 | +44.02% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | replace all rows | completed | duration | ms | 118.7 | 33.8 | 69 | +53.56% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | partial update | completed | duration | ms | 41.9 | 3.3 | 37.5 | best |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | select row | completed | duration | ms | 12 | 4.1 | 7 | +41.18% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | swap rows | completed | duration | ms | 55 | 2.9 | 49 | +1.66% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | remove row | completed | duration | ms | 33.3 | 1.6 | 30.9 | best |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | create many rows | completed | duration | ms | 1061 | 205.2 | 767.4 | +28.37% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | append rows to large table | completed | duration | ms | 109.1 | 17.4 | 76 | +24.4% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | clear rows | completed | duration | ms | 65.2 | 59.9 | 3.7 | +111.69% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | ready memory | completed | memory | MB | 2 |  |  | +93.16% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | run memory | completed | memory | MB | 5 |  |  | +75.16% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | repeated clear memory | completed | memory | MB | 2.6 |  |  | +108.53% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | total byte weight | completed | size | kB | 44.5 |  |  | +888.89% |
| js-framework-benchmark | marko-v6.1.8-keyed | create rows | completed | duration | ms | 75.2 | 9.2 | 64.8 | +5.77% |
| js-framework-benchmark | marko-v6.1.8-keyed | replace all rows | completed | duration | ms | 82.7 | 15.5 | 66.2 | +6.99% |
| js-framework-benchmark | marko-v6.1.8-keyed | partial update | completed | duration | ms | 47.8 | 5.9 | 37.9 | +14.08% |
| js-framework-benchmark | marko-v6.1.8-keyed | select row | completed | duration | ms | 11.8 | 4.2 | 6.3 | +38.82% |
| js-framework-benchmark | marko-v6.1.8-keyed | swap rows | completed | duration | ms | 59 | 5.1 | 49.3 | +9.06% |
| js-framework-benchmark | marko-v6.1.8-keyed | remove row | completed | duration | ms | 39.1 | 2.2 | 34.6 | +17.42% |
| js-framework-benchmark | marko-v6.1.8-keyed | create many rows | completed | duration | ms | 832 | 86.9 | 736.3 | +0.67% |
| js-framework-benchmark | marko-v6.1.8-keyed | append rows to large table | completed | duration | ms | 88.1 | 10.4 | 75.7 | +0.46% |
| js-framework-benchmark | marko-v6.1.8-keyed | clear rows | completed | duration | ms | 30.8 | 25.8 | 3.4 | best |
| js-framework-benchmark | marko-v6.1.8-keyed | ready memory | completed | memory | MB | 1.1 |  |  | +8.16% |
| js-framework-benchmark | marko-v6.1.8-keyed | run memory | completed | memory | MB | 2.8 |  |  | best |
| js-framework-benchmark | marko-v6.1.8-keyed | repeated clear memory | completed | memory | MB | 1.3 |  |  | +7.12% |
| js-framework-benchmark | marko-v6.1.8-keyed | total byte weight | completed | size | kB | 4.8 |  |  | +6.67% |
| js-framework-benchmark | **mreact-react-compat-v0.0.170-local-keyed** | create rows | completed | duration | ms | 114.7 | 48.8 | 64.4 | +61.32% |
| js-framework-benchmark | **mreact-react-compat-v0.0.170-local-keyed** | replace all rows | completed | duration | ms | 128 | 59.7 | 65.7 | +65.59% |
| js-framework-benchmark | **mreact-react-compat-v0.0.170-local-keyed** | partial update | completed | duration | ms | 68 | 26.5 | 37.9 | +62.29% |
| js-framework-benchmark | **mreact-react-compat-v0.0.170-local-keyed** | select row | completed | duration | ms | 16.9 | 8.7 | 6.8 | +98.82% |
| js-framework-benchmark | **mreact-react-compat-v0.0.170-local-keyed** | swap rows | completed | duration | ms | 78.8 | 21.7 | 52.2 | +45.66% |
| js-framework-benchmark | **mreact-react-compat-v0.0.170-local-keyed** | remove row | completed | duration | ms | 45.9 | 9.1 | 35.2 | +37.84% |
| js-framework-benchmark | **mreact-react-compat-v0.0.170-local-keyed** | create many rows | completed | duration | ms | 1118.6 | 389.4 | 720.3 | +35.34% |
| js-framework-benchmark | **mreact-react-compat-v0.0.170-local-keyed** | append rows to large table | completed | duration | ms | 139.9 | 61 | 77.1 | +59.52% |
| js-framework-benchmark | **mreact-react-compat-v0.0.170-local-keyed** | clear rows | completed | duration | ms | 51.2 | 46.2 | 3.7 | +66.23% |
| js-framework-benchmark | **mreact-react-compat-v0.0.170-local-keyed** | ready memory | completed | memory | MB | 1.4 |  |  | +34.37% |
| js-framework-benchmark | **mreact-react-compat-v0.0.170-local-keyed** | run memory | completed | memory | MB | 5.4 |  |  | +88.31% |
| js-framework-benchmark | **mreact-react-compat-v0.0.170-local-keyed** | repeated clear memory | completed | memory | MB | 2.5 |  |  | +98.57% |
| js-framework-benchmark | **mreact-react-compat-v0.0.170-local-keyed** | total byte weight | completed | size | kB | 29.5 |  |  | +555.56% |
| js-framework-benchmark | **mreact-v0.0.170-local-keyed** | create rows | completed | duration | ms | 71.1 | 6.5 | 63.5 | best |
| js-framework-benchmark | **mreact-v0.0.170-local-keyed** | replace all rows | completed | duration | ms | 78.5 | 13.4 | 64.1 | +1.55% |
| js-framework-benchmark | **mreact-v0.0.170-local-keyed** | partial update | completed | duration | ms | 43.1 | 2.2 | 37.6 | +2.86% |
| js-framework-benchmark | **mreact-v0.0.170-local-keyed** | select row | completed | duration | ms | 8.5 | 0.9 | 6.5 | best |
| js-framework-benchmark | **mreact-v0.0.170-local-keyed** | swap rows | completed | duration | ms | 54.1 | 2 | 48.1 | best |
| js-framework-benchmark | **mreact-v0.0.170-local-keyed** | remove row | completed | duration | ms | 36.5 | 1.6 | 33 | +9.61% |
| js-framework-benchmark | **mreact-v0.0.170-local-keyed** | create many rows | completed | duration | ms | 830.3 | 75.5 | 744.2 | +0.46% |
| js-framework-benchmark | **mreact-v0.0.170-local-keyed** | append rows to large table | completed | duration | ms | 87.7 | 9.2 | 76 | best |
| js-framework-benchmark | **mreact-v0.0.170-local-keyed** | clear rows | completed | duration | ms | 32.9 | 28.5 | 3.6 | +6.82% |
| js-framework-benchmark | **mreact-v0.0.170-local-keyed** | ready memory | completed | memory | MB | 1.1 |  |  | +7.61% |
| js-framework-benchmark | **mreact-v0.0.170-local-keyed** | run memory | completed | memory | MB | 2.9 |  |  | +2.39% |
| js-framework-benchmark | **mreact-v0.0.170-local-keyed** | repeated clear memory | completed | memory | MB | 1.3 |  |  | +5.14% |
| js-framework-benchmark | **mreact-v0.0.170-local-keyed** | total byte weight | completed | size | kB | 8.5 |  |  | +88.89% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | create rows | completed | duration | ms | 89.1 | 23.1 | 64.6 | +25.32% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | replace all rows | completed | duration | ms | 101.9 | 35.5 | 66 | +31.82% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | partial update | completed | duration | ms | 53.7 | 10.4 | 39 | +28.16% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | select row | completed | duration | ms | 14.7 | 6.2 | 6.9 | +72.94% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | swap rows | completed | duration | ms | 350.6 | 54 | 287.7 | +548.06% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | remove row | completed | duration | ms | 42.7 | 2.8 | 37.4 | +28.23% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | create many rows | completed | duration | ms | 1280.6 | 483.6 | 802.5 | +54.94% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | append rows to large table | completed | duration | ms | 106.5 | 24 | 81 | +21.44% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | clear rows | completed | duration | ms | 59.2 | 54.9 | 3.7 | +92.21% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | ready memory | completed | memory | MB | 1.6 |  |  | +60.59% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | run memory | completed | memory | MB | 4.9 |  |  | +71.97% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | repeated clear memory | completed | memory | MB | 2.5 |  |  | +98.12% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | total byte weight | completed | size | kB | 51.4 |  |  | +1042.22% |
| js-framework-benchmark | solid-v1.9.13-keyed | create rows | completed | duration | ms | 72.3 | 7.6 | 63.4 | +1.69% |
| js-framework-benchmark | solid-v1.9.13-keyed | replace all rows | completed | duration | ms | 77.3 | 15 | 61.1 | best |
| js-framework-benchmark | solid-v1.9.13-keyed | partial update | completed | duration | ms | 45 | 3 | 38.7 | +7.4% |
| js-framework-benchmark | solid-v1.9.13-keyed | select row | completed | duration | ms | 9.9 | 2.1 | 6.5 | +16.47% |
| js-framework-benchmark | solid-v1.9.13-keyed | swap rows | completed | duration | ms | 60 | 2.3 | 53.4 | +10.91% |
| js-framework-benchmark | solid-v1.9.13-keyed | remove row | completed | duration | ms | 40.2 | 0.9 | 36.8 | +20.72% |
| js-framework-benchmark | solid-v1.9.13-keyed | create many rows | completed | duration | ms | 826.5 | 76.2 | 741.2 | best |
| js-framework-benchmark | solid-v1.9.13-keyed | append rows to large table | completed | duration | ms | 88.6 | 8.9 | 77.6 | +1.03% |
| js-framework-benchmark | solid-v1.9.13-keyed | clear rows | completed | duration | ms | 36.1 | 31.4 | 3.3 | +17.21% |
| js-framework-benchmark | solid-v1.9.13-keyed | ready memory | completed | memory | MB | 1 |  |  | best |
| js-framework-benchmark | solid-v1.9.13-keyed | run memory | completed | memory | MB | 3.1 |  |  | +9.28% |
| js-framework-benchmark | solid-v1.9.13-keyed | repeated clear memory | completed | memory | MB | 1.2 |  |  | best |
| js-framework-benchmark | solid-v1.9.13-keyed | total byte weight | completed | size | kB | 4.5 |  |  | best |
| js-framework-benchmark | svelte-v5.56.3-keyed | create rows | completed | duration | ms | 75.3 | 10.9 | 63.8 | +5.91% |
| js-framework-benchmark | svelte-v5.56.3-keyed | replace all rows | completed | duration | ms | 83.2 | 18.6 | 63.4 | +7.63% |
| js-framework-benchmark | svelte-v5.56.3-keyed | partial update | completed | duration | ms | 45.7 | 4 | 38.2 | +9.07% |
| js-framework-benchmark | svelte-v5.56.3-keyed | select row | completed | duration | ms | 14.7 | 6.6 | 6.4 | +72.94% |
| js-framework-benchmark | svelte-v5.56.3-keyed | swap rows | completed | duration | ms | 57.6 | 4.1 | 49.3 | +6.47% |
| js-framework-benchmark | svelte-v5.56.3-keyed | remove row | completed | duration | ms | 42.1 | 1.7 | 37.6 | +26.43% |
| js-framework-benchmark | svelte-v5.56.3-keyed | create many rows | completed | duration | ms | 851.3 | 98.5 | 741.9 | +3% |
| js-framework-benchmark | svelte-v5.56.3-keyed | append rows to large table | completed | duration | ms | 90.5 | 11.6 | 76.1 | +3.19% |
| js-framework-benchmark | svelte-v5.56.3-keyed | clear rows | completed | duration | ms | 33.9 | 29.4 | 3.3 | +10.06% |
| js-framework-benchmark | svelte-v5.56.3-keyed | ready memory | completed | memory | MB | 1.2 |  |  | +20.13% |
| js-framework-benchmark | svelte-v5.56.3-keyed | run memory | completed | memory | MB | 3.5 |  |  | +21.31% |
| js-framework-benchmark | svelte-v5.56.3-keyed | repeated clear memory | completed | memory | MB | 1.6 |  |  | +27.71% |
| js-framework-benchmark | svelte-v5.56.3-keyed | total byte weight | completed | size | kB | 14.3 |  |  | +217.78% |
| js-framework-benchmark | vue-v3.6.0-beta.15-keyed | create rows | completed | duration | ms | 88 | 21.2 | 65.5 | +23.77% |
| js-framework-benchmark | vue-v3.6.0-beta.15-keyed | replace all rows | completed | duration | ms | 92.7 | 26.5 | 65.1 | +19.92% |
| js-framework-benchmark | vue-v3.6.0-beta.15-keyed | partial update | completed | duration | ms | 50 | 6.7 | 40.2 | +19.33% |
| js-framework-benchmark | vue-v3.6.0-beta.15-keyed | select row | completed | duration | ms | 10.3 | 2.4 | 6.6 | +21.18% |
| js-framework-benchmark | vue-v3.6.0-beta.15-keyed | swap rows | completed | duration | ms | 63.3 | 3.3 | 55.6 | +17.01% |
| js-framework-benchmark | vue-v3.6.0-beta.15-keyed | remove row | completed | duration | ms | 44.1 | 5.8 | 36 | +32.43% |
| js-framework-benchmark | vue-v3.6.0-beta.15-keyed | create many rows | completed | duration | ms | 951.7 | 173.9 | 766.9 | +15.15% |
| js-framework-benchmark | vue-v3.6.0-beta.15-keyed | append rows to large table | completed | duration | ms | 97.9 | 18.2 | 78 | +11.63% |
| js-framework-benchmark | vue-v3.6.0-beta.15-keyed | clear rows | completed | duration | ms | 46.2 | 41.4 | 3.6 | +50% |
| js-framework-benchmark | vue-v3.6.0-beta.15-keyed | ready memory | completed | memory | MB | 1.3 |  |  | +30.66% |
| js-framework-benchmark | vue-v3.6.0-beta.15-keyed | run memory | completed | memory | MB | 4.4 |  |  | +55.58% |
| js-framework-benchmark | vue-v3.6.0-beta.15-keyed | repeated clear memory | completed | memory | MB | 1.6 |  |  | +32.28% |
| js-framework-benchmark | vue-v3.6.0-beta.15-keyed | total byte weight | completed | size | kB | 23.8 |  |  | +428.89% |
