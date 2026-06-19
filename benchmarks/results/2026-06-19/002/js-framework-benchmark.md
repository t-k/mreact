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

Raw JSON files are stored in `benchmarks/results/2026-06-19/002/js-framework-benchmark-results`.
Chrome trace files are stored in `benchmarks/results/2026-06-19/002/js-framework-benchmark-traces`.

## Rankings

Lower values are better for all js-framework-benchmark metrics reported here.

### create rows

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | **mreact-v0.0.175-local-keyed** | create rows | 64.3 | 6.2 | 56.9 | best | ms |
| 2 | solid-v1.9.13-keyed | create rows | 65.1 | 7.2 | 56.8 | +1.24% | ms |
| 3 | marko-v6.1.11-keyed | create rows | 67.1 | 8.6 | 57.4 | +4.35% | ms |
| 4 | svelte-v5.56.3-keyed | create rows | 68.2 | 9.7 | 57.4 | +6.07% | ms |
| 5 | vue-v3.6.0-beta.16-keyed | create rows | 77.8 | 19.4 | 57.6 | +21% | ms |
| 6 | react-hooks-v19.2.7-keyed | create rows | 79.9 | 21.3 | 57.5 | +24.26% | ms |
| 7 | **mreact-react-compat-v0.0.175-local-keyed** | create rows | 81.4 | 22.9 | 57.1 | +26.59% | ms |
| 8 | **mreact-react-compat-vdom-v0.0.175-local-keyed** | create rows | 91.1 | 31.9 | 58 | +41.68% | ms |
| 9 | angular-cf-v22.0.0-keyed | create rows | 94.8 | 18.3 | 59.3 | +47.43% | ms |

### replace all rows

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | marko-v6.1.11-keyed | replace all rows | 72.8 | 13.8 | 58.2 | best | ms |
| 2 | **mreact-v0.0.175-local-keyed** | replace all rows | 72.8 | 12.7 | 58.5 | 0% | ms |
| 3 | solid-v1.9.13-keyed | replace all rows | 73.2 | 13.5 | 58.7 | +0.55% | ms |
| 4 | svelte-v5.56.3-keyed | replace all rows | 77.2 | 17.1 | 58.6 | +6.04% | ms |
| 5 | vue-v3.6.0-beta.16-keyed | replace all rows | 83.7 | 22.5 | 59.4 | +14.97% | ms |
| 6 | **mreact-react-compat-v0.0.175-local-keyed** | replace all rows | 84 | 24.1 | 58.8 | +15.38% | ms |
| 7 | react-hooks-v19.2.7-keyed | replace all rows | 92.6 | 31 | 60.2 | +27.2% | ms |
| 8 | **mreact-react-compat-vdom-v0.0.175-local-keyed** | replace all rows | 95.5 | 35.9 | 58.6 | +31.18% | ms |
| 9 | angular-cf-v22.0.0-keyed | replace all rows | 103 | 27.8 | 60 | +41.48% | ms |

### partial update

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | angular-cf-v22.0.0-keyed | partial update | 36.2 | 3 | 31.8 | best | ms |
| 2 | **mreact-v0.0.175-local-keyed** | partial update | 36.6 | 1.8 | 30.9 | +1.1% | ms |
| 3 | solid-v1.9.13-keyed | partial update | 38.8 | 2.7 | 32.4 | +7.18% | ms |
| 4 | svelte-v5.56.3-keyed | partial update | 39 | 3.7 | 31.8 | +7.73% | ms |
| 5 | marko-v6.1.11-keyed | partial update | 41.2 | 4.9 | 32.2 | +13.81% | ms |
| 6 | **mreact-react-compat-v0.0.175-local-keyed** | partial update | 43.5 | 7.4 | 32.3 | +20.17% | ms |
| 7 | vue-v3.6.0-beta.16-keyed | partial update | 43.5 | 5.8 | 33.5 | +20.17% | ms |
| 8 | react-hooks-v19.2.7-keyed | partial update | 46.4 | 10.1 | 32 | +28.18% | ms |
| 9 | **mreact-react-compat-vdom-v0.0.175-local-keyed** | partial update | 54.5 | 18.8 | 32.2 | +50.55% | ms |

### select row

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | **mreact-v0.0.175-local-keyed** | select row | 8.5 | 0.9 | 6.1 | best | ms |
| 2 | solid-v1.9.13-keyed | select row | 9.3 | 1.7 | 6.1 | +9.41% | ms |
| 3 | vue-v3.6.0-beta.16-keyed | select row | 10.2 | 2.4 | 6.5 | +20% | ms |
| 4 | angular-cf-v22.0.0-keyed | select row | 12 | 3.7 | 6.8 | +41.18% | ms |
| 5 | marko-v6.1.11-keyed | select row | 13.7 | 5.5 | 6.4 | +61.18% | ms |
| 6 | react-hooks-v19.2.7-keyed | select row | 14 | 6.2 | 6.2 | +64.71% | ms |
| 7 | svelte-v5.56.3-keyed | select row | 14.3 | 6.5 | 6 | +68.24% | ms |
| 8 | **mreact-react-compat-v0.0.175-local-keyed** | select row | 14.4 | 6.2 | 6.6 | +69.41% | ms |
| 9 | **mreact-react-compat-vdom-v0.0.175-local-keyed** | select row | 14.4 | 6.8 | 6.5 | +69.41% | ms |

### swap rows

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | **mreact-v0.0.175-local-keyed** | swap rows | 42.7 | 1.7 | 37.6 | best | ms |
| 2 | angular-cf-v22.0.0-keyed | swap rows | 43.5 | 3 | 38.7 | +1.87% | ms |
| 3 | solid-v1.9.13-keyed | swap rows | 44 | 2 | 38.2 | +3.04% | ms |
| 4 | svelte-v5.56.3-keyed | swap rows | 45.4 | 3.4 | 38.2 | +6.32% | ms |
| 5 | vue-v3.6.0-beta.16-keyed | swap rows | 45.5 | 3 | 38.5 | +6.56% | ms |
| 6 | marko-v6.1.11-keyed | swap rows | 46.8 | 4 | 38.4 | +9.6% | ms |
| 7 | **mreact-react-compat-v0.0.175-local-keyed** | swap rows | 52.2 | 9.4 | 37.9 | +22.25% | ms |
| 8 | **mreact-react-compat-vdom-v0.0.175-local-keyed** | swap rows | 60.1 | 16.8 | 38.3 | +40.75% | ms |
| 9 | react-hooks-v19.2.7-keyed | swap rows | 293.4 | 41.1 | 246.4 | +587.12% | ms |

### remove row

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | angular-cf-v22.0.0-keyed | remove row | 30.4 | 1.6 | 28.3 | best | ms |
| 2 | **mreact-v0.0.175-local-keyed** | remove row | 33.8 | 0.8 | 30.6 | +11.18% | ms |
| 3 | svelte-v5.56.3-keyed | remove row | 34 | 1.6 | 30.5 | +11.84% | ms |
| 4 | solid-v1.9.13-keyed | remove row | 34.3 | 0.9 | 31.3 | +12.83% | ms |
| 5 | **mreact-react-compat-v0.0.175-local-keyed** | remove row | 36 | 2.7 | 30.8 | +18.42% | ms |
| 6 | react-hooks-v19.2.7-keyed | remove row | 36.2 | 2.6 | 31 | +19.08% | ms |
| 7 | marko-v6.1.11-keyed | remove row | 36.6 | 3.5 | 31 | +20.39% | ms |
| 8 | vue-v3.6.0-beta.16-keyed | remove row | 37.5 | 4.8 | 30.6 | +23.36% | ms |
| 9 | **mreact-react-compat-vdom-v0.0.175-local-keyed** | remove row | 38.5 | 4.8 | 31.4 | +26.64% | ms |

### create many rows

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | **mreact-v0.0.175-local-keyed** | create many rows | 703.2 | 68.2 | 625.1 | best | ms |
| 2 | marko-v6.1.11-keyed | create many rows | 710.1 | 81.4 | 616.2 | +0.98% | ms |
| 3 | solid-v1.9.13-keyed | create many rows | 712.5 | 71.4 | 630.8 | +1.32% | ms |
| 4 | svelte-v5.56.3-keyed | create many rows | 734.9 | 90.3 | 630.8 | +4.51% | ms |
| 5 | vue-v3.6.0-beta.16-keyed | create many rows | 820.7 | 158.5 | 654.8 | +16.71% | ms |
| 6 | **mreact-react-compat-v0.0.175-local-keyed** | create many rows | 853.9 | 233.6 | 607.5 | +21.43% | ms |
| 7 | **mreact-react-compat-vdom-v0.0.175-local-keyed** | create many rows | 903.8 | 263.5 | 631.8 | +28.53% | ms |
| 8 | angular-cf-v22.0.0-keyed | create many rows | 922 | 189.2 | 656.5 | +31.11% | ms |
| 9 | react-hooks-v19.2.7-keyed | create many rows | 1093.8 | 428.7 | 650.2 | +55.55% | ms |

### append rows to large table

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | **mreact-v0.0.175-local-keyed** | append rows to large table | 75.3 | 7.5 | 66.1 | best | ms |
| 2 | solid-v1.9.13-keyed | append rows to large table | 76.1 | 8.5 | 66.4 | +1.06% | ms |
| 3 | svelte-v5.56.3-keyed | append rows to large table | 78.8 | 9.9 | 67 | +4.65% | ms |
| 4 | marko-v6.1.11-keyed | append rows to large table | 79 | 10.6 | 66.9 | +4.91% | ms |
| 5 | vue-v3.6.0-beta.16-keyed | append rows to large table | 83.3 | 16.3 | 65.5 | +10.62% | ms |
| 6 | react-hooks-v19.2.7-keyed | append rows to large table | 89.7 | 22.3 | 65.7 | +19.12% | ms |
| 7 | **mreact-react-compat-v0.0.175-local-keyed** | append rows to large table | 90.8 | 24 | 65.6 | +20.58% | ms |
| 8 | angular-cf-v22.0.0-keyed | append rows to large table | 96.9 | 16.1 | 66.8 | +28.69% | ms |
| 9 | **mreact-react-compat-vdom-v0.0.175-local-keyed** | append rows to large table | 98.3 | 31.5 | 64.7 | +30.54% | ms |

### clear rows

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | marko-v6.1.11-keyed | clear rows | 24.5 | 20.4 | 2.9 | best | ms |
| 2 | **mreact-v0.0.175-local-keyed** | clear rows | 25.6 | 21.5 | 3.3 | +4.49% | ms |
| 3 | svelte-v5.56.3-keyed | clear rows | 28 | 23.4 | 3.2 | +14.29% | ms |
| 4 | solid-v1.9.13-keyed | clear rows | 29.9 | 25.6 | 3 | +22.04% | ms |
| 5 | **mreact-react-compat-vdom-v0.0.175-local-keyed** | clear rows | 33.4 | 28.8 | 3.2 | +36.33% | ms |
| 6 | vue-v3.6.0-beta.16-keyed | clear rows | 33.4 | 29.4 | 2.9 | +36.33% | ms |
| 7 | **mreact-react-compat-v0.0.175-local-keyed** | clear rows | 38.1 | 33.5 | 2.9 | +55.51% | ms |
| 8 | react-hooks-v19.2.7-keyed | clear rows | 43.7 | 39.6 | 3.1 | +78.37% | ms |
| 9 | angular-cf-v22.0.0-keyed | clear rows | 47.5 | 43 | 3.5 | +93.88% | ms |

### ready memory

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | solid-v1.9.13-keyed | ready memory | 1 |  |  | best | MB |
| 2 | marko-v6.1.11-keyed | ready memory | 1.1 |  |  | +1.3% | MB |
| 3 | **mreact-v0.0.175-local-keyed** | ready memory | 1.1 |  |  | +6.75% | MB |
| 4 | svelte-v5.56.3-keyed | ready memory | 1.2 |  |  | +18.26% | MB |
| 5 | vue-v3.6.0-beta.16-keyed | ready memory | 1.3 |  |  | +28.8% | MB |
| 6 | **mreact-react-compat-vdom-v0.0.175-local-keyed** | ready memory | 1.3 |  |  | +29.65% | MB |
| 7 | **mreact-react-compat-v0.0.175-local-keyed** | ready memory | 1.4 |  |  | +33.82% | MB |
| 8 | react-hooks-v19.2.7-keyed | ready memory | 1.6 |  |  | +58.29% | MB |
| 9 | angular-cf-v22.0.0-keyed | ready memory | 2.1 |  |  | +100.5% | MB |

### run memory

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | marko-v6.1.11-keyed | run memory | 2.9 |  |  | best | MB |
| 2 | **mreact-v0.0.175-local-keyed** | run memory | 2.9 |  |  | +0.07% | MB |
| 3 | solid-v1.9.13-keyed | run memory | 3.1 |  |  | +9.31% | MB |
| 4 | svelte-v5.56.3-keyed | run memory | 3.5 |  |  | +22.41% | MB |
| 5 | vue-v3.6.0-beta.16-keyed | run memory | 4.4 |  |  | +54.23% | MB |
| 6 | react-hooks-v19.2.7-keyed | run memory | 4.9 |  |  | +71.33% | MB |
| 7 | **mreact-react-compat-vdom-v0.0.175-local-keyed** | run memory | 4.9 |  |  | +72.2% | MB |
| 8 | angular-cf-v22.0.0-keyed | run memory | 5 |  |  | +76.69% | MB |
| 9 | **mreact-react-compat-v0.0.175-local-keyed** | run memory | 5.3 |  |  | +86.16% | MB |

### repeated clear memory

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | solid-v1.9.13-keyed | repeated clear memory | 1.3 |  |  | best | MB |
| 2 | **mreact-v0.0.175-local-keyed** | repeated clear memory | 1.4 |  |  | +5.79% | MB |
| 3 | marko-v6.1.11-keyed | repeated clear memory | 1.4 |  |  | +5.85% | MB |
| 4 | svelte-v5.56.3-keyed | repeated clear memory | 1.6 |  |  | +21.45% | MB |
| 5 | vue-v3.6.0-beta.16-keyed | repeated clear memory | 1.6 |  |  | +27.43% | MB |
| 6 | **mreact-react-compat-v0.0.175-local-keyed** | repeated clear memory | 2 |  |  | +51.95% | MB |
| 7 | react-hooks-v19.2.7-keyed | repeated clear memory | 2.4 |  |  | +86.04% | MB |
| 8 | **mreact-react-compat-vdom-v0.0.175-local-keyed** | repeated clear memory | 2.4 |  |  | +88.78% | MB |
| 9 | angular-cf-v22.0.0-keyed | repeated clear memory | 2.6 |  |  | +101.67% | MB |

### total byte weight

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | solid-v1.9.13-keyed | total byte weight | 4.5 |  |  | best | kB |
| 2 | marko-v6.1.11-keyed | total byte weight | 4.8 |  |  | +6.67% | kB |
| 3 | **mreact-v0.0.175-local-keyed** | total byte weight | 9.6 |  |  | +113.33% | kB |
| 4 | svelte-v5.56.3-keyed | total byte weight | 14.3 |  |  | +217.78% | kB |
| 5 | vue-v3.6.0-beta.16-keyed | total byte weight | 23.9 |  |  | +431.11% | kB |
| 6 | **mreact-react-compat-vdom-v0.0.175-local-keyed** | total byte weight | 32.8 |  |  | +628.89% | kB |
| 7 | **mreact-react-compat-v0.0.175-local-keyed** | total byte weight | 34.8 |  |  | +673.33% | kB |
| 8 | angular-cf-v22.0.0-keyed | total byte weight | 44.5 |  |  | +888.89% | kB |
| 9 | react-hooks-v19.2.7-keyed | total byte weight | 51.4 |  |  | +1042.22% | kB |

## Results

| suite | framework | case | status | metric | unit | value | script | paint | diff vs 1st |
| --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | create rows | completed | duration | ms | 94.8 | 18.3 | 59.3 | +47.43% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | replace all rows | completed | duration | ms | 103 | 27.8 | 60 | +41.48% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | partial update | completed | duration | ms | 36.2 | 3 | 31.8 | best |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | select row | completed | duration | ms | 12 | 3.7 | 6.8 | +41.18% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | swap rows | completed | duration | ms | 43.5 | 3 | 38.7 | +1.87% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | remove row | completed | duration | ms | 30.4 | 1.6 | 28.3 | best |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | create many rows | completed | duration | ms | 922 | 189.2 | 656.5 | +31.11% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | append rows to large table | completed | duration | ms | 96.9 | 16.1 | 66.8 | +28.69% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | clear rows | completed | duration | ms | 47.5 | 43 | 3.5 | +93.88% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | ready memory | completed | memory | MB | 2.1 |  |  | +100.5% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | run memory | completed | memory | MB | 5 |  |  | +76.69% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | repeated clear memory | completed | memory | MB | 2.6 |  |  | +101.67% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | total byte weight | completed | size | kB | 44.5 |  |  | +888.89% |
| js-framework-benchmark | marko-v6.1.11-keyed | create rows | completed | duration | ms | 67.1 | 8.6 | 57.4 | +4.35% |
| js-framework-benchmark | marko-v6.1.11-keyed | replace all rows | completed | duration | ms | 72.8 | 13.8 | 58.2 | best |
| js-framework-benchmark | marko-v6.1.11-keyed | partial update | completed | duration | ms | 41.2 | 4.9 | 32.2 | +13.81% |
| js-framework-benchmark | marko-v6.1.11-keyed | select row | completed | duration | ms | 13.7 | 5.5 | 6.4 | +61.18% |
| js-framework-benchmark | marko-v6.1.11-keyed | swap rows | completed | duration | ms | 46.8 | 4 | 38.4 | +9.6% |
| js-framework-benchmark | marko-v6.1.11-keyed | remove row | completed | duration | ms | 36.6 | 3.5 | 31 | +20.39% |
| js-framework-benchmark | marko-v6.1.11-keyed | create many rows | completed | duration | ms | 710.1 | 81.4 | 616.2 | +0.98% |
| js-framework-benchmark | marko-v6.1.11-keyed | append rows to large table | completed | duration | ms | 79 | 10.6 | 66.9 | +4.91% |
| js-framework-benchmark | marko-v6.1.11-keyed | clear rows | completed | duration | ms | 24.5 | 20.4 | 2.9 | best |
| js-framework-benchmark | marko-v6.1.11-keyed | ready memory | completed | memory | MB | 1.1 |  |  | +1.3% |
| js-framework-benchmark | marko-v6.1.11-keyed | run memory | completed | memory | MB | 2.9 |  |  | best |
| js-framework-benchmark | marko-v6.1.11-keyed | repeated clear memory | completed | memory | MB | 1.4 |  |  | +5.85% |
| js-framework-benchmark | marko-v6.1.11-keyed | total byte weight | completed | size | kB | 4.8 |  |  | +6.67% |
| js-framework-benchmark | **mreact-react-compat-v0.0.175-local-keyed** | create rows | completed | duration | ms | 81.4 | 22.9 | 57.1 | +26.59% |
| js-framework-benchmark | **mreact-react-compat-v0.0.175-local-keyed** | replace all rows | completed | duration | ms | 84 | 24.1 | 58.8 | +15.38% |
| js-framework-benchmark | **mreact-react-compat-v0.0.175-local-keyed** | partial update | completed | duration | ms | 43.5 | 7.4 | 32.3 | +20.17% |
| js-framework-benchmark | **mreact-react-compat-v0.0.175-local-keyed** | select row | completed | duration | ms | 14.4 | 6.2 | 6.6 | +69.41% |
| js-framework-benchmark | **mreact-react-compat-v0.0.175-local-keyed** | swap rows | completed | duration | ms | 52.2 | 9.4 | 37.9 | +22.25% |
| js-framework-benchmark | **mreact-react-compat-v0.0.175-local-keyed** | remove row | completed | duration | ms | 36 | 2.7 | 30.8 | +18.42% |
| js-framework-benchmark | **mreact-react-compat-v0.0.175-local-keyed** | create many rows | completed | duration | ms | 853.9 | 233.6 | 607.5 | +21.43% |
| js-framework-benchmark | **mreact-react-compat-v0.0.175-local-keyed** | append rows to large table | completed | duration | ms | 90.8 | 24 | 65.6 | +20.58% |
| js-framework-benchmark | **mreact-react-compat-v0.0.175-local-keyed** | clear rows | completed | duration | ms | 38.1 | 33.5 | 2.9 | +55.51% |
| js-framework-benchmark | **mreact-react-compat-v0.0.175-local-keyed** | ready memory | completed | memory | MB | 1.4 |  |  | +33.82% |
| js-framework-benchmark | **mreact-react-compat-v0.0.175-local-keyed** | run memory | completed | memory | MB | 5.3 |  |  | +86.16% |
| js-framework-benchmark | **mreact-react-compat-v0.0.175-local-keyed** | repeated clear memory | completed | memory | MB | 2 |  |  | +51.95% |
| js-framework-benchmark | **mreact-react-compat-v0.0.175-local-keyed** | total byte weight | completed | size | kB | 34.8 |  |  | +673.33% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.175-local-keyed** | create rows | completed | duration | ms | 91.1 | 31.9 | 58 | +41.68% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.175-local-keyed** | replace all rows | completed | duration | ms | 95.5 | 35.9 | 58.6 | +31.18% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.175-local-keyed** | partial update | completed | duration | ms | 54.5 | 18.8 | 32.2 | +50.55% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.175-local-keyed** | select row | completed | duration | ms | 14.4 | 6.8 | 6.5 | +69.41% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.175-local-keyed** | swap rows | completed | duration | ms | 60.1 | 16.8 | 38.3 | +40.75% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.175-local-keyed** | remove row | completed | duration | ms | 38.5 | 4.8 | 31.4 | +26.64% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.175-local-keyed** | create many rows | completed | duration | ms | 903.8 | 263.5 | 631.8 | +28.53% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.175-local-keyed** | append rows to large table | completed | duration | ms | 98.3 | 31.5 | 64.7 | +30.54% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.175-local-keyed** | clear rows | completed | duration | ms | 33.4 | 28.8 | 3.2 | +36.33% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.175-local-keyed** | ready memory | completed | memory | MB | 1.3 |  |  | +29.65% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.175-local-keyed** | run memory | completed | memory | MB | 4.9 |  |  | +72.2% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.175-local-keyed** | repeated clear memory | completed | memory | MB | 2.4 |  |  | +88.78% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.175-local-keyed** | total byte weight | completed | size | kB | 32.8 |  |  | +628.89% |
| js-framework-benchmark | **mreact-v0.0.175-local-keyed** | create rows | completed | duration | ms | 64.3 | 6.2 | 56.9 | best |
| js-framework-benchmark | **mreact-v0.0.175-local-keyed** | replace all rows | completed | duration | ms | 72.8 | 12.7 | 58.5 | 0% |
| js-framework-benchmark | **mreact-v0.0.175-local-keyed** | partial update | completed | duration | ms | 36.6 | 1.8 | 30.9 | +1.1% |
| js-framework-benchmark | **mreact-v0.0.175-local-keyed** | select row | completed | duration | ms | 8.5 | 0.9 | 6.1 | best |
| js-framework-benchmark | **mreact-v0.0.175-local-keyed** | swap rows | completed | duration | ms | 42.7 | 1.7 | 37.6 | best |
| js-framework-benchmark | **mreact-v0.0.175-local-keyed** | remove row | completed | duration | ms | 33.8 | 0.8 | 30.6 | +11.18% |
| js-framework-benchmark | **mreact-v0.0.175-local-keyed** | create many rows | completed | duration | ms | 703.2 | 68.2 | 625.1 | best |
| js-framework-benchmark | **mreact-v0.0.175-local-keyed** | append rows to large table | completed | duration | ms | 75.3 | 7.5 | 66.1 | best |
| js-framework-benchmark | **mreact-v0.0.175-local-keyed** | clear rows | completed | duration | ms | 25.6 | 21.5 | 3.3 | +4.49% |
| js-framework-benchmark | **mreact-v0.0.175-local-keyed** | ready memory | completed | memory | MB | 1.1 |  |  | +6.75% |
| js-framework-benchmark | **mreact-v0.0.175-local-keyed** | run memory | completed | memory | MB | 2.9 |  |  | +0.07% |
| js-framework-benchmark | **mreact-v0.0.175-local-keyed** | repeated clear memory | completed | memory | MB | 1.4 |  |  | +5.79% |
| js-framework-benchmark | **mreact-v0.0.175-local-keyed** | total byte weight | completed | size | kB | 9.6 |  |  | +113.33% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | create rows | completed | duration | ms | 79.9 | 21.3 | 57.5 | +24.26% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | replace all rows | completed | duration | ms | 92.6 | 31 | 60.2 | +27.2% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | partial update | completed | duration | ms | 46.4 | 10.1 | 32 | +28.18% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | select row | completed | duration | ms | 14 | 6.2 | 6.2 | +64.71% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | swap rows | completed | duration | ms | 293.4 | 41.1 | 246.4 | +587.12% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | remove row | completed | duration | ms | 36.2 | 2.6 | 31 | +19.08% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | create many rows | completed | duration | ms | 1093.8 | 428.7 | 650.2 | +55.55% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | append rows to large table | completed | duration | ms | 89.7 | 22.3 | 65.7 | +19.12% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | clear rows | completed | duration | ms | 43.7 | 39.6 | 3.1 | +78.37% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | ready memory | completed | memory | MB | 1.6 |  |  | +58.29% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | run memory | completed | memory | MB | 4.9 |  |  | +71.33% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | repeated clear memory | completed | memory | MB | 2.4 |  |  | +86.04% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | total byte weight | completed | size | kB | 51.4 |  |  | +1042.22% |
| js-framework-benchmark | solid-v1.9.13-keyed | create rows | completed | duration | ms | 65.1 | 7.2 | 56.8 | +1.24% |
| js-framework-benchmark | solid-v1.9.13-keyed | replace all rows | completed | duration | ms | 73.2 | 13.5 | 58.7 | +0.55% |
| js-framework-benchmark | solid-v1.9.13-keyed | partial update | completed | duration | ms | 38.8 | 2.7 | 32.4 | +7.18% |
| js-framework-benchmark | solid-v1.9.13-keyed | select row | completed | duration | ms | 9.3 | 1.7 | 6.1 | +9.41% |
| js-framework-benchmark | solid-v1.9.13-keyed | swap rows | completed | duration | ms | 44 | 2 | 38.2 | +3.04% |
| js-framework-benchmark | solid-v1.9.13-keyed | remove row | completed | duration | ms | 34.3 | 0.9 | 31.3 | +12.83% |
| js-framework-benchmark | solid-v1.9.13-keyed | create many rows | completed | duration | ms | 712.5 | 71.4 | 630.8 | +1.32% |
| js-framework-benchmark | solid-v1.9.13-keyed | append rows to large table | completed | duration | ms | 76.1 | 8.5 | 66.4 | +1.06% |
| js-framework-benchmark | solid-v1.9.13-keyed | clear rows | completed | duration | ms | 29.9 | 25.6 | 3 | +22.04% |
| js-framework-benchmark | solid-v1.9.13-keyed | ready memory | completed | memory | MB | 1 |  |  | best |
| js-framework-benchmark | solid-v1.9.13-keyed | run memory | completed | memory | MB | 3.1 |  |  | +9.31% |
| js-framework-benchmark | solid-v1.9.13-keyed | repeated clear memory | completed | memory | MB | 1.3 |  |  | best |
| js-framework-benchmark | solid-v1.9.13-keyed | total byte weight | completed | size | kB | 4.5 |  |  | best |
| js-framework-benchmark | svelte-v5.56.3-keyed | create rows | completed | duration | ms | 68.2 | 9.7 | 57.4 | +6.07% |
| js-framework-benchmark | svelte-v5.56.3-keyed | replace all rows | completed | duration | ms | 77.2 | 17.1 | 58.6 | +6.04% |
| js-framework-benchmark | svelte-v5.56.3-keyed | partial update | completed | duration | ms | 39 | 3.7 | 31.8 | +7.73% |
| js-framework-benchmark | svelte-v5.56.3-keyed | select row | completed | duration | ms | 14.3 | 6.5 | 6 | +68.24% |
| js-framework-benchmark | svelte-v5.56.3-keyed | swap rows | completed | duration | ms | 45.4 | 3.4 | 38.2 | +6.32% |
| js-framework-benchmark | svelte-v5.56.3-keyed | remove row | completed | duration | ms | 34 | 1.6 | 30.5 | +11.84% |
| js-framework-benchmark | svelte-v5.56.3-keyed | create many rows | completed | duration | ms | 734.9 | 90.3 | 630.8 | +4.51% |
| js-framework-benchmark | svelte-v5.56.3-keyed | append rows to large table | completed | duration | ms | 78.8 | 9.9 | 67 | +4.65% |
| js-framework-benchmark | svelte-v5.56.3-keyed | clear rows | completed | duration | ms | 28 | 23.4 | 3.2 | +14.29% |
| js-framework-benchmark | svelte-v5.56.3-keyed | ready memory | completed | memory | MB | 1.2 |  |  | +18.26% |
| js-framework-benchmark | svelte-v5.56.3-keyed | run memory | completed | memory | MB | 3.5 |  |  | +22.41% |
| js-framework-benchmark | svelte-v5.56.3-keyed | repeated clear memory | completed | memory | MB | 1.6 |  |  | +21.45% |
| js-framework-benchmark | svelte-v5.56.3-keyed | total byte weight | completed | size | kB | 14.3 |  |  | +217.78% |
| js-framework-benchmark | vue-v3.6.0-beta.16-keyed | create rows | completed | duration | ms | 77.8 | 19.4 | 57.6 | +21% |
| js-framework-benchmark | vue-v3.6.0-beta.16-keyed | replace all rows | completed | duration | ms | 83.7 | 22.5 | 59.4 | +14.97% |
| js-framework-benchmark | vue-v3.6.0-beta.16-keyed | partial update | completed | duration | ms | 43.5 | 5.8 | 33.5 | +20.17% |
| js-framework-benchmark | vue-v3.6.0-beta.16-keyed | select row | completed | duration | ms | 10.2 | 2.4 | 6.5 | +20% |
| js-framework-benchmark | vue-v3.6.0-beta.16-keyed | swap rows | completed | duration | ms | 45.5 | 3 | 38.5 | +6.56% |
| js-framework-benchmark | vue-v3.6.0-beta.16-keyed | remove row | completed | duration | ms | 37.5 | 4.8 | 30.6 | +23.36% |
| js-framework-benchmark | vue-v3.6.0-beta.16-keyed | create many rows | completed | duration | ms | 820.7 | 158.5 | 654.8 | +16.71% |
| js-framework-benchmark | vue-v3.6.0-beta.16-keyed | append rows to large table | completed | duration | ms | 83.3 | 16.3 | 65.5 | +10.62% |
| js-framework-benchmark | vue-v3.6.0-beta.16-keyed | clear rows | completed | duration | ms | 33.4 | 29.4 | 2.9 | +36.33% |
| js-framework-benchmark | vue-v3.6.0-beta.16-keyed | ready memory | completed | memory | MB | 1.3 |  |  | +28.8% |
| js-framework-benchmark | vue-v3.6.0-beta.16-keyed | run memory | completed | memory | MB | 4.4 |  |  | +54.23% |
| js-framework-benchmark | vue-v3.6.0-beta.16-keyed | repeated clear memory | completed | memory | MB | 1.6 |  |  | +27.43% |
| js-framework-benchmark | vue-v3.6.0-beta.16-keyed | total byte weight | completed | size | kB | 23.9 |  |  | +431.11% |
